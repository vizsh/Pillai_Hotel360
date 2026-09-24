import type { ResortModel } from "@/lib/architecture/types";
import { gaussian, mulberry32, pick, randInt, randRange, type Rand } from "@/lib/utils";
import { reviewText as reviewTextSeed } from "./text";
import { scoreText as scoreTextSeed } from "@/lib/intelligence/sentiment";
import { assessAsset as assessAssetSeed } from "@/lib/intelligence/maintenance";
import type {
  AssetState,
  Dept,
  Guest,
  InventoryItem,
  RoomState,
  Scenario,
  Segment,
  SimState,
  Staff,
} from "./types";

export const HOUR = 60;
export const DAY = 24 * HOUR;

const firstNames = ["Aarav", "Priya", "Rohan", "Ananya", "Vikram", "Meera", "Kabir", "Isha", "Arjun", "Diya", "Neel", "Sara", "Dev", "Tara", "Ayaan", "Zara", "Liam", "Emma", "Noah", "Olivia", "Hiro", "Yuki", "Omar", "Layla", "Lucas", "Sofia", "Ethan", "Chloe", "Ravi", "Nisha"];
const lastNames = ["Sharma", "Mehta", "Patel", "Iyer", "Kapoor", "Reddy", "Nair", "Desai", "Singh", "Joshi", "Rao", "Khan", "Bose", "Menon", "Walker", "Tanaka", "Haddad", "Silva", "Müller", "Rossi"];
const nationalities = ["IN", "IN", "IN", "IN", "IN", "GB", "US", "AE", "DE", "JP", "SG", "AU"];
const prefPool = ["late-checkout", "high-floor", "sea-view", "extra-pillows", "hypoallergenic", "quiet-room", "early-breakfast", "spa", "vegetarian", "vegan", "gluten-free", "crib", "connecting-rooms", "airport-transfer", "gym", "pool-cabana", "mini-bar-off", "feather-free", "yoga", "champagne-welcome"];

const staffNames = ["Sunita", "Ramesh", "Farah", "Deepak", "Lakshmi", "Manoj", "Rekha", "Suresh", "Pooja", "Ganesh", "Anita", "Rajesh", "Kavita", "Prakash", "Shalini", "Vinod", "Geeta", "Ashok", "Sneha", "Mahesh", "Rina", "Sanjay", "Usha", "Kiran", "Bhavna", "Nitin", "Seema", "Amit", "Jyoti", "Harish", "Preeti", "Dinesh", "Madhu", "Rahul", "Swati", "Yash", "Divya", "Naveen", "Pallavi", "Tarun", "Komal", "Vijay", "Asha", "Rohit"];

export function segmentFor(r: Rand, scenario: Scenario): Segment {
  const w: Record<Segment, number> =
    scenario === "conference-block"
      ? { business: 0.5, group: 0.2, "leisure-couple": 0.15, family: 0.1, luxury: 0.05 }
      : scenario === "vip-arrival"
        ? { luxury: 0.3, "leisure-couple": 0.3, family: 0.2, business: 0.15, group: 0.05 }
        : { "leisure-couple": 0.35, family: 0.28, business: 0.17, luxury: 0.12, group: 0.08 };
  let x = r();
  for (const [k, v] of Object.entries(w)) {
    x -= v;
    if (x <= 0) return k as Segment;
  }
  return "leisure-couple";
}

/** Relative ancillary-spend intensity by segment — the single source of truth for how much
 * a segment "typically" spends, read both when generating a guest's actual spend below and
 * by lib/intelligence/guestExperience.ts's engagement benchmark, so "high engagement for a
 * business traveller" and "high engagement for a luxury guest" mean different, honest things
 * rather than sharing one flat number. */
export const SEGMENT_SPEND_MULTIPLIER: Record<Segment, number> = { "leisure-couple": 1.0, family: 1.2, business: 0.8, luxury: 2.4, group: 0.7 };

