import { describe, expect, it } from "vitest";
import { assessHousekeepingFatigue, assessStaffFairness, BURNOUT_THRESHOLD, housekeepingBurnoutRecommendations, optimizeHousekeepingAssignment, STANDARD_ROOMS_PER_HK_SHIFT } from "@/lib/intelligence/staffing";
import { tick } from "@/lib/sim/engine";
import { makeState } from "../helpers";

describe("housekeeping fatigue accrual/decay (engine tick)", () => {
  it("accrues fatigue faster for a working attendant when the dirty-room backlog is far above the 14-room standard", () => {
    const light = makeState();
    const heavy = makeState();
    // Force exactly 3 housekeeping staff on duty (status survives shift-boundary reassignment
    // since it only ever touches idle/break/off) so the dirty-room-per-attendant ratio is
    // fully controlled by room count, not by whatever shift the seed happened to roster.
    const shiftAt = (hour: number) => (hour >= 6 && hour < 14 ? "morning" : hour >= 14 && hour < 22 ? "evening" : "night");
    let workerId = "";
    for (const s of [light, heavy]) {
      // Pin every housekeeping staffer's shift to one that won't go active during this tick,
      // so the shift-boundary logic can't flip any of the "off" ones to "idle" and dilute
      // the on-duty headcount this test is trying to hold at exactly 3.
      const activeAfter = shiftAt(Math.floor(((s.state.t + 60) % 1440) / 60));
      const safeShift = (["morning", "evening", "night"] as const).find((sh) => sh !== activeAfter)!;
      const hkList = Object.values(s.state.staff).filter((x) => x.dept === "housekeeping");
      hkList.forEach((st, i) => {
        st.shift = safeShift;
        st.status = i < 3 ? "working" : "off";
        st.fatigue = 0;
        // status flips to "idle" as soon as tick() notices workUntil is already in the past
        // (this staff never went through the normal "moving" -> "working" handoff that sets
        // it) — fatigue still accrues correctly for the tick it's "working" in, but look the
        // attendant up by id afterward rather than by status.
        if (i === 0) workerId = st.id;
      });
      for (const r of Object.values(s.state.rooms)) r.status = "vacant-clean";
    }
    const hk = (s: typeof light.state) => s.staff[workerId];

    // 2 dirty rooms / 3 attendants: well under the 14-room standard. 90 dirty / 3: far over it.
    const lightRooms = Object.values(light.state.rooms).slice(0, 2);
    for (const r of lightRooms) r.status = "vacant-dirty";
    const heavyRooms = Object.values(heavy.state.rooms).slice(0, 90);
    for (const r of heavyRooms) r.status = "vacant-dirty";

    tick(light.state, light.model, 60);
    tick(heavy.state, heavy.model, 60);

    expect(hk(heavy.state).fatigue).toBeGreaterThan(hk(light.state).fatigue);
    expect(hk(light.state).fatigue).toBeGreaterThan(0);
  });

  it("recovers fatigue for an off-duty attendant and never goes negative", () => {
    const { state, model } = makeState();
    const s = Object.values(state.staff).find((x) => x.dept === "housekeeping")!;
    // Pin this attendant's shift to whichever of the 3 shifts can't become active within the
    // test's ≤7h window, so the shift-boundary logic in tick() never flips them back "on".
    const shiftAt = (hour: number) => (hour >= 6 && hour < 14 ? "morning" : hour >= 14 && hour < 22 ? "evening" : "night");
    const hour0 = Math.floor((state.t % 1440) / 60);
    const current = shiftAt(hour0);
    const next = current === "morning" ? "evening" : current === "evening" ? "night" : "morning";
    s.shift = (["morning", "evening", "night"] as const).find((sh) => sh !== current && sh !== next)!;
    s.status = "off";
    s.fatigue = 0.3;
    tick(state, model, 60);
    expect(s.fatigue).toBeLessThan(0.3);
    expect(s.fatigue).toBeGreaterThanOrEqual(0);

    s.fatigue = 0.001;
    tick(state, model, 6 * 60);
    expect(s.fatigue).toBe(0);
  });

  it("never touches fatigue for non-housekeeping staff", () => {
    const { state, model } = makeState();
    const s = Object.values(state.staff).find((x) => x.dept !== "housekeeping")!;
    s.fatigue = 0;
    s.status = "working";
    tick(state, model, 120);
    expect(s.fatigue).toBe(0);
  });

  it("clamps fatigue to at most 1 under extreme sustained overload", () => {
    const { state, model } = makeState();
    for (const r of Object.values(state.rooms)) r.status = "vacant-dirty";
    for (const s of Object.values(state.staff)) {
      if (s.dept === "housekeeping") {
        s.status = "working";
        s.fatigue = 0.95;
      }
    }
    tick(state, model, 8 * 60);
    for (const s of Object.values(state.staff)) if (s.dept === "housekeeping") expect(s.fatigue).toBeLessThanOrEqual(1);
  });
});

