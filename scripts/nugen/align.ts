import fs from "node:fs";
import path from "node:path";
import { api, requireKey, poll, loadState, saveState, setEnv, type State } from "./client";

/** Base AI model -> Nugen alignment -> domain-specific model -> deployed for inference.
 *
 *   npm run nugen:align                 full run (resumes from nugen/state.json)
 *   npm run nugen:align -- --base qwen-v2p5-0p5b-instruct --samples 30
 *   npm run nugen:align -- --restart    forget saved progress and start over
 *
 * Steps: upload corpus documents -> generate a benchmark from them -> create the alignment project ->
 * wait for training -> find the aligned model id -> deploy it -> write NUGEN_MODEL_ID to .env.local. */
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

type BaseModel = { model_id: string; model_name: string; parameters?: string; alignment_ready?: boolean; available_on_request?: boolean; type?: string };
const paramsOf = (m: BaseModel) => parseFloat((m.parameters ?? "0").replace(/[^0-9.]/g, "")) || 0;

async function pickBase(): Promise<string> {
  const want = opt("base");
  const { models } = await api<{ models: BaseModel[] }>("GET", "/api/v3/models/base?limit=100");
  console.log("Base models available to this account:");
  for (const m of models) console.log(`  ${m.model_id.padEnd(34)} ${String(m.parameters ?? "").padEnd(8)} type=${m.type} alignment_ready=${m.alignment_ready} on_request=${m.available_on_request}`);
  if (want) return want;
  const usable = models.filter((m) => m.type === "llm" && m.alignment_ready && !m.available_on_request).sort((a, b) => paramsOf(b) - paramsOf(a));
  if (!usable.length) throw new Error("No alignment-ready base model is available without an access request. Pass --base <model_id> once one is granted.");
  console.log(`Choosing the largest alignment-ready model: ${usable[0].model_id}`);
  return usable[0].model_id;
}

async function main() {
  requireKey();
  const state: State = flag("restart") ? {} : loadState();
  const dir = path.join(process.cwd(), "nugen", "corpus");
  if (!fs.existsSync(dir) || !fs.readdirSync(dir).length) throw new Error("nugen/corpus is empty. Run: npm run nugen:corpus");

  // 1 · documents
  if (!state.documentIds) {
    const files = fs.readdirSync(dir).filter((f) => /\.(md|txt)$/.test(f));
    console.log(`Uploading ${files.length} corpus files…`);
    const form = new FormData();
    for (const f of files) form.append("files", new Blob([fs.readFileSync(path.join(dir, f))], { type: "text/plain" }), f);
    for (const f of files) form.append("names", f);
    form.append("categories", "smart-resort-360");
    const { document_ids } = await api<{ document_ids: string[] }>("POST", "/api/v3/documents/create", undefined, form);
    state.documentIds = document_ids;
    saveState(state);
  }
  console.log("Waiting for documents to be processed…");
  for (const id of state.documentIds) {
    await poll(`document ${id}`, () => api<{ status: string; error?: string }>("GET", `/api/v3/documents/${id}/status`), (v) => /READY|COMPLETED/i.test(v.status), (v) => (/FAILED|ERROR/i.test(v.status) ? String(v.error ?? v.status) : null), 5000);
  }
  console.log("\nDocuments ready.");

  // 2 · benchmark (used by Nugen to evaluate the aligned model)
  if (!state.benchmarkId) {
    const samples = Number(opt("samples") ?? 30);
    const b = await api<{ benchmark_id: string }>("POST", "/api/v3/benchmarks/create", { document_ids: state.documentIds, n_samples: samples, benchmark_name: "smart-resort-360-domain" });
    state.benchmarkId = b.benchmark_id;
    saveState(state);
  }
  console.log("Waiting for the benchmark to be generated…");
  await poll("benchmark", () => api<{ status: string; error?: string }>("GET", `/api/v3/benchmarks/${state.benchmarkId}/status`), (v) => /READY|COMPLETED/i.test(v.status), (v) => (/FAILED|ERROR/i.test(v.status) ? String(v.error ?? v.status) : null), 10000);
  console.log("\nBenchmark ready.");

  // 3 · alignment project
  if (!state.alignmentId) {
    state.baseModelId = await pickBase();
    const a = await api<{ alignment_id: string }>("POST", "/api/v3/alignment-projects/create", {
      alignment_name: "Smart Resort 360 — hospitality operations and guest concierge",
      base_model_id: state.baseModelId,
      document_ids: state.documentIds,
      benchmark_id: state.benchmarkId,
      description: "Domain alignment on resort operations, revenue and weather logic, integrations, and the guest knowledge base.",
    });
    state.alignmentId = a.alignment_id;
    saveState(state);
    console.log(`Alignment started: ${state.alignmentId}`);
  }
  console.log("Waiting for alignment (this can take a long while; safe to interrupt and re-run)…");
  await poll(
    "alignment",
    () => api<{ status: string }>("GET", `/api/v3/alignment-projects/${state.alignmentId}/status`),
    (v) => ["READY", "EVALUATED", "DEPLOYING", "UNDEPLOYED"].includes(v.status),
    (v) => (["FAILED", "STOPPED"].includes(v.status) ? v.status : null),
    30000,
  );
  console.log("\nAlignment finished.");

  // 4 · aligned model id
  if (!state.modelId) {
    const detail = await api<{ model_id?: string | null }>("GET", `/api/v3/alignment-projects/${state.alignmentId}`);
    let id = detail.model_id ?? undefined;
    if (!id) {
      const { domain_aligned_models } = await api<{ domain_aligned_models: { model_id: string; base_model_id: string; created_at: string }[] }>("GET", "/api/v3/models/aligned?limit=100");
      id = domain_aligned_models.filter((m) => m.base_model_id === state.baseModelId).sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.model_id;
    }
    if (!id) throw new Error("Alignment finished but no aligned model id was found. Run: npm run nugen:status");
    state.modelId = id;
    saveState(state);
  }
  console.log(`Aligned model: ${state.modelId}`);

  // 5 · deploy
  if (!flag("skip-deploy")) {
    try {
      await api("POST", `/api/v3/models/${state.modelId}/deployment`);
      console.log("Deployment started (5-15 minutes)…");
    } catch (e) {
      console.log(`Deploy call note: ${(e as Error).message.slice(0, 200)}`);
    }
    await poll("deployment", () => api<{ status: string; error?: string | null }>("GET", `/api/v3/models/${state.modelId}/deployment/status`), (v) => v.status === "DEPLOYED", (v) => (v.status === "UNDEPLOYED" && v.error ? v.error : null), 20000);
    console.log("\nDeployed.");
  }

  setEnv("NUGEN_MODEL_ID", state.modelId);
  console.log(`\nDone. NUGEN_MODEL_ID=${state.modelId} written to .env.local.`);
  console.log("Restart the dev server, then open Ops Assistant — the badge should read “Nugen-aligned”. Verify with: npm run nugen:chat");
}

main().catch((e) => {
  console.error("\n" + (e as Error).message);
  process.exit(1);
});
