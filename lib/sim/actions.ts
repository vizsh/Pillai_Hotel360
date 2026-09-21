import type { ResortModel } from "@/lib/architecture/types";
import type { Recommendation, SimState } from "@/lib/sim/types";
import type { RelocationPair } from "@/lib/intelligence/guestImpact";
import { pushFeed, scheduleService, resolveAlert, nextId, createRequest, dispatchStaff, addAlert, refreshRecommendations } from "./engine";
import { rateForRoom } from "./seed";
import { clamp } from "@/lib/utils";

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
      const g = state.guests[p.guestId as string];
      if (g) {
        g.sentiment = clamp(g.sentiment + (p.uplift as number), -1, 1);
        if (g.roomId) state.rooms[g.roomId].sentiment = g.sentiment;
        resolveAlert(state, `sent-${g.id}`);
        pushFeed(state, "task", `${rec.action} → ${g.name}`, "guest", g.id, "info");
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

export { nextId };
