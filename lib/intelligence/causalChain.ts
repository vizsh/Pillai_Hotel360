import type { ResortModel } from "@/lib/architecture/types";
import type { SimState } from "@/lib/sim/types";
import { assessGuestRisk } from "./guestRecovery";

export type ChainStage = "complaint" | "diagnosis" | "workorder" | "relocation" | "recovery";

export interface ChainStep {
  stage: ChainStage;
  done: boolean;
  label: string;
}

export interface CausalChain {
  requestId: string;
  roomId: string;
  roomNumber: string;
  guestId: string | null;
  guestName: string | null;
  createdAt: number;
  steps: ChainStep[];
}

/** Only guest-reported maintenance issues in the last 8h are worth showing as a live chain —
 * older ones have already resolved one way or another and belong in the event log, not a
 * "what's happening right now" tracker. */
const LOOKBACK_MIN = 8 * 60;
/** Below this, one guest complaint about a floor's AC is just one guest complaint — at or
 * above it, the floor's own asset telemetry corroborates the complaint independently. */
const ASSET_RISK_CONFIRM_THRESHOLD = 0.3;

/** Reconstructs the complaint -> diagnosis -> work order -> relocation -> recovery chain the
 * blueprint names as its "unique edge" for the Cascade Engine (a visible timeline showing one
 * event ripple through the resort), entirely from state this codebase already produces —
 * guest-sourced maintenance requests (lib/sim/engine.ts), the floor's own asset risk
 * (lib/intelligence/maintenance.ts's assessAsset, already running), any relocation
 * recommendation naming this room (lib/intelligence/guestImpact.ts), and this guest's own
 * recovery risk (lib/intelligence/guestRecovery.ts). No new mutable state, no new module id —
 * this is a read across four modules that already exist, not a fifth one. */
export function detectCausalChains(state: SimState, model: ResortModel): CausalChain[] {
  const candidates = Object.values(state.requests).filter((r) => r.type === "maintenance" && r.source === "guest" && state.t - r.createdAt < LOOKBACK_MIN);

  const atRiskGuestIds = new Set(assessGuestRisk(state, model).map((g) => g.guestId));
  const chains: CausalChain[] = [];

  for (const req of candidates) {
    const room = model.roomById.get(req.roomId);
    if (!room) continue;
    const guest = req.guestId ? state.guests[req.guestId] : null;

    const floorAsset = model.assets.find((a) => a.kind === "ahu" && a.servesFloors.includes(room.floor));
    const assetRisk = floorAsset ? (state.assets[floorAsset.id]?.failureProb7d ?? 0) : 0;
    const diagnosed = floorAsset != null && assetRisk >= ASSET_RISK_CONFIRM_THRESHOLD;

    const dispatched = req.assignedTo !== null || req.status === "in-progress" || req.status === "done";

    let relocated: "none" | "offered" | "executed" = "none";
    if (floorAsset) {
      const rec = state.recommendations[`rec-relocate-${floorAsset.id}`];
      if (rec) {
        const pairs = (rec.payload?.pairs as { fromRoomId: string }[] | undefined) ?? [];
        if (pairs.some((p) => p.fromRoomId === req.roomId)) relocated = rec.status === "executed" ? "executed" : "offered";
      }
    }

    let recovered: "none" | "flagged" | "executed" = "none";
    if (guest) {
      const rec = state.recommendations[`rec-recovery-${guest.id}`];
      if (rec) recovered = rec.status === "executed" ? "executed" : "flagged";
      else if (atRiskGuestIds.has(guest.id)) recovered = "flagged";
    }

    const steps: ChainStep[] = [
      { stage: "complaint", done: true, label: `${guest?.name ?? "Guest"} reported: "${req.text}"` },
      {
        stage: "diagnosis",
        done: diagnosed,
        label: floorAsset ? `${floorAsset.name} risk ${(assetRisk * 100).toFixed(0)}%${diagnosed ? " — confirmed, not an isolated complaint" : " — below confirmation threshold, treated as isolated"}` : "No serving asset on record to corroborate",
      },
      { stage: "workorder", done: dispatched, label: dispatched ? `Dispatched${req.assignedTo && state.staff[req.assignedTo] ? ` to ${state.staff[req.assignedTo].name}` : ""}` : "Awaiting dispatch" },
      {
        stage: "relocation",
        done: relocated !== "none",
        label: relocated === "executed" ? "Guest relocated" : relocated === "offered" ? "Relocation available, not yet applied" : diagnosed ? "Asset not yet failed — not needed" : "Not needed",
      },
      {
        stage: "recovery",
        done: recovered !== "none",
        label: recovered === "executed" ? "Recovery gesture delivered" : recovered === "flagged" ? "Guest flagged for recovery" : "No recovery risk detected",
      },
    ];

    chains.push({ requestId: req.id, roomId: req.roomId, roomNumber: room.number, guestId: guest?.id ?? null, guestName: guest?.name ?? null, createdAt: req.createdAt, steps });
  }

  return chains.sort((a, b) => b.createdAt - a.createdAt);
}
