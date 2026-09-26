import type { ResortModel } from "@/lib/architecture/types";
import type { SimState } from "@/lib/sim/types";
import { compositeRisk } from "./colors";

export interface TwinQueryResult {
  rooms: string[];
  caption: string;
}

/** Deterministic "show me" pattern matcher — not an LLM call. Camera-driving commands live
 * here for the same reason task dispatch lives in lib/intelligence/concierge.ts's keyword
 * classifier rather than an LLM: moving the camera and highlighting rooms based on a
 * hallucinated room list would be worse than useless, and every one of these patterns reuses
 * a real, already-computed signal (compositeRisk, live sentiment, actual SLA math) rather than
 * inventing new logic just for this feature. Both the Ctrl+K palette (Overlays.tsx) and the
 * ops assistant (AssistantPage.tsx) call this same function, so "which rooms are at risk
 * tonight" behaves identically whether it's typed or asked. Returns null when nothing in the
 * text matches a known pattern — the caller falls back to its own normal behaviour (palette:
 * plain entity search; assistant: the LLM tool-calling path). */
export function resolveTwinQuery(text: string, state: SimState, model: ResortModel): TwinQueryResult | null {
  const q = text.toLowerCase();

  const roomNumber = (id: string) => model.roomById.get(id)?.number ?? id;
  const cap = (ids: string[], noun: string, extra?: string) => {
    const names = ids.slice(0, 6).map(roomNumber);
    const list = names.length ? names.join(", ") : "none";
    const more = ids.length > 6 ? ` (+${ids.length - 6} more)` : "";
    return `${ids.length} room${ids.length === 1 ? "" : "s"} ${noun}${ids.length ? `: ${list}${more}` : ""}${extra ? ` — ${extra}` : ""}`;
  };

  if (/\bvip\b/.test(q)) {
    const ids = model.rooms.filter((r) => {
      const g = state.rooms[r.id]?.guestId;
      return g && state.guests[g]?.vip;
    }).map((r) => r.id);
    return { rooms: ids, caption: cap(ids, "hold a VIP guest") };
  }

  if (/unhapp|upset|angry|complain|sentiment|dissatisf/.test(q)) {
    const ids = model.rooms
      .filter((r) => {
        const g = state.rooms[r.id]?.guestId;
        return g && state.guests[g] && state.rooms[r.id].sentiment !== null && state.rooms[r.id].sentiment! < -0.2;
      })
      .sort((a, b) => (state.rooms[a.id].sentiment ?? 0) - (state.rooms[b.id].sentiment ?? 0))
      .map((r) => r.id);
    return { rooms: ids, caption: cap(ids, "have an unhappy in-house guest right now") };
  }

  if (/sla|breach|overdue|late\b/.test(q)) {
    const ids = Object.values(state.requests)
      .filter((r) => r.status !== "done" && state.t - r.createdAt > r.slaMin)
      .map((r) => r.roomId);
    return { rooms: ids, caption: cap(ids, "have an SLA breach open") };
  }

  if (/dirty|awaiting.?clean|housekeeping.?(queue|backlog)/.test(q)) {
    const ids = model.rooms.filter((r) => state.rooms[r.id]?.status === "vacant-dirty").map((r) => r.id);
    return { rooms: ids, caption: cap(ids, "are vacant and awaiting housekeeping") };
  }

  if (/maintenance|failing|failure|breakdown/.test(q)) {
    const ids = model.rooms
      .map((r) => ({ id: r.id, risk: state.rooms[r.id]?.maintRisk ?? 0 }))
      .filter((r) => r.risk > 0.35)
      .sort((a, b) => b.risk - a.risk)
      .slice(0, 8)
      .map((r) => r.id);
    return { rooms: ids, caption: cap(ids, "sit on equipment with elevated failure risk") };
  }

  if (/\brisk\b|need attention|at risk|problem/.test(q)) {
    const ids = model.rooms
      .map((r) => ({ id: r.id, risk: compositeRisk(state.rooms[r.id]) }))
      .filter((r) => r.risk > 0.45)
      .sort((a, b) => b.risk - a.risk)
      .slice(0, 8)
      .map((r) => r.id);
    return { rooms: ids, caption: cap(ids, "need attention", "composite of maintenance, sentiment, housekeeping and energy risk") };
  }

  const roomMatch = q.match(/\b(\d{2,4})\b/);
  if (roomMatch) {
    const r = model.rooms.find((x) => x.number === roomMatch[1]);
    if (r) return { rooms: [r.id], caption: `Room ${r.number}` };
  }

  return null;
}
