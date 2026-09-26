import type { ResortModel } from "@/lib/architecture/types";
import type { ModuleId, Recommendation, SimState } from "@/lib/sim/types";
import { injectScenario } from "@/lib/sim/actions";
import { refreshRecommendations, tick } from "@/lib/sim/engine";
import { statusFor } from "@/lib/intelligence/maintenance";
import { nextBestActions } from "@/lib/intelligence/personalization";

/** "Automation Scenarios" — a curated, explain-then-run catalog for demonstrating full
 * detect → decide → act loops, one module at a time, distinct from the generic Autopilot
 * toggle (which just auto-executes WHATEVER happens to already be pending). Every entry here
 * either (a) finds a currently pending, real recommendation of that module and runs it through
 * the exact same acceptRecommendation() a manual click uses, or (b) forces the specific,
 * minimal, real state field a module's own detector reads (the same technique
 * lib/sim/actions.ts's existing injectScenario already uses for the maintenance/relocation
 * demo) so the module's own real math produces a fresh one on demand — nothing here is a
 * scripted fake outcome; it's the production logic, cued to fire predictably for a live demo. */

export type ScenarioKind = "recommendation" | "asset-soft" | "asset-failure" | "guest-message" | "guest-app-order";

export interface ScenarioDef {
  id: string;
  title: string;
  module: ModuleId;
  situation: string;
  detection: string;
  reasoning: string;
  kind: ScenarioKind;
  /** For kind "recommendation": narrows which pending rec of this module counts as a match
   * (several modules, e.g. staffing, produce more than one distinct situation). */
  match?: (r: Recommendation) => boolean;
}

function pickAsset(state: SimState, model: ResortModel, exclude: (id: string, st: SimState["assets"][string]) => boolean) {
  const candidates = model.assets.filter((a) => {
    const st = state.assets[a.id];
    return st && !exclude(a.id, st);
  });
  if (!candidates.length) return null;
  // Most "due" first — lowest remaining health — so repeated runs cycle through different plant.
  candidates.sort((a, b) => state.assets[a.id].health - state.assets[b.id].health);
  return candidates[0];
}

export function pickOccupiedRoom(state: SimState, model: ResortModel) {
  const occupied = model.rooms.filter((r) => state.rooms[r.id]?.guestId);
  if (!occupied.length) return null;
  return occupied[Math.floor(Math.random() * occupied.length)];
}

/** Forces the SAME two telemetry fields lib/intelligence/maintenance.ts's real Weibull +
 * anomaly-z-score model reads (temp/vibration deviation from baseline) — not the derived
 * failureProb7d/rulDays directly — then lets the model recompute status from that telemetry,
 * exactly like a real sensor spike would. Kept below injectScenario's full-failure severity so
 * this scenario reads as "caught early", distinct from the harder failure scenario below. */
export function triggerSoftMaintenanceIssue(state: SimState, model: ResortModel): string | null {
  const asset = pickAsset(state, model, (_, st) => st.status === "failed" || st.status === "service");
  if (!asset) return null;
  const st = state.assets[asset.id];
  st.temp = st.tempBase * 1.08;
  st.vibration = st.vibBase * 1.55;
  st.status = statusFor(0.55, st);
  refreshRecommendations(state, model);
  return asset.id;
}

export function triggerAssetFailure(state: SimState, model: ResortModel): string | null {
  const asset = pickAsset(state, model, (_, st) => st.status === "failed" || st.status === "service");
  if (!asset) return null;
  injectScenario(state, model, asset.id);
  return asset.id;
}

/** Forces the exact precondition lib/intelligence/personalization.ts's own "upgrade" action
 * reads — a stated sea-view preference plus a genuinely vacant-clean sea-view room to move
 * them into (without a real match to offer, the module scores this action 0.2, well under its
 * own 0.75 publish gate). Only nudges the one field the module actually checks (Guest.prefs);
 * everything else about the guest — sentiment, loyalty, spend — is untouched. Because
 * personalizationRecommendations() only ever publishes the resort-wide top 3 scored guests,
 * making the action *eligible* isn't enough — this replicates that same guest-wide scan
 * (read-only, using the real nextBestActions()) to confirm our nudged guest actually clears
 * it before committing, trying a few different candidates rather than gambling on one. */
