"use client";

import { useEffect } from "react";
import { useSim } from "@/store/sim";
import { getModel } from "@/lib/architecture/model";
import { applyGuestAppOrder } from "@/lib/sim/actions";

const POLL_INTERVAL_MS = 5000;

interface InboxItem {
  id: number;
  room: string;
  stayId: string | null;
  guestName: string | null;
  type: string;
  payload: Record<string, unknown> & { text?: string };
}

/** Drains app/api/guest-app/inbox — the bridge from the separate guestexperience guest app
 * into this browser-only live sim, same shape as hooks/useTelegramInbox.ts. Silently skips an
 * item whose room number doesn't exist in this model (a stray/malformed POST) rather than
 * failing the whole batch, same "stale, not fatal" stance the Telegram inbox already takes. */
export function useGuestAppInbox() {
  useEffect(() => {
    let cancelled = false;
    const model = getModel();

    const poll = async () => {
      try {
        const res = await fetch("/api/guest-app/inbox");
        if (!res.ok) return;
        const data = (await res.json()) as { items: InboxItem[] };
        if (cancelled || !data.items.length) return;

        const applied: number[] = [];
        useSim.getState().mutate((state) => {
          for (const item of data.items) {
            const room = model.rooms.find((r) => r.number === item.room);
            if (room) applyGuestAppOrder(state, model, room.id, item.guestName ?? "Guest", item.type, item.payload.text ?? item.type);
            applied.push(item.id);
          }
        });

        if (applied.length) await fetch("/api/guest-app/inbox", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: applied }) });
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
