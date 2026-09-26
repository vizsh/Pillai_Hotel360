"use client";

import { Thermometer, Wrench, DoorOpen, X, Activity } from "lucide-react";
import { useSim } from "@/store/sim";
import { useTwin } from "@/store/twin";
import { getModel } from "@/lib/architecture/model";
import { worstAssetForRoom } from "@/lib/twin/trace";
import { statusColors, statusLabels } from "@/lib/twin/colors";
import { guestCue } from "@/lib/rbac";
import { createRequest, dispatchStaff, pushFeed, fmtClock } from "@/lib/sim/engine";
import { Button, Sparkline } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

/** The "open a room like a dollhouse" HUD: appears only while the camera has actually dived
 * inside a room (viewMode "room" + that room selected — both already real, pre-existing
 * states this project's camera rig drives, see components/twin/CameraRig.tsx's "room" case
 * and components/twin/tower/RoomPlates.tsx's onDoubleClick). This is deliberately a compact,
 * cinematic overlay distinct from the full ContextPanel sidebar (which keeps showing the same
 * room in its usual, denser form) — four things, exactly as asked for: the room's own
 * highest-risk asset (already glowing in the 3D scene via Assets.tsx's risk-driven emissive
 * pulse — this HUD just names it and charts it), a one-line guest note that's genuinely
 * masked rather than just visually smaller when the guest hasn't consented to personalization,
 * the room's own recent history, and the actions a duty manager would actually take here. */
export function DollhouseHud() {
  const { state, mutate } = useSim();
  useSim((s) => s.version);
  const viewMode = useTwin((s) => s.viewMode);
  const selected = useTwin((s) => s.selected);
  const setViewMode = useTwin((s) => s.setViewMode);
  const select = useTwin((s) => s.select);

  if (viewMode !== "room" || selected?.kind !== "room") return null;
  const model = getModel();
  const cell = model.roomById.get(selected.id);
  const rs = state.rooms[selected.id];
  if (!cell || !rs) return null;

  const guest = rs.guestId ? state.guests[rs.guestId] : null;
  const worst = worstAssetForRoom(model, state, selected.id);
  const worstAsset = worst ? model.assetById.get(worst.id) : null;
  const worstState = worst ? state.assets[worst.id] : null;
  const temps = worstState?.history.map((h) => h.temp) ?? [];

  const history = state.feed
    .filter((f) => f.targetKind === "room" && f.targetId === selected.id)
    .slice(-4)
    .reverse();

  const close = () => {
    setViewMode("isolate");
    select(null);
  };

  const dispatchClean = () => {
    mutate((s) => {
      const rq = createRequest(s, model, selected.id, "housekeeping", "Priority clean", "system", 30);
      dispatchStaff(s, model, rq, "housekeeping");
      pushFeed(s, "task", `Priority clean requested for ${cell.number}`, "room", selected.id);
    });
  };

  const dispatchEngineer = () => {
    mutate((s) => {
      const rq = createRequest(s, model, selected.id, "maintenance", "Manager-requested inspection", "staff", 45, rs.guestId);
      dispatchStaff(s, model, rq, "engineering");
      pushFeed(s, "task", `Inspection dispatched to ${cell.number}`, "room", selected.id);
    });
  };

  return (
    <div className="glass pointer-events-auto absolute left-3 top-[74px] z-20 w-[340px] overflow-hidden rounded-xl border border-accent/25 shadow-[0_0_40px_-12px_var(--accent)]">
      <div className="flex items-center justify-between border-b border-stroke px-3.5 py-2.5">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-display text-[16px] font-semibold text-hi">Room {cell.number}</span>
            <span className="mono rounded px-1.5 py-0.5 text-[10px]" style={{ background: statusColors[rs.status] + "22", color: statusColors[rs.status] }}>
              {statusLabels[rs.status]}
            </span>
          </div>
          <span className="text-[10.5px] text-low">
            Floor {cell.floor} · {cell.type}
          </span>
        </div>
        <Button size="icon" variant="ghost" onClick={close} aria-label="Exit room view">
          <X size={13} />
        </Button>
      </div>

      <div className="flex flex-col gap-3 p-3.5">
        {worstAsset && worst && (
          <div className="rounded-lg border border-stroke bg-white/[0.02] p-2.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11.5px] text-hi">
                <Thermometer size={12} className={worst.risk > 0.35 ? "text-critical" : "text-accent"} />
                {worstAsset.name}
              </span>
              <span className={cn("mono text-[12px]", worst.risk > 0.6 ? "text-critical" : worst.risk > 0.35 ? "text-warm" : "text-positive")}>{(worst.risk * 100).toFixed(0)}% risk</span>
            </div>
            {temps.length > 1 && <Sparkline data={temps} width={296} height={26} color={worst.risk > 0.35 ? "var(--critical)" : "var(--accent)"} className="mt-2 w-full" />}
          </div>
        )}

        <div className="rounded-lg border border-stroke bg-white/[0.02] p-2.5">
          <div className="label mb-1">In-house guest</div>
          {!guest ? (
            <p className="text-[12px] text-low">Vacant — {rs.status === "vacant-dirty" ? `${Math.round(rs.hkMinutes)} min housekeeping queued` : "ready to sell"}.</p>
          ) : guest.consentPersonalization ? (
            <p className="text-[12.5px] text-hi">{guestCue(guest)}</p>
          ) : (
            <p className="text-[12px] text-mid">
              In-house · {guest.loyalty !== "none" ? `${guest.loyalty} member` : "no loyalty tier"}
              <span className="ml-1.5 text-low">(not consented to personalization — profile masked)</span>
            </p>
          )}
        </div>

        <div className="rounded-lg border border-stroke bg-white/[0.02] p-2.5">
          <div className="label mb-1 flex items-center gap-1">
            <Activity size={10} /> Recent history
          </div>
          {history.length === 0 ? (
            <p className="text-[11.5px] text-low">Nothing logged yet for this room.</p>
          ) : (
            <div className="flex flex-col gap-1">
              {history.map((f) => (
                <div key={f.id} className="flex items-start gap-2 text-[11px]">
                  <span className="mono shrink-0 text-low">{fmtClock(f.t)}</span>
                  <span className="text-mid">{f.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-1.5">
          {rs.status === "vacant-dirty" && (
            <Button size="sm" variant="outline" onClick={dispatchClean}>
              Prioritise clean
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={dispatchEngineer}>
            <Wrench size={12} /> Send engineer
          </Button>
          <Button size="sm" variant="ghost" onClick={close}>
            <DoorOpen size={12} /> Step back
          </Button>
        </div>
      </div>
    </div>
  );
}
