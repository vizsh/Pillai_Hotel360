"use client";

import { cn } from "@/lib/utils";
import { useUi } from "@/store/ui";
import type { ModuleId } from "@/lib/sim/types";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Button({ className, variant = "ghost", size = "md", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "ghost" | "primary" | "outline" | "danger" | "subtle"; size?: "sm" | "md" | "icon" }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 disabled:pointer-events-none disabled:opacity-40",
        size === "sm" && "h-7 px-2.5 text-[12px]",
        size === "md" && "h-8 px-3 text-[13px]",
        size === "icon" && "h-8 w-8",
        variant === "ghost" && "text-mid hover:bg-white/5 hover:text-hi",
        variant === "subtle" && "bg-white/5 text-hi hover:bg-white/10",
        variant === "primary" && "bg-accent text-void hover:bg-accent-glow",
        variant === "outline" && "border border-stroke-lit text-hi hover:border-accent/60 hover:bg-accent/5",
        variant === "danger" && "border border-critical/40 text-critical hover:bg-critical/10",
        className,
      )}
      {...props}
    />
  );
}

export function Tag({ children, color, className }: { children: ReactNode; color?: string; className?: string }) {
  return (
    <span className={cn("mono inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em]", className)} style={color ? { color, borderColor: color + "66", background: color + "14" } : { color: "var(--text-low)", borderColor: "var(--stroke)" }}>
      {children}
    </span>
  );
}

/** Passive by default (a tag stating how real a number is) — becomes a clickable trigger
 * for the methodology panel when a `module` is given, i.e. wherever the tag is standing in
 * for one specific intelligence module's output rather than data in general. Not every
 * usage maps to a single module (e.g. general telemetry, a page-wide header) — those stay
 * passive rather than being force-fit to a module they don't actually represent. */
export const Provenance = ({ kind = "simulated", module }: { kind?: "simulated" | "modeled" | "derived"; module?: ModuleId }) => {
  if (!module) return <Tag className="opacity-70">{kind}</Tag>;
  return (
    <button onClick={() => useUi.getState().openMethodology(module)} title="How this is calculated">
      <Tag className="cursor-pointer opacity-70 transition-opacity hover:opacity-100">{kind}</Tag>
    </button>
  );
};

export function Stat({ label, value, sub, accent, className }: { label: string; value: ReactNode; sub?: ReactNode; accent?: string; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <span className="label">{label}</span>
      <span className="mono text-[18px] leading-none text-hi" style={accent ? { color: accent } : undefined}>
        {value}
      </span>
      {sub && <span className="mono text-[10px] text-low">{sub}</span>}
    </div>
  );
}

export function Sparkline({ data, width = 120, height = 28, color = "var(--accent)", fill = true, className }: { data: number[]; width?: number; height?: number; color?: string; fill?: boolean; className?: string }) {
  if (data.length < 2) return <svg width={width} height={height} className={className} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * width, height - 2 - ((v - min) / span) * (height - 4)] as const);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg width={width} height={height} className={className} aria-hidden>
      {fill && <path d={`${d} L${width},${height} L0,${height} Z`} fill={color} opacity={0.12} />}
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={2} fill={color} />
    </svg>
  );
}

export function Meter({ value, color = "var(--accent)", className }: { value: number; color?: string; className?: string }) {
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-white/5", className)}>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max(0, Math.min(100, value * 100))}%`, background: color }} />
    </div>
  );
}

export function Section({ title, right, children, className }: { title: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-2", className)}>
      <header className="flex items-center justify-between">
        <span className="label">{title}</span>
        {right}
      </header>
      {children}
    </section>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="mono rounded border border-stroke-lit bg-white/5 px-1 py-px text-[10px] text-mid">{children}</kbd>;
}

export const sevColor = (s: "info" | "warn" | "critical") => ({ info: "var(--accent)", warn: "var(--warm)", critical: "var(--critical)" })[s];
