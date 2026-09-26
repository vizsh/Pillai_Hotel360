# The Math Behind Every Decision

Twelve modules, each with a real, inspectable method — not a black-box score. Every recommendation these modules produce carries a `basis: string[]` built from the actual numbers below, which is what renders under "basis" on every recommendation card in the app. This document is the derivation behind that basis text.

Three further **composite views** (§13-15) don't add a 13th module — they re-read the outputs of the modules below and roll them into a single number or timeline a GM actually wants to look at.

---

## 1. Predictive Maintenance — Weibull hazard + telemetry anomaly

`lib/intelligence/maintenance.ts`

Each asset kind (chiller, AHU, elevator, pump, boiler, generator, kitchen-hood, pool-filter) has its own Weibull shape/scale pair (`k`, `λ`) reflecting a different wear curve — an elevator's failure hazard rises far more sharply with age than a pump's.

```
effective runtime    effHours = runtimeHours / max(0.15, health)
Weibull CDF          H(t) = (t / λ)^k
7-day base hazard     condBase = 1 - exp(-(H(effHours + 7d) - H(effHours)))

temperature z-score   tempZ = (temp - tempBase) / (tempBase × 0.06)
vibration z-score     vibZ  = (vibration - vibBase) / (vibBase × 0.18)
anomaly               anomaly = clamp(max(0, tempZ)×0.5 + max(0, vibZ)×0.5, 0, 6)

P(fail ≤ 7 days)      prob7d = 1 - (1 - condBase) × exp(-anomaly × 0.45)
```

Remaining useful life (RUL) is the smallest number of days `d` at which the cumulative failure probability (same Weibull curve, but with the anomaly-scaled hazard applied per-day) first crosses 50%. A recommendation is only raised once `prob7d ≥ 35%` — below that, a work order every time telemetry twitches would just be noise.

**Why this, not a flat "service every N days" schedule:** a fixed schedule either wastes engineer-hours on a chiller that's fine, or misses one that's failing early — this couples wear (runtime/health) with what the sensors are *currently* saying, so identical assets get different urgency if one is genuinely running hotter.

## 2. Dynamic Pricing — constant-elasticity demand curve

`lib/intelligence/pricing.ts`

```
demand(mult) = baseDemand × mult^(-elasticity) × seasonality × pacing
RevPAR(mult) = ADR(mult) × occupancy(mult)
```

A grid search over candidate multipliers (fine-grained steps around the current rate) finds the RevPAR-maximizing multiplier; a recommendation only fires when that optimum differs from the live rate by more than 4% (`Math.abs(delta) < 0.04` returns early) — a 1% theoretical improvement isn't worth a rate change a guest might notice.

**Why elasticity-based, not a rules table:** a rules table ("raise 5% if occupancy > 80%") can't tell you the *right* 5% vs 8% vs 2% — the elasticity curve already encodes how much demand a given price increase costs you, so the recommended number is the one that actually maximizes revenue, not a round guess.

## 3. Intelligent Staffing — demand forecast + greedy roster solve

`lib/intelligence/staffing.ts`

