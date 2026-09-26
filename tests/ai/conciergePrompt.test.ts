import { describe, expect, it } from "vitest";
import { buildSystemPrompt, correctTierEligibility, GUARDRAIL_FALLBACK_REPLY, violatesGuardrails, type GuestPromptContext } from "@/lib/ai/conciergePrompt";
import type { RetrievedDoc } from "@/lib/ai/rag";

const silverGuest: GuestPromptContext = { name: "Liam", roomNumber: "101", segment: "group", loyalty: "silver", vip: false, prefs: null };
const goldGuest: GuestPromptContext = { name: "Asha", roomNumber: "204", segment: "luxury", loyalty: "gold", vip: false, prefs: null };

describe("violatesGuardrails", () => {
  it("flags refund, compensation, discount, waiver and free-upgrade language", () => {
    expect(violatesGuardrails("I can offer you a full refund for the inconvenience.")).toBe(true);
    expect(violatesGuardrails("We'll compensate you with a free night.")).toBe(true);
    expect(violatesGuardrails("I can waive the resort fee for you.")).toBe(true);
    expect(violatesGuardrails("Enjoy a 20% discount on your next stay.")).toBe(true);
    expect(violatesGuardrails("I've arranged a free upgrade to a suite.")).toBe(true);
  });

  it("does not flag ordinary informational replies", () => {
    expect(violatesGuardrails("The pool is open from 6am to 10pm daily.")).toBe(false);
    expect(violatesGuardrails("I've let housekeeping know — someone will be up shortly.")).toBe(false);
  });

  it("has a non-empty, guardrail-safe fallback reply that doesn't itself trip the filter", () => {
    expect(GUARDRAIL_FALLBACK_REPLY.length).toBeGreaterThan(0);
    expect(violatesGuardrails(GUARDRAIL_FALLBACK_REPLY)).toBe(false);
  });
});

describe("buildSystemPrompt", () => {
  const docs: RetrievedDoc[] = [{ id: "pool", text: "The pool is open 6am-10pm.", source: "src", score: 0.9 }];

  it("includes retrieved knowledge text verbatim", () => {
    const prompt = buildSystemPrompt(null, docs);
    expect(prompt).toContain("The pool is open 6am-10pm.");
  });

  it("says explicitly when nothing was retrieved, rather than staying silent about it", () => {
    const prompt = buildSystemPrompt(null, []);
    expect(prompt.toLowerCase()).toContain("no matching knowledge");
  });

  it("includes consented guest preferences when present", () => {
    const prompt = buildSystemPrompt({ name: "Asha", roomNumber: "204", segment: "luxury", loyalty: "gold", vip: false, prefs: ["sea-view", "spa"] }, docs);
    expect(prompt).toContain("sea-view");
    expect(prompt).toContain("Asha");
  });

  it("never includes a preference list for a guest who has not consented, and says so explicitly", () => {
    const prompt = buildSystemPrompt({ name: "Raj", roomNumber: "512", segment: "business", loyalty: "none", vip: false, prefs: null }, docs);
    expect(prompt).not.toContain("Known preferences");
    expect(prompt.toLowerCase()).toContain("not consented");
  });

  it("always instructs the model never to promise refunds, compensation or discounts", () => {
    const prompt = buildSystemPrompt(null, docs);
    expect(prompt.toLowerCase()).toContain("refund");
    expect(prompt.toLowerCase()).toContain("discount");
  });

  it("instructs the model to check tier-restricted benefits against the guest's actual tier", () => {
    const prompt = buildSystemPrompt(silverGuest, docs);
    expect(prompt.toLowerCase()).toContain("loyalty tier");
  });
});

describe("correctTierEligibility", () => {
  it("corrects a reply that wrongly grants a Silver guest a Gold/Platinum-only benefit (the reproduced bug)", () => {
    const reply = "Yes, as a loyalty member you have complimentary late checkout until 2pm, subject to availability.";
    const corrected = correctTierEligibility(reply, silverGuest);
    expect(corrected).not.toBeNull();
    expect(corrected!.toLowerCase()).toContain("reserved for our gold and platinum");
    expect(corrected).toContain("Liam");
  });

  it("leaves a reply alone when the guest's tier actually qualifies", () => {
    const reply = "Yes, as a Gold member you have complimentary late checkout until 2pm.";
    expect(correctTierEligibility(reply, goldGuest)).toBeNull();
  });

  it("leaves a reply alone when it doesn't mention a tier-gated benefit at all", () => {
    expect(correctTierEligibility("The pool is open 6am-10pm.", silverGuest)).toBeNull();
  });

  it("does nothing when there is no guest context (e.g. an anonymous question)", () => {
    const reply = "You have complimentary late checkout until 2pm.";
    expect(correctTierEligibility(reply, null)).toBeNull();
  });

  it("also catches the priority-spa-booking benefit for an ineligible tier", () => {
    const reply = "You have priority spa booking as a valued guest.";
    const corrected = correctTierEligibility(reply, silverGuest);
    expect(corrected).not.toBeNull();
    expect(corrected!.toLowerCase()).toContain("gold and platinum");
  });
});
