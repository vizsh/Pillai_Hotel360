import type { DetectedObject } from "./coco";

/** Real vehicle detection (COCO-SSD "car"/"truck") binned into a coarse zone grid over the
 * frame, rather than photogrammetrically calibrated per-slot polygons — calibrating exact slot
 * boundaries per camera (the way this project's sibling calibrated its seating chart from a
 * measured pixel grid) is a per-video setup step worth doing later for a specific lot; a grid
 * gives an honest, genuinely-detected occupied/free reading today without pretending a
 * per-slot calibration exists yet. */

export const GRID_COLS = 4;
export const GRID_ROWS = 3;

const VEHICLE_CLASSES = new Set(["car", "truck", "bus"]);

export interface ParkingZone {
  col: number;
  row: number;
  occupied: boolean;
  vehicleCount: number;
}

export function scoreParkingGrid(detections: DetectedObject[], videoW: number, videoH: number): ParkingZone[] {
  const zones: ParkingZone[] = [];
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) zones.push({ col, row, occupied: false, vehicleCount: 0 });
  }
  const cellW = videoW / GRID_COLS;
  const cellH = videoH / GRID_ROWS;
  for (const d of detections) {
    if (!VEHICLE_CLASSES.has(d.class)) continue;
    const [x, y, w, h] = d.bbox;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const col = Math.min(GRID_COLS - 1, Math.max(0, Math.floor(cx / cellW)));
    const row = Math.min(GRID_ROWS - 1, Math.max(0, Math.floor(cy / cellH)));
    const zone = zones[row * GRID_COLS + col];
    zone.occupied = true;
    zone.vehicleCount++;
  }
  return zones;
}
