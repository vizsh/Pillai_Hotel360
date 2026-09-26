# Smart Resort 360

AI-powered resort operations, guest experience and revenue intelligence — delivered on a **live 3D digital twin** of the property.

Built for PS ID 4 (Pillai Panvel hackathon). Every signal the resort produces lands on the building: room state, maintenance risk, sentiment, revenue, housekeeping load, energy. Eight intelligence modules turn that data into recommendations with confidence and basis, and accepting a recommendation dispatches it into operations where you can watch the consequence on the model.

## Run

```bash
npm install
npm run dev
```

Every route requires signing in first (see **Auth** below) — you'll land on `/login`.

- `/command` — the command center (3D twin + panels + recommendation queue + concierge)
- `/revenue` `/guests` `/operations` `/maintenance` `/inventory` `/sentiment` `/concierge` `/energy` `/assistant` — analytics deep dives
- `npx tsx scripts/smoke.ts` — headless 3-day simulation run, prints KPIs

### Auth

A real login gate, not just a client-side role dropdown: `/login` has a typed username/password
form plus one-click "continue as \<role\>" demo cards, backed by a fixed 4-account roster (one
per RBAC role, `lib/db/client.ts`) with genuinely salted-and-hashed passwords
(`lib/auth/password.ts`, Node's built-in `scrypt` — no bcrypt dependency needed) and a signed,
httpOnly session cookie (`lib/auth/session.ts`, HMAC-SHA256, 8h expiry). `middleware.ts` redirects
any unauthenticated request for a page route to `/login`; `store/session.ts` hydrates the
logged-in user's *server-verified* role from `/api/auth/session` on load — the free role-switcher
dropdown this project used to have is gone, because a role is now something you log in as, not
something you self-select from a menu.

**What this does and doesn't guarantee.** This is deliberately not a full auth framework
(NextAuth/Auth.js etc.) — the app's pages are almost entirely client components reading a
browser-only live simulation, so there's no per-request server render to hang a session provider
off, and the actual demo need is narrower: real hashed passwords, a real signed session, and a
real redirect gate, which is what's built. It gates *which pages a browser can load* and *which
role you're assigned*, enforced server-side in `middleware.ts`. It does not, and structurally
cannot, make the live simulation's own data confidential from the browser holding it — the
entire sim state already lives in that browser's own JavaScript memory by design (see "What is
real and what is simulated" below), so a curious user with devtools open could always read their
own client's state regardless of role. RBAC's masking (`lib/rbac.ts`) was never a data-secrecy
boundary and still isn't; it's a "would a real distribution of duties show this to this role"
guardrail, same as before, just now behind a real login instead of a self-selectable label.

### Optional: local AI concierge + ops assistant (Ollama)

Two opt-in Ollama-backed layers, both additive on top of deterministic systems that keep working with Ollama off:

- **Guest concierge** (`/concierge`) — RAG-grounded conversational replies layered on the deterministic keyword classifier (`lib/intelligence/concierge.ts`), which still owns every task dispatch.
- **Ops assistant** (`/assistant`) — a staff-facing, tool-calling assistant that answers live operational questions ("who's in room 204", "what needs attention", "list our VIP guests") by calling real functions against the current simulation (`lib/ai/tools.ts`), not a fixed script. Answers are masked per your selected role exactly like the Guests page (`lib/rbac.ts`). Supports English, Hindi and Marathi, with browser-native voice input/output (Web Speech API — no extra model, works in Chrome; falls back to text-only elsewhere).

```bash
ollama serve
ollama pull llama3.1:8b       # chat model, also does the ops assistant's tool calling
ollama pull nomic-embed-text  # embedding model, for RAG retrieval over the resort's own knowledge base
```

No API key, no outbound network call beyond `localhost:11434`. Override the models via `OLLAMA_CHAT_MODEL` / `OLLAMA_EMBED_MODEL` env vars — `phi3:mini` is a much faster (if less capable) alternative chat model if `llama3.1:8b` is too slow on CPU-only hardware, though it does not support tool calling, so the ops assistant needs `llama3.1:8b` or another tools-capable model specifically. First reply after a cold start can take 30-90s while Ollama loads the model into memory (measured live on modest hardware); both routes pre-warm the chat/embed models at server startup so this cost is paid once per process, not once per question — a warm exchange typically returns in 10-15s, including a tool call.

### Optional: Telegram frontline bot

A standalone process for housekeeping/engineering/front-desk staff to receive tasks and report issues from their own phone, without opening the dashboard. Built on Telegram rather than WhatsApp: a Telegram bot needs only a token from [@BotFather](https://t.me/BotFather) (free, instant, no verification), where the WhatsApp Business Cloud API requires a real Meta Business verification and a registered phone number — a real-world approval process, not something this session could set up or test end-to-end. The blueprint itself lists Telegram as the free, instant-setup option, so that's what's built.

```bash
# 1. Message @BotFather on Telegram, send /newbot, follow the prompts, copy the token it gives you
# 2. Put it in a .env file in the project root (.env is gitignored, never commit it):
echo "TELEGRAM_BOT_TOKEN=your-token-here" > .env

# 3. Run the bot alongside (not instead of) the dev server:
npm run dev    # terminal 1
npm run bot    # terminal 2
```

**How it works:** the bot long-polls Telegram directly (no webhook, no public URL needed). Because the simulation only ever lives inside a browser tab, the bot can't reach it directly — instead it reads the same SQLite snapshot the app already persists every ~20s (`lib/db/client.ts`, originally built for demo continuity/audit trail) to know current staff and open tasks, and writes to a small `telegram_inbox` queue table. A hook in the running browser tab (`hooks/useTelegramInbox.ts`) polls that queue every 6s and applies each action through the same `lib/sim/actions.ts` functions any dashboard accept/dismiss button uses — so the dashboard must be open in a browser somewhere for actions to take effect, same as every other part of this sim.

**Staff usage:**
- `/start <your name>` — link this Telegram chat to a staff member on the current shift roster (exact or unambiguous partial match, e.g. `/start Priya`)
- `/mytasks` — list currently assigned tasks with a "✅ Done" button per task (SLA-breached tasks are flagged)
- Any other free text — reported as a new issue if it contains a valid room number (e.g. `"305 tap is leaking"`), routed through the same keyword classifier (`lib/intelligence/concierge.ts`) a guest concierge message goes through

### Room dive & "show me" queries

Two ways to explore the twin beyond point-and-read:

- **Double-click any room** on `/command` to dive the camera inside it (single-click still just selects, for fast browsing across many rooms without diving into each one) and open a compact floating HUD (`components/command/DollhouseHud.tsx`) — the room's own highest-risk asset with a live sensor sparkline, a one-line guest note that's genuinely masked (not just visually smaller) when the guest hasn't consented to personalization, the room's own recent history, and the same accept-style action buttons as the sidebar. `Esc` or "Step back" returns to the floor view.
- **"Show me" queries** — `Ctrl/⌘K` or the Ops Assistant (`/assistant`) both accept questions like *"which rooms are at risk tonight"*, *"which guests seem unhappy"*, or *"any SLA breaches open"*. Both call the same deterministic matcher (`lib/twin/queries.ts`) — not the LLM — so the camera frames and pulse-highlights the matched rooms and the answer appears as a caption, with zero hallucination risk in what actually moves the camera (the same reasoning behind keeping task dispatch deterministic elsewhere in this project). Asking from `/assistant` updates the same shared twin state and links to "View framed on the twin" since the 3D view isn't on that page; asking from `/command` itself shows the result immediately, in place.

**Known limitations:** text and button interactions only — voice-note transcription (the blueprint's Marathi voice-note example) isn't implemented, since this session's own measured Ollama latency (30-90s per call on modest hardware) made adding a third heavy model for STT impractical for a demo. WhatsApp is scoped out entirely for the verification reason above.

## What is real and what is simulated

**Everything numeric is synthetic.** A seeded engine (`lib/sim`) generates the property, guests, staff, telemetry, requests, reviews and revenue. Same seed, same run. The UI tags values as `SIMULATED` (raw sim state), `MODELED` (output of an intelligence module) or `DERIVED` (aggregation). No real property or guest data is used or implied.

The *models* are real implementations, not stubs:

| Module | Method | File |
|---|---|---|
| Predictive maintenance | Weibull hazard on health-adjusted runtime × telemetry anomaly z-scores → P(fail ≤ 7d), RUL | `lib/intelligence/maintenance.ts` |
| Dynamic pricing | Constant-elasticity demand curve with seasonality, pacing, competitor index; RevPAR grid search | `lib/intelligence/pricing.ts` |
| Staffing | Hourly demand profiles × occupancy → greedy shift allocation + swap improvement | `lib/intelligence/staffing.ts` |
| Inventory | Holt linear-trend forecast, 1.65σ safety stock over lead time, EOQ | `lib/intelligence/inventory.ts` |
| Sentiment | Aspect lexicon with clause-level negation; department routing with floor hotspot | `lib/intelligence/sentiment.ts` |
| Segmentation | k-means (k=5, k-means++ init) on 6 normalised behavioural features | `lib/intelligence/segmentation.ts` |
| Personalization | Rule-scored next-best-action ranking by preference, loyalty and stay stage | `lib/intelligence/personalization.ts` |
| AI concierge (task dispatch) | Weighted keyword intent classifier with urgency detection → task dispatch | `lib/intelligence/concierge.ts` |
| AI concierge (conversational layer, opt-in) | Retrieval-augmented generation over a real knowledge base (cosine similarity, `nomic-embed-text` embeddings) grounds a local Ollama model (`llama3.1:8b`); a deterministic guardrail filter blocks refund/discount/compensation language after generation, before it reaches the guest | `lib/ai/*`, `app/api/concierge/route.ts` |
| Ops assistant (opt-in) | Function-calling loop against a local Ollama model — 4 tools (`find_room`, `list_open_issues`, `list_guests`, `get_resort_summary`) query a fresh per-request snapshot of the live sim, role- and consent-masked identically to the Guests page; replies are Markdown, rendered by a small dependency-free renderer scoped to what the system prompt actually asks the model to produce | `lib/ai/tools.ts`, `lib/ai/opsSnapshot.ts`, `app/api/ops-assistant/route.ts`, `components/ui/Markdown.tsx` |
| Telegram frontline bot (opt-in) | Standalone long-polling process bridged to the browser-only sim via a SQLite read model + write queue; free-text issue reports route through the same keyword classifier as the guest concierge | `scripts/telegramBot.ts`, `lib/telegram/*`, `hooks/useTelegramInbox.ts`, `app/api/telegram/inbox/route.ts` |

## Architecture

```
lib/architecture   parametric resort generator (config → rooms, zones, assets, nav graph)
lib/sim            entity types, seeded population, tick engine, A* pathfinding, actions
lib/intelligence   the eight modules + registry
lib/twin           layer colour maps, merged geometry builders, materials
store              zustand: sim (transient), twin view state, quality tier, ui
components/twin    R3F scene: floors, facade, room plates, furniture, site, staff agents, markers
components/command command center shell and context panels
components/analytics  deep-dive routes
```

**Geometry is procedural.** No model files. `defaultConfig` in `lib/architecture/config.ts` sets floors, rooms per side, room dimensions, roof and site — change it and the twin regenerates. Walls are merged per floor, furniture and room plates are instanced, so the whole resort renders in roughly 90 draw calls.

**The sim never re-renders React.** It mutates a single state object at 10 Hz; the 3D layer reads it in `useFrame`, panels subscribe to a throttled version counter.

**Quality tiers** (`store/quality.ts`) auto-degrade on low FPS: DPR, shadows, post-processing, glass transmission and palm density.

### What-if simulator

`Planning → What if…` in the left rail opens a projection panel: drag a hypothetical occupancy and watch recommended RevPAR/ADR, unmet staffing shifts, and inventory reorder counts move — computed by re-running the exact same production functions the Revenue/Operations/Inventory pages use (`computePricing`, `solveRoster`, `assessInventory`) against a cloned state with only `kpis.occupancy` overridden, never the real one (`lib/intelligence/whatIf.ts`). Not a separate toy model and not applied to the live sim — a GM's forecast before a decision, not the decision itself.

## Keyboard

`1–7` view modes · `U Q W E R Y` layers (risk · occupancy · maintenance · sentiment · revenue · energy) · `Shift+T` housekeeping layer · `[ ]` floors · `Space` pause · `⌘K` search · `T` tour · `?` help

## Limitations

- Sentiment is lexicon-based; it will miss sarcasm and novel phrasing.
- Pricing assumes a single elasticity across segments; a production model would estimate elasticity per segment and channel.
- Staff pathfinding uses a coarse corridor graph; agents walk through room interiors once inside a room.
- The task-dispatching concierge classifier is keyword-weighted, not a language model; it is deliberately transparent rather than fluent — this is why task creation never runs through the LLM.
- The opt-in Ollama conversational layer can still state something not actually in the retrieved knowledge (observed live: a Silver-tier guest was told they get a Gold/Platinum-only benefit) — RAG grounds the model, it doesn't guarantee it. The guardrail filter catches promise-of-compensation language specifically; it is not a general factuality check. Treat the LLM's replies as a fluency layer to verify, not an authority to trust blindly, same as the blueprint's own "escalate to a human when unsure" principle.
- The ops assistant's Markdown renderer is intentionally not a general Markdown parser — it covers headers, bold, bullet/numbered lists and pipe tables, the exact subset the system prompt instructs the model to use, nothing more.
- Voice input/output uses the browser's own Web Speech API, not a local speech model — real STT/TTS quality and language coverage (English/Hindi/Marathi) depend entirely on the browser and OS, and it is unavailable outside Chromium-based browsers.
- Failure probabilities are calibrated to look plausible, not to any real asset population.
- The Telegram bot is text/button-only (no voice-note transcription) and requires the dashboard open in a browser tab somewhere to actually apply its queued actions — it's a remote control for the live sim, not an independent backend. WhatsApp support was scoped out; see the setup section above for why.
