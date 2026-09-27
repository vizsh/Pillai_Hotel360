import fs from "node:fs";
import path from "node:path";
import { getModel } from "@/lib/architecture/model";
import { seedState } from "@/lib/sim/seed";
import { buildOpsSnapshot } from "@/lib/ai/opsSnapshot";
import { composeAnswer } from "@/lib/ai/composers";
import { SYSTEM_KNOWLEDGE } from "@/lib/ai/systemKnowledge";
import { buildKnowledgeBase } from "@/lib/ai/knowledge";
import { runWeatherWhatIf } from "@/lib/intelligence/weatherWhatIf";

/** Builds the domain corpus Nugen aligns a base model on (plain-text files only: the developer edition
 * accepts text). Output: nugen/corpus/*.md. Sources, all real project material:
 *   - docs/*.md                        architecture, module math, surveillance, integrations, differentiators
 *   - lib/ai/systemKnowledge.ts        curated how-it-works / API / formula facts, as Q&A
 *   - lib/ai/knowledge.ts              the resort's guest-facing knowledge base
 *   - ../guestexperience/content/kb    the guest companion app's knowledge base (if the sibling repo exists)
 *   - composer exemplars               real answers in the house format, generated from the live engine
 *   - style guides                     how the ops assistant and the guest concierge must answer */
const ROOT = process.cwd();
const OUT = path.join(ROOT, "nugen", "corpus");
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const write = (name: string, body: string) => fs.writeFileSync(path.join(OUT, name), body.trim() + "\n", "utf8");

// 1 · project docs, verbatim
for (const f of fs.readdirSync(path.join(ROOT, "docs")).filter((x) => x.endsWith(".md"))) {
  write(`docs-${f.toLowerCase()}`, `# Smart Resort 360 — ${f.replace(".md", "")}\n\n` + fs.readFileSync(path.join(ROOT, "docs", f), "utf8"));
}

// 2 · system knowledge as question/answer pairs
const qa = SYSTEM_KNOWLEDGE.flatMap((f) => [
  `Question: ${f.title}?\nAnswer: ${f.text}`,
  `Question: How does ${f.title.toLowerCase()} work in Smart Resort 360?\nAnswer: ${f.text}`,
  ...f.keywords.slice(0, 2).map((k) => `Question: What should I know about ${k} in this system?\nAnswer: ${f.text}`),
]);
write("system-knowledge.md", `# Smart Resort 360 — how the system works (question and answer)\n\n${qa.join("\n\n")}`);

// 3 · the resort's guest-facing knowledge base
const kb = buildKnowledgeBase(getModel());
write("resort-knowledge.md", `# Azure Bay Resort — guest-facing facts\n\n${kb.map((d) => `## ${d.id}\n${d.text}`).join("\n\n")}`);

// 4 · guest companion app knowledge base (sibling repo, optional)
const guestKb = path.resolve(ROOT, "..", "guestexperience", "content", "kb");
if (fs.existsSync(guestKb)) {
  for (const f of fs.readdirSync(guestKb).filter((x) => x.endsWith(".md"))) write(`guest-kb-${f}`, `# Sahyadri guest app knowledge — ${f.replace(".md", "")}\n\n` + fs.readFileSync(path.join(guestKb, f), "utf8"));
} else {
  console.warn("guestexperience/content/kb not found next to this repo — guest KB skipped");
}

// 5 · exemplar answers in the house format, produced by the real deterministic engine
const model = getModel();
const state = seedState(model, 0x5a1f, "peak-season");
const snapshot = buildOpsSnapshot(state, model, "gm");
snapshot.weatherWhatIf = {
  rain: runWeatherWhatIf(state, model, { condition: "rain", tempC: 28, rainProbability: 0.9 }),
  heatwave: runWeatherWhatIf(state, model, { condition: "heatwave", tempC: 38, rainProbability: 0.05 }),
};
const questions = [
  "We spend about ₹8 lakh a month on chiller repairs. If predictive maintenance cuts unplanned-failure cost by 20 to 40%, what do we save a year?",
  "Suppose heavy rain cuts pool-deck demand by 55%. How much daily revenue is at risk?",
  "A cyclone hits Goa this weekend. How should we prepare and what does the model say happens?",
  "How much commission did direct bookings save us, and what would it be at a 25% OTA rate?",
  "Which equipment should engineering service first, and why is waiting expensive?",
  "Will the rain this week hurt us, and how should I adjust staffing?",
  "Our restaurant makes ₹2 lakh a day. If a heatwave cuts footfall by 15%, what do we lose a month?",
  "If we add ₹50,000 a month of direct-booking revenue at a 20% OTA rate, what commission do we avoid a year?",
];
const exemplars = questions.map((q) => ({ q, a: composeAnswer(q, snapshot) })).filter((x) => x.a);
write("assistant-exemplars.md", `# Ops assistant — exemplar answers in the house format\n\nEvery exemplar below was produced by the deterministic engine from measured numbers.\n\n${exemplars.map((x) => `Question: ${x.q}\nAnswer:\n${x.a!.reply}`).join("\n\n---\n\n")}`);

// 6 · style guides
write(
  "ops-assistant-style.md",
  `# Ops assistant — how to answer\n
The ops assistant serves a General Manager, Revenue Manager, Front Office Manager or Executive Housekeeper of a resort.
- Start with the answer in one bold sentence, then a table or short steps, then a "Suggested next step" for decisions.
- Every number comes from live data, a verified arithmetic line, or a figure the user stated. Never invent a rupee amount.
- Show maths as Formula, Substitution, Result. Use Indian digit grouping (₹1,25,000) and INR.
- A percentage change in one outlet or zone applies only to that outlet. Outlet-level revenue is not tracked, so say so and use an illustrative base the user can replace.
- Label every figure live, modeled or simulated. What-if bands are modeled (Monte Carlo, six paired runs), never measured. The property, guests and telemetry are a seeded simulation; the formulas are real.
- A regional hazard more than 500 km from the resort (Goa) is monitoring only, not an immediate threat. Report the distance.
- Never promise a refund, compensation, discount or waived charge; say a manager will confirm.
- Reactive maintenance typically costs 3 to 5 times planned maintenance (industry benchmark).
- Answer in the language of the latest message (English, Hindi, Marathi).`,
);
write(
  "guest-concierge-style.md",
  `# Guest concierge — how to answer\n
The concierge serves a guest staying at the resort, on their own phone.
- Be warm, concise and specific (under about 90 words). Answer only from the resort's knowledge base; if it is not there, offer to connect the guest to the front desk (dial 0). Never guess prices, timings or policies.
- Reply in the guest's language (English, Hindi or Marathi). Keep names of dishes and places as they are.
- Safety first: any mention of fire, medical emergency, feeling unsafe or an accident is an SOS; acknowledge and confirm help is on the way.
- Requests (towels, cleaning, repairs, late checkout, upgrades) are dispatched as tasks; confirm what was requested and the expected time, never promise a specific outcome the system cannot guarantee.
- Never promise refunds, compensation, discounts or waived charges; say the duty manager will follow up.
- Loyalty benefits depend on the guest's tier (Silver, Gold, Platinum); do not offer a benefit above their tier.
- Guests who have not consented are never profiled for marketing.
- When a guest sounds unhappy, apologise once, sincerely, and act.`,
);

const files = fs.readdirSync(OUT);
const bytes = files.reduce((n, f) => n + fs.statSync(path.join(OUT, f)).size, 0);
console.log(`Corpus written to nugen/corpus: ${files.length} files, ${(bytes / 1024).toFixed(0)} KB`);
for (const f of files) console.log("  " + f);
