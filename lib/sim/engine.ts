import type { ResortModel, Vec3 } from "@/lib/architecture/types";
import { floorY } from "@/lib/architecture/generate";
import { defaultConfig } from "@/lib/architecture/config";
import { mulberry32, pick, randInt, randRange, clamp, type Rand } from "@/lib/utils";
import type { Alert, FeedEvent, RequestType, ServiceRequest, SimState, Staff, Severity } from "./types";
import { DAY, HOUR, makeGuest, occupancyTarget, rateForRoom } from "./seed";
import { pickRequestType, requestTemplates, reviewText } from "./text";
import { assetNode, findPath, nearestNode, roomDoorNode, zoneNode } from "./nav";
import { assessAsset, maintenanceRecommendations, statusFor } from "@/lib/intelligence/maintenance";
import { scoreText, sentimentRecommendations } from "@/lib/intelligence/sentiment";
import { runModules } from "@/lib/intelligence/registry";

let counter = 1;
let rand: Rand = mulberry32(1);
let randSeed = -1;

export function nextId(prefix: string) {
  return `${prefix}-${(counter++).toString(36)}`;
}

function ensureRand(state: SimState) {
  if (randSeed !== state.seed) {
    rand = mulberry32(state.seed ^ 0x51ed);
    randSeed = state.seed;
    counter = 1;
  }
}

export function pushFeed(state: SimState, kind: FeedEvent["kind"], text: string, targetKind?: string, targetId?: string, severity?: Severity) {
  state.feed.push({ id: nextId("ev"), t: state.t, kind, text, targetKind, targetId, severity });
  if (state.feed.length > 240) state.feed.splice(0, state.feed.length - 240);
}

export function addAlert(state: SimState, a: Omit<Alert, "id" | "createdAt" | "resolvedAt"> & { id?: string }) {
  const id = a.id ?? nextId("al");
  if (state.alerts[id] && !state.alerts[id].resolvedAt) return state.alerts[id];
  const alert: Alert = { ...a, id, createdAt: state.t, resolvedAt: null };
  state.alerts[id] = alert;
  pushFeed(state, "alert", a.title, a.targetKind, a.targetId, a.severity);
  return alert;
}

export function resolveAlert(state: SimState, id: string) {
  const a = state.alerts[id];
  if (a && !a.resolvedAt) a.resolvedAt = state.t;
}

export function clock(t: number) {
  const day = Math.floor(t / DAY);
  const h = Math.floor((t % DAY) / HOUR);
  const m = Math.floor(t % HOUR);
  return { day, h, m, hour: (t % DAY) / HOUR };
}

