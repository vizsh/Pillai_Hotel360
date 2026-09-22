"use client";

import { useEffect } from "react";
import { useSim } from "@/store/sim";
import { getModel } from "@/lib/architecture/model";
import { tick } from "@/lib/sim/engine";
import { saveSnapshot } from "@/lib/api/backend";

/** How often (real seconds) the live state gets persisted — decoupled from sim speed so a
 * demo interrupted at any point loses at most this much, not the whole session. */
const SNAPSHOT_INTERVAL_S = 20;

export function useSimLoop() {
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let uiAcc = 0;
    // Wall-clock timestamp, not accumulated per-frame delta — dtReal below is deliberately
    // capped at 0.25s to keep sim ticks stable, which would make an accumulator built from
    // it under-count real elapsed time whenever rAF is throttled (backgrounded/inactive
    // tab), and this timer needs to fire on real elapsed time regardless of tab focus.
    let lastSnapshotAt = Date.now();
    const model = getModel();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dtReal = Math.min(0.25, (now - last) / 1000);
      last = now;
      const { state, bump } = useSim.getState();
      if (Date.now() - lastSnapshotAt > SNAPSHOT_INTERVAL_S * 1000) {
        lastSnapshotAt = Date.now();
        saveSnapshot(state);
      }
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
