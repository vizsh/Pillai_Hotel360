export interface ResortConfig {
  name: string;
  seed: number;
  tower: {
    floors: number;
    floorHeight: number;
    groundHeight: number;
    slabThickness: number;
  };
  plate: {
    roomsPerSide: number;
    roomW: number;
    roomD: number;
    corridorW: number;
    coreW: number;
  };
  suites: {
    topFloorSuites: boolean;
  };
  roof: {
    pool: boolean;
    skyBar: boolean;
    hvacUnits: number;
  };
  site: {
    groundSize: number;
    poolSize: [number, number];
    palms: number;
    cabanas: number;
    cars: number;
  };
}

export const defaultConfig: ResortConfig = {
  name: "Azure Bay Resort",
  seed: 0x5a1f,
  tower: {
    floors: 8,
    floorHeight: 3.6,
    groundHeight: 6.4,
    slabThickness: 0.35,
  },
  plate: {
    roomsPerSide: 10,
    roomW: 5.2,
    roomD: 7.4,
    corridorW: 2.8,
    coreW: 8,
  },
  suites: { topFloorSuites: true },
  roof: { pool: true, skyBar: true, hvacUnits: 6 },
  site: {
    groundSize: 240,
    poolSize: [34, 16],
    palms: 90,
    cabanas: 8,
    cars: 36,
  },
};
