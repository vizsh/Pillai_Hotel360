# Smart Resort 360

AI-powered resort operations, guest experience and revenue intelligence — delivered on a **live 3D digital twin** of the property.

Built for PS ID 4 (Pillai Panvel hackathon). Every signal the resort produces lands on the building: room state, maintenance risk, sentiment, revenue, housekeeping load, energy. Eight intelligence modules turn that data into recommendations with confidence and basis, and accepting a recommendation dispatches it into operations where you can watch the consequence on the model.

## Run

```bash
npm install
npm run dev
```

- `/command` — the command center (3D twin + panels + recommendation queue + concierge)
- `/revenue` `/guests` `/operations` `/maintenance` `/inventory` `/sentiment` `/concierge` `/energy` — analytics deep dives
- `npx tsx scripts/smoke.ts` — headless 3-day simulation run, prints KPIs

### Optional: local AI concierge (Ollama)

The deterministic keyword concierge (`lib/intelligence/concierge.ts`) always works and always dispatches tasks — this is a purely additive, opt-in conversational layer on top, not a replacement. Off by default in any environment without Ollama running; the Concierge page shows connection status live.

```bash
ollama serve
ollama pull llama3.1:8b       # chat model
ollama pull nomic-embed-text  # embedding model, for RAG retrieval over the resort's own knowledge base
```

No API key, no outbound network call beyond `localhost:11434`. Override the models via `OLLAMA_CHAT_MODEL` / `OLLAMA_EMBED_MODEL` env vars — `phi3:mini` is a much faster (if less capable) alternative chat model if `llama3.1:8b` is too slow on CPU-only hardware. First reply after a cold start can take 30-90s while Ollama loads the model into memory; the server pre-warms both models at startup (`app/api/concierge/route.ts`) so this cost is paid once per process, not once per guest.

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

## Keyboard

`1–7` view modes · `Q W E R Y` layers · `[ ]` floors · `Space` pause · `⌘K` search · `T` tour · `?` help

## Limitations

- Sentiment is lexicon-based; it will miss sarcasm and novel phrasing.
- Pricing assumes a single elasticity across segments; a production model would estimate elasticity per segment and channel.
- Staff pathfinding uses a coarse corridor graph; agents walk through room interiors once inside a room.
- The task-dispatching concierge classifier is keyword-weighted, not a language model; it is deliberately transparent rather than fluent — this is why task creation never runs through the LLM.
- The opt-in Ollama conversational layer can still state something not actually in the retrieved knowledge (observed live: a Silver-tier guest was told they get a Gold/Platinum-only benefit) — RAG grounds the model, it doesn't guarantee it. The guardrail filter catches promise-of-compensation language specifically; it is not a general factuality check. Treat the LLM's replies as a fluency layer to verify, not an authority to trust blindly, same as the blueprint's own "escalate to a human when unsure" principle.
- Failure probabilities are calibrated to look plausible, not to any real asset population.
