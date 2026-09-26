import type { RequestType } from "@/lib/sim/types";

/** guestexperience (github.com/SDP42/guestexperience, a separate, independently-deployed
 * Next.js app guests use directly) has its own request schema (lib/requests.ts's ReqType).
 * Its submitRequest() writes to its own local SQLite AND now fires a real, fire-and-forget
 * POST to this app's /api/guest-app/inbox right after (see notifyAdminBridge in that repo's
 * lib/requests.ts). This adapter is what the receiving side of that call needs to translate
 * one of ITS request types into something this sim's own createRequest() already understands. */
export type GuestAppReqType = "room_service" | "housekeeping" | "maintenance" | "late_checkout" | "sos" | "other";

const TYPE_MAP: Record<GuestAppReqType, RequestType> = {
  room_service: "fnb",
  housekeeping: "housekeeping",
  maintenance: "maintenance",
  late_checkout: "concierge",
  sos: "complaint",
  other: "concierge",
};

export function mapGuestAppRequestType(type: string): RequestType {
  return TYPE_MAP[type as GuestAppReqType] ?? "concierge";
}

/** Builds the same kind of short, human-readable text this sim's own request templates use,
 * from whatever shape of payload guestexperience's submitRequest() sends — its payload varies
 * by kind (room_service carries an items array, others mostly carry free text / options), so
 * this reads defensively rather than assuming one fixed shape. */
export function describeGuestAppPayload(type: string, payload: Record<string, unknown>): string {
  if (type === "room_service" && Array.isArray(payload.items)) {
    const items = payload.items as Array<{ name?: string; qty?: number }>;
    const line = items.map((i) => `${i.qty ?? 1}x ${i.name ?? "item"}`).join(", ");
    return `Room service (guest app): ${line || "order placed"}`;
  }
  if (type === "sos") return `SOS raised from guest app${payload.note ? `: ${payload.note}` : ""}`;
  if (type === "late_checkout") return `Late checkout requested via guest app${payload.until ? ` until ${payload.until}` : ""}`;
  if (typeof payload.note === "string" && payload.note) return `${type.replace("_", " ")} (guest app): ${payload.note}`;
  return `${type.replace("_", " ")} request from guest app`;
}
