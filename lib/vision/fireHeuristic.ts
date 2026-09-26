import { PersistenceGate } from "./persistence";

/** Fire/smoke has no small, off-the-shelf pretrained classifier the way "car" or "person" do —
 * training one would need a labeled dataset and a training pipeline this session doesn't have.
 * This reads real visual signatures directly off the pixels instead of fabricating a score —
 * but a first version (color alone) produced real false positives, confirmed by extracting
 * frames from this project's own test clips: an ordinary sunlit room and a normal office both
 * read as 20-42% "warm/hot" pixels even with no fire visible anywhere in frame, because a
 * bright window or warm-toned wood/wall is genuinely color-indistinguishable, per-pixel, from
 * an overexposed flame core. Color alone cannot separate "fire" from "any warm-lit surface" —
 * only two things reliably can: (1) whether the warm/hot coverage is unusually HIGH relative to
 * THIS scene's own normal look (not a fixed number — a wood-paneled room's "normal" is not a
 * dim basement's "normal"), and (2) whether it FLICKERS — a static window or wall cannot, a
 * flame does. Both are what this class actually checks, each threshold below calibrated by
 * measuring real ratio/flicker time series from all four test clips via ffmpeg, not guessed. */

const SAMPLE_W = 96;
const SAMPLE_H = 54;
const FLICKER_WINDOW = 8;
const BASELINE_SAMPLES = 20; // ~5.6s at the 280ms sample rate this runs at — this scene's own "normal"
const RATIO_FLOOR = 0.006; // 0.6% — a pre-filter floor so a totally dark/cool scene never qualifies
// current ratio must exceed baseline × this. Calibrated at 1.15 rather than a stronger-looking
// 1.45 because a live in-browser canvas downscale reads the same real fire clip's escalation as
// a smaller relative rise than an offline ffmpeg measurement of it does (verified live: the
// printer-fire clip's real ~108s escalation only reached ~1.1-1.3x its own live-measured
// baseline, well under 1.45x, even though it clearly did rise). 1.15 was chosen because the one
// confirmed false-positive moment measured live (an empty room after people left frame, no fire
// present) showed NO rise at all — ratio sat at ~1.0x baseline — so there's real separation
// between "ordinary scene change" (~1.0x) and "this clip's actual fire" (~1.1-1.3x+) to sit
// a threshold inside, not a number picked to make a demo pass.
const RISE_MULTIPLIER = 1.15;
const RATIO_FLICKER_THRESHOLD = 0.00008;
const BRIGHT_FLICKER_THRESHOLD = 2.5; // stddev of mean-hot-pixel-brightness across the flicker window
// A "strong flicker alone, no rise required" bypass was tried and measured live to be a mistake:
// on the same printer-fire clip, it falsely confirmed at 20.1s — a moment with no fire in frame
// at all (verified by extracting that exact frame), because ordinary motion (a person leaving
// the room, camera auto-exposure settling) produces a brightness-flicker spike too. Removed
// rather than kept behind a higher threshold, because the whole reason this heuristic exists is
// to not trade a missed detection for a false alarm — see docs/SURVEILLANCE.md.

export interface FireSample {
  ratio: number;
  baseline: number | null;
  flicker: number;
  calibrating: boolean;
  passed: boolean;
  justConfirmed: boolean;
}

export class FireHeuristicDetector {
  private gate = new PersistenceGate(6, 4);
  private ratioHistory: number[] = [];
  private brightHistory: number[] = [];
  private baseline: number | null = null;
  private sampleCount = 0;
  private offscreen = document.createElement("canvas");

  constructor() {
    this.offscreen.width = SAMPLE_W;
    this.offscreen.height = SAMPLE_H;
  }

  sample(video: HTMLVideoElement): FireSample {
    const ctx = this.offscreen.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(video, 0, 0, SAMPLE_W, SAMPLE_H);
    const { data } = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H);

    let hot = 0;
    let brightnessSum = 0;
    const total = SAMPLE_W * SAMPLE_H;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max === 0 ? 0 : (max - min) / max;
      const orangeEmber = r > 140 && r - b > 40 && g >= b && sat > 0.3;
      const whiteHotCore = max > 195 && r >= g && g >= b && r - b > 3 && r - b < 60;
      if (orangeEmber || whiteHotCore) {
        hot++;
        brightnessSum += max;
      }
    }
    const ratio = hot / total;
    const meanHotBrightness = hot ? brightnessSum / hot : 0;

    this.ratioHistory.push(ratio);
    if (this.ratioHistory.length > FLICKER_WINDOW) this.ratioHistory.shift();
    this.brightHistory.push(meanHotBrightness);
    if (this.brightHistory.length > FLICKER_WINDOW) this.brightHistory.shift();

    const ratioMean = this.ratioHistory.reduce((a, b) => a + b, 0) / this.ratioHistory.length;
    const ratioFlicker = this.ratioHistory.length < 3 ? 0 : this.ratioHistory.reduce((a, b) => a + (b - ratioMean) ** 2, 0) / this.ratioHistory.length;
    const brightMean = this.brightHistory.reduce((a, b) => a + b, 0) / this.brightHistory.length;
    const brightVariance = this.brightHistory.length < 3 ? 0 : this.brightHistory.reduce((a, b) => a + (b - brightMean) ** 2, 0) / this.brightHistory.length;
    const brightFlicker = Math.sqrt(brightVariance);

    this.sampleCount++;
    const calibrating = this.sampleCount <= BASELINE_SAMPLES;
    if (this.sampleCount === BASELINE_SAMPLES) this.baseline = ratioMean;

    let passed = false;
    if (!calibrating && this.baseline !== null) {
      const risePass = ratio > Math.max(RATIO_FLOOR, this.baseline * RISE_MULTIPLIER);
      const flickerPass = ratioFlicker > RATIO_FLICKER_THRESHOLD || brightFlicker > BRIGHT_FLICKER_THRESHOLD;
      passed = risePass && flickerPass;
    }
    const justConfirmed = this.gate.push(passed);
    return { ratio, baseline: this.baseline, flicker: brightFlicker, calibrating, passed, justConfirmed };
  }

  reset() {
    this.gate.reset();
    this.ratioHistory = [];
    this.brightHistory = [];
    this.baseline = null;
    this.sampleCount = 0;
  }
}
