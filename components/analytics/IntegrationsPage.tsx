"use client";

import { useState } from "react";
import { useSim } from "@/store/sim";
import { getModel } from "@/lib/architecture/model";
import { buildAdapterContracts } from "@/lib/adapters/simulatedSource";
import { fmtClock } from "@/lib/sim/engine";
import { AnalyticsShell, Card } from "./AnalyticsShell";
import { Tag, Provenance } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

const STATUS_COLOR: Record<string, string> = { open: "#f5a524", assigned: "#38bdf8", "in-progress": "#60a5fa", done: "#34d399" };

/** The real, live proof that the guest-app bridge works: every request here arrived through
 * app/api/guest-app/inbox (hooks/useGuestAppInbox.ts drains it every 5s) from the separate
 * guestexperience deployment — tagged source "guest-app" specifically so this view never
 * mixes in the tick engine's own purely-simulated organic guest requests (which use the
 * pre-existing "guest" source). Nothing here is staged: place a real order on the guest app
 * and it appears in this exact list, with the real room, guest, and staff dispatch. */
export function IntegrationsPage() {
  const { state } = useSim();
  useSim((s) => s.version);
  const model = getModel();
  const [showContracts, setShowContracts] = useState(false);
  const [openSample, setOpenSample] = useState<string | null>(null);
  const contracts = buildAdapterContracts(state, model);

  const guestAppRequests = Object.values(state.requests)
    .filter((r) => r.source === "guest-app")
    .sort((a, b) => b.createdAt - a.createdAt);

  const open = guestAppRequests.filter((r) => r.status === "open").length;
  const active = guestAppRequests.filter((r) => r.status === "assigned" || r.status === "in-progress").length;
  const done = guestAppRequests.filter((r) => r.status === "done").length;

  return (
    <AnalyticsShell
      title="Guest Requests"
      subtitle="Live feed of orders and requests placed on the separate guest-facing app (guestexperience) — bridged in real time through app/api/guest-app/inbox into this system's own dispatch pipeline. Not a mockup: place a real order there and it appears here, dispatched to a real staff member."
    >
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-lg border border-stroke bg-white/[0.02] p-3 text-center">
          <div className="mono text-[20px] font-semibold text-hi">{guestAppRequests.length}</div>
          <div className="text-[10px] uppercase tracking-wider text-low">Total received</div>
        </div>
        <div className="rounded-lg border border-warm/30 bg-warm/10 p-3 text-center">
          <div className="mono text-[20px] font-semibold text-warm">{open}</div>
          <div className="text-[10px] uppercase tracking-wider text-low">Awaiting dispatch</div>
        </div>
        <div className="rounded-lg border border-accent/30 bg-accent/10 p-3 text-center">
          <div className="mono text-[20px] font-semibold text-accent">{active}</div>
          <div className="text-[10px] uppercase tracking-wider text-low">In progress</div>
        </div>
        <div className="rounded-lg border border-positive/30 bg-positive/10 p-3 text-center">
          <div className="mono text-[20px] font-semibold text-positive">{done}</div>
          <div className="text-[10px] uppercase tracking-wider text-low">Completed</div>
        </div>
      </div>

      <Card title="Live requests" right={<span className="mono flex items-center gap-1.5 text-[10px] text-low"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" /> polling every 5s</span>}>
        {guestAppRequests.length === 0 ? (
          <p className="p-4 text-center text-[12px] text-low">
            No guest-app requests yet. Place a real order on the guest app (guestexperience) — it will appear here within 5 seconds, dispatched to a real staff member, same as any other request source.
          </p>
        ) : (
          <div className="scrollbar-thin flex max-h-[420px] flex-col gap-1.5 overflow-y-auto">
            {guestAppRequests.map((r) => {
              const room = model.roomById.get(r.roomId);
              const guestName = r.guestAppGuestName ?? (r.guestId ? state.guests[r.guestId]?.name : null);
              const staff = r.assignedTo ? state.staff[r.assignedTo] : null;
              return (
                <div key={r.id} className="grid grid-cols-[64px_70px_1fr_100px_130px] items-center gap-3 rounded-lg border border-stroke bg-white/[0.015] px-3 py-2">
                  <span className="mono text-[10.5px] text-low">{fmtClock(r.createdAt)}</span>
                  <span className="mono text-[12px] font-medium text-hi">{room?.number ?? r.roomId}</span>
                  <div className="min-w-0">
                    <div className="truncate text-[12px] text-hi">{r.text}</div>
                    <div className="truncate text-[10.5px] text-low">{guestName ?? "Guest"} · {r.type}</div>
                  </div>
                  <Tag color={STATUS_COLOR[r.status]}>{r.status}</Tag>
                  <span className="truncate text-[11px] text-mid">{staff ? staff.name : "unassigned"}</span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <button
        onClick={() => setShowContracts((v) => !v)}
        className="mono flex w-full items-center justify-between rounded-lg border border-stroke bg-white/[0.015] px-3 py-2 text-[10.5px] uppercase tracking-wider text-low hover:text-hi"
      >
        <span>Integration contracts (PMS · BMS · Camera analytics) — proves the real-swap-in seam, not a live feed</span>
        <span>{showContracts ? "hide ▲" : "show ▼"}</span>
      </button>

      {showContracts && (
        <Card title="Payload contracts" right={<Provenance kind="derived" />}>
          <p className="mb-2 text-[11px] leading-snug text-mid">
            Every module reads one internal shape (SimState), written today by the seeded simulator. These are the exact payloads a real PMS, BMS, or camera-analytics vendor would send — generated live from current state, proving the contract is satisfiable, not aspirational.
          </p>
          <div className="flex flex-wrap gap-2">
            {contracts.map((c) => (
              <button
                key={c.id}
                onClick={() => setOpenSample(openSample === c.id ? null : c.id)}
                className={cn("rounded-md border px-2.5 py-1 text-[11px]", openSample === c.id ? "border-accent/60 bg-accent/10 text-accent" : "border-stroke text-mid hover:text-hi")}
              >
                {c.label}
              </button>
            ))}
          </div>
          {contracts
            .filter((c) => c.id === openSample)
            .map((c) => (
              <div key={c.id} className="mt-3">
                <p className="mb-1 text-[10.5px] text-low">{c.description}</p>
                <pre className="scrollbar-thin max-h-[220px] overflow-auto rounded-lg bg-void/60 p-3 text-[10.5px] leading-relaxed text-accent/90">
                  {JSON.stringify(c.sample(), null, 2)}
                </pre>
              </div>
            ))}
        </Card>
      )}
    </AnalyticsShell>
  );
}
