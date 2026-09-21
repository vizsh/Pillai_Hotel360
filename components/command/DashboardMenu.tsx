"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { LayoutGrid, ChevronDown, ArrowUpRight } from "lucide-react";
import { routes } from "@/components/analytics/AnalyticsShell";
import { cn } from "@/lib/utils";

export function DashboardMenu() {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 8, left: r.left });
    };
    place();
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (btnRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen((o) => !o)}
        className={cn("flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12px] transition-colors", open ? "border-accent/60 bg-accent/10 text-accent" : "border-stroke text-mid hover:border-stroke-lit hover:text-hi")}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <LayoutGrid size={13} />
        Dashboards
        <ChevronDown size={12} className={cn("transition-transform", open && "rotate-180")} />
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="glass fixed z-50 w-56 overflow-hidden p-1"
            style={{ top: pos.top, left: pos.left }}
          >
            {routes.map((r) => (
              <Link
                key={r.href}
                href={r.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex h-8 items-center justify-between rounded-md px-2.5 text-[12.5px] text-mid hover:bg-white/5 hover:text-hi"
              >
                {r.label}
                <ArrowUpRight size={12} className="text-low" />
              </Link>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
