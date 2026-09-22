/**
 * Integration contracts — the exact payload shapes a real deployment's external systems
 * would push in. Every field here is one a real vendor's webhook/API actually exposes;
 * none of it is invented for convenience. Today `lib/adapters/simulatedSource.ts` produces
 * these shapes FROM the seeded simulator, proving the contract is satisfiable with real
 * data, not just aspirational. In a live deployment, a small ingestion service receives
 * these same payloads over webhook/MQTT and writes them into the same SimState shape the
 * simulator writes today — the intelligence modules in lib/intelligence/* don't change at
 * all, because they only ever read SimState, never the ingestion path.
 */

/** What a PMS (Opera, Protel, Cloudbeds, …) reservation webhook sends on check-in,
 * check-out, or a rate/status change. */
export interface PmsReservationEvent {
  reservationId: string;
  roomNumber: string;
  status: "checked-in" | "checked-out" | "reserved" | "no-show" | "cancelled";
  guestName: string;
  loyaltyTier: "none" | "silver" | "gold" | "platinum";
  ratePlanCode: string;
  rateAmount: number;
  currency: string;
  checkInIso: string;
  checkOutIso: string;
  channel: "direct" | "ota" | "corporate" | "travel-agent";
  adults: number;
  children: number;
  eventTimestampIso: string;
}

/** What a BMS/BACnet gateway (Niagara, Honeywell, Siemens Desigo, …) sends per monitored
 * point — this is real BACnet "point" semantics (value + engineering unit + quality
 * flag), not a made-up shape. */
export interface BmsTelemetryPoint {
  assetId: string;
  assetName: string;
  pointType: "temperature" | "vibration" | "runtime-hours" | "current-draw";
  value: number;
  unit: "C" | "mm/s" | "h" | "A";
  quality: "good" | "uncertain" | "bad";
  timestampIso: string;
}

/** What a camera-analytics vendor (Verkada, Density, Xovis, …) sends for occupancy/
 * presence inference — deliberately presence-only, no identity or face data, consistent
 * with this project's no-face-recognition constraint. Real vendors offer exactly this
 * privacy-preserving mode (zone occupancy count + confidence) for hospitality use. */
export interface CameraPresenceEvent {
  zoneId: string;
  zoneType: "guest-room" | "corridor" | "lobby" | "back-of-house";
  presenceConfidence: number;
  personCount: number | null;
  timestampIso: string;
}

export interface AdapterContract<T> {
  id: string;
  label: string;
  vendorExamples: string[];
  description: string;
  sample: () => T[];
}
