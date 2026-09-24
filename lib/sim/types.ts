import type { Vec3 } from "@/lib/architecture/types";

export type RoomStatus = "vacant-clean" | "vacant-dirty" | "cleaning" | "occupied" | "vip" | "ooo";

export interface RoomState {
  id: string;
  status: RoomStatus;
  guestId: string | null;
  rate: number;
  revenue7d: number;
  nights7d: number;
  sentiment: number | null;
  hkMinutes: number;
  hkQueuePos: number | null;
  energyKwh: number;
  conditioned: boolean;
  /** True while this room's conditioning is being held off by an accepted energy
   * recommendation (as opposed to just being naturally unconditioned). Lets the energy
   * module avoid re-recommending a room it already acted on, and lets the engine attribute
   * kpis.energySavedToday to managed rooms specifically rather than organic vacancy. */
  energyManaged: boolean;
  /** Corridor/room-adjacent camera presence confidence (SIMULATED — a noisy proxy for
   * physical presence, independent of the PMS guestId occupancy flag). Lets the energy
   * module catch a room the PMS calls "occupied" whose guest is actually poolside — the
   * gap plain PMS-driven conditioning logic can't see. Not face recognition: presence
   * only, no identity. */
  presence: number;
  /** True while conditioning is throttled to an eco setback because the guest is checked
   * in but the camera feed shows sustained absence — distinct from energyManaged, which
   * is a full shutdown for genuinely vacant rooms. */
  ecoMode: boolean;
  maintRisk: number;
  lastCleanedAt: number;
}

export type Segment = "leisure-couple" | "family" | "business" | "luxury" | "group";
export type LoyaltyTier = "none" | "silver" | "gold" | "platinum";

export interface Guest {
  id: string;
  name: string;
  roomId: string | null;
  segment: Segment;
  loyalty: LoyaltyTier;
  nationality: string;
  adults: number;
  children: number;
  checkIn: number;
  checkOut: number;
  leadDays: number;
  channel: "direct" | "ota" | "corporate" | "agent";
  spendRoom: number;
  spendFnb: number;
  spendSpa: number;
  spendOther: number;
  prefs: string[];
  sentiment: number;
  vip: boolean;
  stays: number;
}

export type Dept = "housekeeping" | "engineering" | "fnb" | "frontdesk" | "spa" | "security" | "concierge";

export type StaffStatus = "idle" | "moving" | "working" | "break" | "off";

export interface Staff {
  id: string;
  name: string;
  dept: Dept;
  role: string;
  skills: string[];
  shift: "morning" | "evening" | "night" | "off";
  status: StaffStatus;
  position: Vec3;
  floor: number;
  taskId: string | null;
  path: Vec3[];
  pathIdx: number;
  workUntil: number;
  tasksDone: number;
  hoursToday: number;
  homeNode: string;
  /** 0–1 accumulated workload strain, currently only modeled for housekeeping (see
   * lib/intelligence/staffing.ts's burnout assessment). Builds while working understaffed
   * shifts (rooms-per-attendant above the 14-room industry standard), recovers during
   * off-duty hours. Zero and inert for every other department — not modeled there. */
  fatigue: number;
}

export type AssetStatus = "healthy" | "degraded" | "critical" | "service" | "failed";

export interface AssetState {
  id: string;
  runtimeHours: number;
  temp: number;
  tempBase: number;
  vibration: number;
  vibBase: number;
  current: number;
  health: number;
  failureProb7d: number;
  rulDays: number;
  status: AssetStatus;
  lastServiceAt: number;
  history: { t: number; temp: number; vib: number }[];
}

export type RequestType = "housekeeping" | "maintenance" | "fnb" | "concierge" | "amenity" | "complaint";
export type RequestStatus = "open" | "assigned" | "in-progress" | "done";

export interface ServiceRequest {
  id: string;
  roomId: string;
  guestId: string | null;
  type: RequestType;
  text: string;
  createdAt: number;
  status: RequestStatus;
  assignedTo: string | null;
  slaMin: number;
  completedAt: number | null;
  source: "guest" | "system" | "concierge" | "staff";
}

export type Severity = "info" | "warn" | "critical";

export interface Alert {
  id: string;
  severity: Severity;
  kind: string;
  targetKind: "room" | "asset" | "zone" | "staff" | "inventory";
  targetId: string;
  title: string;
  body: string;
  createdAt: number;
  resolvedAt: number | null;
}