describe("assessHousekeepingFatigue", () => {
  it("reports load per on-duty attendant and sorts at-risk staff by fatigue descending", () => {
    const { state } = makeState();
    const hk = Object.values(state.staff).filter((s) => s.dept === "housekeeping");
    for (const s of hk) {
      s.status = "off";
      s.fatigue = 0;
    }
    hk[0].status = "idle";
    hk[1].status = "idle";
    hk[0].fatigue = 0.9;
    hk[1].fatigue = 0.7;
    for (const r of Object.values(state.rooms)) r.status = "vacant-clean";
    const dirtyIds = Object.values(state.rooms).slice(0, 10).map((r) => r.id);
    for (const id of dirtyIds) state.rooms[id].status = "vacant-dirty";

    const a = assessHousekeepingFatigue(state);
    expect(a.loadPerAttendant).toBeCloseTo(5, 5);
    expect(a.atRisk.map((s) => s.id)).toEqual([hk[0].id, hk[1].id]);
  });

  it("falls back to raw dirty-room count when nobody is on duty", () => {
    const { state } = makeState();
    for (const s of Object.values(state.staff)) if (s.dept === "housekeeping") s.status = "off";
    for (const r of Object.values(state.rooms)) r.status = "vacant-clean";
    state.rooms[Object.keys(state.rooms)[0]].status = "vacant-dirty";
    const a = assessHousekeepingFatigue(state);
    expect(a.loadPerAttendant).toBe(1);
  });
});

describe("housekeepingBurnoutRecommendations", () => {
  it("does not recommend below the 2-attendant minimum", () => {
    const { state } = makeState();
    const hk = Object.values(state.staff).filter((s) => s.dept === "housekeeping");
    for (const s of hk) s.fatigue = 0;
    hk[0].fatigue = BURNOUT_THRESHOLD + 0.1;
    expect(housekeepingBurnoutRecommendations(state)).toHaveLength(0);
  });

  it("recommends a call-in with matching payload once at least 2 attendants are at risk", () => {
    const { state } = makeState();
    const hk = Object.values(state.staff).filter((s) => s.dept === "housekeeping");
    for (const s of hk) s.fatigue = 0;
    hk[0].fatigue = BURNOUT_THRESHOLD + 0.1;
    hk[1].fatigue = BURNOUT_THRESHOLD + 0.2;

    const recs = housekeepingBurnoutRecommendations(state);
    expect(recs).toHaveLength(1);
    const rec = recs[0];
    expect(rec.module).toBe("staffing");
    expect(rec.payload?.dept).toBe("housekeeping");
    expect(rec.payload?.count).toBeGreaterThanOrEqual(1);
    expect(rec.confidence).toBeGreaterThan(0);
    expect(rec.confidence).toBeLessThanOrEqual(0.9);
    expect(rec.body).toContain(String(STANDARD_ROOMS_PER_HK_SHIFT));
  });
});

