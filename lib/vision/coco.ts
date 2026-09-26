import * as tf from "@tensorflow/tfjs";
import * as cocoSsd from "@tensorflow-models/coco-ssd";

/** Real, pretrained in-browser object detector (COCO-SSD via TensorFlow.js — MIT-licensed,
 * genuinely runs client-side, no server round-trip). Loaded once and cached across every
 * clip/category rather than per run, since the weight fetch + backend init takes a few
 * seconds the first time only. There is no equivalent off-the-shelf pretrained model for
 * "fire" or "fight" as object classes — lib/vision/fireHeuristic.ts and
 * altercationHeuristic.ts use this model's real "person" detections plus real pixel/motion
 * math instead of pretending a bespoke classifier exists. */
let modelPromise: Promise<cocoSsd.ObjectDetection> | null = null;

export function loadCocoModel(): Promise<cocoSsd.ObjectDetection> {
  if (!modelPromise) {
    modelPromise = tf.ready().then(() => cocoSsd.load({ base: "lite_mobilenet_v2" }));
  }
  return modelPromise;
}

export type DetectedObject = cocoSsd.DetectedObject;
