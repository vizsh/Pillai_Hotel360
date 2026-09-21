import type { ResortModel } from "@/lib/architecture/types";
import type { AssetState, Recommendation, SimState } from "@/lib/sim/types";
import { clamp } from "@/lib/utils";

const shape: Record<string, number> = { chiller: 2.4, ahu: 2.0, elevator: 2.8, pump: 2.2, boiler: 2.6, generator: 1.9, "kitchen-hood": 1.8, "pool-filter": 2.0 };
const scale: Record<string, number> = { chiller: 26000, ahu: 32000, elevator: 40000, pump: 18000, boiler: 30000, generator: 22000, "kitchen-hood": 24000, "pool-filter": 20000 };

export interface RiskResult {
  prob7d: number;
  rulDays: number;
  hazardBase: number;
  tempZ: number;
  vibZ: number;
  anomaly: number;
}

export function assessAsset(kind: string, st: AssetState): RiskResult {
  const k = shape[kind] ?? 2;
  const lam = scale[kind] ?? 25000;
  const effHours = st.runtimeHours / Math.max(0.15, st.health);
  const H = (t: number) => Math.pow(t / lam, k);
  const dt7 = 7 * 24 * 12;
  const condBase = 1 - Math.exp(-(H(effHours + dt7) - H(effHours)));
  const tempZ = (st.temp - st.tempBase) / (st.tempBase * 0.06);
  const vibZ = (st.vibration - st.vibBase) / (st.vibBase * 0.18);
  const anomaly = clamp(Math.max(0, tempZ) * 0.5 + Math.max(0, vibZ) * 0.5, 0, 6);
  const prob7d = clamp(1 - (1 - condBase) * Math.exp(-anomaly * 0.45), 0, 0.99);
  let rul = 0;
  const step = 24 * 12;
  let cum = 0;
  for (let d = 1; d < 400; d++) {
    const p = 1 - Math.exp(-(H(effHours + d * step) - H(effHours + (d - 1) * step)) * (1 + anomaly * 0.6));
    cum = 1 - (1 - cum) * (1 - p);
    if (cum >= 0.5) {
      rul = d;
      break;
    }
    rul = d;
  }
  return { prob7d, rulDays: rul, hazardBase: condBase, tempZ, vibZ, anomaly };
}

export function statusFor(prob: number, st: AssetState): AssetState["status"] {
  if (st.status === "service" || st.status === "failed") return st.status;
  if (prob > 0.6) return "critical";
  if (prob > 0.3) return "degraded";
  return "healthy";
}

export function maintenanceRecommendations(state: SimState, model: ResortModel): Recommendation[] {
  const out: Recommendation[] = [];
  for (const a of model.assets) {
    const st = state.assets[a.id];
    if (!st || st.status === "service" || st.status === "failed") continue;
    if (st.failureProb7d < 0.35) continue;
    const roomsAffected = model.rooms.filter((r) => a.servesFloors.includes(r.floor)).length;
    const occAffected = model.rooms.filter((r) => a.servesFloors.includes(r.floor) && state.rooms[r.id]?.guestId).length;
    const hour = Math.floor((state.t % (24 * 60)) / 60);
    const windowStart = hour < 2 ? 2 : 26;
    const startLabel = windowStart === 2 ? "today 02:00–05:00" : "tomorrow 02:00–05:00";
    const lostNights = Math.round(occAffected * 0.35 * (st.failureProb7d > 0.6 ? 2 : 1));
    const critical = st.failureProb7d > 0.6;
    out.push({
      id: `rec-maint-${a.id}`,
      module: "maintenance",
      title: `${critical ? "Service" : "Inspect"} ${a.name} · ${a.floor >= model.floors.length ? "Roof plant" : a.floor === 0 ? "Ground" : `Floor ${a.floor}`}`,
      body: `Failure probability ${(st.failureProb7d * 100).toFixed(0)}% within 7 days. Remaining useful life estimate ${st.rulDays} days.`,
      confidence: clamp(0.55 + st.failureProb7d * 0.4 + Math.min(0.1, st.history.length / 400), 0, 0.96),
      basis: [
        `runtime ${st.runtimeHours.toLocaleString()} h · Weibull k=${shape[a.kind]} λ=${scale[a.kind].toLocaleString()} h`,
        `discharge temp ${st.temp.toFixed(1)}°C vs baseline ${st.tempBase.toFixed(1)}°C (z=${((st.temp - st.tempBase) / (st.tempBase * 0.06)).toFixed(1)})`,
        `vibration ${st.vibration.toFixed(2)} mm/s vs ${st.vibBase.toFixed(2)} (z=${((st.vibration - st.vibBase) / (st.vibBase * 0.18)).toFixed(1)})`,
        `health index ${(st.health * 100).toFixed(0)}% · last service ${Math.round((state.t - st.lastServiceAt) / (24 * 60))} days ago`,
      ],
      impact: `Serves ${roomsAffected} rooms (${occAffected} occupied). Avoids est. ${lostNights} room-nights lost. Displaces 0 guests in the ${startLabel} window.`,
      action: `Schedule ${critical ? "service" : "inspection"} window ${startLabel} and dispatch engineering.`,
      targetKind: "asset",
      targetId: a.id,
      createdAt: state.t,
      status: "pending",
      payload: { assetId: a.id, critical },
    });
  }
  return out;
}
