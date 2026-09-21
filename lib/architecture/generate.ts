import { mulberry32 } from "@/lib/utils";
import type { ResortConfig } from "./config";
import type {
  AssetNode,
  FloorSpec,
  NavEdge,
  NavNode,
  ResortModel,
  RoomCell,
  RoomType,
  Vec3,
  ZoneCell,
} from "./types";

export function floorY(cfg: ResortConfig, floor: number) {
  if (floor === 0) return 0;
  return cfg.tower.groundHeight + (floor - 1) * cfg.tower.floorHeight;
}

export function floorHeight(cfg: ResortConfig, floor: number) {
  return floor === 0 ? cfg.tower.groundHeight : cfg.tower.floorHeight;
}

export function generateResort(cfg: ResortConfig): ResortModel {
  const rand = mulberry32(cfg.seed);
  const { plate, tower } = cfg;
  const half = Math.floor(plate.roomsPerSide / 2);
  const length = plate.roomsPerSide * plate.roomW + plate.coreW;
  const depth = plate.roomD * 2 + plate.corridorW;
  const roofY = floorY(cfg, tower.floors);
  const dims = {
    length,
    depth,
    height: roofY,
    coreW: plate.coreW,
    corridorW: plate.corridorW,
  };

  const rooms: RoomCell[] = [];
  const floors: FloorSpec[] = [];
  const assets: AssetNode[] = [];
  const zones: ZoneCell[] = [];
  const navNodes: NavNode[] = [];
  const navEdges: NavEdge[] = [];

  const roomX = (i: number, w: number, perSide: number) => {
    const h = Math.floor(perSide / 2);
    const base = -length / 2;
    return i < h ? base + (i + 0.5) * w : base + plate.coreW + (i + 0.5) * w;
  };

  for (let f = 0; f < tower.floors; f++) {
    const y = floorY(cfg, f);
    const h = floorHeight(cfg, f);
    const kind: FloorSpec["kind"] = f === 0 ? "ground" : "guest";
    const floorRooms: RoomCell[] = [];

    if (kind === "guest") {
      const isSuiteFloor = cfg.suites.topFloorSuites && f === tower.floors - 1;
      const perSide = isSuiteFloor ? plate.roomsPerSide / 2 : plate.roomsPerSide;
      const w = isSuiteFloor ? plate.roomW * 2 : plate.roomW;
      let idx = 0;
      for (const side of ["south", "north"] as const) {
        const facing: 1 | -1 = side === "north" ? 1 : -1;
        const cz = facing * (plate.corridorW / 2 + plate.roomD / 2);
        for (let i = 0; i < perSide; i++) {
          const cx = roomX(i, w, perSide);
          let type: RoomType = "standard";
          if (isSuiteFloor) type = "suite";
          else if (side === "south") type = rand() < 0.35 ? "deluxe" : "standard";
          if (!isSuiteFloor && i === 0 && side === "north" && f % 3 === 1) type = "accessible";
          const number = `${f}${String(idx + 1).padStart(2, "0")}`;
          const room: RoomCell = {
            id: `room-${number}`,
            number,
            floor: f,
            index: idx,
            side,
            type,
            seaView: side === "south",
            center: [cx, y, cz],
            w,
            d: plate.roomD,
            h: h - tower.slabThickness,
            facing,
            doorPos: [cx + w * 0.3, y, cz - facing * (plate.roomD / 2)],
          };
          floorRooms.push(room);
          rooms.push(room);
          idx++;
        }
      }

      assets.push({
        id: `ahu-${String(f).padStart(2, "0")}`,
        name: `AHU-${String(f).padStart(2, "0")}`,
        kind: "ahu",
        floor: f,
        position: [0, y + 0.4, plate.corridorW / 2 + plate.roomD * 0.55],
        servesFloors: [f],
        size: [2.2, 1.4, 1.6],
      });

      const corridorNodes: NavNode[] = [];
      const xs = new Set<number>();
      for (const r of floorRooms) xs.add(+r.center[0].toFixed(2));
      xs.add(0);
      const sorted = [...xs].sort((a, b) => a - b);
      sorted.forEach((x, i) => {
        const n: NavNode = {
          id: `nav-f${f}-c${i}`,
          position: [x, y, 0],
          floor: f,
          kind: x === 0 ? "core" : "corridor",
        };
        corridorNodes.push(n);
        navNodes.push(n);
        if (i > 0) {
          const prev = corridorNodes[i - 1];
          navEdges.push({ a: prev.id, b: n.id, cost: Math.abs(x - prev.position[0]) });
        }
      });
      for (const r of floorRooms) {
        const nearest = corridorNodes.reduce((best, n) =>
          Math.abs(n.position[0] - r.center[0]) < Math.abs(best.position[0] - r.center[0]) ? n : best,
        );
        const door: NavNode = {
          id: `nav-${r.id}`,
          position: [r.doorPos[0], y, r.facing * plate.corridorW * 0.5],
          floor: f,
          kind: "room-door",
        };
        navNodes.push(door);
        navEdges.push({ a: nearest.id, b: door.id, cost: plate.corridorW });
      }
    }

    floors.push({ index: f, y, height: h, kind, rooms: floorRooms });
  }

  const g = 0;
  const L = length / 2;
  const D = depth / 2;
  const zone = (id: string, name: string, kind: ZoneCell["kind"], x0: number, x1: number, z0: number, z1: number, floor = 0, y = 0): ZoneCell => ({
    id,
    name,
    kind,
    floor,
    center: [(x0 + x1) / 2, y, (z0 + z1) / 2],
    w: x1 - x0,
    d: z1 - z0,
  });
  zones.push(
    zone("z-restaurant", "Horizon Restaurant", "restaurant", -L, -14, -D, 0),
    zone("z-kitchen", "Main Kitchen", "kitchen", -L, -14, 0, D),
    zone("z-lobby", "Grand Lobby", "lobby", -14, 14, -D, -1.5),
    zone("z-reception", "Reception", "reception", -14, -4.5, 1.5, D),
    zone("z-hk-store", "Housekeeping Store", "housekeeping-store", 4.5, 9.5, 1.5, D),
    zone("z-fb-store", "F&B Store", "fb-store", 9.5, 14, 1.5, D),
    zone("z-spa", "Serenity Spa", "spa", 14, 24, -D, 0),
    zone("z-gym", "Fitness", "gym", 24, L, -D, 0),
    zone("z-conference", "Conference Hall", "conference", 14, L, 0, D),
    zone("z-pool-deck", "Infinity Pool Deck", "pool-deck", -16, 16, -D, 0, tower.floors, roofY),
    zone("z-sky-bar", "Sky Bar", "sky-bar", 16, L, -D, D, tower.floors, roofY),
  );

  assets.push(
    { id: "chiller-01", name: "Chiller-01", kind: "chiller", floor: tower.floors, position: [-L + 6, roofY + 1, 4], servesFloors: range(1, tower.floors), size: [4.2, 2.2, 2.4] },
    { id: "chiller-02", name: "Chiller-02", kind: "chiller", floor: tower.floors, position: [-L + 6, roofY + 1, -1.5], servesFloors: range(1, tower.floors), size: [4.2, 2.2, 2.4] },
    { id: "pump-roof", name: "Pool Circulation Pump", kind: "pump", floor: tower.floors, position: [-L + 13, roofY + 0.6, 5], servesFloors: [tower.floors], size: [1.6, 1.1, 1.2] },
    { id: "elevator-a", name: "Elevator A", kind: "elevator", floor: 0, position: [-2.4, g, 0], servesFloors: range(0, tower.floors), size: [2, tower.floors * tower.floorHeight, 2.2] },
    { id: "elevator-b", name: "Elevator B", kind: "elevator", floor: 0, position: [0, g, 0], servesFloors: range(0, tower.floors), size: [2, tower.floors * tower.floorHeight, 2.2] },
    { id: "elevator-c", name: "Elevator C", kind: "elevator", floor: 0, position: [2.4, g, 0], servesFloors: range(0, tower.floors), size: [2, tower.floors * tower.floorHeight, 2.2] },
    { id: "boiler-01", name: "Hot Water Boiler", kind: "boiler", floor: 0, position: [7, g + 0.9, D - 2], servesFloors: range(0, tower.floors), size: [2.4, 1.8, 1.8] },
    { id: "kitchen-hood", name: "Kitchen Extract Hood", kind: "kitchen-hood", floor: 0, position: [-22, g + 3.2, D - 3], servesFloors: [0], size: [5, 0.8, 1.6] },
    { id: "generator-01", name: "Standby Generator", kind: "generator", floor: 0, position: [L + 10, g + 0.9, D + 6], servesFloors: range(0, tower.floors), size: [4, 1.8, 1.8] },
    { id: "pool-filter", name: "Lagoon Pool Filtration", kind: "pool-filter", floor: 0, position: [-6, g + 0.5, -D - 34], servesFloors: [0], size: [2.4, 1, 2] },
  );

  const lobbyNodes: NavNode[] = [];
  for (let i = -4; i <= 4; i++) {
    const n: NavNode = { id: `nav-g-${i + 4}`, position: [i * 6, 0, -D / 2], floor: 0, kind: "lobby" };
    lobbyNodes.push(n);
    navNodes.push(n);
    if (i > -4) navEdges.push({ a: `nav-g-${i + 3}`, b: n.id, cost: 6 });
  }
  const groundCore: NavNode = { id: "nav-g-core", position: [0, 0, 0], floor: 0, kind: "core" };
  navNodes.push(groundCore);
  navEdges.push({ a: "nav-g-4", b: groundCore.id, cost: D / 2 });
  const siteEntry: NavNode = { id: "nav-site-entry", position: [0, 0, -D - 8], floor: 0, kind: "site" };
  navNodes.push(siteEntry);
  navEdges.push({ a: "nav-g-4", b: siteEntry.id, cost: 12 });

  for (let f = 1; f < tower.floors; f++) {
    const coreId = navNodes.find((n) => n.floor === f && n.kind === "core")!.id;
    const below = f === 1 ? groundCore.id : navNodes.find((n) => n.floor === f - 1 && n.kind === "core")!.id;
    navEdges.push({ a: below, b: coreId, cost: tower.floorHeight * 2.5 });
  }

  return {
    name: cfg.name,
    dims,
    floors,
    rooms,
    roomById: new Map(rooms.map((r) => [r.id, r])),
    assets,
    assetById: new Map(assets.map((a) => [a.id, a])),
    zones,
    zoneById: new Map(zones.map((z) => [z.id, z])),
    nav: {
      nodes: navNodes,
      edges: navEdges,
      nodeById: new Map(navNodes.map((n) => [n.id, n])),
    },
    roofY,
  };
}

function range(a: number, b: number) {
  const out: number[] = [];
  for (let i = a; i < b; i++) out.push(i);
  return out;
}

export function roomWorldCenter(r: RoomCell): Vec3 {
  return [r.center[0], r.center[1] + r.h / 2, r.center[2]];
}
