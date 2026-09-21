import type { NavNode, ResortModel, Vec3 } from "@/lib/architecture/types";

let adj: Map<string, { id: string; cost: number }[]> | null = null;
let adjModel: ResortModel | null = null;

function adjacency(model: ResortModel) {
  if (adj && adjModel === model) return adj;
  adj = new Map();
  for (const n of model.nav.nodes) adj.set(n.id, []);
  for (const e of model.nav.edges) {
    adj.get(e.a)!.push({ id: e.b, cost: e.cost });
    adj.get(e.b)!.push({ id: e.a, cost: e.cost });
  }
  adjModel = model;
  return adj;
}

const h = (a: NavNode, b: NavNode) =>
  Math.abs(a.position[0] - b.position[0]) + Math.abs(a.position[1] - b.position[1]) * 2 + Math.abs(a.position[2] - b.position[2]);

export function findPath(model: ResortModel, from: string, to: string): NavNode[] {
  if (from === to) return [model.nav.nodeById.get(from)!];
  const A = adjacency(model);
  const nodes = model.nav.nodeById;
  const goal = nodes.get(to)!;
  const open = new Set<string>([from]);
  const came = new Map<string, string>();
  const g = new Map<string, number>([[from, 0]]);
  const f = new Map<string, number>([[from, h(nodes.get(from)!, goal)]]);
  while (open.size) {
    let cur = "";
    let best = Infinity;
    for (const id of open) {
      const v = f.get(id) ?? Infinity;
      if (v < best) {
        best = v;
        cur = id;
      }
    }
    if (cur === to) {
      const path = [cur];
      while (came.has(path[0])) path.unshift(came.get(path[0])!);
      return path.map((id) => nodes.get(id)!);
    }
    open.delete(cur);
    for (const { id, cost } of A.get(cur) ?? []) {
      const ng = (g.get(cur) ?? Infinity) + cost;
      if (ng < (g.get(id) ?? Infinity)) {
        came.set(id, cur);
        g.set(id, ng);
        f.set(id, ng + h(nodes.get(id)!, goal));
        open.add(id);
      }
    }
  }
  return [];
}

export function nearestNode(model: ResortModel, pos: Vec3, floor: number): NavNode {
  let best: NavNode | null = null;
  let bd = Infinity;
  for (const n of model.nav.nodes) {
    if (n.floor !== floor) continue;
    const d = (n.position[0] - pos[0]) ** 2 + (n.position[2] - pos[2]) ** 2;
    if (d < bd) {
      bd = d;
      best = n;
    }
  }
  return best ?? model.nav.nodes[0];
}

export function roomDoorNode(model: ResortModel, roomId: string) {
  return model.nav.nodeById.get(`nav-${roomId}`)!;
}

export function assetNode(model: ResortModel, assetId: string): NavNode {
  const a = model.assetById.get(assetId)!;
  if (a.floor === 0) return nearestNode(model, a.position, 0);
  if (a.floor >= model.floors.length) {
    return model.nav.nodes.find((n) => n.floor === model.floors.length - 1 && n.kind === "core")!;
  }
  return model.nav.nodes.find((n) => n.floor === a.floor && n.kind === "core")!;
}

export function zoneNode(model: ResortModel, zoneId: string): NavNode {
  const z = model.zoneById.get(zoneId)!;
  return nearestNode(model, z.center, z.floor >= model.floors.length ? 0 : z.floor);
}