export function triggerPersonalizationVip(state: SimState, model: ResortModel): string | null {
  const hasVacantSeaView = model.rooms.some((r) => r.seaView && state.rooms[r.id]?.status === "vacant-clean");
  if (!hasVacantSeaView) return null;
  const pool = Object.values(state.guests).filter((g) => g.roomId && g.consentPersonalization && g.sentiment >= -0.15 && !model.roomById.get(g.roomId!)?.seaView && !g.prefs.includes("sea-view"));
  for (let attempt = 0; attempt < Math.min(6, pool.length); attempt++) {
    const g = pool[Math.floor(Math.random() * pool.length)];
    const prevPrefs = g.prefs;
    g.prefs = [...g.prefs, "sea-view"];
    const top = nextBestActions(g, state, model)[0];
    if (top?.id !== "upgrade") {
      g.prefs = prevPrefs;
      continue;
    }
    const scored = Object.values(state.guests)
      .filter((x) => x.roomId)
      .map((x) => ({ id: x.id, score: nextBestActions(x, state, model)[0]?.score ?? 0 }))
      .filter((x) => x.score >= 0.75)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    if (scored.some((x) => x.id === g.id)) {
      refreshRecommendations(state, model);
      return g.id;
    }
    g.prefs = prevPrefs;
  }
  return null;
}

export function isPhysicalScenario(kind: ScenarioKind): boolean {
  return kind === "asset-failure" || kind === "guest-message" || kind === "guest-app-order";
}

/** Advances the REAL sim clock (the same tick() the global loop calls every frame) in visible
 * steps and re-evaluates recommendations after each one — used when a "recommendation"-kind
 * scenario has no live match at the instant it's picked. Not a fabricated wait: population-
 * level modules (pricing, staffing, groupblock, weather, segmentation) genuinely only produce
 * a fresh recommendation once enough simulated time has passed for their own conditions to
 * shift, so this is the honest way to give one a chance to appear rather than pretending one
 * already existed. */
export function tickForwardStep(state: SimState, model: ResortModel, stepMin = 30) {
  tick(state, model, stepMin);
  refreshRecommendations(state, model);
}

