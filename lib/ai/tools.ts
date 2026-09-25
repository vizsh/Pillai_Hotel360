import type { OpsSnapshot } from "./opsSnapshot";

/** Ollama/OpenAI-style function-calling tool schemas. Kept deliberately small — four tools,
 * each returning a targeted slice of the snapshot rather than the model ever seeing the full
 * thing, both because llama3.1:8b's practical context window is small on this hardware and
 * because a targeted result is what actually keeps an answer grounded instead of inviting the
 * model to browse-and-summarize a wall of JSON. */
export const TOOL_SCHEMAS = [
  {
    type: "function",
    function: {
      name: "find_room",
      description: "Look up a specific room or guest by room number or guest name. Use this for 'who is in room X' or 'which room is <guest> in'.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "A room number (e.g. '204') or a guest name (full or partial)." } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_open_issues",
      description: "List every currently open service request and unresolved alert across the resort — use this for 'what problems are there', 'what needs attention', 'any SLA breaches'.",
      parameters: {
        type: "object",
        properties: { onlyBreached: { type: "boolean", description: "If true, only include requests that have already breached their SLA." } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_guests",
      description: "List in-house guests, optionally filtered — use this for 'who are our VIPs', 'which guests are unhappy', 'list platinum members'.",
      parameters: {
        type: "object",
        properties: {
          filter: { type: "string", enum: ["all", "vip", "unhappy", "platinum", "gold", "silver"], description: "'unhappy' means sentiment below -0.2." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_resort_summary",
      description: "Get resort-wide KPIs — occupancy, ADR, RevPAR, guest satisfaction, revenue today. Use this for any high-level 'how is the resort doing' question.",
      parameters: { type: "object", properties: {} },
    },
  },
] as const;

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

/** Executes one tool call against the snapshot, returns a small JSON-serializable result —
 * pure and synchronous, no I/O, fully unit-testable without touching Ollama at all. An
 * unrecognized tool name returns an error object rather than throwing, since the caller feeds
 * this straight back to the model as a "tool" message either way. */
export function executeTool(call: ToolCall, snapshot: OpsSnapshot): unknown {
  switch (call.name) {
    case "find_room": {
      const query = String(call.arguments.query ?? "").trim().toLowerCase();
      if (!query) return { error: "no query provided" };
      const matches = snapshot.rooms.filter((r) => r.number.toLowerCase() === query || r.number.toLowerCase().includes(query) || (r.guestName && r.guestName.toLowerCase().includes(query)));
      if (!matches.length) return { found: false, message: `No room or guest matching "${call.arguments.query}".` };
      return {
        found: true,
        matches: matches.slice(0, 10).map((r) => {
          const guest = r.guestId ? snapshot.guests.find((g) => g.id === r.guestId) : null;
          return {
            room: r.number,
            floor: r.floor,
            status: r.status,
            guest: guest ? { name: guest.name, segment: guest.segment, loyalty: guest.loyalty, vip: guest.vip, sentiment: guest.sentiment, totalSpend: guest.totalSpend } : null,
            maintenanceRisk: r.maintRisk,
          };
        }),
      };
    }
    case "list_open_issues": {
      const onlyBreached = call.arguments.onlyBreached === true;
      const requests = onlyBreached ? snapshot.openRequests.filter((r) => r.slaBreached) : snapshot.openRequests;
      return {
        openRequestCount: snapshot.openRequests.length,
        breachedCount: snapshot.openRequests.filter((r) => r.slaBreached).length,
        requests: requests.slice(0, 15).map((r) => ({ room: r.room, type: r.type, text: r.text, status: r.status, ageMinutes: r.ageMinutes, slaBreached: r.slaBreached, assignedTo: r.assignedTo })),
        alerts: snapshot.openAlerts.slice(0, 10).map((a) => ({ severity: a.severity, title: a.title, ageMinutes: a.ageMinutes })),
      };
    }
    case "list_guests": {
      const filter = String(call.arguments.filter ?? "all");
      let guests = snapshot.guests;
      if (filter === "vip") guests = guests.filter((g) => g.vip);
      else if (filter === "unhappy") guests = guests.filter((g) => g.sentiment < -0.2);
      else if (["platinum", "gold", "silver"].includes(filter)) guests = guests.filter((g) => g.loyalty === filter);
      return {
        matchCount: guests.length,
        guests: guests.slice(0, 20).map((g) => ({ name: g.name, room: g.room, segment: g.segment, loyalty: g.loyalty, vip: g.vip, sentiment: g.sentiment, totalSpend: g.totalSpend })),
      };
    }
    case "get_resort_summary":
      return { asOf: snapshot.asOfSimTime, ...snapshot.kpis, openRequests: snapshot.openRequests.length, openAlerts: snapshot.openAlerts.length, pendingRecommendations: snapshot.pendingRecommendations.length };
    default:
      return { error: `unknown tool "${call.name}"` };
  }
}
