import { describe, expect, it } from "vitest";
import { completeAnalysis, disruptionScoreOf, parseClassifierReply, ruleClassify } from "@/lib/ai/signalIntel";
import { parseScenarioReply, ruleParseScenario } from "@/lib/ai/scenarioParse";
import { offlineAnswer } from "@/lib/ai/offlineAnswer";
import { buildOpsSnapshot } from "@/lib/ai/opsSnapshot";
import { makeState } from "../helpers";

describe("signal classification", () => {
  it("rule classifier reads intent, urgency and place", () => {
    const r = ruleClassify("Flights cancelled at Dabolim as Goa floods");
    expect(["cancellation", "flooding"]).toContain(r.intent);
    expect(r.location).toBe("Goa");
    expect(ruleClassify("New phone launch tomorrow").intent).toBe("irrelevant");
  });
  it("parses model JSON, ignores junk, and the rules fill the gaps", () => {
    const items = [{ id: "a", title: "Cyclone warning for Konkan coast", source: "gnews" }, { id: "b", title: "Lovely sunny beach day", source: "reddit" }];
    const model = parseClassifierReply('Sure: [{"i":1,"intent":"safety-warning","urgency":0.9,"location":"Konkan","summary":"Cyclone warning"},{"i":9,"intent":"x"}]', items);
    expect(model.a.intent).toBe("safety-warning");
    expect(model.b).toBeUndefined();
    const full = completeAnalysis(items, model);
    expect(full.a.by).toBe("model");
    expect(full.b.by).toBe("rules");
  });
  it("disruption score counts only real disruption", () => {
    const mk = (intent: "cancellation" | "positive", urgency: number) => ({ intent, urgency, location: null, summary: "", by: "rules" as const });
    expect(disruptionScoreOf([mk("positive", 0.1), mk("positive", 0.1)])).toBe(0);
    expect(disruptionScoreOf([mk("cancellation", 0.8), mk("positive", 0.1)])).toBeCloseTo(0.4, 5);
  });
});

describe("scenario parsing", () => {
  it("maps plain English to bounded parameters", () => {
    const storm = ruleParseScenario("a severe cyclone with 95% rain");
    expect(storm.condition).toBe("rain");
    expect(storm.rainProbability).toBeCloseTo(0.95, 2);
    const heat = ruleParseScenario("extreme heatwave of 44 degrees");
    expect(heat.condition).toBe("heatwave");
    expect(heat.tempC).toBe(44);
    expect(ruleParseScenario("nice clear day").condition).toBe("clear");
  });
  it("clamps model output", () => {
    const p = parseScenarioReply('{"condition":"heatwave","tempC":99,"rainProbability":5,"note":"x"}')!;
    expect(p.tempC).toBe(46);
    expect(p.rainProbability).toBe(1);
    expect(parseScenarioReply("no json")).toBeNull();
  });
});

describe("offline answers", () => {
  it("answers lookups from live data with no model", () => {
    const { state, model } = makeState();
    const snap = buildOpsSnapshot(state, model, "gm");
    const r = offlineAnswer("How is the resort doing today?", snap)!;
    expect(r.reply).toContain("Resort summary");
    expect(r.toolsUsed).toContain("get_resort_summary");
    expect(offlineAnswer("zzzz qqqq", snap)).toBeNull();
  });
});