export function fmtClock(t: number) {
  const { day, h, m } = clock(t);
  return `D${day - 13} ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function shiftFor(hour: number): Staff["shift"] {
  if (hour >= 6 && hour < 14) return "morning";
  if (hour >= 14 && hour < 22) return "evening";
  return "night";
}

export function dispatchStaff(state: SimState, model: ResortModel, req: ServiceRequest, dept: string, skill?: string): Staff | null {
  const candidates = Object.values(state.staff).filter((s) => s.dept === dept && s.status === "idle" && (!skill || s.skills.includes(skill)));
  if (!candidates.length) return null;
  const target = req.roomId.startsWith("room-") ? roomDoorNode(model, req.roomId) : req.roomId.startsWith("z-") ? zoneNode(model, req.roomId) : assetNode(model, req.roomId);
  let best: Staff | null = null;
  let bestLen = Infinity;
  let bestPath: Vec3[] = [];
  for (const s of candidates) {
    const from = nearestNode(model, s.position, s.floor);
    const path = findPath(model, from.id, target.id);
    if (!path.length) continue;
    let len = 0;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1].position;
      const b = path[i].position;
      len += Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    }
    if (len < bestLen) {
      bestLen = len;
      best = s;
      bestPath = path.map((n) => [n.position[0], n.position[1], n.position[2]] as Vec3);
    }
  }
  if (!best) return null;
  if (req.roomId.startsWith("room-")) {
    const r = model.roomById.get(req.roomId)!;
    bestPath.push([r.center[0], r.center[1], r.center[2]]);
  } else if (!req.roomId.startsWith("z-")) {
    const a = model.assetById.get(req.roomId)!;
    bestPath.push([a.position[0], floorY(defaultConfig, a.floor), a.position[2]]);
  }
  best.path = bestPath;
  best.pathIdx = 0;
  best.status = "moving";
  best.taskId = req.id;
  req.assignedTo = best.id;
  req.status = "assigned";
  return best;
}

export function createRequest(state: SimState, model: ResortModel, roomId: string, type: RequestType, text: string, source: ServiceRequest["source"], slaMin: number, guestId: string | null = null): ServiceRequest {
  const req: ServiceRequest = { id: nextId("rq"), roomId, guestId, type, text, createdAt: state.t, status: "open", assignedTo: null, slaMin, completedAt: null, source };
  state.requests[req.id] = req;
  return req;
}

function workMinutesFor(req: ServiceRequest) {
  if (req.source === "system" && req.type === "housekeeping") return 28;
  if (req.source === "system" && req.type === "maintenance") return 85;
  const t = requestTemplates[req.type].find((x) => x.text === req.text);
  return t?.minutes ?? 12;
}

function deptFor(req: ServiceRequest): { dept: string; skill?: string } {
  if (req.source === "system" && req.type === "maintenance") return { dept: "engineering", skill: "hvac" };
  const t = requestTemplates[req.type].find((x) => x.text === req.text);
  return { dept: t?.dept ?? "housekeeping" };
}

function checkout(state: SimState, model: ResortModel, roomId: string) {
  const room = state.rooms[roomId];
  const g = room.guestId ? state.guests[room.guestId] : null;
  room.status = "vacant-dirty";
  room.guestId = null;
  room.sentiment = null;
  room.hkMinutes = 32;
  room.ecoMode = false;
  room.presence = 0.05;
  if (g) {
    if (rand() < 0.65) {
      const text = reviewText(rand, g.sentiment);
      const sc = scoreText(text);
      const rating = clamp(Math.round(3 + g.sentiment * 2 + randRange(rand, -0.4, 0.4)), 1, 5);
      state.reviews.push({ id: nextId("rv"), guestId: g.id, roomId, text, rating, aspects: sc.aspects, createdAt: state.t, source: rand() < 0.5 ? "post-stay" : "ota" });
      if (state.reviews.length > 400) state.reviews.splice(0, state.reviews.length - 400);
      pushFeed(state, "review", `${g.name} left a ${rating}★ review: "${text.slice(0, 60)}…"`, "guest", g.id, rating <= 2 ? "warn" : "info");
    }
    g.roomId = null;
    pushFeed(state, "checkout", `${g.name} checked out of ${model.roomById.get(roomId)!.number}`, "room", roomId);
  }
  const req = createRequest(state, model, roomId, "housekeeping", "Departure clean", "system", 90);
  dispatchStaff(state, model, req, "housekeeping");
}

function checkin(state: SimState, model: ResortModel, roomId: string) {
  const cell = model.roomById.get(roomId)!;
  const g = makeGuest(rand, nextId("g"), roomId, state.t, state.scenario, cell.seaView, cell.type);
  g.checkIn = state.t;
  g.checkOut = state.t + (g.checkOut - (state.t - 0)) ;
  const nights = g.segment === "business" ? randInt(rand, 1, 3) : g.segment === "luxury" ? randInt(rand, 3, 7) : randInt(rand, 2, 5);
  g.checkOut = Math.floor(state.t / DAY) * DAY + nights * DAY + 11 * HOUR;
  g.spendFnb = 0;
  g.spendRoom = 0;
  state.guests[g.id] = g;
  const room = state.rooms[roomId];
  room.guestId = g.id;
  room.status = g.vip ? "vip" : "occupied";
  room.rate = rateForRoom(state.baseRate, cell.type, cell.seaView, cell.floor, state.rateMultiplier);
  room.sentiment = g.sentiment;
  room.conditioned = true;
  room.energyManaged = false;
  room.ecoMode = false;
  room.presence = 0.85;
  pushFeed(state, "checkin", `${g.name} (${g.segment.replace("-", " ")}${g.vip ? ", VIP" : ""}) checked in to ${cell.number}`, "room", roomId);
}

function moveStaff(s: Staff, dtMin: number) {
  const speed = 78 * dtMin;
  let remaining = speed;
  while (remaining > 0 && s.pathIdx < s.path.length) {
    const target = s.path[s.pathIdx];
    const dx = target[0] - s.position[0];
    const dy = target[1] - s.position[1];
    const dz = target[2] - s.position[2];
    const d = Math.hypot(dx, dy, dz);
    if (d <= remaining) {
      s.position = [target[0], target[1], target[2]];
      s.pathIdx++;
      remaining -= d;
    } else {
      const k = remaining / d;
      s.position = [s.position[0] + dx * k, s.position[1] + dy * k, s.position[2] + dz * k];
      remaining = 0;
    }
  }
  return s.pathIdx >= s.path.length;
}

function floorOfY(y: number, model: ResortModel) {
  let f = 0;
  for (const fl of model.floors) if (y >= fl.y - 0.5) f = fl.index;
  return f;
}

/** Re-runs every recommendation module and reconciles the result into state.recommendations.
 * Called on the normal 30-sim-minute cadence from tick(), and also on demand — e.g. right
 * after a demo fault injection — so a triggered scenario doesn't have to wait for the next
 * cadence to produce its recommendation. */
export function refreshRecommendations(state: SimState, model: ResortModel) {
  const fresh = [...maintenanceRecommendations(state, model), ...sentimentRecommendations(state, model), ...runModules(state, model)];
  const freshIds = new Set(fresh.map((r) => r.id));
  for (const rec of fresh) {
    const ex = state.recommendations[rec.id];
    if (!ex || (ex.status === "dismissed" && state.t - ex.createdAt > 6 * HOUR)) {
      state.recommendations[rec.id] = rec;
      pushFeed(state, "recommendation", rec.title, rec.targetKind, rec.targetId);
    } else if (ex.status === "pending") {
      Object.assign(ex, { body: rec.body, confidence: rec.confidence, basis: rec.basis, impact: rec.impact });
    }
  }
  for (const rec of Object.values(state.recommendations)) {
    if (rec.status === "pending" && !freshIds.has(rec.id)) delete state.recommendations[rec.id];
    if ((rec.status === "executed" || rec.status === "dismissed") && state.t - rec.createdAt > 12 * HOUR) delete state.recommendations[rec.id];
  }
}

export function tick(state: SimState, model: ResortModel, dtMin: number) {
  ensureRand(state);
  const prevClock = clock(state.t);
  state.t += dtMin;
  const now = clock(state.t);
  const rooms = Object.values(state.rooms);
  const totalRooms = rooms.length;
  const dtH = dtMin / 60;

  if (prevClock.h !== now.h) {
    const shift = shiftFor(now.h);
    for (const s of Object.values(state.staff)) {
      const on = s.shift === shift;
      if (on && s.status === "off") {
        s.status = "idle";
        s.hoursToday = 0;
      } else if (!on && (s.status === "idle" || s.status === "break")) {
        s.status = "off";
        s.taskId = null;
      }
    }
    if (now.h === 6 || now.h === 14 || now.h === 22) pushFeed(state, "system", `${shift[0].toUpperCase() + shift.slice(1)} shift on duty · ${Object.values(state.staff).filter((s) => s.status !== "off").length} staff`);
  }

  if (prevClock.day !== now.day) {
    for (const r of rooms) {
      r.revenue7d = r.revenue7d * (6 / 7) + (r.guestId ? r.rate : 0);
      r.nights7d = Math.min(7, Math.round(r.nights7d * (6 / 7) + (r.guestId ? 1 : 0)));
    }
    state.kpis.revenueToday = 0;
    state.kpis.energyToday = 0;
    state.kpis.energySavedToday = 0;
    state.kpis.ancillaryRevenueToday = 0;
    pushFeed(state, "system", `Night audit complete · occupancy ${(state.kpis.occupancy * 100).toFixed(1)}%`);
  }

  for (const r of rooms) {
    const g = r.guestId ? state.guests[r.guestId] : null;
    if (g && state.t >= g.checkOut) checkout(state, model, r.id);
  }

  const occupied = rooms.filter((r) => r.guestId).length;
  const target = occupancyTarget(state.scenario) * (state.rateMultiplier > 1 ? 1 - (state.rateMultiplier - 1) * 0.45 : 1 + (1 - state.rateMultiplier) * 0.35);
  const tod = now.hour >= 13 && now.hour <= 21 ? 1 : now.hour >= 9 ? 0.35 : 0.05;
  const deficit = target * totalRooms - occupied;
  if (deficit > 0) {
    const rate = deficit * 0.22 * tod;
    if (rand() < rate * dtH) {
      const free = rooms.filter((r) => r.status === "vacant-clean");
      if (free.length) checkin(state, model, pick(rand, free).id);
    }
  }

  const maintBias = state.scenario === "equipment-crisis" ? 0.2 : 0;
  for (const r of rooms) {
    if (!r.guestId) continue;
    if (rand() < 0.05 * dtH * (now.hour > 7 && now.hour < 23 ? 1 : 0.15)) {
      const type = pickRequestType(rand, maintBias);
      const tpl = pick(rand, requestTemplates[type]);
      const req = createRequest(state, model, r.id, type, tpl.text, "guest", tpl.sla, r.guestId);
      pushFeed(state, "request", `${model.roomById.get(r.id)!.number}: ${tpl.text}`, "room", r.id);
      dispatchStaff(state, model, req, tpl.dept);
    }
  }

  for (const req of Object.values(state.requests)) {
    if (req.status === "done") continue;
    if (req.status === "open") {
      const { dept, skill } = deptFor(req);
      dispatchStaff(state, model, req, dept, skill);
      if (req.status === "open" && state.t - req.createdAt > req.slaMin && !state.alerts[`sla-${req.id}`]) {
        addAlert(state, { id: `sla-${req.id}`, severity: "warn", kind: "sla", targetKind: "room", targetId: req.roomId, title: `SLA breach · ${model.roomById.get(req.roomId)?.number ?? req.roomId}`, body: `${req.type} request unassigned for ${Math.round(state.t - req.createdAt)} min (SLA ${req.slaMin}).` });
      }
    }
  }

  for (const s of Object.values(state.staff)) {
    if (s.status === "moving") {
      const arrived = moveStaff(s, dtMin);
      s.floor = floorOfY(s.position[1], model);
      if (arrived) {
        s.status = "working";
        const req = s.taskId ? state.requests[s.taskId] : null;
        if (req) {
          req.status = "in-progress";
          s.workUntil = state.t + workMinutesFor(req);
          if (req.source === "system" && req.type === "housekeeping") state.rooms[req.roomId].status = "cleaning";
        } else s.workUntil = state.t + 5;
      }
    } else if (s.status === "working") {
      s.hoursToday += dtH;
      if (state.t >= s.workUntil) {
        const req = s.taskId ? state.requests[s.taskId] : null;
        if (req) {
          req.status = "done";
          req.completedAt = state.t;
          resolveAlert(state, `sla-${req.id}`);
          if (req.source === "system" && req.type === "housekeeping") {
            const room = state.rooms[req.roomId];
            room.status = room.guestId ? (state.guests[room.guestId].vip ? "vip" : "occupied") : "vacant-clean";
            room.hkMinutes = 0;
            room.lastCleanedAt = state.t;
          } else if (req.source === "system" && req.type === "maintenance") {
            const a = state.assets[req.roomId];
            if (a) {
              a.health = 0.96;
              a.temp = a.tempBase;
              a.vibration = a.vibBase;
              a.status = "healthy";
              a.lastServiceAt = state.t;
              resolveAlert(state, `asset-${a.id}`);
              resolveAlert(state, `fail-${a.id}`);
              pushFeed(state, "task", `${s.name} completed service on ${model.assetById.get(a.id)!.name}`, "asset", a.id, "info");
            }
          } else {
            const g = req.guestId ? state.guests[req.guestId] : null;
            if (g) g.sentiment = clamp(g.sentiment + (state.t - req.createdAt <= req.slaMin ? 0.04 : -0.02), -1, 1);
            pushFeed(state, "task", `${s.name} resolved ${req.type} request in ${model.roomById.get(req.roomId)?.number ?? req.roomId}`, "room", req.roomId);
          }
        }
        s.tasksDone++;
        s.taskId = null;
        s.status = "idle";
      }
    } else if (s.status === "idle" && s.floor !== 0 && rand() < 0.02 * dtMin) {
      const from = nearestNode(model, s.position, s.floor);
      const path = findPath(model, from.id, "nav-g-core");
      if (path.length) {
        s.path = path.map((n) => [n.position[0], n.position[1], n.position[2]]);
        s.pathIdx = 0;
        s.status = "moving";
      }
    }
  }

  const crisis = state.scenario === "equipment-crisis" ? 2.2 : 1;
  for (const a of model.assets) {
    const st = state.assets[a.id];
    if (st.status === "service") continue;
    const load = a.kind === "chiller" || a.kind === "ahu" ? 0.6 + 0.4 * (occupied / totalRooms) : 0.8;
    const wear = { chiller: 0.0011, ahu: 0.0007, elevator: 0.0005, pump: 0.0012, boiler: 0.0006, generator: 0.0004, "kitchen-hood": 0.0005, "pool-filter": 0.0008 }[a.kind];
    st.runtimeHours += dtH * load;
    if (st.status !== "failed") st.health = clamp(st.health - wear * load * crisis * dtH * (1 + (1 - st.health) * 2), 0.02, 1);
    const degr = 1 - st.health;
    st.temp += (st.tempBase + degr * 16 - st.temp) * 0.2 * dtH + randRange(rand, -0.6, 0.6) * Math.sqrt(dtH);
    st.vibration += (st.vibBase * (1 + degr * 2.2) - st.vibration) * 0.25 * dtH + randRange(rand, -0.08, 0.08) * Math.sqrt(dtH);
    st.current = 100 * (1 + degr * 0.3);
    if (now.m % 30 < prevClock.m % 30 || dtMin >= 30) {
      st.history.push({ t: state.t, temp: st.temp, vib: st.vibration });
      if (st.history.length > 96) st.history.shift();
    }
    if (st.status !== "failed" && st.health < 0.12 && rand() < 0.15 * dtH) {
      st.status = "failed";
      addAlert(state, { id: `fail-${a.id}`, severity: "critical", kind: "failure", targetKind: "asset", targetId: a.id, title: `${a.name} FAILED`, body: `Unplanned outage. ${a.servesFloors.length} floors affected.` });
      const req = createRequest(state, model, a.id, "maintenance", "Emergency repair", "system", 30);
      dispatchStaff(state, model, req, "engineering", "hvac");
    }
  }

  if (Math.floor(state.t / 15) !== Math.floor((state.t - dtMin) / 15)) {
    for (const a of model.assets) {
      const st = state.assets[a.id];
      const res = assessAsset(a.kind, st);
      st.failureProb7d = st.status === "failed" ? 1 : st.status === "service" ? 0.05 : res.prob7d;
      st.rulDays = res.rulDays;
      st.status = statusFor(st.failureProb7d, st);
      if (st.failureProb7d > 0.6 && st.status !== "failed" && st.status !== "service") {
        addAlert(state, { id: `asset-${a.id}`, severity: "critical", kind: "asset-risk", targetKind: "asset", targetId: a.id, title: `${a.name} · ${(st.failureProb7d * 100).toFixed(0)}% failure risk`, body: `Predicted failure within 7 days. RUL ${st.rulDays}d.` });
      } else if (st.failureProb7d < 0.45) resolveAlert(state, `asset-${a.id}`);
    }
    for (const r of model.rooms) {
      let risk = 0;
      for (const a of model.assets) if (a.servesFloors.includes(r.floor)) risk = Math.max(risk, state.assets[a.id].failureProb7d * (a.kind === "ahu" ? 1 : a.kind === "chiller" ? 0.8 : 0.5));
      state.rooms[r.id].maintRisk = risk;
    }
  }

  for (const r of rooms) {
    // Corridor/room camera presence confidence (SIMULATED): occupied rooms swing between
    // "guest in" (night, and a baseline through the day) and "guest out" (typical
    // pool/restaurant/excursion hours), vacant rooms sit near zero with a small bump while
    // housekeeping is actually in the room. Moves slowly (EMA-style) so it reads as a
    // sustained absence rather than tick noise, which is what makes it useful as a signal
    // distinct from the instantaneous PMS occupancy flag.
    const targetPresence = r.guestId ? (now.h >= 22 || now.h < 8 ? 0.9 : now.h >= 10 && now.h < 18 ? 0.35 : 0.65) : r.status === "cleaning" ? 0.5 : 0.03;
    r.presence = clamp(r.presence + (targetPresence - r.presence) * clamp(0.25 * dtH, 0, 1) + randRange(rand, -0.03, 0.03) * Math.sqrt(dtH), 0, 1);
    if (r.ecoMode && r.presence > 0.6) r.ecoMode = false;

    const rate = r.ecoMode ? 0.6 : r.conditioned ? 1.55 : 0.18;
    r.energyKwh = r.energyKwh * (1 - dtMin / DAY) + rate * dtH;
    state.kpis.energyToday += rate * dtH;
    if (r.guestId) state.kpis.revenueToday += (r.rate * dtMin) / DAY;
    if (r.energyManaged && !r.guestId && !r.conditioned) state.kpis.energySavedToday += (1.55 - 0.18) * dtH;
    if (r.ecoMode && r.guestId) state.kpis.energySavedToday += (1.55 - 0.6) * dtH;
    if (!r.guestId && r.conditioned && rand() < 0.01 * dtH) r.conditioned = false;
    if (r.status === "vacant-dirty" && r.hkMinutes < 45) r.hkMinutes = Math.min(45, r.hkMinutes + 0.5 * dtMin);
  }

  for (const g of Object.values(state.guests)) {
    if (!g.roomId) continue;
    const base = 0.35 + (g.loyalty === "platinum" ? 0.1 : 0);
    let drift = (base - g.sentiment) * 0.04 * dtH;
    for (const req of Object.values(state.requests)) if (req.guestId === g.id && req.status !== "done" && state.t - req.createdAt > req.slaMin) drift -= 0.035 * dtH;
    const floor = model.roomById.get(g.roomId)!.floor;
    for (const a of model.assets) if (a.servesFloors.includes(floor) && state.assets[a.id].status === "failed") drift -= (a.kind === "ahu" || a.kind === "chiller" ? 0.07 : 0.03) * dtH;
    g.sentiment = clamp(g.sentiment + drift, -1, 1);
    g.spendFnb += randRange(rand, 0, 1) < 0.5 ? 0 : randRange(rand, 40, 260) * dtH;
    state.rooms[g.roomId].sentiment = g.sentiment;
    if (g.sentiment < -0.45 && rand() < 0.02 * dtH && !state.alerts[`sent-${g.id}`]) {
      addAlert(state, { id: `sent-${g.id}`, severity: "warn", kind: "sentiment", targetKind: "room", targetId: g.roomId, title: `At-risk guest · ${model.roomById.get(g.roomId)!.number}`, body: `${g.name} sentiment ${g.sentiment.toFixed(2)}. ${g.loyalty !== "none" ? `${g.loyalty} member.` : ""} Service recovery recommended.` });
    }
  }

  const occFactor = occupied / Math.max(1, totalRooms * 0.85);
  for (const it of Object.values(state.inventory)) {
    it.stock = Math.max(0, it.stock - (it.dailyUse * occFactor * dtMin) / DAY);
    if (it.orderEta !== null && state.t >= it.orderEta) {
      it.stock += it.onOrder;
      pushFeed(state, "inventory", `Received ${it.onOrder} ${it.unit} ${it.name}`, "inventory", it.id);
      it.onOrder = 0;
      it.orderEta = null;
      resolveAlert(state, `stock-${it.id}`);
    }
    if (prevClock.day !== now.day) {
      it.useHistory.push(it.dailyUse * occFactor * randRange(rand, 0.85, 1.15));
      if (it.useHistory.length > 28) it.useHistory.shift();
    }
    if (it.stock < it.reorderPoint && it.onOrder === 0) {
      addAlert(state, { id: `stock-${it.id}`, severity: it.stock < it.dailyUse * 1.5 ? "critical" : "warn", kind: "stock", targetKind: "inventory", targetId: it.id, title: `Low stock · ${it.name}`, body: `${Math.round(it.stock)} ${it.unit} on hand, reorder point ${it.reorderPoint}. ${(it.stock / (it.dailyUse * occFactor)).toFixed(1)} days cover.` });
    }
  }

  if (Math.floor(state.t / 30) !== Math.floor((state.t - dtMin) / 30)) refreshRecommendations(state, model);

  for (const id of Object.keys(state.requests)) {
    const rq = state.requests[id];
    if (rq.status === "done" && state.t - (rq.completedAt ?? 0) > 6 * HOUR) delete state.requests[id];
  }
  for (const id of Object.keys(state.alerts)) {
    const al = state.alerts[id];
    if (al.resolvedAt && state.t - al.resolvedAt > 4 * HOUR) delete state.alerts[id];
  }
  for (const id of Object.keys(state.guests)) if (!state.guests[id].roomId && Object.keys(state.guests).length > 400) delete state.guests[id];

  const occ = rooms.filter((r) => r.guestId).length;
  const adr = occ ? rooms.filter((r) => r.guestId).reduce((s, r) => s + r.rate, 0) / occ : 0;
  const recent = state.reviews.slice(-40);
  const gssReviews = recent.length ? recent.reduce((s, r) => s + r.rating, 0) / recent.length : 4.2;
  const inhouse = Object.values(state.guests).filter((g) => g.roomId);
  const gssLive = inhouse.length ? 3.1 + (inhouse.reduce((s, g) => s + g.sentiment, 0) / inhouse.length) * 1.9 : 4.2;
  state.kpis = {
    ...state.kpis,
    occupancy: occ / totalRooms,
    adr,
    revpar: (adr * occ) / totalRooms,
    gss: clamp(gssReviews * 0.5 + gssLive * 0.5, 1, 5),
    openAlerts: Object.values(state.alerts).filter((a) => !a.resolvedAt).length,
    staffOnShift: Object.values(state.staff).filter((s) => s.status !== "off").length,
    openRequests: Object.values(state.requests).filter((r) => r.status !== "done").length,
  };
  if (Math.floor(state.t / 60) !== Math.floor((state.t - dtMin) / 60)) {
    state.kpiHistory.push({ t: state.t, occupancy: state.kpis.occupancy, adr, revpar: state.kpis.revpar, gss: state.kpis.gss });
    if (state.kpiHistory.length > 24 * 14) state.kpiHistory.shift();
  }
}

export function scheduleService(state: SimState, model: ResortModel, assetId: string, immediate = false) {
  const st = state.assets[assetId];
  const a = model.assetById.get(assetId)!;
  const req = createRequest(state, model, assetId, "maintenance", immediate ? "Emergency repair" : `Planned service · ${a.name}`, "system", 120);
  st.status = "service";
  st.failureProb7d = 0.05;
  const staff = dispatchStaff(state, model, req, "engineering", "hvac");
  pushFeed(state, "task", `Work order ${req.id.toUpperCase()} · ${a.name} · ${staff ? `${staff.name} dispatched` : "queued for engineering"}`, "asset", assetId, "info");
  resolveAlert(state, `asset-${assetId}`);
  return req;
}
