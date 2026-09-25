"use client";

import { useEffect } from "react";
import { useSim } from "@/store/sim";
import { getModel } from "@/lib/architecture/model";
import { completeRequestExternally, reportIssueFromStaff } from "@/lib/sim/actions";

const POLL_INTERVAL_MS = 6000;

interface InboxItem {
  id: number;
  type: "complete_task" | "report_issue";
  payload: Record<string, unknown>;
}

/** Drains app/api/telegram/inbox — the one-way bridge from the standalone Telegram bot
 * process into the browser-only live simulation (see lib/db/client.ts's module comment for
 * why this indirection exists at all: the bot has no other way to reach state that only ever
 * lives in this tab). Applies each item through the same lib/sim/actions.ts functions any
 * other accept/dismiss button uses, then marks it processed so a second tab or a slow network
 * retry can't double-apply it. Silently no-ops when the request/room it refers to no
 * longer exists (deleted, already completed some other way) — stale, not fatal. */
export function useTelegramInbox() {
  useEffect(() => {
    let cancelled = false;
    const model = getModel();

    const poll = async () => {
      try {
        const res = await fetch("/api/telegram/inbox");
        if (!res.ok) return;
        const data = (await res.json()) as { items: InboxItem[] };
        if (cancelled || !data.items.length) return;

        const applied: number[] = [];
        useSim.getState().mutate((state) => {
          for (const item of data.items) {
            if (item.type === "complete_task") {
              const requestId = String(item.payload.requestId ?? "");
              const staffName = String(item.payload.staffName ?? "Staff");
              if (requestId && completeRequestExternally(state, model, requestId, staffName)) applied.push(item.id);
              else applied.push(item.id); // stale reference — still mark processed, don't retry forever
            } else if (item.type === "report_issue") {
              const roomNumber = String(item.payload.roomNumber ?? "");
              const text = String(item.payload.text ?? "");
              const staffName = String(item.payload.staffName ?? "Staff");
              const room = model.rooms.find((r) => r.number === roomNumber);
              if (room) reportIssueFromStaff(state, model, room.id, text, staffName);
              applied.push(item.id);
            } else {
              applied.push(item.id);
            }
          }
        });

        if (applied.length) await fetch("/api/telegram/inbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: applied }) });
      } catch {
        // network hiccup or the dev server briefly restarting — next interval retries
      }
    };

    const interval = setInterval(poll, POLL_INTERVAL_MS);
    void poll();
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);
}
