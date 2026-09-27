import type { ResortModel } from "@/lib/architecture/types";
import type { SimState } from "@/lib/sim/types";
import { ROLES, type Role } from "@/lib/rbac";
import { forecastWeather, weatherSource } from "@/lib/intelligence/weather";
import { weatherDemandProfile } from "@/lib/intelligence/weatherImpact";
import { beliefSlope, calibrationSummary } from "@/lib/intelligence/weatherLearner";
import { computePricing } from "@/lib/intelligence/pricing";
import { getSocialSignals, getHazardEvents, getTrendScore, getSignalSources, socialSignalsSource, publicConcernScore } from "@/lib/intelligence/socialSignals";
import type { WeatherWhatIfResult } from "@/lib/intelligence/weatherWhatIf";

export interface OpsRoom {
  number: string;
  floor: number;
  status: string;
  guestName: string | null;
  guestId: string | null;
  maintRisk: number;
}

export interface OpsGuest {
  id: string;
  name: string;
  room: string;
  segment: string;
  loyalty: string;
  vip: boolean;
  sentiment: number;
  /** null when the requesting role can't see guest value (lib/rbac.ts) OR the guest hasn't
   * consented to personalization — the same two gates the rest of the app already enforces,
   * never bypassed just because a question came through the assistant instead of a page. */
  totalSpend: number | null;
}

export interface OpsRequest {
  id: string;
  room: string;
  type: string;
  text: string;
  status: string;
  ageMinutes: number;
  slaMin: number;
  slaBreached: boolean;
  assignedTo: string | null;
}

export interface OpsAlert {
  severity: string;
  kind: string;
  title: string;
  body: string;
  ageMinutes: number;
}

export interface OpsRecommendation {
  module: string;
  title: string;
  confidence: number;
  impact: string;
  /** Carried through so a tool can answer "what's planned for guest X" or "for our VIPs"
   * precisely (lib/ai/tools.ts's list_planned_actions) — matching on the title's own text
   * (e.g. "Chloe Kapoor · 303: ...") would be fragile; this is the same targetKind/targetId
   * the recommendation itself already carries. */
  targetKind: string;
  targetId: string;
}

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return Math.round(6371 * 2 * Math.asin(Math.sqrt(a)));
}

export interface OpsWeatherDay {
  dayOffset: number;
  condition: string;
  tempC: number;
  rainProbability: number;
  narrative: string;
  fnbSpendMultiplier: number;
  daytimePresenceBump: number;
  zoneMultiplier: Record<string, number>;
}

export interface OpsAsset {
  name: string;
  kind: string;
  floor: number;
  status: string;
  failureProb7d: number;
  rulDays: number;
  health: number;
}

export interface OpsSnapshot {
  asOfSimTime: string;
  role: Role;
  kpis: { occupancy: number; adr: number; revpar: number; gss: number; revenueToday: number };
  financials: {
    totalRooms: number;
    occupiedRooms: number;
    trevpar: number;
    ancillaryRevenueToday: number;
    organicAncillaryToday: number;
    directBookingShare: number;
    otaCommissionSavedToday: number;
    energyToday: number;
    energySavedToday: number;
    staffOnShift: number;
    currentRateMultiplier: number;
    recommendedRateMultiplier: number;
    currentAdr: number;
    recommendedAdr: number;
    currentRevpar: number;
    projectedRevpar: number;
    projectedOccupancy: number;
    elasticity: number;
  };
  weather: { source: "live" | "simulated"; days: OpsWeatherDay[]; calibration?: { priorSlope: number; learnedSlope: number; learnedSd: number; observations: number; improvementPct: number | null } };
  signals: {
    source: "live" | "none";
    concernScore: number;
    trendScore: number | null;
    sources: Record<string, boolean>;
    hazards: { name: string; eventType: string; alertLevel: string; fromDate: string; distanceKmFromResort: number }[];
    headlines: { source: string; title: string }[];
  };
  assets: OpsAsset[];
  /** Filled by the client only when the question is weather-related (the projection fast-forwards
   * the real sim engine several times, so it is computed on demand rather than on every message). */
  weatherWhatIf?: { rain: WeatherWhatIfResult; heatwave: WeatherWhatIfResult };
  rooms: OpsRoom[];
  guests: OpsGuest[];
  openRequests: OpsRequest[];
  openAlerts: OpsAlert[];
  pendingRecommendations: OpsRecommendation[];
}

/** Builds the full, current operational picture the ops assistant's tools query against —
 * everything a GM could ask about, in one place, computed fresh per request from the client's
 * own sim state (the simulation runs client-side; this snapshot is how the server ever sees
 * any of it, same as the rest of this codebase's API routes). Role-gated exactly like the
 * Guests page (lib/rbac.ts's canViewGuestValue) and consent-gated exactly like
 * personalization.ts — asking through the assistant is not a way around either. */
