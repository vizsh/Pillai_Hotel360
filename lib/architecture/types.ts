export type Vec3 = [number, number, number];

export type RoomType = "standard" | "deluxe" | "suite" | "accessible";
export type Side = "north" | "south";

export interface RoomCell {
  id: string;
  number: string;
  floor: number;
  index: number;
  side: Side;
  type: RoomType;
  seaView: boolean;
  center: Vec3;
  w: number;
  d: number;
  h: number;
  facing: 1 | -1;
  doorPos: Vec3;
}

export type AssetKind =
  | "chiller"
  | "ahu"
  | "elevator"
  | "pump"
  | "boiler"
  | "generator"
  | "kitchen-hood"
  | "pool-filter";

export interface AssetNode {
  id: string;
  name: string;
  kind: AssetKind;
  floor: number;
  position: Vec3;
  servesFloors: number[];
  size: Vec3;
}

export type ZoneKind =
  | "lobby"
  | "reception"
  | "restaurant"
  | "bar"
  | "spa"
  | "conference"
  | "kitchen"
  | "boh"
  | "housekeeping-store"
  | "fb-store"
  | "pool-deck"
  | "sky-bar"
  | "gym";

export interface ZoneCell {
  id: string;
  name: string;
  kind: ZoneKind;
  floor: number;
  center: Vec3;
  w: number;
  d: number;
}

export interface NavNode {
  id: string;
  position: Vec3;
  floor: number;
  kind: "corridor" | "core" | "room-door" | "lobby" | "site";
}

export interface NavEdge {
  a: string;
  b: string;
  cost: number;
}

export interface FloorSpec {
  index: number;
  y: number;
  height: number;
  kind: "ground" | "guest" | "roof";
  rooms: RoomCell[];
}

export interface TowerDims {
  length: number;
  depth: number;
  height: number;
  coreW: number;
  corridorW: number;
}

export interface ResortModel {
  name: string;
  dims: TowerDims;
  floors: FloorSpec[];
  rooms: RoomCell[];
  roomById: Map<string, RoomCell>;
  assets: AssetNode[];
  assetById: Map<string, AssetNode>;
  zones: ZoneCell[];
  zoneById: Map<string, ZoneCell>;
  nav: { nodes: NavNode[]; edges: NavEdge[]; nodeById: Map<string, NavNode> };
  roofY: number;
}
