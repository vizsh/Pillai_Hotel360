"use client";

import { useMemo } from "react";
import type { FloorSpec, ResortModel } from "@/lib/architecture/types";
import type { ResortConfig } from "@/lib/architecture/config";
import {
  buildBalconies,
  buildBalconyRailings,
  buildFacadeGlass,
  buildFloorSlab,
  buildGuestFloorWalls,
  buildMullions,
} from "@/lib/twin/geometry";
import { makeGlass, makeMullion, makeSlab, makeWall } from "@/lib/twin/materials";
import { FloorGroup, useRegisterMaterial } from "../FloorGroup";
import { RoomPlates } from "./RoomPlates";
import { Furniture } from "./Furniture";
import { useProfile } from "@/store/quality";
import { AssetMeshes } from "../Assets";

function FloorShell({ floor, cfg, model }: { floor: FloorSpec; cfg: ResortConfig; model: ResortModel }) {
  const profile = useProfile();
  const geos = useMemo(
    () => ({
      slab: buildFloorSlab(cfg, model),
      walls: buildGuestFloorWalls(cfg, floor, model),
      glass: buildFacadeGlass(cfg, floor, model),
      mullions: buildMullions(cfg, floor, model),
      balconies: buildBalconies(cfg, floor, model),
      railings: buildBalconyRailings(cfg, floor, model),
    }),
    [cfg, floor, model],
  );
  const mats = useMemo(
    () => ({
      slab: makeSlab(),
      wall: makeWall(),
      glass: makeGlass(profile.transmission),
      mullion: makeMullion(),
      railing: makeMullion(),
    }),
    [profile.transmission],
  );
  useRegisterMaterial([mats.slab, mats.wall, mats.glass, mats.mullion, mats.railing]);
  return (
    <>
      <mesh geometry={geos.slab} material={mats.slab} receiveShadow castShadow />
      <mesh geometry={geos.walls} material={mats.wall} receiveShadow castShadow />
      <mesh geometry={geos.balconies} material={mats.slab} castShadow />
      <mesh geometry={geos.railings} material={mats.railing} castShadow />
      <mesh geometry={geos.mullions} material={mats.mullion} />
      <mesh geometry={geos.glass} material={mats.glass} />
    </>
  );
}

export function GuestFloor({ floor, cfg, model }: { floor: FloorSpec; cfg: ResortConfig; model: ResortModel }) {
  return (
    <FloorGroup floor={floor.index} baseY={floor.y}>
      <FloorShell floor={floor} cfg={cfg} model={model} />
      <RoomPlates floor={floor} />
      <Furniture floor={floor} />
      <AssetMeshes floor={floor.index} />
    </FloorGroup>
  );
}
