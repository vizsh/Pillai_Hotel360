import { defaultConfig, type ResortConfig } from "./config";
import { generateResort } from "./generate";
import type { ResortModel } from "./types";

let cached: { cfg: ResortConfig; model: ResortModel } | null = null;

export function getModel(cfg: ResortConfig = defaultConfig): ResortModel {
  if (cached && cached.cfg === cfg) return cached.model;
  const model = generateResort(cfg);
  cached = { cfg, model };
  return model;
}

export { defaultConfig };
