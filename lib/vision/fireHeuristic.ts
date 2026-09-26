import { PersistenceGate } from "./persistence";

/** Fire/smoke has no small, off-the-shelf pretrained classifier the way "car" or "person" do —
 * training one would need a labeled dataset and a training pipeline this session doesn't have.
 * Instead this reads two real, well-documented visual signatures of flame directly off the
 * actual video pixels: (1) a hot-pixel signature that covers BOTH the orange/red glowing edge
 * of a flame AND its overexposed white-hot core (a real fire's brightest point is often blown
 * out to near-white on camera, not pure orange — thresholds below were calibrated by measuring
 * actual RGB values pulled from this project's own test clips via ffmpeg, not guessed), and
 * (2) frame-to-frame flicker in that coverage. Calibration notes, measured directly against
 * public/surveillance/fire_detection/*.mp4: a small contained bucket fire runs a ~1.0% warm-
 * pixel baseline (mostly a static work light in frame) rising to ~2.1% once lit; a printer fire
 * peaks around 6%; a fully-engulfed room fire runs 25-60%+. The absolute floor below sits
 * comfortably under the smallest real fire's peak and above ordinary baseline/sensor noise. */

const SAMPLE_W = 96;
const SAMPLE_H = 54;
const FLICKER_WINDOW = 8;
const RATIO_THRESHOLD = 0.013; // 1.3% — above bucket-fire's ~1.0-1.3% baseline noise floor
const RATIO_THRESHOLD_HIGH = 0.017; // 1.7% — bucket-fire's actual burn peaks ~1.9-2.1%; this
// clears it without relying on flicker, which that clip's slow-building flame doesn't reliably
// produce even at a fast sample rate (measured directly against the real clip via ffmpeg —
// see this file's module comment). Printer/room fires clear this by a wide margin regardless.
const FLICKER_THRESHOLD = 0.0002;

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

    let hot = 0;
    const total = SAMPLE_W * SAMPLE_H;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max === 0 ? 0 : (max - min) / max;
      // Orange/red glowing embers and flame edges: classic warm hue, real saturation.
      const orangeEmber = r > 140 && r - b > 40 && g >= b && sat > 0.3;
      // The overexposed white-hot flame core: very bright, still slightly warm-shifted
      // (R >= G >= B) but too blown-out to read as "saturated orange" — a plain hue/sat test
      // alone misses exactly the brightest, most fire-like part of the frame.
      const whiteHotCore = max > 195 && r >= g && g >= b && r - b > 3 && r - b < 60;
      if (orangeEmber || whiteHotCore) hot++;
    }
    const ratio = hot / total;

    this.ratioHistory.push(ratio);
    if (this.ratioHistory.length > FLICKER_WINDOW) this.ratioHistory.shift();
    const mean = this.ratioHistory.reduce((a, b) => a + b, 0) / this.ratioHistory.length;
    const flicker = this.ratioHistory.length < 3 ? 0 : this.ratioHistory.reduce((a, b) => a + (b - mean) ** 2, 0) / this.ratioHistory.length;

    // Either corroborating flicker on top of the floor, or a ratio high enough to not need it —
    // a small fire flickers around a low baseline; a large one is unambiguous outright.
    const passed = ratio > RATIO_THRESHOLD && (flicker > FLICKER_THRESHOLD || ratio > RATIO_THRESHOLD_HIGH);
    const justConfirmed = this.gate.push(passed);
    return { ratio, flicker, passed, justConfirmed };
  }

  reset() {
    this.gate.reset();
    this.ratioHistory = [];
  }
}
