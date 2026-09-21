"use client";

import { getModel, defaultConfig } from "@/lib/architecture/model";
import { GuestFloor } from "./tower/GuestFloor";
import { GroundFloor } from "./tower/GroundFloor";
import { Roof } from "./tower/Roof";
import { Site } from "./site/Site";
import { Boundary } from "./Boundary";

export function Resort() {
  const model = getModel();
  const cfg = defaultConfig;
  return (
    <group>
      <Boundary name="site">
        <Site cfg={cfg} model={model} />
      </Boundary>
      {model.floors.map((f) => (
        <Boundary key={f.index} name={`floor-${f.index}`}>
          {f.kind === "ground" ? <GroundFloor floor={f} cfg={cfg} model={model} /> : <GuestFloor floor={f} cfg={cfg} model={model} />}
        </Boundary>
      ))}
      <Boundary name="roof">
        <Roof cfg={cfg} model={model} />
      </Boundary>
    </group>
  );
}