export function makeGuest(r: Rand, id: string, roomId: string | null, t: number, scenario: Scenario, seaView: boolean, type: string): Guest {
  const segment = segmentFor(r, scenario);
  const nights = segment === "business" ? randInt(r, 1, 3) : segment === "luxury" ? randInt(r, 3, 7) : randInt(r, 2, 5);
  const alreadyIn = randInt(r, 0, Math.max(0, nights - 1));
  const checkIn = t - alreadyIn * DAY - randInt(r, 0, 8) * HOUR;
  const loyaltyRoll = r();
  const loyalty = segment === "luxury" ? (loyaltyRoll < 0.5 ? "platinum" : "gold") : loyaltyRoll < 0.55 ? "none" : loyaltyRoll < 0.8 ? "silver" : loyaltyRoll < 0.95 ? "gold" : "platinum";
  const baseSpend = SEGMENT_SPEND_MULTIPLIER[segment];
  const prefs = new Set<string>();
  const nPrefs = randInt(r, 1, 4);
  while (prefs.size < nPrefs) prefs.add(pick(r, prefPool));
  if (segment === "family") prefs.add(r() < 0.5 ? "crib" : "connecting-rooms");
  if (segment === "luxury") prefs.add("sea-view");
  const vip = loyalty === "platinum" || (segment === "luxury" && r() < 0.4);
  return {
    id,
    name: `${pick(r, firstNames)} ${pick(r, lastNames)}`,
    roomId,
    segment,
    loyalty,
    nationality: pick(r, nationalities),
    adults: segment === "family" ? 2 : segment === "business" ? 1 : randInt(r, 1, 2),
    children: segment === "family" ? randInt(r, 1, 3) : 0,
    checkIn,
    checkOut: checkIn + nights * DAY + 3 * HOUR,
    leadDays: segment === "business" ? randInt(r, 1, 10) : randInt(r, 5, 60),
    channel: segment === "business" ? "corporate" : r() < 0.45 ? "ota" : r() < 0.7 ? "direct" : "agent",
    spendRoom: 0,
    spendFnb: Math.round(randRange(r, 800, 4500) * baseSpend * (alreadyIn + 0.5)),
    spendSpa: segment === "luxury" || r() < 0.25 ? Math.round(randRange(r, 1500, 8000) * baseSpend) : 0,
    spendOther: Math.round(randRange(r, 0, 2500) * baseSpend),
    prefs: [...prefs],
    sentiment: Math.max(-1, Math.min(1, gaussian(r, seaView ? 0.45 : 0.3, 0.3) + (type === "suite" ? 0.15 : 0))),
    // SIMULATED opt-out rate — no real hotel-industry consent benchmark cited here, unlike
    // the rest of this file's constants; illustrative only.
    consentPersonalization: r() < 0.85,
    vip,
    stays: loyalty === "none" ? 1 : loyalty === "silver" ? randInt(r, 2, 4) : loyalty === "gold" ? randInt(r, 5, 12) : randInt(r, 12, 40),
  };
}

export function occupancyTarget(scenario: Scenario) {
  return { "peak-season": 0.91, "monsoon-lull": 0.48, "conference-block": 0.86, "equipment-crisis": 0.82, "vip-arrival": 0.88 }[scenario];
}

