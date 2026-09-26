import type { ResortModel } from "@/lib/architecture/types";
import type { Recommendation, SimState } from "@/lib/sim/types";
import type { RelocationPair } from "@/lib/intelligence/guestImpact";
import type { NextBestAction } from "@/lib/intelligence/personalization";
import { pushFeed, scheduleService, resolveAlert, nextId, createRequest, dispatchStaff, addAlert, refreshRecommendations } from "./engine";
import { rateForRoom } from "./seed";
import { classify } from "@/lib/intelligence/concierge";
import { mapGuestAppRequestType } from "@/lib/integration/guestAppAdapter";
import { clamp } from "@/lib/utils";

/** The one place an accepted next-best-action's effect actually gets applied — sentiment
 * AND, where the action is a real upsell rather than service recovery/relationship spend,
 * incremental guest spend plus the resort-wide ancillaryRevenueToday KPI. Previously this
 * logic was duplicated three times (BottomDock's recommendation-dock path via
 * executeRecommendation below, RoomPanel's inline NBA card, GuestsPage's inline NBA card) —
 * all three sentiment-only, none tracking revenue, free to drift out of sync with each
 * other. Lives here rather than in lib/intelligence/personalization.ts to avoid that module
 * importing back from lib/sim/engine.ts (personalization.ts stays a pure function of
 * (guest, state, model), like every other intelligence module). */
export function applyNextBestAction(state: SimState, model: ResortModel, guestId: string, nba: NextBestAction) {
  const g = state.guests[guestId];
  if (!g) return;
  g.sentiment = clamp(g.sentiment + nba.uplift, -1, 1);
  if (g.roomId) state.rooms[g.roomId].sentiment = g.sentiment;
  if (nba.revenueUplift > 0) {
    if (nba.spendCategory === "spa") g.spendSpa += nba.revenueUplift;
    else if (nba.spendCategory === "fnb") g.spendFnb += nba.revenueUplift;
    else g.spendOther += nba.revenueUplift;
    state.kpis.ancillaryRevenueToday += nba.revenueUplift;
  }
  const roomNumber = g.roomId ? model.roomById.get(g.roomId)?.number : undefined;
  pushFeed(state, "task", `${nba.label} → ${g.name}${roomNumber ? ` (${roomNumber})` : ""}${nba.revenueUplift > 0 ? ` · +₹${nba.revenueUplift.toLocaleString("en-IN")}` : ""}`, "guest", g.id);
}

/** Moves a guest out of a room whose climate asset has failed into a vacant-clean
 * room outside that asset's zone. The vacated room goes `ooo` (unsellable) rather
 * than `vacant-dirty` — it isn't habitable until the asset is serviced, which is a
 * separate accepted maintenance recommendation. Rate never increases on an
 * involuntary move even when the new room outranks the old one. */
export function relocateGuest(state: SimState, model: ResortModel, pair: RelocationPair) {
  const fromRoom = state.rooms[pair.fromRoomId];
  const toRoom = state.rooms[pair.toRoomId];
  const guest = state.guests[pair.guestId];
  if (!fromRoom || !toRoom || !guest || fromRoom.guestId !== guest.id || toRoom.guestId) return;

  toRoom.guestId = guest.id;
  toRoom.status = guest.vip ? "vip" : "occupied";
  toRoom.rate = Math.min(fromRoom.rate, toRoom.rate);
  toRoom.sentiment = guest.sentiment;
  toRoom.conditioned = true;
  guest.roomId = pair.toRoomId;
  guest.sentiment = clamp(guest.sentiment - 0.04, -1, 1);

  fromRoom.guestId = null;
  fromRoom.status = "ooo";
  fromRoom.sentiment = null;

  pushFeed(state, "task", `${guest.name} relocated ${pair.fromRoomNumber} → ${pair.toRoomNumber}${pair.upgrade ? " (complimentary upgrade)" : ""} — climate outage`, "room", pair.toRoomId, "warn");
  const req = createRequest(state, model, pair.toRoomId, "concierge", `Escort ${guest.name} from ${pair.fromRoomNumber} to ${pair.toRoomNumber}`, "system", 20, guest.id);
  dispatchStaff(state, model, req, "frontdesk") ?? dispatchStaff(state, model, req, "concierge");
}

