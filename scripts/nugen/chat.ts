import { api, requireKey } from "./client";

/** npm run nugen:chat [-- "your question"] — smoke-tests inference against the aligned model and,
 * for a before/after comparison, against the base model the alignment started from. */
const question = process.argv.slice(2).filter((a) => !a.startsWith("--")).join(" ") || "How does the weather what-if work, and which external APIs feed it?";
const system = "You are the operations assistant for a resort's digital twin. Answer precisely and honestly, label figures live, modeled or simulated, and never invent numbers.";

async function ask(model: string): Promise<string> {
  const r = await api("POST", "/api/v3/inference/chat/completions", { model, messages: [{ role: "system", content: system }, { role: "user", content: question }], temperature: 0.2, max_tokens: 400 });
  return r.choices?.[0]?.message?.content ?? JSON.stringify(r).slice(0, 300);
}

async function main() {
  requireKey();
  const aligned = process.env.NUGEN_MODEL_ID;
  const base = process.env.NUGEN_BASE_MODEL_ID;
  console.log(`Question: ${question}\n`);
  if (base) console.log(`— BASE (${base}):\n${await ask(base).catch((e) => "n/a: " + (e as Error).message.slice(0, 160))}\n`);
  if (!aligned) throw new Error("NUGEN_MODEL_ID is not set. Run: npm run nugen:align");
  console.log(`— ALIGNED (${aligned}):\n${await ask(aligned)}`);
}
main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