export type ModuleId =
  | "maintenance"
  | "pricing"
  | "staffing"
  | "inventory"
  | "personalization"
  | "concierge"
  | "sentiment"
  | "segmentation"
  | "relocation"
  | "energy"
  | "groupblock"
  | "recovery"
  | "weather";

export interface Recommendation {
  id: string;
  module: ModuleId;
  title: string;
  body: string;
  confidence: number;
  basis: string[];
  impact: string;
  action: string;
  targetKind: "room" | "asset" | "zone" | "staff" | "inventory" | "guest" | "resort";
  targetId: string;
  createdAt: number;
  status: "pending" | "accepted" | "dismissed" | "executed";
  payload?: Record<string, unknown>;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: "fnb" | "housekeeping" | "amenity" | "engineering";
  unit: string;
  stock: number;
  dailyUse: number;
  useHistory: number[];
  leadDays: number;
  unitCost: number;
  reorderPoint: number;
  reorderQty: number;
  onOrder: number;
  orderEta: number | null;
  storeZone: string;
}

export interface Review {
  id: string;
  guestId: string;
  roomId: string;
  text: string;
  rating: number;
  aspects: Record<string, number>;
  createdAt: number;
  source: "in-stay" | "post-stay" | "ota";
}

export interface FeedEvent {
  id: string;
  t: number;
  kind: "checkin" | "checkout" | "request" | "task" | "alert" | "recommendation" | "pricing" | "inventory" | "review" | "system" | "concierge";
  text: string;
  targetKind?: string;
  targetId?: string;
  severity?: Severity;
}

export interface Kpis {
  occupancy: number;
  adr: number;
  revpar: number;
  gss: number;
  openAlerts: number;
  staffOnShift: number;
  openRequests: number;
  revenueToday: number;
  energyToday: number;
  energySavedToday: number;
  /** Incremental F&B/spa/other spend directly attributable to an accepted personalization
   * next-best-action (a spa credit taken up, a sunset table booked, …) — distinct from
   * revenueToday, which is room revenue only. Zero until lib/intelligence/personalization.ts
   * actually models this; previously every NBA only ever moved guest sentiment. */
  ancillaryRevenueToday: number;
  /** Organic F&B/spa/other spend guests generate on their own (engine.ts's per-tick drift on
   * Guest.spendFnb), separate from ancillaryRevenueToday's NBA-attributed slice — together
   * these are "every outlet's revenue today," the total TRevPAR needs and RevPAR alone
   * can't see. Resets to 0 at night audit like revenueToday. */
  organicAncillaryToday: number;
  /** Total revenue (rooms + F&B + spa + other) ÷ available rooms — the metric the blueprint
   * explicitly flags hotels should manage instead of RevPAR, since a full-but-quiet resort
   * and a full-and-spending resort look identical on RevPAR alone. */
  trevparToday: number;
  /** Share of currently occupied rooms' revenue booked on Guest.channel "direct" (vs OTA/
   * corporate/agent) — revenue-weighted, not a headcount share, so a discounted OTA room
   * doesn't count the same as a full-rate direct one. */
  directBookingShare: number;
  /** ₹ saved today by the direct-booked share of revenueToday not paying an OTA commission,
   * at a 20% blended rate (MakeMyTrip/Booking.com India list 15-25% depending on property
   * and programme tier). An estimate against a counterfactual, not a real ledger line. */
  otaCommissionSavedToday: number;
}

export interface ChatMessage {
  id: string;
  role: "guest" | "concierge" | "system";
  text: string;
  t: number;
  intent?: string;
  requestId?: string;
  roomId?: string;
  confidence?: number;
  urgency?: "normal" | "high";
}

export type Scenario = "peak-season" | "monsoon-lull" | "conference-block" | "equipment-crisis" | "vip-arrival";

export interface SimState {
  seed: number;
  scenario: Scenario;
  t: number;
  day0: number;
  speed: number;
  paused: boolean;
  rooms: Record<string, RoomState>;
  guests: Record<string, Guest>;
  staff: Record<string, Staff>;
  assets: Record<string, AssetState>;
  requests: Record<string, ServiceRequest>;
  alerts: Record<string, Alert>;
  recommendations: Record<string, Recommendation>;
  inventory: Record<string, InventoryItem>;
  reviews: Review[];
  feed: FeedEvent[];
  chat: ChatMessage[];
  kpis: Kpis;
  kpiHistory: { t: number; occupancy: number; adr: number; revpar: number; gss: number }[];
  baseRate: number;
  rateMultiplier: number;
}
