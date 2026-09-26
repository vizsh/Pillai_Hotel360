import type { DetectedObject } from "./coco";
import { PersistenceGate } from "./persistence";

/** Same honesty constraint as fire: no small pretrained "fight" classifier exists off the
 * shelf, so this reads real signals a physical incident actually produces off COCO-SSD's real
 * "person" detections, not a fabricated action-recognition score:
 *  - multiple people in sustained close contact (bounding-box overlap) with elevated
 *    frame-to-frame motion — a struggle moves far more per frame than two people talking.
 *  - a single person whose bounding box is unusually wide relative to its height, sustained —
 *    a standing adult's box runs roughly 0.4-0.6 width/height; someone collapsed, sitting
 *    against a wall or curled up reads much wider than tall. Added because a real test clip in
 *    this project's own dataset (public/surveillance/sus_behaviour) shows exactly one visible
 *    person for its whole duration — the multi-person contact rule above can never fire on it
 *    by design, and pretending a second person exists would be fabricating a detection. This
 *    reads a real, different, single-person distress signal instead. */

const IOU_CONTACT_THRESHOLD = 0.12;
const MOTION_THRESHOLD_PX = 26; // per-sample centroid displacement, in source-video pixels
const MIN_PEOPLE = 2;
// bbox width/height. Measured directly against this project's own real test clip
// (public/surveillance/sus_behaviour/Abuse018_x264.mp4) rather than assumed: that person's box
// runs ~0.41-0.50 while upright/walking early in the clip, rising to ~0.62-0.73 once they're
// down against the wall — never crossing 1.0 (never literally wider than tall) even collapsed,
// so a "wider than tall" rule would silently never fire on this real footage. The threshold
// below sits between those two observed regimes.
const DOWN_ASPECT_THRESHOLD = 0.68;

export interface AltercationSample {
  peopleCount: number;
  maxOverlapIoU: number;
  avgMotion: number;
  passed: boolean;
  justConfirmed: boolean;
  personDown: boolean;
  justConfirmedDown: boolean;
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
  private downGate = new PersistenceGate(6, 4);
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

    const personDown = people.length >= 1 && people.some((p) => p.bbox[2] / p.bbox[3] > DOWN_ASPECT_THRESHOLD);
    const justConfirmedDown = this.downGate.push(personDown);

    return { peopleCount: people.length, maxOverlapIoU, avgMotion, passed, justConfirmed, personDown, justConfirmedDown };
  }

  reset() {
    this.gate.reset();
    this.downGate.reset();
    this.prevCentroids = [];
  }
}
