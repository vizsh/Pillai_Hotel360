/** Role-based access, per the blueprint's own persona table and its explicit worked example
 * ("a housekeeper never sees guest spending; the GM sees everything"). Routes are the
 * AnalyticsShell hrefs each role's nav shows; "/command" is always reachable by everyone —
 * it's the live twin, not a data table, and every role needs a way back to it. Enforcement
 * is real, not cosmetic: AnalyticsShell checks isRouteAllowed on every render and renders a
 * restricted-access panel instead of the page's children when a role types in a URL its own
 * nav wouldn't show. */

export type Role = "gm" | "revenue-manager" | "front-office-manager" | "executive-housekeeper";

export interface RoleDef {
  label: string;
  description: string;
  /** AnalyticsShell route hrefs this role's nav shows and can open. "*" = every route. */
  routes: string[] | "*";
  /** Whether this role sees guest ₹ figures — spend, ancillary revenue, NBA revenue uplift.
   * The blueprint's own literal example: a housekeeper never sees guest spending. */
  canViewGuestValue: boolean;
}

export const ROLES: Record<Role, RoleDef> = {
  gm: {
    label: "General Manager",
    description: "Full visibility across every department — the blueprint's Morning Briefing persona.",
    routes: "*",
    canViewGuestValue: true,
  },
  "revenue-manager": {
    label: "Revenue Manager",
    description: "Pricing, demand and guest value — not HR rosters or engineering telemetry.",
    routes: ["/revenue", "/guests", "/operations", "/history", "/summary"],
    canViewGuestValue: true,
  },
  "front-office-manager": {
    label: "Front Office Manager",
    description: "Guests, arrivals and service — no room-rate or guest-spend detail.",
    routes: ["/guests", "/operations", "/sentiment", "/concierge", "/summary"],
    canViewGuestValue: false,
  },
  "executive-housekeeper": {
    label: "Executive Housekeeper",
    description: "Rooms, roster and maintenance only — never guest spend, per the PS's own named example.",
    routes: ["/operations", "/maintenance", "/inventory", "/energy"],
    canViewGuestValue: false,
  },
};

export const roleList = Object.keys(ROLES) as Role[];

export function isRouteAllowed(role: Role, href: string): boolean {
  if (href === "/command") return true;
  const def = ROLES[role];
  return def.routes === "*" || def.routes.includes(href);
}

export function allowedRoutes(role: Role, all: { href: string; label: string }[]): { href: string; label: string }[] {
  return all.filter((r) => isRouteAllowed(role, r.href));
}

/** The blueprint's "guest cue" unique-edge: a one-line, non-financial summary a role without
 * canViewGuestValue can see instead of a full guest record ("Returning, prefers high floor,
 * Jain meals, anniversary tomorrow" is the blueprint's own worked example). Never includes
 * spend figures — that's the entire point of the function existing. */
export function guestCue(g: { stays: number; loyalty: string; prefs: string[]; vip: boolean }): string {
  const parts: string[] = [];
  parts.push(g.stays > 1 ? `Returning (${g.stays} stays)` : "First stay");
  if (g.loyalty !== "none") parts.push(`${g.loyalty} member`);
  if (g.vip) parts.push("VIP");
  if (g.prefs.length) parts.push(`prefers ${g.prefs.slice(0, 2).join(", ")}`);
  return parts.join(" · ");
}
