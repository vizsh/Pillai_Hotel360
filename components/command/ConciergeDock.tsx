"use client";

import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { useSim } from "@/store/sim";
import { cn } from "@/lib/utils";

export function ConciergeDock() {
  const { state } = useSim();
  useSim((s) => s.version);
  const openConcierge = Object.values(state.requests).filter((r) => r.source === "concierge" && r.status !== "done").length;

  return (
    <Link
      href="/concierge"
      className={cn(
        "glass pointer-events-auto flex h-11 items-center gap-2.5 rounded-full px-4 text-[13px] font-medium text-hi shadow-[0_0_24px_rgba(45,212,191,0.25)] transition-colors hover:border-accent/50",
      )}
    >
      <MessageSquare size={15} className="text-accent" />
      AI Concierge
      {openConcierge > 0 && <span className="mono rounded-full bg-accent/20 px-1.5 py-0.5 text-[10px] text-accent">{openConcierge} open</span>}
      {state.chat.length === 0 && <span className="text-[10.5px] text-low">· open full page</span>}
    </Link>
  );
}
