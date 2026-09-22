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
    benchmark: "Hospitality labor is 52% of full-service hotel opex; annual turnover runs 70–80% (vs 12–15% cross-industry), with housekeeping the most short-staffed department (38% of hotels).",
    source: "CBRE 2025 Trends; industry turnover benchmarking",
    realWorldNote: "Demand profiles are synthetic; a live deployment would fit them against the property's own historical occupancy-to-labor ratio.",
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
    benchmark: "Deliberately a weighted-keyword classifier, not an LLM — zero network dependency, fully inspectable logic, no hallucination risk in a live guest-facing flow.",
    source: "Design choice, not an external benchmark",
    realWorldNote: "Could be swapped for an LLM-backed classifier behind the same interface; the deterministic version stays as a reliability fallback.",
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
    benchmark: "Hotel rooms sit vacant ~60–70% of the time yet draw 60–80% of occupied-room HVAC cost while empty — a 35–40% pure-waste band. Occupancy-based conditioning recovers 20–35% of HVAC spend industry-wide.",
    source: "ENERGY STAR; hotel HVAC energy-management studies, 2025–2026",
    realWorldNote: "The 'guest checked in but away' signal already runs on a documented camera-presence contract — see /integrations.",
  },
  groupblock: {
    file: "lib/intelligence/groupBlocks.ts",
    benchmark: "Displacement analysis — comparing a negotiated group/event block's rate against the transient rate the same rooms would command on the same dates — is standard hotel revenue-management practice for evaluating group business.",
    source: "Hospitality Net; Cloudbeds and Revenuenaire revenue-management methodology guides",
    realWorldNote: "This reasons over the currently in-house group/transient mix, since the simulator has no forward-reservations pipeline (guests materialize at check-in, not at booking). A real deployment would run the same math against a specific pending group RFP before it's accepted, using the PMS's booking pace and group-block records.",
  },
};
