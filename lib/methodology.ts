import type { ModuleId } from "@/lib/sim/types";

export interface MethodologyEntry {
  /** Which file implements this — so "show me the code" is always one click away. */
  file: string;
  /** The real-world number this module's approach is calibrated against or validated
   * by — every figure here is drawn from published industry research, not invented. */
  benchmark: string;
  source: string;
  /** What would change if this ran against real data instead of the simulator. */
  realWorldNote: string;
}

export const methodology: Record<ModuleId, MethodologyEntry> = {
  maintenance: {
    file: "lib/intelligence/maintenance.ts",
    benchmark: "IoT-monitored predictive maintenance cuts unplanned equipment failures by ~60% and maintenance cost by ~25%; McKinsey estimates 10:1–30:1 ROI within 12–18 months for high-criticality assets.",
    source: "McKinsey; industry HVAC predictive-maintenance studies, 2024–2025",
    realWorldNote: "Same Weibull hazard math, fed by real BACnet telemetry (see /integrations) instead of the simulator's synthetic drift.",
  },
  pricing: {
    file: "lib/intelligence/pricing.ts",
    benchmark: "AI-driven dynamic pricing yields 15–20% RevPAR gains within 6 months for hotels new to revenue management, and ~17% higher total revenue on average versus static pricing.",
    source: "Hospitality Net; PriceLabs 2026 revenue management benchmarks",
    realWorldNote: "Demand curve today is seeded per-scenario; in production it would be fit against a property's actual booking-pace history.",
  },
  staffing: {
    file: "lib/intelligence/staffing.ts",
    benchmark: "Hospitality labor is 52% of full-service hotel opex; annual turnover runs 70–80% (vs 12–15% cross-industry), with housekeeping the most short-staffed department (38% of hotels). Room attendants sustainably clean 12–16 rooms per 8h shift (14-room standard used here); held above that standard, burnout research documents up to 55% departure within 90 days, and SHRM benchmarks the fully-loaded replacement cost at ~$9,932 per hourly hospitality worker.",
    source: "CBRE 2025 Trends; industry turnover benchmarking; SHRM 2025 hourly-worker replacement cost benchmarking; hotel housekeeper job-stress/burnout research",
    realWorldNote: "Demand profiles are synthetic; a live deployment would fit them against the property's own historical occupancy-to-labor ratio. Fatigue is tracked per housekeeping staff member (Staff.fatigue) from actual shift load vs. the 14-room standard — a real deployment would validate the accrual/recovery rates against wearable or scheduling-system fatigue data instead of the modeled constants. Roster fairness (coefficient of variation on tracked night/weekend shifts) and the room-assignment walking-distance optimiser both read real per-staff counters and real room coordinates already in this codebase — no synthetic inputs to swap out.",
  },
  inventory: {
    file: "lib/intelligence/inventory.ts",
    benchmark: "Holt linear-trend forecasting with a 1.65σ safety-stock buffer (95th-percentile service level) and EOQ order sizing are standard supply-chain formulas, not house-specific tuning.",
    source: "Classical inventory theory (Holt-Winters, Wilson EOQ)",
    realWorldNote: "Consumption history is seeded; a real deployment reads it from POS/procurement system exports.",
  },
  personalization: {
    file: "lib/intelligence/personalization.ts",
    benchmark: "Rule-scored next-best-action ranking — transparent by design so every recommendation can show its basis, rather than a black-box model a GM can't explain to a guest. Each action carries both a sentiment uplift and, where it's a real upsell rather than service recovery, an incremental ₹ spend rolled up into a resort-wide ancillary-revenue KPI.",
    source: "Design choice, not an external benchmark",
    realWorldNote: "Preference/history fields are seeded; real deployment reads guest profile + stay history from the PMS/CRM. Ancillary spend would reconcile against actual POS/spa-system transactions instead of being applied on accept.",
  },
  concierge: {
    file: "lib/intelligence/concierge.ts",
    benchmark: "Task dispatch is deliberately a weighted-keyword classifier, not an LLM — zero network dependency, fully inspectable logic, no hallucination risk in the flow that actually creates work orders. An opt-in conversational layer (lib/ai/*, app/api/concierge/route.ts) now sits on top: RAG over the resort's own knowledge base grounds a local Ollama model (llama3.1:8b, nomic-embed-text embeddings), matching the blueprint's own 'Runs on a local open-weight LLM for privacy and offline resilience' and 'Guardrails prevent the bot from promising refunds or unapproved discounts' asks.",
    source: "Design choice for task dispatch; blueprint's AI Concierge module spec for the RAG layer",
    realWorldNote: "The keyword classifier remains the sole path to an actual task/work order — the LLM only ever answers questions, it never dispatches anything. A failure mode was verified live during testing (the model stated a Gold/Platinum-exclusive benefit applied to a Silver guest, despite the correct tier gate being in the retrieved context) and traced to two causes: a contradictory knowledge-base entry (fixed — lib/intelligence/concierge.ts's checkout answer now states the same tier restriction as lib/ai/knowledge.ts's loyalty-tiers doc, instead of contradicting it) and the model simply not cross-checking a stated benefit against the guest's own tier (mitigated with a deterministic post-generation guardrail, lib/ai/conciergePrompt.ts's correctTierEligibility, that swaps in the tier-correct answer for the small, named set of tier-gated benefits — the same pattern already used for refund/discount language, just with a known-correct replacement instead of a deflection). A production deployment would still add a stricter grounding check for benefits outside that named set (e.g. requiring the reply to quote retrieved text rather than paraphrase it).",
  },
  sentiment: {
    file: "lib/intelligence/sentiment.ts",
    benchmark: "A 1% increase in online reputation is associated with 0.89% higher ADR, 0.54% higher occupancy, and 1.42% higher RevPAR. 4.5+-rated hotels earn 10–20% higher ADR than lower-rated competitors.",
    source: "ScienceDirect (hotel reputation/revenue signaling studies)",
    realWorldNote: "Reviews are seeded text; real deployment ingests OTA review APIs (TripAdvisor, Google, Booking.com) and PMS in-stay feedback.",
  },
  segmentation: {
    file: "lib/intelligence/segmentation.ts",
    benchmark: "k-means with k-means++ initialization is the standard unsupervised approach for behavioral segmentation — segment-level elasticity now blends directly into the pricing module's demand curve.",
    source: "Classical clustering methodology",
    realWorldNote: "Behavioral features are seeded per synthetic guest; real deployment computes them from PMS/CRM booking and spend history.",
  },
  relocation: {
    file: "lib/intelligence/guestImpact.ts",
    benchmark: "Same-or-better-type greedy matching against vacant-clean inventory is standard hotel service-recovery practice during an outage.",
    source: "Operational practice, not an external benchmark",
    realWorldNote: "Room/asset state already matches PMS + BMS semantics 1:1 — this module needs no changes to run on real data.",
  },
  energy: {
    file: "lib/intelligence/energy.ts",
    benchmark: "Hotel rooms sit vacant ~60–70% of the time yet draw 60–80% of occupied-room HVAC cost while empty — a 35–40% pure-waste band. Occupancy-based conditioning recovers 20–35% of HVAC spend industry-wide. Carbon uses CEA's provisional India grid emission factor (0.71 kgCO2/kWh, FY2024-25, Version 21.0); water uses the 300-400L/occupied-room-night range Indian resorts report, midpoint 350L.",
    source: "ENERGY STAR; hotel HVAC energy-management studies, 2025–2026; CEA CO2 Baseline Database v21.0 (Dec 2025); Indian hotel water-consumption benchmarking",
    realWorldNote: "The 'guest checked in but away' signal already runs on a documented camera-presence contract — see /integrations. Water has no per-tick simulation behind it (unlike energy) — it's a same-day estimate from current occupancy, not an accumulating meter; a real deployment would replace it with actual sub-metering.",
  },
  groupblock: {
    file: "lib/intelligence/groupBlocks.ts",
    benchmark: "Displacement analysis — comparing a negotiated group/event block's rate against the transient rate the same rooms would command on the same dates — is standard hotel revenue-management practice for evaluating group business.",
    source: "Hospitality Net; Cloudbeds and Revenuenaire revenue-management methodology guides",
    realWorldNote: "This reasons over the currently in-house group/transient mix, since the simulator has no forward-reservations pipeline (guests materialize at check-in, not at booking). A real deployment would run the same math against a specific pending group RFP before it's accepted, using the PMS's booking pace and group-block records.",
  },
  recovery: {
    file: "lib/intelligence/guestRecovery.ts",
    benchmark: "A 525-upscale-hotel study of 11,000 guest complaints found only 68% of service recoveries landed inside the guest's expected timeframe; separate research found only complete, timely resolution — not the gesture alone — predicts repeat patronage. The 'service recovery paradox' (a well-handled failure can out-satisfy no failure at all) has mixed empirical support, so this module leans on timeliness and completeness rather than claiming the paradox as a guarantee.",
    source: "Hotel service-recovery timeliness research; service recovery paradox literature (McCollough & Bharadwaj, 1992, and later replications)",
    realWorldNote: "Risk scoring reads request SLA breaches and live sentiment, both already real signals in this codebase. A live deployment would add post-recovery outcome tracking (did the guest's final review improve) — not built here, since it needs a persisted before/after link this module doesn't yet keep.",
  },
  weather: {
    file: "lib/intelligence/weather.ts",
    benchmark: "Weather-aware operations (moving activities indoors, adjusting staffing and menus for rain; prioritizing AC maintenance ahead of a heat wave) is standard playbook practice for leisure resorts, and heat-linked HVAC failure risk is a named, real operational pattern.",
    source: "Operational practice, not a single external benchmark",
    realWorldNote: "The one module with a real external integration built, not just described: app/api/weather calls Open-Meteo live (no API key) for Goa, India, refreshed automatically every 20 minutes (hooks/useLiveWeather.ts) — the playbook logic below never changed to accommodate this, since the adapter swaps in behind forecastWeather()'s existing signature. Falls back to the seeded deterministic forecast (still SIMULATED, tagged as such) if the API is unreachable, same fail-soft convention as lib/ai/ollama.ts. A real deployment would point the same route at the actual property's coordinates.",
  },
};