Hourly demand per department is forecast from occupancy and known service-time constants (e.g., housekeeping's 14-room/shift industry standard), then a shift roster is solved by greedy allocation (assign the largest gaps first) with a pairwise-swap improvement pass (try swapping two staff between shifts; keep the swap only if it reduces total unmet demand). A recommendation ("call in N from department X for shift Y") only fires when the solver's own local search can't close the gap by rebalancing existing staff across shifts — i.e., it's a genuine shortfall, not a solvable imbalance.

A second, separate check (`assessHousekeepingFatigue`) tracks **per-staff burnout** — a 0–1 accrual that builds during understaffed shifts and recovers during normal ones — and only raises a burnout recommendation once **two or more** attendants are simultaneously at-risk, filtering out "one hard afternoon" from a genuine pattern. The exposure number quoted (`≈ ₹8.2L` in a typical run) comes from a documented industry replacement-cost figure × a documented ~55% first-90-day departure odds for sustained overload — a real, citable number, not an arbitrary severity label.

## 4. Inventory Optimization — Holt linear trend + safety stock + EOQ

`lib/intelligence/inventory.ts`

```
Holt forecast:  level_t = α·y_t + (1-α)(level_{t-1} + trend_{t-1})
                trend_t = β·(level_t - level_{t-1}) + (1-β)·trend_{t-1}
safety stock:   1.65σ × sqrt(leadTimeDays)     (≈95% service level)
reorder point:  forecastDemand(leadTime) + safetyStock
EOQ:            sqrt(2 × annualDemand × orderCost / holdingCost)
```

A reorder recommendation fires when projected on-hand stock crosses the reorder point *before* the next scheduled delivery — not a flat par-level check, which is why the same "quantity on shelf" can be fine for a slow-moving item and urgent for a fast-moving one with a longer lead time.

## 5. Sentiment Analysis — aspect lexicon with clause-level negation

`lib/intelligence/sentiment.ts`

Reviews are split into clauses; each clause is scored against a weighted aspect keyword lexicon (room/wifi/food/staff/cleanliness/noise/value...), with a negation flag ("not clean", "wasn't great") flipping the clause's polarity rather than just its raw keyword hit. A root-cause link is only drawn (routing a complaint straight to a department) once **at least 3 independent reviews** mention the same aspect with a mean score below -0.2 — three guests naming the same problem is systemic; two is coincidence.

**Deliberately not an LLM classifier for this specific job:** task-dispatch has to be auditable in one line ("negated 'clean', floor-hotspot: 4") — a transformer's attention weights aren't a template you can put in a recommendation's `basis` field.

## 6. Guest Segmentation — k-means on six behavioral features

`lib/intelligence/segmentation.ts`

k=5 clusters, k-means++ initialization (spreads initial centroids apart to avoid a bad random draw collapsing two real segments into one), 30 iterations, over six min-max-normalized features: spend/night, nights, lead time, party size, spa engagement, average sentiment. Below 5 total in-house guests the module returns no clusters at all — five isn't enough for a "cluster" to mean anything statistically, so no clusters are fabricated for a near-empty resort.

## 7. Guest Personalization — rule-scored next-best-action

`lib/intelligence/personalization.ts`

For each guest, a set of candidate actions (service recovery, sea-view upgrade, VIP welcome, dinner offer, rebook offer, late-checkout, spa credit...) is scored 0–1 from real state: preference match, stay stage (arrival/mid-stay/departure computed from check-in/out timestamps), sentiment, loyalty tier, and — critically — whether the offer is actually *fulfillable* right now (a sea-view move only scores high if a vacant-clean sea-view room genuinely exists; otherwise it scores 0.2, below the publish floor). Only the **resort-wide top 3** scored guests (score ≥ 0.75) surface as recommendations — not every guest's top action, which would flood the queue with low-value noise.

Service recovery (`sentiment < -0.2`) stays available regardless of the guest's personalization consent — DPDP purpose limitation applies to profiling for *offers*, not to responding to a guest who's already unhappy.

## 8. AI Concierge (task dispatch) — weighted keyword intent classifier

`lib/intelligence/concierge.ts`

Each intent (housekeeping, maintenance, F&B, concierge, amenity, complaint, info, smalltalk) has a keyword set with per-keyword weights (`"room service"` weighs more than `"order"` alone); the highest-scoring intent above a confidence floor wins, and urgency escalates (tighter SLA) on complaint-flavored language or explicit urgency words ("now", "asap", "emergency"). The exact same classifier handles a guest's in-room chat message, a staff member's free-text Telegram report, and (via the adapter layer) a translated guest-app order — one dispatch pipeline, three entry points.

## 9. Guest Impact & Relocation — greedy same-or-better matching

`lib/intelligence/guestImpact.ts`

When an asset fails (`injectScenario`/real telemetry crossing the failure threshold), every guest on the floors it serves is matched against currently vacant-clean inventory, preferring same-or-better room type, outside the affected zone. This is a one-pass greedy match, not an optimal assignment solver — the honest tradeoff is speed and explainability over a marginally better global matching, which a presenter can verify by eye in seconds.

## 10. Energy Intelligence — occupancy-gated waste detection

`lib/intelligence/energy.ts`

Flags rooms that are `vacant` (no guest) but still `conditioned` at the occupied setpoint, and separately rooms that are occupied but the guest is "away" (a lower-confidence, opt-in signal). The gate is deliberately binary on occupancy — this module never touches an occupied room's comfort to save energy, it only recovers cost that has zero guest-facing tradeoff.

## 11. Group Block Optimizer — displacement analysis

`lib/intelligence/groupBlocks.ts`

```
displacementPerRoom = transientADR(currentOccupancy) - groupContractedADR
```

Only fires above a minimum group-room count and a minimum occupancy threshold (the group rooms have to be *provably* displacing sellable transient demand, not just theoretically underpriced in a half-empty resort), and separately flags the inverse case (group share too high at *low* occupancy — a signal to sell the block harder, not renegotiate it).

## 12. Weather & Event Radar — seeded forecast → operating playbooks

`lib/intelligence/weather.ts`

A deterministic per-day forecast (seeded, so re-running the same seed reproduces the same weather) drives rain/heatwave playbooks (pre-cooling, staffing adjustment) gated on both the weather condition *and* current occupancy/lead time — a heatwave hitting a half-empty resort has nothing at stake yet. Heat-linked AC wear feeds directly into predictive maintenance's own hazard model (module #1) rather than being a separate parallel concern. This module also has the one **real, live** data source in the project: `hooks/useLiveWeather.ts` polls Open-Meteo and this module prefers that real forecast the moment it arrives, falling back to the deterministic seeded one otherwise — the playbook logic itself never changes based on which source is live.

---

## 13. Causal Chain — cross-module event reconstruction

`lib/intelligence/causalChain.ts`

Not a 13th module — a **read** across four already-running ones, reconstructing "guest complained → diagnosis → work order → relocation → recovery" as a single visible timeline for any guest-reported maintenance issue in the last 8 hours:

1. **Complaint** — the request itself (`state.requests`, source=guest)
2. **Diagnosis** — corroborated only if the room's serving asset's own `failureProb7d ≥ 30%` (module #1) — otherwise it's treated as an isolated complaint, not systemic
3. **Work order** — dispatched status on that request
4. **Relocation** — did a relocation recommendation (module #9) name this exact room
5. **Recovery** — did guest-recovery risk (module #10, described above as In-Stay Recovery) flag this guest

This is the literal implementation of "show the whole ripple, not five separate dashboards" — every stage is a lookup, not a new calculation.

## 14. Demand Spine — 14-day occupancy/ADR forecast

`lib/intelligence/demandSpine.ts`

Seasonal-naive forecasting: day-of-week buckets of *real observed* occupancy from `state.kpiHistory`, blended toward the scenario's own day-of-week-shaped baseline as a trust anchor while history is thin:

```
historyWeight = clamp(observedSamples / 6, 0.25, 0.85)
expected = mean(observed) × historyWeight + baseline × (1 - historyWeight)
confidence = clamp(0.35 + historyWeight × 0.5, 0.35, 0.85)
```

Below 2 observed same-weekday samples, the forecast is pure scenario baseline with confidence pinned at 0.3 — an honest "not enough history yet" rather than a falsely-confident number from 1 data point. This is deliberately *not* a forward-reservations forecast (the simulator has no booking pipeline) — it forecasts the same demand pattern the tick engine itself already runs on, which is the forecast that's actually available to build against real state.

## 15. Guest Experience Index — one composite score per guest

`lib/intelligence/guestExperience.ts`

```
index = 0.40×sentiment + 0.25×SLA-hit-rate + 0.20×engagement + 0.15×loyalty
```

- **Sentiment** (40%) and **SLA hit-rate** (25%) are what the resort actually controls day-to-day, so they carry the most weight.
- **Engagement** (20%) is ancillary spend/night against a *segment-relative* benchmark — a luxury guest's bar is proportionally higher than a leisure-couple's, not a flat number.
- **Loyalty** (15%) describes the guest more than the stay, so it carries the least weight.

A guest with zero requests yet defaults to a neutral-good SLA component (0.75) rather than being penalized for not having asked for anything — absence of evidence isn't evidence of bad service. Bands (`excellent`/`good`/`at-risk`/`poor`) are fixed cutoffs on the 0–1 index, giving a GM one number to watch instead of three adjacent module dashboards that each see one slice of the same guest.
