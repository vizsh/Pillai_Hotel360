import type { OpsSnapshot } from "./opsSnapshot";
import { executeTool, routeTools, type ToolCall } from "./tools";

/** Model-free answers. When no language model is reachable (a deployment without Ollama and without a
 * Nugen/hosted key, or a provider outage) the assistant still answers: the same deterministic routing that
 * pre-fetches data for the model formats it into tables. Fewer flourishes than a model, identical facts. */
export interface OfflineAnswer {
  reply: string;
  toolsUsed: string[];
}

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const table = (header: string[], rows: (string | number)[][]) =>
  [`| ${header.join(" | ")} |`, `| ${header.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");

type R = Record<string, unknown>;

function section(call: ToolCall, data: unknown): string | null {
  const d = data as R;
  switch (call.name) {
    case "find_room": {
      if (!d.found) return String(d.message ?? "No matching room or guest.");
      const rows = (d.matches as R[]).map((m) => {
        const g = m.guest as R | null;
        return [String(m.room), String(m.status), g ? String(g.name) : "vacant", g ? `${g.segment} · ${g.loyalty}${g.vip ? " · VIP" : ""}` : "—", `${m.maintenanceRiskPercent}%`];
      });
      return "**Room lookup**\n\n" + table(["Room", "Status", "Guest", "Profile", "Maintenance risk"], rows);
    }
    case "list_open_issues": {
      const reqs = (d.requests as R[]).slice(0, 10).map((r) => [String(r.room), String(r.type), String(r.text), `${r.ageMinutes} min`, r.slaBreached ? "BREACHED" : "ok", String(r.assignedTo ?? "unassigned")]);
      const alerts = (d.alerts as R[]).slice(0, 6).map((a) => [String(a.severity), String(a.title), `${a.ageMinutes} min`]);
      return `**Open issues:** ${d.openRequestCount} requests (${d.breachedCount} past SLA)\n\n` + (reqs.length ? table(["Room", "Type", "Request", "Age", "SLA", "Assigned"], reqs) : "No open requests.") + (alerts.length ? "\n\n" + table(["Severity", "Alert", "Age"], alerts) : "");
    }
    case "list_guests": {
      const rows = (d.guests as R[]).slice(0, 12).map((g) => [String(g.name), String(g.room), String(g.segment), String(g.loyalty), g.vip ? "yes" : "no", String(g.sentiment)]);
      return `**Guests (${d.matchCount})**\n\n` + (rows.length ? table(["Guest", "Room", "Segment", "Loyalty", "VIP", "Sentiment"], rows) : "No matching guests.");
    }
    case "list_planned_actions": {
      const rows = (d.actions as R[]).slice(0, 10).map((a) => [String(a.module), String(a.title), String(a.impact), `${a.confidencePercent}%`]);
      return `**Planned actions (${d.count})**\n\n` + (rows.length ? table(["Module", "Action", "Impact", "Confidence"], rows) : "Nothing queued.");
    }
    case "get_resort_summary":
      return "**Resort summary**\n\n" + table(["Metric", "Value"], [["Occupancy", `${d.occupancyPercent}%`], ["ADR", inr(Number(d.adr))], ["RevPAR", inr(Number(d.revpar))], ["Guest satisfaction", String(d.guestSatisfactionScore)], ["Revenue today", inr(Number(d.revenueToday))], ["Open requests", String(d.openRequests)], ["Open alerts", String(d.openAlerts)], ["Pending recommendations", String(d.pendingRecommendations)]]);
    case "get_financials": {
      const p = d.pricingEngine as R;
      return "**Financials (INR)**\n\n" + table(["Metric", "Value"], [["Occupancy", `${d.occupancyPercent}%`], ["ADR", inr(Number(d.adr))], ["RevPAR", inr(Number(d.revpar))], ["TRevPAR", inr(Number(d.trevpar))], ["Total revenue so far today", inr(Number(d.totalRevenueToday))], ["Direct-booking share", `${d.directBookingSharePercent}%`], ["OTA commission avoided (20% model)", inr(Number(d.otaCommissionAvoidedToday))], ["Recommended rate multiplier", String(p.recommendedRateMultiplier)], ["Projected RevPAR change", p.projectedRevparChangePercent === null ? "n/a" : `${p.projectedRevparChangePercent}%`]]);
    }
    case "get_weather_outlook": {
      const rows = (d.days as R[]).map((x) => [`+${x.dayOffset}`, String(x.condition), `${x.tempC}°C`, `${x.rainProbabilityPercent}%`, `×${x.fnbSpendMultiplier}`]);
      return `**7-day outlook** (${d.source})\n\n` + table(["Day", "Condition", "Temp", "Rain", "F&B spend"], rows);
    }
    case "get_public_signals": {
      if (!d.available) return String(d.message);
      const h = (d.officialHazards as R[]).slice(0, 4).map((x) => [String(x.name || x.eventType), String(x.alertLevel), `${x.distanceKmFromResort} km`, String(x.assessment)]);
      return `**Public signals:** concern ${d.concernScorePercent}%; live sources: ${(d.sourcesLive as string[]).join(", ") || "none"}\n\n` + (h.length ? table(["Hazard", "Level", "Distance", "Assessment"], h) : "No official hazards listed.");
    }
    case "get_asset_risk": {
      const rows = (d.assets as R[]).slice(0, 5).map((a) => [String(a.name), String(a.kind), `${a.failureProbability7dPercent}%`, `${a.remainingUsefulLifeDays} d`, `${a.healthPercent}%`]);
      return "**Equipment risk**\n\n" + table(["Asset", "Type", "P(fail ≤ 7d)", "Life left", "Health"], rows);
    }
    case "search_knowledge": {
      const results = (d.results as R[]) ?? [];
      return results.length ? results.map((r) => `**${r.topic}** — ${r.detail}`).join("\n\n") : null;
    }
    default:
      return null;
  }
}

export function offlineAnswer(message: string, snapshot: OpsSnapshot): OfflineAnswer | null {
  const calls = routeTools(message, snapshot).filter((c) => c.name !== "calculate");
  const parts: string[] = [];
  const used: string[] = [];
  for (const call of calls.slice(0, 4)) {
    const text = section(call, executeTool(call, snapshot));
    if (text) {
      parts.push(text);
      if (!used.includes(call.name)) used.push(call.name);
    }
  }
  if (!parts.length) return null;
  return { reply: `**Here is what the live data shows.**\n\n${parts.join("\n\n")}\n\n_Answered from live data with templates — no language model was reachable, so no free-text reasoning was added._`, toolsUsed: used };
}
