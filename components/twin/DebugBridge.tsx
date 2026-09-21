"use client";

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { useUi } from "@/store/ui";

export function DebugBridge() {
  const store = useThree((s) => s.get);
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    (window as unknown as { __r3f: unknown }).__r3f = store;
  }, [store]);
  return null;
}

export function ReadySignal() {
  useEffect(() => {
    const id = requestAnimationFrame(() => useUi.getState().setTwinReady(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return null;
}
