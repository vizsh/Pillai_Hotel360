import type { ChatTurn } from "./ollama";

/** Turns a plain-English scenario ("a two-day cyclone with 45 degree heat after") into what-if parameters.
 * The aligned model does the language understanding when available; the deterministic parser below is the
 * fallback and also validates and clamps whatever the model returns, so the simulator only ever receives
 * safe, bounded numbers. */
export interface ParsedScenario {
  condition: "clear" | "rain" | "heatwave";
  tempC: number;
  rainProbability: number;
  note: string;
  by: "model" | "rules";
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function ruleParseScenario(text: string): ParsedScenario {
  const t = text.toLowerCase();
  const temp = /(\d{2})\s*(?:°|deg|degrees?)?\s*c?\b/.exec(t.replace(/(\d+)%/g, ""));
  const pct = /(\d{1,3})\s*%/.exec(t);
  const storm = /(cyclone|hurricane|typhoon|storm|downpour|torrential|deluge|flood|heavy rain|pour)/.test(t);
  const rain = storm || /(rain|drizzle|shower|monsoon|wet)/.test(t);
  const heat = /(heat ?wave|scorch|very hot|extreme heat|sweltering|boiling|hot)/.test(t);
  const light = /(light|drizzle|shower|mild)/.test(t);
  let rainProbability = pct && rain ? clamp(Number(pct[1]) / 100, 0, 1) : storm ? 0.95 : rain ? (light ? 0.55 : 0.8) : 0.05;
  let tempC = temp ? clamp(Number(temp[1]), 15, 46) : heat ? 39 : storm ? 24 : rain ? 26 : 28;
  if (heat && !rain) rainProbability = 0.02;
  if (rain && !heat && tempC >= 34) tempC = 26;
  const condition: ParsedScenario["condition"] = heat && !storm && tempC >= 34 ? "heatwave" : rain && rainProbability >= 0.5 ? "rain" : tempC >= 34 ? "heatwave" : "clear";
  const note = `${condition === "clear" ? "Clear" : condition === "rain" ? (rainProbability >= 0.9 ? "Severe storm" : "Rain") : "Heatwave"} · ${Math.round(rainProbability * 100)}% rain · ${tempC}°C`;
  return { condition, tempC, rainProbability, note, by: "rules" };
}

export function scenarioPrompt(text: string): ChatTurn[] {
  return [
    {
      role: "system",
      content: `You convert a scenario description for a resort's weather digital twin into parameters. Reply with ONLY one JSON object: {"condition":"clear|rain|heatwave","tempC":number 15-46,"rainProbability":number 0-1,"note":"short label"}. A cyclone, storm or flood means condition rain with rainProbability about 0.95. Extreme heat means heatwave with tempC at or above 36 and rainProbability near 0.02.`,
    },
    { role: "user", content: text },
  ];
}

export function parseScenarioReply(reply: string): ParsedScenario | null {
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const o = JSON.parse(reply.slice(start, end + 1)) as Record<string, unknown>;
    if (!["clear", "rain", "heatwave"].includes(String(o.condition))) return null;
    let tempC = clamp(Number(o.tempC), 15, 46);
    if (o.condition === "rain") tempC = Math.min(tempC, 33); // a rain day and 40+ degrees are contradictory; keep the rain
    const rainProbability = clamp(Number(o.rainProbability), 0, 1);
    if (!Number.isFinite(tempC) || !Number.isFinite(rainProbability)) return null;
    return { condition: o.condition as ParsedScenario["condition"], tempC: Math.round(tempC), rainProbability, note: typeof o.note === "string" && o.note ? o.note.slice(0, 60) : "Parsed scenario", by: "model" };
  } catch {
    return null;
  }
}
