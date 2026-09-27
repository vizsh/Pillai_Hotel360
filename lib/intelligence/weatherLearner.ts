import type { SimState } from "@/lib/sim/types";

/** Online Bayesian calibration of the twin's weather-response model. The twin's belief about "how
 * strongly does rain move guest F&B spend" starts from a documented prior and is updated from what
 * the simulated property actually does on wet ticks (data assimilation), so the twin keeps learning
 * as new observations arrive instead of relying on a fixed constant.
 *
 * Model: y = beta * x + noise, where x is rain severity and y is the observed F&B spend ratio minus 1.
 * Conjugate normal update with a normal prior on beta (closed form, no sampling):
 *   precision = 1/prior_sd^2 + Sxx/sigma^2
 *   mean      = (prior_mean/prior_sd^2 + Sxy/sigma^2) / precision
 * Sigma is estimated online from residuals, shrunk toward a prior noise level while data is thin. */
export const PRIOR_SLOPE = 0.35;
export const PRIOR_SD = 0.15;
const PRIOR_NOISE_VAR = 0.02;
const PRIOR_NOISE_WEIGHT = 12;
const HISTORY_EVERY = 20;
const HISTORY_MAX = 80;

export interface LearnPoint {
  n: number;
  mean: number;
  sd: number;
}

export interface WeatherLearnState {
  n: number;
  sxx: number;
  sxy: number;
  syy: number;
  /** Running absolute prediction error of the current belief vs. a frozen prior-only model. */
  absErrLearned: number;
  absErrPrior: number;
  history: LearnPoint[];
}

export interface Posterior {
  mean: number;
  sd: number;
  ci95: [number, number];
  n: number;
  sigma: number;
}

export function newLearnState(): WeatherLearnState {
  return { n: 0, sxx: 0, sxy: 0, syy: 0, absErrLearned: 0, absErrPrior: 0, history: [] };
}

export function posteriorOf(l: WeatherLearnState | undefined): Posterior {
  if (!l || l.n === 0) return { mean: PRIOR_SLOPE, sd: PRIOR_SD, ci95: [PRIOR_SLOPE - 1.96 * PRIOR_SD, PRIOR_SLOPE + 1.96 * PRIOR_SD], n: 0, sigma: Math.sqrt(PRIOR_NOISE_VAR) };
  const p0 = 1 / (PRIOR_SD * PRIOR_SD);
  // Two-pass: estimate noise from the current best slope, then form the posterior with it.
  const rough = (p0 * PRIOR_SLOPE + l.sxy / PRIOR_NOISE_VAR) / (p0 + l.sxx / PRIOR_NOISE_VAR);
  const resid = Math.max(0, l.syy - 2 * rough * l.sxy + rough * rough * l.sxx);
  const noiseVar = (resid + PRIOR_NOISE_WEIGHT * PRIOR_NOISE_VAR) / (l.n + PRIOR_NOISE_WEIGHT);
  const precision = p0 + l.sxx / noiseVar;
  const mean = (p0 * PRIOR_SLOPE + l.sxy / noiseVar) / precision;
  const sd = Math.sqrt(1 / precision);
  return { mean, sd, ci95: [mean - 1.96 * sd, mean + 1.96 * sd], n: l.n, sigma: Math.sqrt(noiseVar) };
}

/** The slope the twin currently believes (posterior mean). */
export function beliefSlope(state: Pick<SimState, "wxLearn">): number {
  return posteriorOf(state.wxLearn).mean;
}

export function observe(state: Pick<SimState, "wxLearn">, severity: number, ratioMinusOne: number): void {
  if (severity <= 0 || !Number.isFinite(ratioMinusOne)) return;
  const l = (state.wxLearn ??= newLearnState());
  const before = posteriorOf(l).mean;
  l.absErrLearned += Math.abs(ratioMinusOne - before * severity);
  l.absErrPrior += Math.abs(ratioMinusOne - PRIOR_SLOPE * severity);
  l.n += 1;
  l.sxx += severity * severity;
  l.sxy += severity * ratioMinusOne;
  l.syy += ratioMinusOne * ratioMinusOne;
  if (l.n % HISTORY_EVERY === 0) {
    const p = posteriorOf(l);
    l.history.push({ n: l.n, mean: p.mean, sd: p.sd });
    if (l.history.length > HISTORY_MAX) l.history.shift();
  }
}

export function resetLearning(state: Pick<SimState, "wxLearn">): void {
  state.wxLearn = newLearnState();
}

export interface CalibrationSummary {
  priorSlope: number;
  priorSd: number;
  learned: Posterior;
  /** Mean absolute error of one-tick F&B-effect predictions: belief vs the frozen prior. */
  maeLearned: number | null;
  maePrior: number | null;
  improvementPct: number | null;
  /** The simulator's hidden ground truth (only meaningful because the property is simulated). */
  simulatorTruthSlope: number;
  history: LearnPoint[];
}

export function calibrationSummary(state: Pick<SimState, "wxLearn" | "wxWorldSens">): CalibrationSummary {
  const l = state.wxLearn;
  const learned = posteriorOf(l);
  const maeLearned = l && l.n > 0 ? l.absErrLearned / l.n : null;
  const maePrior = l && l.n > 0 ? l.absErrPrior / l.n : null;
  return {
    priorSlope: PRIOR_SLOPE,
    priorSd: PRIOR_SD,
    learned,
    maeLearned,
    maePrior,
    improvementPct: maeLearned !== null && maePrior !== null && maePrior > 0 ? ((maePrior - maeLearned) / maePrior) * 100 : null,
    simulatorTruthSlope: PRIOR_SLOPE * (state.wxWorldSens ?? 1),
    history: l?.history ?? [],
  };
}