export function executeRecommendation(state: SimState, model: ResortModel, rec: Recommendation) {
  if (rec.status !== "pending") return;
  rec.status = "executed";
  const p = rec.payload ?? {};
  switch (rec.module) {
    case "maintenance": {
      scheduleService(state, model, p.assetId as string);
      break;
    }
    case "pricing": {
      const mult = p.multiplier as number;
      const prev = state.rateMultiplier;
      state.rateMultiplier = mult;
      for (const r of model.rooms) {
        const st = state.rooms[r.id];
        if (!st.guestId) st.rate = rateForRoom(state.baseRate, r.type, r.seaView, r.floor, mult);
      }
      pushFeed(state, "pricing", `BAR multiplier ${prev.toFixed(2)}× → ${mult.toFixed(2)}× applied to all unsold inventory`, "resort", "pricing", "info");
      break;
    }
    case "staffing": {
      const dept = p.dept as string;
      const count = p.count as number;
      const shift = p.shift as "morning" | "evening" | "night";
      const pool = Object.values(state.staff).filter((s) => s.dept === dept && s.status === "off" && s.shift !== shift).slice(0, count);
      for (const s of pool) {
        s.shift = shift;
        s.status = "idle";
        s.hoursToday = 0;
      }
      pushFeed(state, "task", `${pool.length} ${dept} called in for ${shift} shift`, "resort", dept, "info");
      break;
    }
    case "inventory": {
      const it = state.inventory[p.itemId as string];
      if (it) {
        it.onOrder = p.qty as number;
        it.orderEta = state.t + it.leadDays * 24 * 60;
        pushFeed(state, "inventory", `PO raised: ${it.onOrder} ${it.unit} ${it.name}, ETA ${it.leadDays}d`, "inventory", it.id, "info");
      }
      break;
    }
    case "personalization": {
      const guestId = p.guestId as string;
      if (state.guests[guestId]) {
        applyNextBestAction(state, model, guestId, {
          id: p.actionId as string,
          label: rec.action,
          score: rec.confidence,
          reason: "",
          cost: 0,
          uplift: p.uplift as number,
          revenueUplift: (p.revenueUplift as number) ?? 0,
          spendCategory: (p.spendCategory as NextBestAction["spendCategory"]) ?? "none",
        });
        resolveAlert(state, `sent-${guestId}`);
      }
      break;
    }
    case "sentiment": {
      const floor = p.floor as number | null;
      if (floor !== null) {
        for (const r of model.rooms) {
          if (r.floor !== floor) continue;
          const st = state.rooms[r.id];
          if (st.guestId) {
            const g = state.guests[st.guestId];
            g.sentiment = clamp(g.sentiment + 0.08, -1, 1);
            st.sentiment = g.sentiment;
          }
        }
      }
      pushFeed(state, "task", `Quality action opened for ${p.dept}${floor !== null ? ` · floor ${floor} inspection scheduled` : ""}`, "resort", p.dept as string, "info");
      break;
    }
    case "segmentation": {
      for (const id of p.members as string[]) {
        const g = state.guests[id];
        if (g) {
          g.sentiment = clamp(g.sentiment + 0.12, -1, 1);
          if (g.roomId) state.rooms[g.roomId].sentiment = g.sentiment;
        }
      }
      pushFeed(state, "task", `Segment offer pushed to ${(p.members as string[]).length} guests`, "resort", "segment", "info");
      break;
    }
    case "relocation": {
      const pairs = p.pairs as RelocationPair[];
      for (const pair of pairs) relocateGuest(state, model, pair);
      break;
    }
    case "energy": {
      const roomIds = p.roomIds as string[];
      const mode = p.mode as "vacant" | "away";
      let n = 0;
      for (const id of roomIds) {
        const st = state.rooms[id];
        if (!st) continue;
        if (mode === "vacant" && !st.guestId) {
          st.conditioned = false;
          st.energyManaged = true;
          n++;
        } else if (mode === "away" && st.guestId) {
          st.ecoMode = true;
          n++;
        }
      }
      pushFeed(
        state,
        "task",
        mode === "vacant"
          ? `Conditioning disabled in ${n} vacant room${n === 1 ? "" : "s"} — resumes automatically on check-in`
          : `Eco setback enabled in ${n} occupied room${n === 1 ? "" : "s"} — restores automatically when the guest returns`,
        "resort",
        "energy",
        "info",
      );
      break;
    }
    case "concierge":
      break;
    case "groupblock": {
      pushFeed(state, "pricing", rec.action, "resort", "group-blocks", "info");
      break;
    }
    case "weather": {
      pushFeed(state, "system", rec.action, "resort", "weather", "info");
      break;
    }
    case "recovery": {
      const guestId = p.guestId as string;
      const g = state.guests[guestId];
      if (g) {
        const riskScore = (p.riskScore as number) ?? 0.5;
        g.sentiment = clamp(g.sentiment + 0.2 + riskScore * 0.15, -1, 1);
        if (g.roomId) state.rooms[g.roomId].sentiment = g.sentiment;
        pushFeed(state, "task", `${rec.action} delivered to ${g.name}`, "guest", guestId, "info");
      }
      break;
    }
  }
}

export function dismissRecommendation(state: SimState, rec: Recommendation) {
  if (rec.status === "pending") {
    rec.status = "dismissed";
    rec.createdAt = state.t;
  }
}

export function setRoomConditioning(state: SimState, roomId: string, on: boolean) {
  state.rooms[roomId].conditioned = on;
}

export function triggerFailure(state: SimState, model: ResortModel, assetId: string) {
  const st = state.assets[assetId];
  st.health = 0.08;
  st.temp = st.tempBase + 18;
  st.vibration = st.vibBase * 3;
  pushFeed(state, "system", `Injected fault into ${model.assetById.get(assetId)!.name} (demo)`, "asset", assetId, "warn");
}

