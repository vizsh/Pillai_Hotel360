import type { ResortModel } from "@/lib/architecture/types";
import type { SimState } from "@/lib/sim/types";
import type { AdapterContract, BmsTelemetryPoint, CameraPresenceEvent, PmsReservationEvent } from "./types";

/** Sim time (minutes since day0) has no calendar meaning on its own — anchor it to an
 * arbitrary fixed date so sample payloads read as real ISO timestamps instead of exposing
 * the simulator's internal clock representation. */
const SIM_EPOCH_MS = Date.UTC(2026, 0, 1);
const toIso = (t: number) => new Date(SIM_EPOCH_MS + t * 60_000).toISOString();

/** Maps live SimState into the exact shape a PMS reservation webhook would send. This is
 * the seam: today it reads state.rooms/state.guests (written by the simulator's tick
 * loop); in production the same PmsReservationEvent[] would arrive over a webhook and be
 * written into state.rooms/state.guests instead — nothing downstream (lib/intelligence/*)
 * would need to change. */
export function toPmsEvents(state: SimState, model: ResortModel, limit = 8): PmsReservationEvent[] {
  const out: PmsReservationEvent[] = [];
  for (const r of model.rooms) {
    const rs = state.rooms[r.id];
    if (!rs.guestId) continue;
    const g = state.guests[rs.guestId];
    if (!g) continue;
    out.push({
      reservationId: `res-${g.id}`,
      roomNumber: r.number,
      status: "checked-in",
      guestName: g.name,
      loyaltyTier: g.loyalty,
      ratePlanCode: g.channel === "corporate" ? "CORP-FLEX" : g.channel === "ota" ? "OTA-NR" : "BAR",
      rateAmount: Math.round(rs.rate),
      currency: "INR",
      checkInIso: toIso(g.checkIn),
      checkOutIso: toIso(g.checkOut),
      channel: g.channel === "agent" ? "travel-agent" : g.channel,
      adults: g.adults,
      children: g.children,
      eventTimestampIso: toIso(state.t),
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** Maps live asset telemetry into BACnet-style points. Two points per asset (temperature,
 * vibration) mirror what a real gateway exposes per monitored object — the maintenance
 * module's Weibull hazard calc already consumes exactly these two signals. */
export function toBmsTelemetry(state: SimState, model: ResortModel, limit = 8): BmsTelemetryPoint[] {
  const out: BmsTelemetryPoint[] = [];
  for (const a of model.assets) {
    const st = state.assets[a.id];
    if (!st) continue;
    out.push(
      { assetId: a.id, assetName: a.name, pointType: "temperature", value: +st.temp.toFixed(1), unit: "C", quality: st.status === "failed" ? "bad" : "good", timestampIso: toIso(state.t) },
      { assetId: a.id, assetName: a.name, pointType: "vibration", value: +st.vibration.toFixed(2), unit: "mm/s", quality: st.status === "failed" ? "bad" : "good", timestampIso: toIso(state.t) },
    );
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}

/** Maps the CCTV-presence signal (already SIMULATED end-to-end — see lib/sim/types.ts on
 * RoomState.presence) into what a real camera-analytics vendor's zone-occupancy webhook
 * sends. Deliberately presence-confidence + count only, never identity. */
export function toCameraPresenceEvents(state: SimState, model: ResortModel, limit = 8): CameraPresenceEvent[] {
  const out: CameraPresenceEvent[] = [];
  for (const r of model.rooms) {
    const rs = state.rooms[r.id];
    if (!rs.guestId) continue;
    out.push({
      zoneId: r.id,
      zoneType: "guest-room",
      presenceConfidence: +rs.presence.toFixed(2),
      personCount: rs.presence > 0.5 ? 1 : 0,
      timestampIso: toIso(state.t),
    });
    if (out.length >= limit) break;
  }
  return out;
}

export function buildAdapterContracts(state: SimState, model: ResortModel): AdapterContract<PmsReservationEvent | BmsTelemetryPoint | CameraPresenceEvent>[] {
  return [
    {
      id: "pms",
      label: "Property Management System",
      vendorExamples: ["Oracle Opera Cloud", "Protel", "Cloudbeds"],
      description: "Reservation lifecycle events — check-in/out, rate, loyalty tier, channel. Drives occupancy, pricing, and segmentation today via the seeded simulator; a real PMS webhook would write into the identical state.rooms / state.guests shape.",
      sample: () => toPmsEvents(state, model, 4),
    },
    {
      id: "bms",
      label: "Building Management System",
      vendorExamples: ["Honeywell", "Siemens Desigo", "Niagara / BACnet gateway"],
      description: "Per-asset telemetry points (temperature, vibration) feeding the predictive-maintenance Weibull hazard model. Real BACnet point semantics: value + engineering unit + quality flag.",
      sample: () => toBmsTelemetry(state, model, 4),
    },
    {
      id: "camera",
      label: "Camera Presence Analytics",
      vendorExamples: ["Verkada", "Density", "Xovis"],
      description: "Zone-level presence confidence, not identity — feeds the Energy Intelligence module's eco-setback detection (a room the PMS calls occupied but the camera shows empty).",
      sample: () => toCameraPresenceEvents(state, model, 4),
    },
  ];
}