export const WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Weekend leisure-resort occupancy runs 15-20% above weekday (WebSearch-verified, Indian
 * market). Normalized to a weekly mean of 1.0 so it reshapes a scenario's average occupancy
 * across the week rather than inflating or deflating it — Mon-Thu sit below the scenario's
 * target, Fri-Sat above it (~19% Fri/Sat-vs-Mon-Thu spread), Sun winds back down. Both the
 * live sim (engine.ts's occupancy-deficit tick) and the demand-spine forecast read this same
 * curve, so the forecast is never fighting a different demand model than the one that's
 * actually running. */
const DAY_OF_WEEK_FACTOR = [0.9518, 0.899, 0.899, 1.0046, 1.1105, 1.1317, 1.0046];

export function dayOfWeekFactor(dayIndex: number) {
  return DAY_OF_WEEK_FACTOR[((dayIndex % 7) + 7) % 7];
}

export function baseRateFor(scenario: Scenario) {
  return { "peak-season": 14200, "monsoon-lull": 8400, "conference-block": 11800, "equipment-crisis": 12600, "vip-arrival": 13400 }[scenario];
}

export function rateForRoom(base: number, type: string, seaView: boolean, floor: number, mult: number) {
  const typeMul = { standard: 1, deluxe: 1.28, accessible: 1, suite: 2.3 }[type] ?? 1;
  return Math.round(base * typeMul * (seaView ? 1.18 : 1) * (1 + floor * 0.012) * mult);
}

export function seedState(model: ResortModel, seed: number, scenario: Scenario): SimState {
  const r = mulberry32(seed ^ 0x9e3779b9);
  const t = 14 * DAY + 10 * HOUR + 24;
  const baseRate = baseRateFor(scenario);
  const occTarget = occupancyTarget(scenario);

  const rooms: Record<string, RoomState> = {};
  const guests: Record<string, Guest> = {};
  let gi = 0;
  for (const cell of model.rooms) {
    const roll = r();
    let status: RoomState["status"] = "vacant-clean";
    let guestId: string | null = null;
    if (roll < occTarget) {
      const g = makeGuest(r, `g-${String(++gi).padStart(4, "0")}`, cell.id, t, scenario, cell.seaView, cell.type);
      guests[g.id] = g;
      guestId = g.id;
      status = g.vip ? "vip" : "occupied";
    } else if (roll < occTarget + 0.05) status = "vacant-dirty";
    else if (roll < occTarget + 0.06) status = "ooo";
    const rate = rateForRoom(baseRate, cell.type, cell.seaView, cell.floor, 1);
    const nights7d = Math.round(7 * (guestId ? randRange(r, 0.7, 1) : randRange(r, 0.25, 0.75)));
    rooms[cell.id] = {
      id: cell.id,
      status,
      guestId,
      rate,
      revenue7d: nights7d * rate * randRange(r, 0.9, 1.05),
      nights7d,
      sentiment: guestId ? guests[guestId].sentiment : null,
      hkMinutes: status === "vacant-dirty" ? randInt(r, 28, 45) : status === "occupied" || status === "vip" ? randInt(r, 0, 20) : 0,
      hkQueuePos: null,
      energyKwh: 0,
      conditioned: guestId !== null || r() < 0.18,
      energyManaged: false,
      presence: guestId !== null ? 0.8 : 0.02,
      ecoMode: false,
      maintRisk: 0,
      lastCleanedAt: t - randInt(r, 1, 30) * HOUR,
    };
    if (guestId) guests[guestId].spendRoom = Math.round(rate * Math.max(1, (t - guests[guestId].checkIn) / DAY));
  }

  const staff: Record<string, Staff> = {};
  const roster: [Dept, string, string[], number][] = [
    ["housekeeping", "Room Attendant", ["clean", "turndown", "linen"], 14],
    ["housekeeping", "Supervisor", ["clean", "inspect", "linen"], 2],
    ["engineering", "Technician", ["hvac", "electrical", "plumbing"], 4],
    ["engineering", "Chief Engineer", ["hvac", "electrical", "plumbing", "elevator"], 1],
    ["fnb", "Server", ["serve", "room-service"], 8],
    ["fnb", "Chef", ["cook"], 4],
    ["frontdesk", "Agent", ["checkin", "billing"], 4],
    ["concierge", "Concierge", ["booking", "transport", "escort"], 2],
    ["spa", "Therapist", ["massage", "facial"], 3],
    ["security", "Officer", ["patrol"], 2],
  ];
  let si = 0;
  const hour = (t % DAY) / HOUR;
  for (const [dept, role, skills, n] of roster) {
    for (let i = 0; i < n; i++) {
      const id = `s-${String(++si).padStart(3, "0")}`;
      const shiftRoll = r();
      const shift = shiftRoll < 0.5 ? "morning" : shiftRoll < 0.85 ? "evening" : "night";
      const onShift = (shift === "morning" && hour >= 6 && hour < 14) || (shift === "evening" && hour >= 14 && hour < 22) || (shift === "night" && (hour >= 22 || hour < 6));
      const homeZone = { housekeeping: "z-hk-store", engineering: "z-hk-store", fnb: "z-kitchen", frontdesk: "z-reception", concierge: "z-reception", spa: "z-spa", security: "z-lobby" }[dept];
      const z = model.zoneById.get(homeZone)!;
      const pos: [number, number, number] = [z.center[0] + randRange(r, -2, 2), 0, z.center[2] + randRange(r, -2, 2)];
      staff[id] = {
        id,
        name: staffNames[si % staffNames.length],
        dept,
        role,
        skills,
        shift,
        status: onShift ? "idle" : "off",
        position: pos,
        floor: 0,
        taskId: null,
        path: [],
        pathIdx: 0,
        workUntil: 0,
        tasksDone: randInt(r, 0, 6),
        hoursToday: onShift ? randRange(r, 0.5, 5) : 0,
        homeNode: "nav-g-core",
        fatigue: dept === "housekeeping" ? randRange(r, 0.1, 0.35) : 0,
        nightShiftsWorked: shift === "night" ? randInt(r, 0, 4) : 0,
        weekendShiftsWorked: randInt(r, 0, 3),
      };
    }
  }

  const assets: Record<string, AssetState> = {};
  for (const a of model.assets) {
    const bases = {
      chiller: { temp: 42, vib: 2.1 },
      ahu: { temp: 31, vib: 1.4 },
      elevator: { temp: 38, vib: 1.8 },
      pump: { temp: 45, vib: 2.6 },
      boiler: { temp: 78, vib: 1.1 },
      generator: { temp: 55, vib: 3.2 },
      "kitchen-hood": { temp: 60, vib: 1.9 },
      "pool-filter": { temp: 34, vib: 2.3 },
    }[a.kind];
    let health = Math.min(1, Math.max(0.35, gaussian(r, 0.82, 0.12)));
    if (scenario === "equipment-crisis" && (a.id === "chiller-02" || a.id === "ahu-05" || a.id === "elevator-b")) health = randRange(r, 0.3, 0.45);
    if (a.id === "chiller-02" && scenario !== "equipment-crisis") health = 0.52;
    const runtimeHours = Math.round(randRange(r, 3000, 14000));
    const degr = 1 - health;
    assets[a.id] = {
      id: a.id,
      runtimeHours,
      temp: bases.temp + degr * 14,
      tempBase: bases.temp,
      vibration: bases.vib * (1 + degr * 1.8),
      vibBase: bases.vib,
      current: 100 * (1 + degr * 0.25),
      health,
      failureProb7d: 0,
      rulDays: 0,
      status: "healthy",
      lastServiceAt: t - randInt(r, 10, 200) * DAY,
      history: [],
    };
  }

  for (const a of model.assets) {
    const st = assets[a.id];
    const res = assessAssetSeed(a.kind, st);
    st.failureProb7d = res.prob7d;
    st.rulDays = res.rulDays;
    st.status = res.prob7d > 0.6 ? "critical" : res.prob7d > 0.3 ? "degraded" : "healthy";
    for (let i = 12; i >= 1; i--) st.history.push({ t: t - i * 30, temp: st.temp + gaussian(r, 0, 0.5), vib: st.vibration + gaussian(r, 0, 0.06) });
  }
  for (const cell of model.rooms) {
    let risk = 0;
    for (const a of model.assets) if (a.servesFloors.includes(cell.floor)) risk = Math.max(risk, assets[a.id].failureProb7d * (a.kind === "ahu" ? 1 : a.kind === "chiller" ? 0.8 : 0.5));
    rooms[cell.id].maintRisk = risk;
  }

  const inventory: Record<string, InventoryItem> = {};
  const items: [string, string, InventoryItem["category"], string, number, number, number, number, string][] = [
    ["inv-towels", "Bath Towels", "housekeeping", "pcs", 620, 160, 4, 320, "z-hk-store"],
    ["inv-linen", "Bed Linen Sets", "housekeeping", "sets", 380, 95, 5, 180, "z-hk-store"],
    ["inv-amenity", "Amenity Kits", "amenity", "kits", 540, 140, 7, 150, "z-hk-store"],
    ["inv-water", "Mineral Water 500ml", "fnb", "btl", 1800, 520, 2, 22, "z-fb-store"],
    ["inv-coffee", "Coffee Beans", "fnb", "kg", 42, 9, 4, 1400, "z-fb-store"],
    ["inv-eggs", "Eggs", "fnb", "dozen", 96, 38, 1, 84, "z-fb-store"],
    ["inv-chicken", "Chicken", "fnb", "kg", 68, 24, 1, 260, "z-fb-store"],
    ["inv-seafood", "Fresh Seafood", "fnb", "kg", 34, 15, 1, 720, "z-fb-store"],
    ["inv-wine", "House Wine", "fnb", "btl", 210, 26, 6, 1100, "z-fb-store"],
    ["inv-detergent", "Laundry Detergent", "housekeeping", "L", 140, 22, 5, 180, "z-hk-store"],
    ["inv-toilet", "Toilet Rolls", "housekeeping", "rolls", 1400, 210, 4, 18, "z-hk-store"],
    ["inv-filters", "HVAC Filters", "engineering", "pcs", 24, 1.2, 12, 950, "z-hk-store"],
    ["inv-chlorine", "Pool Chlorine", "engineering", "kg", 86, 11, 6, 140, "z-hk-store"],
    ["inv-bulbs", "LED Bulbs", "engineering", "pcs", 130, 4, 8, 220, "z-hk-store"],
  ];
  for (const [id, name, category, unit, stock, dailyUse, leadDays, unitCost, storeZone] of items) {
    const occScale = occTarget / 0.85;
    const use = dailyUse * occScale;
    const hist = Array.from({ length: 14 }, (_, i) => Math.max(0, use * (0.85 + 0.3 * r()) * (1 + 0.02 * i)));
    const sd = use * 0.18;
    const reorderPoint = Math.round(use * leadDays + 1.65 * sd * Math.sqrt(leadDays));
    inventory[id] = {
      id,
      name,
      category,
      unit,
      stock: Math.round(id === "inv-seafood" || id === "inv-towels" ? reorderPoint * 1.15 : stock * randRange(r, 0.6, 1.1)),
      dailyUse: use,
      useHistory: hist,
      leadDays,
      unitCost,
      reorderPoint,
      reorderQty: Math.round(Math.sqrt((2 * use * 365 * 450) / (unitCost * 0.22))),
      onOrder: 0,
      orderEta: null,
      storeZone,
    };
  }

  const occupied = Object.values(rooms).filter((x) => x.guestId).length;
  const occupancy = occupied / model.rooms.length;
  const adr = occupied ? Object.values(rooms).filter((x) => x.guestId).reduce((s, x) => s + x.rate, 0) / occupied : 0;
  const kpiHistory: SimState["kpiHistory"] = [];
  for (let h = 72; h >= 1; h--) {
    const tt = t - h * HOUR;
    const hod = (tt % DAY) / HOUR;
    const diurnal = hod < 11 ? 0.06 : hod < 15 ? -0.08 : 0.02;
    const o = Math.max(0.2, Math.min(0.99, occupancy + diurnal + gaussian(r, 0, 0.02) - (h / 72) * 0.05));
    const a = adr * (1 + gaussian(r, 0, 0.015) - (h / 72) * 0.03);
    kpiHistory.push({ t: tt, occupancy: o, adr: a, revpar: a * o, gss: Math.max(3, Math.min(5, 4.2 + gaussian(r, 0, 0.05))) });
  }
  const reviews: SimState["reviews"] = [];
  const guestList = Object.values(guests);
  for (let i = 0; i < 36 && guestList.length; i++) {
    const g = pick(r, guestList);
    const sent = Math.max(-1, Math.min(1, g.sentiment + gaussian(r, 0, 0.35)));
    const text = reviewTextSeed(r, sent);
    const sc = scoreTextSeed(text);
    reviews.push({ id: `rv-seed-${i}`, guestId: g.id, roomId: g.roomId ?? model.rooms[0].id, text, rating: Math.max(1, Math.min(5, Math.round(3 + sent * 2 + randRange(r, -0.4, 0.4)))), aspects: sc.aspects, createdAt: t - randInt(r, 1, 13) * DAY - randInt(r, 0, 23) * HOUR, source: r() < 0.5 ? "post-stay" : "ota" });
  }
  reviews.sort((a, b) => a.createdAt - b.createdAt);
  return {
    seed,
    scenario,
    t,
    day0: t,
    speed: 10,
    paused: false,
    rooms,
    guests,
    staff,
    assets,
    requests: {},
    alerts: {},
    recommendations: {},
    inventory,
    reviews,
    feed: [],
    chat: [],
    kpis: {
      occupancy,
      adr,
      revpar: adr * occupancy,
      gss: 4.2,
      openAlerts: 0,
      staffOnShift: Object.values(staff).filter((s) => s.status !== "off").length,
      openRequests: 0,
      revenueToday: 0,
      energyToday: 0,
      energySavedToday: 0,
      ancillaryRevenueToday: 0,
      organicAncillaryToday: 0,
      trevparToday: adr * occupancy,
      directBookingShare: 0,
      otaCommissionSavedToday: 0,
    },
    kpiHistory,
    baseRate,
    rateMultiplier: 1,
  };
}
