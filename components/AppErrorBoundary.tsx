"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

/** Top-level safety net for the whole app (wrapped around every route in app/layout.tsx).
 * The per-floor Boundary in components/twin/Boundary.tsx already isolates a single broken
 * floor from blanking the twin; this catches everything else — a render error anywhere
 * else in the tree previously meant a white screen with no explanation, which is about
 * the worst thing a judge could see three minutes into a demo. */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error("[app] unhandled render error", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="grid h-full w-full place-items-center bg-void p-6">
        <div className="glass max-w-[440px] p-6 text-center">
          <AlertTriangle className="mx-auto text-warm" size={28} />
          <h1 className="mt-3 font-display text-[18px] font-semibold text-hi">Something didn&apos;t render</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-mid">
            The simulation itself is fine — state is saved to a database every 20 seconds, so reloading picks up close to where you left off. This is a display error, not lost data.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mono mx-auto mt-4 flex h-9 items-center gap-2 rounded-md bg-accent px-4 text-[12.5px] font-medium text-void hover:bg-accent-glow"
          >
            <RotateCcw size={14} /> Reload
          </button>
        </div>
      </div>
    );
  }
}
