import type { DetectedObject } from "./coco";
import { PersistenceGate } from "./persistence";

/** Same honesty constraint as fire: no small pretrained "fight" classifier exists off the
 * shelf, so this reads the two real signals a physical altercation actually produces —
 * multiple people in sustained close contact (bounding-box overlap, not just proximity) AND
 * unusually high frame-to-frame motion for those same people (a struggle moves far more per
 * frame than two people standing talking) — off COCO-SSD's real "person" detections, not a
 * fabricated action-recognition score. */

const IOU_CONTACT_THRESHOLD = 0.12;
const MOTION_THRESHOLD_PX = 26; // per-sample centroid displacement, in source-video pixels
const MIN_PEOPLE = 2;

export interface AltercationSample {
  peopleCount: number;
  maxOverlapIoU: number;
  avgMotion: number;
  passed: boolean;
  justConfirmed: boolean;
}

interface Tracked {
  cx: number;
  cy: number;
}

function centroid(d: DetectedObject): Tracked {
  const [x, y, w, h] = d.bbox;
  return { cx: x + w / 2, cy: y + h / 2 };
}

function iou(a: DetectedObject, b: DetectedObject): number {
  const [ax, ay, aw, ah] = a.bbox;
  const [bx, by, bw, bh] = b.bbox;
  const x1 = Math.max(ax, bx);
  const y1 = Math.max(ay, by);
  const x2 = Math.min(ax + aw, bx + bw);
  const y2 = Math.min(ay + ah, by + bh);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = aw * ah + bw * bh - inter;
  return union <= 0 ? 0 : inter / union;
}

export class AltercationHeuristicDetector {
  private gate = new PersistenceGate(6, 4);
  private prevCentroids: Tracked[] = [];

  sample(people: DetectedObject[]): AltercationSample {
    let maxOverlapIoU = 0;
    for (let i = 0; i < people.length; i++) {
      for (let j = i + 1; j < people.length; j++) {
        maxOverlapIoU = Math.max(maxOverlapIoU, iou(people[i], people[j]));
      }
    }

    const centroids = people.map(centroid);
    let avgMotion = 0;
    if (this.prevCentroids.length && centroids.length) {
      let total = 0;
      let matched = 0;
      for (const c of centroids) {
        let best = Infinity;
        for (const p of this.prevCentroids) best = Math.min(best, Math.hypot(c.cx - p.cx, c.cy - p.cy));
        if (best !== Infinity) {
          total += best;
          matched++;
        }
      }
      avgMotion = matched ? total / matched : 0;
    }
    this.prevCentroids = centroids;

    const passed = people.length >= MIN_PEOPLE && maxOverlapIoU > IOU_CONTACT_THRESHOLD && avgMotion > MOTION_THRESHOLD_PX;
    const justConfirmed = this.gate.push(passed);
    return { peopleCount: people.length, maxOverlapIoU, avgMotion, passed, justConfirmed };
  }

  reset() {
    this.gate.reset();
    this.prevCentroids = [];
  }
}
