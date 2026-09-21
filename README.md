# Smart Resort 360

AI-powered resort operations, guest experience and revenue intelligence — delivered on a **live 3D digital twin** of the property.

Built for PS ID 4 (Pillai Panvel hackathon). Every signal the resort produces lands on the building: room state, maintenance risk, sentiment, revenue, housekeeping load, energy. Eight intelligence modules turn that data into recommendations with confidence and basis, and accepting a recommendation dispatches it into operations where you can watch the consequence on the model.

## Run

```bash
npm install
npm run dev
```

- `/command` — the command center (3D twin + panels + recommendation queue + concierge)
- `/revenue` `/guests` `/operations` `/maintenance` `/inventory` `/sentiment` — analytics deep dives
- `npx tsx scripts/smoke.ts` — headless 3-day simulation run, prints KPIs

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
| AI concierge | Weighted keyword intent classifier with urgency detection → task dispatch | `lib/intelligence/concierge.ts` |

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
- The concierge classifier is keyword-weighted, not a language model; it is deliberately transparent rather than fluent.
- Failure probabilities are calibrated to look plausible, not to any real asset population.
