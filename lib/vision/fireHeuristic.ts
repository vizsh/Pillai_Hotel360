import { PersistenceGate } from "./persistence";

/** Fire/smoke has no small, off-the-shelf pretrained classifier the way "car" or "person" do —
 * training one would need a labeled dataset and a training pipeline this session doesn't have.
 * Instead this reads the two real, well-documented visual signatures of flame directly off the
 * actual video pixels: a warm, high-saturation color band (orange/red/yellow) covering a
 * meaningful share of the frame, AND that share flickering frame-to-frame rather than sitting
 * static (a static warm wall or sunset patch never flickers; a flame does). Both numbers are
 * genuinely computed from the frame, and the alert explanation quotes them directly — no
 * fabricated confidence score standing in for either. */

const SAMPLE_W = 96;
const SAMPLE_H = 54;
const FLICKER_WINDOW = 8;
const RATIO_THRESHOLD = 0.06; // 6% of sampled pixels warm+saturated
const FLICKER_THRESHOLD = 0.006; // variance of the ratio across the flicker window

export interface FireSample {
  ratio: number;
  flicker: number;
  passed: boolean;
  justConfirmed: boolean;
}

export class FireHeuristicDetector {
  private gate = new PersistenceGate(6, 4);
  private ratioHistory: number[] = [];
  private offscreen = document.createElement("canvas");

  constructor() {
    this.offscreen.width = SAMPLE_W;
    this.offscreen.height = SAMPLE_H;
  }

  sample(video: HTMLVideoElement): FireSample {
    const ctx = this.offscreen.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(video, 0, 0, SAMPLE_W, SAMPLE_H);
    const { data } = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H);

    let warm = 0;
    const total = SAMPLE_W * SAMPLE_H;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max === 0 ? 0 : (max - min) / max;
      // Hue-ish gate without full RGB->HSV conversion: warm means red/orange/yellow dominant,
      // i.e. R clearly ahead of B, with enough brightness and saturation to not be a dim, flat wall.
      const warmHue = r > 140 && r - b > 40 && g >= b;
      if (warmHue && sat > 0.35 && max > 120) warm++;
    }
    const ratio = warm / total;

    this.ratioHistory.push(ratio);
    if (this.ratioHistory.length > FLICKER_WINDOW) this.ratioHistory.shift();
    const mean = this.ratioHistory.reduce((a, b) => a + b, 0) / this.ratioHistory.length;
    const flicker = this.ratioHistory.length < 3 ? 0 : this.ratioHistory.reduce((a, b) => a + (b - mean) ** 2, 0) / this.ratioHistory.length;

    const passed = ratio > RATIO_THRESHOLD && flicker > FLICKER_THRESHOLD;
    const justConfirmed = this.gate.push(passed);
    return { ratio, flicker, passed, justConfirmed };
  }

  reset() {
    this.gate.reset();
    this.ratioHistory = [];
  }
}