export function buildOpsSnapshot(state: SimState, model: ResortModel, role: Role): OpsSnapshot {
  const canSeeValue = ROLES[role].canViewGuestValue;

  const rooms: OpsRoom[] = model.rooms.map((r) => {
    const st = state.rooms[r.id];
    const guest = st.guestId ? state.guests[st.guestId] : null;
    return { number: r.number, floor: r.floor, status: st.status, guestName: guest?.name ?? null, guestId: st.guestId, maintRisk: st.maintRisk };
  });

  const guests: OpsGuest[] = Object.values(state.guests)
    .filter((g) => g.roomId)
    .map((g) => ({
      id: g.id,
      name: g.name,
      room: model.roomById.get(g.roomId!)?.number ?? g.roomId!,
      segment: g.segment,
      loyalty: g.loyalty,
      vip: g.vip,
      sentiment: g.sentiment,
      totalSpend: canSeeValue && g.consentPersonalization ? g.spendRoom + g.spendFnb + g.spendSpa + g.spendOther : null,
    }));

  const openRequests: OpsRequest[] = Object.values(state.requests)
    .filter((r) => r.status !== "done")
    .map((r) => {
      const ageMinutes = state.t - r.createdAt;
      return {
        id: r.id,
        room: r.roomId.startsWith("room-") ? (model.roomById.get(r.roomId)?.number ?? r.roomId) : r.roomId,
        type: r.type,
        text: r.text,
        status: r.status,
        ageMinutes: Math.round(ageMinutes),
        slaMin: r.slaMin,
        slaBreached: ageMinutes > r.slaMin,
        assignedTo: r.assignedTo ? (state.staff[r.assignedTo]?.name ?? null) : null,
      };
    });

  const openAlerts: OpsAlert[] = Object.values(state.alerts)
    .filter((a) => !a.resolvedAt)
    .map((a) => ({ severity: a.severity, kind: a.kind, title: a.title, body: a.body, ageMinutes: Math.round(state.t - a.createdAt) }));

  const pendingRecommendations: OpsRecommendation[] = Object.values(state.recommendations)
    .filter((r) => r.status === "pending")
    .map((r) => ({ module: r.module, title: r.title, confidence: r.confidence, impact: r.impact, targetKind: r.targetKind, targetId: r.targetId }));

  const roomsAll = Object.values(state.rooms);
  const pricing = computePricing(state, model);
  const weatherDays: OpsWeatherDay[] = forecastWeather(state).map((d) => {
    const prof = weatherDemandProfile(d, { fnbSlope: beliefSlope(state) });
    return { dayOffset: d.dayOffset, condition: d.condition, tempC: d.tempC, rainProbability: d.rainProbability, narrative: prof.narrative, fnbSpendMultiplier: prof.fnbSpendMultiplier, daytimePresenceBump: prof.daytimePresenceBump, zoneMultiplier: prof.zoneMultiplier as Record<string, number> };
  });
  const assets: OpsAsset[] = model.assets
    .map((a) => ({ a, st: state.assets[a.id] }))
    .filter((x) => x.st)
    .map(({ a, st }) => ({ name: a.name, kind: a.kind, floor: a.floor, status: st.status, failureProb7d: st.failureProb7d, rulDays: st.rulDays, health: st.health }))
    .sort((x, y) => y.failureProb7d - x.failureProb7d)
    .slice(0, 8);

  return {
    financials: {
      totalRooms: roomsAll.length,
      occupiedRooms: roomsAll.filter((r) => r.status === "occupied" || r.status === "vip").length,
      trevpar: state.kpis.trevparToday,
      ancillaryRevenueToday: state.kpis.ancillaryRevenueToday,
      organicAncillaryToday: state.kpis.organicAncillaryToday,
      directBookingShare: state.kpis.directBookingShare,
      otaCommissionSavedToday: state.kpis.otaCommissionSavedToday,
      energyToday: state.kpis.energyToday,
      energySavedToday: state.kpis.energySavedToday,
      staffOnShift: state.kpis.staffOnShift,
      currentRateMultiplier: pricing.currentMultiplier,
      recommendedRateMultiplier: pricing.recommendedMultiplier,
      currentAdr: pricing.currentAdr,
      recommendedAdr: pricing.recommendedAdr,
      currentRevpar: pricing.currentRevpar,
      projectedRevpar: pricing.projectedRevpar,
      projectedOccupancy: pricing.projectedOccupancy,
      elasticity: pricing.inputs.elasticity,
    },
    weather: {
      source: weatherSource(),
      days: weatherDays,
      calibration: (() => {
        const c = calibrationSummary(state);
        return { priorSlope: c.priorSlope, learnedSlope: c.learned.mean, learnedSd: c.learned.sd, observations: c.learned.n, improvementPct: c.improvementPct };
      })(),
    },
    signals: {
      source: socialSignalsSource(),
      concernScore: publicConcernScore(),
      trendScore: getTrendScore(),
      sources: getSignalSources(),
      hazards: getHazardEvents().map((h) => ({ name: h.name, eventType: h.eventType, alertLevel: h.alertLevel, fromDate: h.fromDate, distanceKmFromResort: distanceKm(15.2993, 74.124, h.lat, h.lon) })).sort((a, b) => a.distanceKmFromResort - b.distanceKmFromResort).slice(0, 6),
      headlines: getSocialSignals().slice(0, 8).map((i) => ({ source: i.source, title: i.title })),
    },
    assets,
    asOfSimTime: `day ${Math.floor(state.t / 1440)}, ${String(Math.floor((state.t % 1440) / 60)).padStart(2, "0")}:${String(Math.floor(state.t % 60)).padStart(2, "0")}`,
    role,
    kpis: { occupancy: state.kpis.occupancy, adr: state.kpis.adr, revpar: state.kpis.revpar, gss: state.kpis.gss, revenueToday: state.kpis.revenueToday },
    rooms,
    guests,
    openRequests,
    openAlerts,
    pendingRecommendations,
  };
}
