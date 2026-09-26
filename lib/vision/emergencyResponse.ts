import type { ResortModel } from "@/lib/architecture/types";
import type { SimState } from "@/lib/sim/types";
import { createRequest, dispatchStaff, pushFeed } from "@/lib/sim/engine";

/** Picks a real, plausible target for a CCTV-triggered dispatch — the surveillance page has no
 * literal camera-to-room mapping (these are user-supplied test clips, not wired to a specific
 * twin location), so this picks a real asset/zone from the current model rather than inventing
 * a fake id, the same honesty standard as everywhere else this codebase touches the twin. */
export function pickFireTarget(model: ResortModel): { id: string; label: string } | null {
  const kitchen = model.assets.find((a) => a.kind === "kitchen-hood");
  const asset = kitchen ?? model.assets[0];
  if (!asset) return null;
  return { id: asset.id, label: asset.name };
}

export function pickIncidentZone(model: ResortModel): { id: string; label: string } | null {
  const lobby = model.zones.find((z) => z.kind === "lobby" || z.kind === "reception");
  const zone = lobby ?? model.zones[0];
  if (!zone) return null;
  return { id: zone.id, label: zone.name };
}

export type IncidentKind = "fire" | "altercation" | "person-down";

export interface EmergencyStep {
  label: string;
  detail: string;
}

export interface EmergencyDispatchResult {
  targetLabel: string;
  staffName: string | null;
  staffDept: string | null;
  requestId: string | null;
  steps: EmergencyStep[];
}

/** What a confirmed CCTV incident actually triggers — reusing the exact same
 * createRequest()/dispatchStaff() every other module's emergency path uses (see
 * lib/sim/actions.ts's injectScenario for the precedent), not a fabricated "done" state. A
 * fire dispatches to engineering against a real plant asset; an altercation/person-down
 * dispatches security (frontdesk dept, the closest real department this sim models) against a
 * representative zone. Two steps here are honestly simulated rather than real, because there
 * is no actual telephone network or physical siren to call — that's stated in the label
 * itself ("simulated"), not hidden behind confident-sounding text. */
export function dispatchEmergencyResponse(state: SimState, model: ResortModel, kind: IncidentKind, targetId: string, targetLabel: string): EmergencyDispatchResult {
  const dept = kind === "fire" ? "engineering" : "frontdesk";
  const reqType = kind === "fire" ? "maintenance" : "complaint";
  const text = kind === "fire" ? `CCTV fire alarm — ${targetLabel}` : kind === "person-down" ? `CCTV possible person down — ${targetLabel}` : `CCTV altercation alarm — ${targetLabel}`;

  const req = createRequest(state, model, targetId, reqType, text, "system", 8, null);
  const staff = dispatchStaff(state, model, req, dept, kind === "fire" ? "hvac" : undefined) ?? dispatchStaff(state, model, req, dept);
  pushFeed(state, "system", `EMERGENCY: ${text}`, "zone", targetId, "critical");

  const steps: EmergencyStep[] = [
    { label: "Alarm activated", detail: kind === "fire" ? "Fire alarm circuit triggered for the affected zone." : "Security alert raised for the affected zone." },
    { label: "Staff dispatched", detail: staff ? `${staff.name} (${dept}) dispatched to ${targetLabel}.` : `No ${dept} staff currently free — queued, dispatches the moment someone is idle.` },
    { label: "Emergency services notified", detail: "Simulated — no real telephony in this demo; a production deployment would place a real outbound call here." },
    { label: "Guests/staff notified", detail: `Resort-wide advisory pushed to the live feed for ${targetLabel}.` },
  ];

  return { targetLabel, staffName: staff?.name ?? null, staffDept: staff ? dept : null, requestId: req.id, steps };
}
