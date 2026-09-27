import { api, requireKey, loadState } from "./client";

/** npm run nugen:status — shows saved progress, live alignment/deployment status and every model on the account. */
async function main() {
  requireKey();
  const state = loadState();
  console.log("Saved state:", JSON.stringify(state, null, 2));
  if (state.alignmentId) {
    const a = await api("GET", `/api/v3/alignment-projects/${state.alignmentId}`);
    console.log("\nAlignment:", JSON.stringify({ status: a.status, error: a.error, model_id: a.model_id, performance_metrics: a.performance_metrics, queue_position: a.queue_position }, null, 2));
  }
  if (state.modelId) {
    const d = await api("GET", `/api/v3/models/${state.modelId}/deployment/status`).catch((e) => ({ error: String(e.message) }));
    console.log("\nDeployment:", JSON.stringify(d, null, 2));
  }
  const m = await api("GET", "/api/v3/models/aligned?limit=100");
  console.log("\nAligned models:");
  for (const x of m.domain_aligned_models ?? []) console.log(`  ${x.model_id}  base=${x.base_model_id}  deployment=${x.deployment_status}`);
}
main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
