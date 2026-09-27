import { create } from "zustand";
import type { ZoneKind } from "@/lib/architecture/types";
import type { WeatherScenarioInput } from "@/lib/intelligence/weatherWhatIf";

/** The bridge between the Weather What-If panel (components/command/WeatherTwinPanel.tsx) and
 * the live 3D digital twin (components/twin/tower/GroundFloor.tsx's zone tint) — read
 * imperatively via getState() inside a useFrame loop, the same pattern RoomPlates.tsx already
 * uses for useTwin/useSim, not through React props, so dragging the panel's sliders repaints
 * the actual building rather than a separate illustration of it. `active` is false whenever the
 * panel isn't open, at which point the twin's "weather" layer falls back to today's real
 * forecasted weather (lib/intelligence/weather.ts) instead of a stale hypothetical. */
interface WeatherWhatIfStore {
  active: boolean;
  scenario: WeatherScenarioInput;
  zoneMultiplier: Partial<Record<ZoneKind, number>>;
  narrative: string;
  setActive: (active: boolean) => void;
  setResult: (scenario: WeatherScenarioInput, zoneMultiplier: Partial<Record<ZoneKind, number>>, narrative: string) => void;
}

export const useWeatherWhatIf = create<WeatherWhatIfStore>()((set) => ({
  active: false,
  scenario: { condition: "clear", tempC: 28, rainProbability: 0.1 },
  zoneMultiplier: {},
  narrative: "",
  setActive: (active) => set({ active }),
  setResult: (scenario, zoneMultiplier, narrative) => set({ scenario, zoneMultiplier, narrative }),
}));
