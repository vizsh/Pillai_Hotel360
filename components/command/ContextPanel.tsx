"use client";

import { X } from "lucide-react";
import { useSim } from "@/store/sim";
import { useTwin } from "@/store/twin";
import { Button } from "@/components/ui/primitives";
import { RoomPanel } from "./panels/RoomPanel";
import { AssetPanel } from "./panels/AssetPanel";
import { ZonePanel, StaffPanel, GuestPanel } from "./panels/ZoneStaffPanels";
import { OverviewPanel } from "./panels/OverviewPanel";

export function ContextPanel() {
  const selected = useTwin((s) => s.selected);
  const select = useTwin((s) => s.select);
  useSim((s) => s.version);
  return (
    <aside className="glass pointer-events-auto relative flex h-full w-[380px] flex-col">
      {selected && (
        <Button size="icon" variant="ghost" className="absolute right-2 top-2 z-10" onClick={() => select(null)} aria-label="Close">
          <X size={14} />
        </Button>
      )}
      <div className="scrollbar-thin flex-1 overflow-y-auto p-4">
        {!selected && <OverviewPanel />}
        {selected?.kind === "room" && <RoomPanel id={selected.id} />}
        {selected?.kind === "asset" && <AssetPanel id={selected.id} />}
        {selected?.kind === "zone" && <ZonePanel id={selected.id} />}
        {selected?.kind === "staff" && <StaffPanel id={selected.id} />}
        {selected?.kind === "guest" && <GuestPanel id={selected.id} />}
      </div>
    </aside>
  );
}
