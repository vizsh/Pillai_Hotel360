import { describe, expect, it } from "vitest";
import { allowedRoutes, guestCue, isRouteAllowed, ROLES, roleList } from "@/lib/rbac";

const allRoutes = [
  { href: "/revenue", label: "Revenue" },
  { href: "/guests", label: "Guests" },
  { href: "/operations", label: "Operations" },
  { href: "/maintenance", label: "Maintenance" },
];

describe("isRouteAllowed", () => {
  it("always allows /command regardless of role", () => {
    for (const role of roleList) expect(isRouteAllowed(role, "/command")).toBe(true);
  });

  it("allows every route for gm", () => {
    for (const r of allRoutes) expect(isRouteAllowed("gm", r.href)).toBe(true);
  });

  it("never allows guest-spend-adjacent revenue routes for executive-housekeeper", () => {
    expect(isRouteAllowed("executive-housekeeper", "/revenue")).toBe(false);
    expect(isRouteAllowed("executive-housekeeper", "/guests")).toBe(false);
  });

  it("matches each role's own declared routes list exactly", () => {
    for (const role of roleList) {
      const def = ROLES[role];
      if (def.routes === "*") continue;
      for (const href of def.routes) expect(isRouteAllowed(role, href)).toBe(true);
    }
  });
});

describe("allowedRoutes", () => {
  it("returns every route for gm and a strict subset for a restricted role", () => {
    expect(allowedRoutes("gm", allRoutes)).toHaveLength(allRoutes.length);
    const restricted = allowedRoutes("executive-housekeeper", allRoutes);
    expect(restricted.length).toBeLessThan(allRoutes.length);
    expect(restricted.every((r) => isRouteAllowed("executive-housekeeper", r.href))).toBe(true);
  });
});

describe("canViewGuestValue", () => {
  it("is true for gm and revenue-manager, false for front-office-manager and executive-housekeeper", () => {
    expect(ROLES.gm.canViewGuestValue).toBe(true);
    expect(ROLES["revenue-manager"].canViewGuestValue).toBe(true);
    expect(ROLES["front-office-manager"].canViewGuestValue).toBe(false);
    expect(ROLES["executive-housekeeper"].canViewGuestValue).toBe(false);
  });
});

describe("guestCue", () => {
  it("never includes a rupee figure — spend must never leak through the redacted cue", () => {
    const cue = guestCue({ stays: 5, loyalty: "gold", prefs: ["sea-view", "spa"], vip: true });
    expect(cue).not.toMatch(/₹|\d{3,}/);
  });

  it("distinguishes a first-time guest from a returning one", () => {
    expect(guestCue({ stays: 1, loyalty: "none", prefs: [], vip: false })).toContain("First stay");
    expect(guestCue({ stays: 4, loyalty: "none", prefs: [], vip: false })).toContain("Returning");
  });

  it("surfaces loyalty tier and VIP status when present, omits them when not", () => {
    const withTier = guestCue({ stays: 2, loyalty: "platinum", prefs: [], vip: true });
    expect(withTier).toContain("platinum");
    expect(withTier).toContain("VIP");
    const withoutTier = guestCue({ stays: 2, loyalty: "none", prefs: [], vip: false });
    expect(withoutTier).not.toContain("VIP");
  });

  it("includes at most 2 preferences to stay a one-liner", () => {
    const cue = guestCue({ stays: 2, loyalty: "none", prefs: ["a", "b", "c", "d"], vip: false });
    expect(cue).toContain("a, b");
    expect(cue).not.toContain("c");
  });
});
