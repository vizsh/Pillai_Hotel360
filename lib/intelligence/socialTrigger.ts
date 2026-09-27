import type { ResortModel } from "@/lib/architecture/types";
import type { Recommendation, SimState } from "@/lib/sim/types";
import { getHazardEvents, getSignalAnalysis, socialTriggerState } from "./socialSignals";
import { ruleParseScenario } from "@/lib/ai/scenarioParse";

const OCCUPANCY_GATE = 0.25;
const SUPPRESS_MS = 6 * 60 * 60 * 1000;

/** Social signal AS A TRIGGER (docs/WEATHER_AND_SIGNALS.md §8) — the same detect -> understand ->
 * decide -> act loop every other module runs, with public chatter as the detector: a burst of
 * posts (understood by the Nugen-aligned classifier, or the rule fallback) that (a) has genuinely
 * risen versus its own recent baseline and (b) is corroborated by at least one independent
 * official agency (GDACS or EONET) fires a recommendation — not a nudge, a real card in the
 * queue — that already carries the derived weather scenario ready for the what-if panel.
 * Distinct from weatherRecommendations() (weather.ts), which reacts to the FORECAST; this reacts
 * to what people are reporting right now, which can lead the forecast by hours. */
export function socialTriggerRecommendations(state: SimState, model: ResortModel): Recommendation[] {
  if (state.kpis.occupancy < OCCUPANCY_GATE) return [];
  const trig = socialTriggerState();
  if (!trig.triggered) return [];

  const existing = state.recommendations["rec-social-trigger"];
  if (existing?.status !== "pending" && existing && state.t - existing.createdAt < SUPPRESS_MS / 60000) return [];

  const analysis = getSignalAnalysis();
  const hazards = getHazardEvents();
  const topPost = analysis
    ? Object.values(analysis.byId)
        .filter((a) => a.urgency > 0)
        .sort((a, b) => b.urgency - a.urgency)[0]
    : null;
  const nearestHazard = [...hazards].sort((a, b) => a.fromDate < b.fromDate ? 1 : -1)[0];
  const derivedText = topPost?.summary ?? nearestHazard?.name ?? "severe weather reported nearby";
  const scenario = ruleParseScenario(derivedText);

  const inHouse = Object.values(state.guests).filter((g) => g.roomId).length;
  const providerNote = trig.corroboratingProviders >= 2 ? "two independent agencies (GDACS and EONET)" : "one independent agency";

  return [
    {
      id: "rec-social-trigger",
      module: "weather",
      title: "Public signal predicts a weather event before the forecast confirms it",
      body: `Disruption chatter rose ${Math.round(trig.burstRate * 100)} points over its own recent baseline and is corroborated by ${providerNote}. Leading report: "${derivedText}". ${inHouse} guests in house.`,
      confidence: Math.min(0.9, 0.4 + trig.burstRate + trig.corroboratingProviders * 0.1),
      basis: [
        `disruption score rose ${Math.round(trig.burstRate * 100)} pts over ${trig.samples} polls (burst gate: ≥12 pts)`,
        `${trig.corroboratingProviders} independent official agenc${trig.corroboratingProviders === 1 ? "y" : "ies"} reporting a matching event (corroboration gate: ≥1)`,
        topPost ? `highest-urgency post: "${topPost.summary}" (urgency ${topPost.urgency.toFixed(2)}, intent ${topPost.intent})` : `nearest official event: ${nearestHazard?.name ?? "none"}`,
        `derived what-if scenario: ${scenario.note} — ${scenario.tempC}°C, ${Math.round(scenario.rainProbability * 100)}% rain`,
      ],
      impact: `Social reports can lead an official forecast update by hours — corroborated early warning buys the property lead time to run the weather playbook before occupancy and staffing are already locked in.`,
      action: `Open the Weather Twin what-if pre-loaded with the derived scenario and review the staffing/energy playbook before it becomes the official forecast.`,
      targetKind: "resort",
      targetId: "social-trigger",
      createdAt: state.t,
      status: "pending",
      payload: { source: "social-trigger", scenario, burstRate: trig.burstRate, corroboratingProviders: trig.corroboratingProviders },
    },
  ];
}
