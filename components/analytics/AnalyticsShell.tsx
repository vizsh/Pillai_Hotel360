"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Box, Pause, Play } from "lucide-react";
import { useSim } from "@/store/sim";
import { useSimLoop } from "@/hooks/useSimLoop";
import { fmtClock } from "@/lib/sim/engine";
import { Button, Provenance } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export const routes = [
  { href: "/revenue", label: "Revenue" },
  { href: "/guests", label: "Guests" },
  { href: "/operations", label: "Operations" },
  { href: "/maintenance", label: "Maintenance" },
  { href: "/inventory", label: "Inventory" },
  { href: "/energy", label: "Energy" },
  { href: "/sentiment", label: "Sentiment" },
  { href: "/concierge", label: "Concierge" },
  { href: "/integrations", label: "Integrations" },
  { href: "/history", label: "History" },
];

export function AnalyticsShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  useSimLoop();
  const path = usePathname();
  const { state, setPaused, setSpeed } = useSim();
  useSim((s) => s.version);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <div className="flex h-full flex-col overflow-hidden bg-void">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-stroke px-4">
        <Link href="/command" className="flex items-center gap-2 text-[12.5px] text-mid hover:text-hi">
          <Box size={14} className="text-accent" />
          Command Center
        </Link>
        <span className="h-5 w-px bg-stroke" />
        <nav className="flex items-center gap-0.5">
          {routes.map((r) => (
            <Link key={r.href} href={r.href} className={cn("rounded-md px-2.5 py-1.5 text-[12.5px]", path === r.href ? "bg-accent/15 text-accent" : "text-mid hover:text-hi")}>
              {r.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Provenance />
          <Button size="icon" variant="subtle" onClick={() => setPaused(!state.paused)}>
            {state.paused ? <Play size={13} /> : <Pause size={13} />}
          </Button>
          <span className="mono text-[12px] text-hi">{fmtClock(state.t)}</span>
          <div className="flex rounded-md bg-white/5 p-0.5">
            {[1, 10, 60, 240].map((s) => (
              <button key={s} onClick={() => setSpeed(s)} className={cn("mono rounded px-1.5 py-0.5 text-[10.5px]", state.speed === s ? "bg-accent/20 text-accent" : "text-low hover:text-hi")}>
                {s}×
              </button>
            ))}
          </div>
        </div>
      </header>
      <main className="scrollbar-thin flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-5 px-6 py-6">
          <div>
            <h1 className="font-display text-[28px] font-semibold tracking-tight">{title}</h1>
            <p className="mt-1 text-[13px] text-mid">{subtitle}</p>
          </div>
          {mounted ? children : <div className="h-[60vh] animate-pulse rounded-xl border border-stroke bg-deep/40" />}
        </div>
      </main>
    </div>
  );
}

export function Card({ title, right, children, className }: { title?: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-stroke bg-deep/70 p-4", className)}>
      {(title || right) && (
        <div className="mb-3 flex items-center justify-between">
          <span className="label">{title}</span>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

export const chartTheme = {
  grid: "#1c2532",
  axis: "#5b6879",
  tooltip: { background: "#101620", border: "1px solid #2a3647", borderRadius: 8, fontSize: 11, fontFamily: "var(--font-geist-mono)" },
};
