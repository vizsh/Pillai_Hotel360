"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Sparkles, X } from "lucide-react";
import { useUi } from "@/store/ui";
import { useSim } from "@/store/sim";
import { useTwin, type Selection } from "@/store/twin";
import { getModel } from "@/lib/architecture/model";
import { statusLabels } from "@/lib/twin/colors";
import { resolveTwinQuery } from "@/lib/twin/queries";
import { Kbd } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export function LoadingOverlay() {
  const ready = useUi((s) => s.twinReady);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (ready) {
      const t = setTimeout(() => setGone(true), 700);
      return () => clearTimeout(t);
    }
  }, [ready]);
  if (gone) return null;
  const model = getModel();
  return (
    <div className={cn("pointer-events-auto absolute inset-0 z-50 grid place-items-center bg-void transition-opacity duration-700", ready ? "opacity-0" : "opacity-100")} aria-hidden={ready}>
      <div className="flex flex-col items-center gap-4">
        <div className="relative h-10 w-10">
          <div className="absolute inset-0 rounded-md bg-accent/30 shadow-[0_0_40px_var(--accent)]" style={{ animation: "pulse-ring 1.6s ease-out infinite" }} />
          <div className="absolute inset-2 rounded-sm bg-accent" />
        </div>
        <div className="text-center">
          <div className="font-display text-[18px] font-semibold tracking-tight">Smart Resort 360</div>
          <div className="label mt-1">generating {model.rooms.length} rooms · {model.floors.length} floors · {model.assets.length} assets</div>
        </div>
      </div>
    </div>
  );
}

interface Entry {
  sel: Selection;
  title: string;
  sub: string;
  kind: string;
}