/** Deterministic version of an unplanned failure, for the scenario director. triggerFailure()
 * only nudges health down and leaves the actual failed-status flip to the tick loop's own
 * probabilistic check, which is fine for organic wear but unusably slow for a live demo click.
 * This mirrors that tick-loop failure branch directly (status, alert, work order) and forces
 * an immediate recommendation-module pass so the relocation card exists on the next frame
 * instead of up to 30 sim-minutes later. */
export function injectScenario(state: SimState, model: ResortModel, assetId: string) {
  const asset = model.assetById.get(assetId);
  const st = state.assets[assetId];
  if (!asset || !st || st.status === "failed") return;
  st.health = 0.06;
  st.failureProb7d = 1;
  st.status = "failed";
  st.temp = st.tempBase + 18;
  st.vibration = st.vibBase * 3;
  addAlert(state, { id: `fail-${asset.id}`, severity: "critical", kind: "failure", targetKind: "asset", targetId: asset.id, title: `${asset.name} FAILED`, body: `Unplanned outage. ${asset.servesFloors.length} floors affected.` });
  const req = createRequest(state, model, asset.id, "maintenance", "Emergency repair", "system", 30);
  dispatchStaff(state, model, req, "engineering", "hvac");
  pushFeed(state, "system", `Scenario injected — ${asset.name} taken offline (demo)`, "asset", asset.id, "warn");
  refreshRecommendations(state, model);
}

/** Confirms a task done from outside the simulated staff walk/work cycle — the Telegram
 * frontline bot's "✅ Done" button, not a fabricated new completion path: same fields
 * (status, completedAt, SLA alert resolution) the tick loop itself sets when a dispatched
 * staff member finishes naturally (lib/sim/engine.ts's "working" branch), applied
 * immediately because a real person just confirmed it in the field rather than the sim's own
 * timer running out. Frees the assigned staff member back to idle if they were still marked
 * on this specific task. */
export function completeRequestExternally(state: SimState, model: ResortModel, requestId: string, confirmedBy: string): boolean {
  const req = state.requests[requestId];
  if (!req || req.status === "done") return false;
  req.status = "done";
  req.completedAt = state.t;
  resolveAlert(state, `sla-${req.id}`);
  if (req.assignedTo) {
    const staff = state.staff[req.assignedTo];
    if (staff && staff.taskId === req.id) {
      staff.status = "idle";
      staff.taskId = null;
      staff.tasksDone++;
    }
  }
  const cell = model.roomById.get(req.roomId);
  pushFeed(state, "task", `${confirmedBy} confirmed "${req.text}" done via Telegram${cell ? ` — ${cell.number}` : ""}`, "room", req.roomId, "info");
  return true;
}

/** A frontline staff member reporting something they noticed, via Telegram free text —
 * the blueprint's own "staff can report issues they notice, which become tickets" ask.
 * Reuses lib/intelligence/concierge.ts's classify() (the same deterministic keyword
 * classifier guest messages go through) rather than a second, separate text pipeline, so a
 * staff report and a guest complaint about the same thing route the same way. Source is
 * "staff", not "guest" — ServiceRequest already had this distinction, previously unused. */
export function reportIssueFromStaff(state: SimState, model: ResortModel, roomId: string, text: string, staffName: string) {
  const c = classify(text);
  const type = c.requestType ?? "maintenance";
  const req = createRequest(state, model, roomId, type, text, "staff", c.sla, null);
  const cell = model.roomById.get(roomId);
  pushFeed(state, "task", `${staffName} reported via Telegram: "${text}"${cell ? ` — ${cell.number}` : ""}`, "room", roomId, c.urgency === "high" ? "warn" : "info");
  dispatchStaff(state, model, req, c.dept === "frontdesk" ? "frontdesk" : c.dept);
  return req;
}

/** Applies an order/request that originated in the separate guestexperience guest app
 * (app/api/guest-app/inbox — see that route's comment for why this bridge exists at all: two
 * independently-deployed apps, no shared database, an HTTP inbox is the only real connection
 * possible today). reqType is guestexperience's own ReqType string, translated via
 * lib/integration/guestAppAdapter's mapGuestAppRequestType — kept a separate action rather than
 * reusing reportIssueFromStaff so the feed/source attribution honestly says "guest app", not
 * "staff". */
export function applyGuestAppOrder(state: SimState, model: ResortModel, roomId: string, guestName: string, reqType: string, text: string) {
  const room = state.rooms[roomId];
  const guestId = room?.guestId ?? null;
  const type = mapGuestAppRequestType(reqType);
  const req = createRequest(state, model, roomId, type, text, "guest", type === "complaint" ? 15 : 30, guestId);
  const cell = model.roomById.get(roomId);
  pushFeed(state, "task", `${guestName || "Guest"} via guest app: "${text}"${cell ? ` — ${cell.number}` : ""}`, "room", roomId, type === "complaint" ? "warn" : "info");
  dispatchStaff(state, model, req, type === "complaint" ? "frontdesk" : type === "fnb" ? "fnb" : type === "housekeeping" ? "housekeeping" : type === "maintenance" ? "engineering" : "concierge");
  return req;
}

export { nextId };
