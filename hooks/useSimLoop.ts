"use client";

import { useEffect } from "react";
import { useSim } from "@/store/sim";
import { getModel } from "@/lib/architecture/model";
import { tick } from "@/lib/sim/engine";

export function useSimLoop() {
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let uiAcc = 0;
    const model = getModel();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dtReal = Math.min(0.25, (now - last) / 1000);
      last = now;
      const { state, bump } = useSim.getState();
      if (state.paused) return;
      acc += dtReal * state.speed;
      const step = state.speed >= 60 ? 2 : state.speed >= 10 ? 1 : 0.25;
      let guard = 0;
      while (acc >= step && guard++ < 400) {
        tick(state, model, step);
        acc -= step;
      }
      uiAcc += dtReal;
      if (uiAcc > 0.25) {
        uiAcc = 0;
        bump();
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
}