export function Palette() {
  const open = useUi((s) => s.paletteOpen);
  const setOpen = useUi((s) => s.setPalette);
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useSim((s) => s.version);
  const state = useSim.getState().state;
  const model = getModel();

  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = [];
    for (const r of model.rooms) {
      const st = state.rooms[r.id];
      const g = st?.guestId ? state.guests[st.guestId] : null;
      out.push({ sel: { kind: "room", id: r.id }, title: `Room ${r.number}`, sub: `${r.type} · floor ${r.floor} · ${st ? statusLabels[st.status] : ""}${g ? ` · ${g.name}` : ""}`, kind: "room" });
    }
    for (const a of model.assets) out.push({ sel: { kind: "asset", id: a.id }, title: a.name, sub: `${a.kind} · risk ${((state.assets[a.id]?.failureProb7d ?? 0) * 100).toFixed(0)}%`, kind: "asset" });
    for (const z of model.zones) out.push({ sel: { kind: "zone", id: z.id }, title: z.name, sub: z.kind, kind: "zone" });
    for (const s of Object.values(state.staff)) if (s.status !== "off") out.push({ sel: { kind: "staff", id: s.id }, title: s.name, sub: `${s.role} · ${s.dept} · ${s.status}`, kind: "staff" });
    return out;
  }, [model, state]);

  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return entries.slice(0, 12);
    return entries.filter((e) => e.title.toLowerCase().includes(t) || e.sub.toLowerCase().includes(t)).slice(0, 14);
  }, [q, entries]);

  // "Show me" queries (lib/twin/queries.ts) — the same deterministic matcher the ops
  // assistant uses, so typing "which rooms are at risk" here does exactly what asking the
  // assistant the same question does: frame + pulse-highlight the matched rooms and caption
  // the answer, instead of (or alongside) plain entity search.
  const askResult = useMemo(() => {
    const t = q.trim();
    if (t.length < 3) return null;
    return resolveTwinQuery(t, state, model);
  }, [q, state, model]);

  useEffect(() => {
    if (open) {
      // Resetting local state when a prop/store value changes (here, the palette opening)
      // is one of React's own documented legitimate effect uses — not the "derived state"
      // anti-pattern the set-state-in-effect rule is meant to catch.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQ("");
      setIdx(0);
      setTimeout(() => input.current?.focus(), 10);
    }
  }, [open]);

  if (!open) return null;
  const choose = (e: Entry) => {
    useTwin.getState().select(e.sel);
    setOpen(false);
  };
  const chooseAsk = () => {
    if (!askResult) return;
    useTwin.getState().ask(askResult.rooms, askResult.caption);
    setOpen(false);
  };
  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex items-start justify-center bg-void/60 pt-[12vh] backdrop-blur-sm" onClick={() => setOpen(false)} role="dialog" aria-label="Search the resort">
      <div className="glass w-[560px] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-stroke px-3">
          <Search size={15} className="text-low" />
          <input
            ref={input}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setIdx(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIdx((i) => Math.min(results.length - 1, i + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setIdx((i) => Math.max(0, i - 1));
              } else if (e.key === "Enter" && results[idx]) choose(results[idx]);
              else if (e.key === "Enter" && askResult) chooseAsk();
              else if (e.key === "Escape") setOpen(false);
            }}
            placeholder="Search rooms, guests, assets, zones, staff…"
            className="h-11 flex-1 bg-transparent text-[14px] text-hi outline-none placeholder:text-low"
          />
          <Kbd>esc</Kbd>
        </div>
        {askResult && (
          <button
            onClick={chooseAsk}
            className="flex w-full items-center gap-3 border-b border-stroke bg-[#c084fc]/[0.06] px-3 py-2.5 text-left hover:bg-[#c084fc]/[0.12]"
          >
            <Sparkles size={14} className="shrink-0 text-[#c084fc]" />
            <span className="flex-1">
              <span className="block text-[12.5px] text-hi">Show me: {askResult.caption}</span>
              <span className="block text-[10.5px] text-low">Frames and highlights the matching rooms on the twin</span>
            </span>
            <Kbd>enter</Kbd>
          </button>
        )}
        <ul className="max-h-[420px] overflow-y-auto p-1" role="listbox">
          {results.map((e, i) => (
            <li key={e.sel.kind + e.sel.id} role="option" aria-selected={i === idx}>
              <button onMouseEnter={() => setIdx(i)} onClick={() => choose(e)} className={cn("flex w-full items-center gap-3 rounded-md px-3 py-2 text-left", i === idx ? "bg-accent/15" : "hover:bg-white/5")}>
                <span className="mono w-11 text-[10px] uppercase tracking-wider text-low">{e.kind}</span>
                <span className="flex-1">
                  <span className="block text-[13px] text-hi">{e.title}</span>
                  <span className="block truncate text-[11px] text-mid">{e.sub}</span>
                </span>
              </button>
            </li>
          ))}
          {results.length === 0 && <li className="px-3 py-4 text-[12px] text-low">No matches.</li>}
        </ul>
      </div>
    </div>
  );
}

export function HelpSheet() {
  const open = useUi((s) => s.helpOpen);
  const setOpen = useUi((s) => s.setHelp);
  if (!open) return null;
  const rows: [string, string][] = [
    ["1 – 7", "View modes: orbit, exploded, floor, x-ray, plan, facade, site"],
    ["[ / ]", "Previous / next floor in floor mode"],
    ["U, Q – Y", "Data layers: overall risk, occupancy, maintenance, sentiment, revenue, housekeeping, energy"],
    ["Space", "Pause / resume the simulation"],
    ["⌘K / Ctrl K", "Search rooms, guests, assets, staff"],
    ["T", "Start / stop cinematic tour"],
    ["Esc", "Clear selection · close dialogs"],
    ["?", "This sheet"],
    ["Drag / scroll", "Orbit and zoom the twin · double-click to focus"],
  ];
  return (
    <div className="pointer-events-auto absolute inset-0 z-40 grid place-items-center bg-void/60 backdrop-blur-sm" onClick={() => setOpen(false)} role="dialog" aria-label="Keyboard shortcuts">
      <div className="glass w-[520px] p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-[18px] font-semibold">Keyboard shortcuts</h2>
          <button onClick={() => setOpen(false)} className="text-low hover:text-hi" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <dl className="mt-4 grid grid-cols-[120px_1fr] gap-y-2 text-[12.5px]">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt>
                <Kbd>{k}</Kbd>
              </dt>
              <dd className="text-mid">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-[11px] text-low">Every entity on the twin is also reachable through search and the context panels, so the product is fully operable without the 3D view.</p>
      </div>
    </div>
  );
}