export const SCENARIOS: ScenarioDef[] = [
  {
    id: "maintenance-early",
    title: "Chiller telemetry drifting toward failure",
    module: "maintenance",
    situation: "A rooftop plant asset's temperature and vibration readings start drifting away from their healthy baseline — nothing has broken yet.",
    detection: "A Weibull hazard model on cumulative runtime hours is combined with a live anomaly z-score on temperature/vibration deviation from baseline. Crossing a 35% 7-day failure probability is what actually creates the work order — not a fixed calendar schedule.",
    reasoning: "Servicing overnight (02:00–05:00, the lowest-occupancy window) costs one engineer-hour. Waiting for it to actually fail costs an emergency callout plus every guest on the floors it serves losing climate control mid-stay. The math favors acting on the leading indicator.",
    kind: "asset-soft",
  },
  {
    id: "relocation-failure",
    title: "HVAC unit fails mid-stay",
    module: "relocation",
    situation: "A climate-control asset goes fully offline right now, mid-stay, affecting every occupied room on the floors it serves.",
    detection: "The asset's own telemetry (temperature +18°, vibration 3× baseline) crosses the failure threshold and its status flips to failed — the same signal path as the early-warning scenario, just past the point of no return.",
    reasoning: "Every minute a guest sits in a room with no AC is a satisfaction hit that compounds toward a bad review. A greedy same-or-better-type match against vacant-clean inventory outside the affected floors resolves every displaced guest in one pass, cheaper than one comped night, let alone the alternative.",
    kind: "asset-failure",
  },
  {
    id: "pricing-demand",
    title: "Demand outpacing today's rate",
    module: "pricing",
    situation: "Booking pace and current occupancy for the remaining unsold nights have moved past what today's posted rate assumed.",
    detection: "A constant-elasticity demand curve is re-solved across a RevPAR grid search; when the RevPAR-optimal multiplier differs from the live rate by more than 4%, the gap is judged large enough to act on rather than noise.",
    reasoning: "The elasticity model already accounts for how many guests would still book at the higher price given current pace — raising the rate captures revenue the demand curve says is there without materially hurting conversion.",
    kind: "recommendation",
  },
  {
    id: "staffing-gap",
    title: "Next shift is short-staffed",
    module: "staffing",
    situation: "The upcoming shift's forecast workload exceeds what the current roster can cover in one department.",
    detection: "An hourly demand forecast per department is solved against the existing roster via greedy allocation plus pairwise-swap improvement; whatever gap survives that optimization — not just a raw headcount rule — is what triggers the call-in.",
    reasoning: "An unmet slot in the model maps to a measurable number of extra late requests that shift. Calling in one off-duty person now is cheaper than the SLA breaches — and the guest complaints — that gap would otherwise produce.",
    kind: "recommendation",
    match: (r) => r.id.startsWith("rec-staff-") && r.id !== "rec-staff-hk-burnout",
  },
  {
    id: "staffing-burnout",
    title: "Housekeeping team trending toward burnout",
    module: "staffing",
    situation: "Two or more room attendants are carrying a sustained rooms-per-shift load well above the standard, not just a single hard afternoon.",
    detection: "A per-staff fatigue-accrual model tracks load against the standard shift size over time; it only fires once the at-risk cohort is at least two people, filtering out normal single-day variance.",
    reasoning: "Documented first-90-day departure odds for overworked room attendants run as high as 55% — rebalancing the roster now costs a shift reshuffle; replacing a departed attendant costs a real, budgeted number this module carries explicitly.",
    kind: "recommendation",
    match: (r) => r.id === "rec-staff-hk-burnout",
  },
  {
    id: "inventory-reorder",
    title: "Amenity stock about to run out",
    module: "inventory",
    situation: "A stocked item's consumption trend is on track to breach its reorder point before the next scheduled delivery.",
    detection: "A Holt linear forecast projects the consumption trend forward against lead time and a safety-stock buffer sized to demand variability — not a flat par-level check.",
    reasoning: "A mid-stay stockout on a guest-facing amenity is a service failure that's cheaper to prevent than apologize for. The reorder quantity itself is EOQ-sized, not a round-number guess.",
    kind: "recommendation",
  },
  {
    id: "personalization-vip",
    title: "VIP guest has an unmet room preference",
    module: "personalization",
    situation: "A guest's stated preference (e.g. sea view) doesn't match the room they're actually in, and a matching room is sitting vacant-clean right now.",
    detection: "A rule-scored next-best-action ranking checks stated preferences against the live room assignment and current vacant-clean inventory in real time — the offer only fires when a matching room genuinely exists to move them into.",
    reasoning: "For a VIP this specific gap is scored as the single highest-value, lowest-cost move available for their stage of stay — free to the resort (inventory would otherwise sit empty) and worth more to loyalty than any discount.",
    kind: "recommendation",
    match: (r) => r.body?.toLowerCase().includes("sea-view") || r.title.toLowerCase().includes("upgrade") || r.title.toLowerCase().includes("sea-view"),
  },
  {
    id: "recovery-silent-unhappy",
    title: "Guest going quiet before checkout",
    module: "recovery",
    situation: "A guest checking out within the next day and a half hasn't complained loudly, but their request-delay pattern and sentiment trend match guests who leave and post the bad review afterward.",
    detection: "A weighted risk score combines sentiment with SLA-breach density, gated to only guests inside the pre-checkout window — the model is specifically built to catch the guest who never raises their voice.",
    reasoning: "A recovery gesture sized to guest value and issue severity, delivered before checkout, is far cheaper than the reputational cost of a public 2-star review after the fact.",
    kind: "recommendation",
  },
  {
    id: "sentiment-root-cause",
    title: "Review cluster points at one root cause",
    module: "sentiment",
    situation: "Several recent reviews independently mention the same aspect of the stay trending negative.",
    detection: "Aspect-level lexicon scoring with clause-level negation handling requires at least 3 independent mentions with a negative average score before linking them back to a specific department or asset as one root cause.",
    reasoning: "Three independent guests naming the same problem is a systemic issue, not a one-off — routing straight to the responsible department with the aggregated evidence attached skips the manual review-reading queue entirely.",
    kind: "recommendation",
  },
  {
    id: "energy-waste",
    title: "Vacant room still drawing full HVAC load",
    module: "energy",
    situation: "A room with no one in it is still conditioning at the occupied setpoint.",
    detection: "An occupancy-gated waste detector compares live room status against HVAC draw — the flag only fires for rooms that are actually vacant, never an occupied one, however wasteful its usage looks.",
    reasoning: "Zero guest impact, pure cost recovery — there's no comfort tradeoff to weigh for an empty room, so the system doesn't wait for a human to approve turning the setpoint down.",
    kind: "recommendation",
  },
  {
    id: "groupblock-underpriced",
    title: "Group block underpriced for today's demand",
    module: "groupblock",
    situation: "A contracted group/event block's rate is sitting well below what the same rooms would earn at today's transient demand.",
    detection: "A displacement analysis compares the group's contracted ADR against current transient ADR for the same inventory, gated to only fire when occupancy is high enough that the group rooms are provably displacing sellable transient demand.",
    reasoning: "At high occupancy, every group-block room is a transient sale foregone — the revenue gap the model surfaces is exactly what a renegotiation conversation with the account manager is worth opening.",
    kind: "recommendation",
  },
  {
    id: "weather-heatwave",
    title: "Heatwave forecast tomorrow",
    module: "weather",
    situation: "Tomorrow's seeded 7-day forecast crosses into heatwave conditions while occupancy is high enough for it to matter operationally.",
    detection: "The forecast is gated on both the weather condition threshold and current occupancy/lead time — a heatwave with the resort half-empty doesn't trigger a playbook, because there's nothing at stake yet.",
    reasoning: "Heat-linked AC wear feeds directly into the same predictive-maintenance hazard model — pre-cooling and a staffing adjustment a day ahead is cheaper than the maintenance cascade a hot spell would otherwise cause across the whole plant.",
    kind: "recommendation",
  },
  {
    id: "segmentation-offer",
    title: "Behavioral cluster ready for a targeted offer",
    module: "segmentation",
    situation: "A cohort of in-house guests clusters together on spend, lead time, party size and stay length in a way that matches one of five recurring behavioral profiles.",
    detection: "k-means (k=5, k-means++ initialisation) runs over six min-max-normalized guest features every refresh cycle; a cluster only produces a recommendation once it has enough members to be a real pattern, not two guests who happen to look alike.",
    reasoning: "A segment-matched offer converts better than a blanket promotion and costs nothing to send — the model already knows which offer template historically lands with this exact profile.",
    kind: "recommendation",
  },
  {
    id: "concierge-live-request",
    title: "Guest raises an issue in chat, right now",
    module: "concierge",
    situation: "A guest types a free-text message into the in-room concierge chat — no menu, no category picker, just what they'd actually say.",
    detection: "A weighted keyword-intent classifier scores the message against department-tagged keyword sets, with urgency detection for language like 'now' or 'urgent' escalating the SLA automatically.",
    reasoning: "Classifying and dispatching immediately beats waiting for a human to read the chat log — especially for complaint-flavored language, where every extra minute of silence is what turns a fixable problem into a bad review.",
    kind: "guest-message",
  },
  {
    id: "guest-app-order",
    title: "Guest places an order from their phone",
    module: "concierge",
    situation: "A guest, using the separate guest-facing app on their own phone (not this dashboard), places a room-service order or raises a request.",
    detection: "The guest app's order is translated from its own request schema onto this resort's request types (lib/integration/guestAppAdapter.ts) and lands in a real inbox this browser polls every 5 seconds — the literal bridge between two independently-deployed apps with no shared database.",
    reasoning: "The guest never has to call the front desk or find a staff member — their own phone is the interface, and the resulting ticket is dispatched to the right department exactly like any other request source, just attributed to the guest app instead of a phone call.",
    kind: "guest-app-order",
  },
];
