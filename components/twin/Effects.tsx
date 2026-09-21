"use client";

import { Bloom, EffectComposer, N8AO, SMAA, Vignette } from "@react-three/postprocessing";
import { useProfile } from "@/store/quality";

export function Effects() {
  const p = useProfile();
  if (!p.postfx) return null;
  return (
    <EffectComposer multisampling={0} enableNormalPass={p.ssao}>
      {p.ssao ? <N8AO aoRadius={2} intensity={1.2} distanceFalloff={1} quality="performance" /> : <></>}
      {p.bloom ? <Bloom luminanceThreshold={0.85} luminanceSmoothing={0.2} intensity={0.55} mipmapBlur radius={0.6} /> : <></>}
      <Vignette eskil={false} offset={0.25} darkness={0.7} />
      <SMAA />
    </EffectComposer>
  );
}