describe("assessStaffFairness", () => {
  it("gives the sole heavily-loaded member a burden score of 1 and everyone else a lower one", () => {
    const { state } = makeState();
    const hk = Object.values(state.staff).filter((s) => s.dept === "housekeeping");
    for (const s of hk) {
      s.nightShiftsWorked = 0;
      s.weekendShiftsWorked = 0;
    }
    hk[0].nightShiftsWorked = 10;

    const depts = assessStaffFairness(state);
    const hkFairness = depts.find((d) => d.dept === "housekeeping")!;
    const burdened = hkFairness.members.find((m) => m.staffId === hk[0].id)!;
    expect(burdened.burdenScore).toBe(1);
    for (const m of hkFairness.members) if (m.staffId !== hk[0].id) expect(m.burdenScore).toBeLessThan(1);
    expect(hkFairness.mostBurdened?.staffId).toBe(hk[0].id);
  });

  it("reports a fairness score of 1 (perfectly fair) when every member carries an identical load", () => {
    const { state } = makeState();
    const hk = Object.values(state.staff).filter((s) => s.dept === "housekeeping");
    for (const s of hk) {
      s.nightShiftsWorked = 3;
      s.weekendShiftsWorked = 2;
    }
    const hkFairness = assessStaffFairness(state).find((d) => d.dept === "housekeeping")!;
    expect(hkFairness.coefficientOfVariation).toBe(0);
    expect(hkFairness.fairnessScore).toBe(1);
  });

  it("keeps fairnessScore within [0,1] and covers every department with at least one staff member", () => {
    const { state } = makeState();
    const results = assessStaffFairness(state);
    for (const d of results) {
      expect(d.fairnessScore).toBeGreaterThanOrEqual(0);
      expect(d.fairnessScore).toBeLessThanOrEqual(1);
      expect(d.members.length).toBeGreaterThan(0);
    }
  });
});

describe("optimizeHousekeepingAssignment", () => {
  it("returns null when there are no dirty rooms", () => {
    const { state, model } = makeState();
    for (const r of Object.values(state.rooms)) r.status = "vacant-clean";
    expect(optimizeHousekeepingAssignment(state, model)).toBeNull();
  });

  it("returns null when no housekeeping attendant is on duty", () => {
    const { state, model } = makeState();
    for (const s of Object.values(state.staff)) if (s.dept === "housekeeping" && s.role === "Room Attendant") s.status = "off";
    state.rooms[model.rooms[0].id].status = "vacant-dirty";
    expect(optimizeHousekeepingAssignment(state, model)).toBeNull();
  });

  it("never assigns a fewer total distance to the optimized plan being longer than the naive one", () => {
    const { state, model } = makeState("peak-season", 3);
    for (const r of Object.values(state.rooms)) if (!r.guestId) r.status = "vacant-dirty";
    for (const s of Object.values(state.staff)) if (s.dept === "housekeeping" && s.role === "Room Attendant") s.status = "idle";

    const plan = optimizeHousekeepingAssignment(state, model);
    expect(plan).not.toBeNull();
    expect(plan!.optimizedDistanceMeters).toBeLessThanOrEqual(plan!.naiveDistanceMeters + 1e-6);
    expect(plan!.savingsPct).toBeGreaterThanOrEqual(0);
  });

  it("assigns every dirty room to exactly one attendant, with no room left out or duplicated", () => {
    const { state, model } = makeState("peak-season", 3);
    for (const r of Object.values(state.rooms)) if (!r.guestId) r.status = "vacant-dirty";
    for (const s of Object.values(state.staff)) if (s.dept === "housekeeping" && s.role === "Room Attendant") s.status = "idle";

    const plan = optimizeHousekeepingAssignment(state, model)!;
    const dirtyCount = Object.values(state.rooms).filter((r) => r.status === "vacant-dirty").length;
    const assignedNumbers = plan.plans.flatMap((p) => p.roomNumbers);
    expect(assignedNumbers.length).toBe(dirtyCount);
    expect(new Set(assignedNumbers).size).toBe(assignedNumbers.length);
  });
});
