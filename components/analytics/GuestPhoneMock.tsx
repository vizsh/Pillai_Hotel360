import { Wifi, Signal, BatteryFull, Sparkles } from "lucide-react";
import { fmtClock } from "@/lib/sim/engine";
import type { ChatMessage } from "@/lib/sim/types";
import { cn } from "@/lib/utils";

/** Renders the SAME chat thread ConciergePage already has (state.chat filtered to a room) as
 * a guest would actually see it on their own phone — no intent/confidence/model debug chrome,
 * just messages. Exists to make the "two sides of one system" story visible at a glance in a
 * live demo: a judge can watch a staff-side classification appear on the left while the exact
 * same exchange renders as an ordinary guest chat app on the right, from one shared source of
 * truth rather than two separately-maintained views. Purely presentational — no new state,
 * no new API calls, nothing here can drift from what actually happened. */
export function GuestPhoneMock({ messages, guestName, roomNumber, thinking }: { messages: ChatMessage[]; guestName: string | null; roomNumber: string | null; thinking: boolean }) {
  return (
    <div className="mx-auto flex h-[560px] w-[260px] flex-col overflow-hidden rounded-[28px] border-[6px] border-[#1c1f26] bg-[#0b0d11] shadow-[0_0_0_1px_rgba(255,255,255,0.04)]">
      <div className="flex items-center justify-between px-4 pt-2 pb-1 text-[10px] text-white/80">
        <span>9:41</span>
        <div className="flex items-center gap-1">
          <Signal size={11} />
          <Wifi size={11} />
          <BatteryFull size={13} />
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/20 text-accent">
          <Sparkles size={14} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-medium text-white">Azure Bay Concierge</div>
          <div className="text-[10px] text-white/40">{roomNumber ? `Room ${roomNumber} · online` : "online"}</div>
        </div>
      </div>

      <div className="scrollbar-thin flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {messages.length === 0 && <div className="pt-10 text-center text-[11px] text-white/30">No messages yet — {guestName ?? "the guest"}&apos;s chat will appear here as it happens.</div>}
        {messages.map((m) => (
          <div key={m.id} className={cn("flex flex-col", m.role === "guest" ? "items-end" : "items-start")}>
            <div
              className={cn(
                "max-w-[80%] rounded-2xl px-3 py-2 text-[12px] leading-snug",
                m.role === "guest" ? "rounded-br-md bg-[#2b7fff] text-white" : "rounded-bl-md bg-white/10 text-white/90",
              )}
            >
              {m.text}
            </div>
            <span className="mt-0.5 px-1 text-[9px] text-white/25">{fmtClock(m.t)}</span>
          </div>
        ))}
        {thinking && (
          <div className="flex flex-col items-start">
            <div className="rounded-2xl rounded-bl-md bg-white/10 px-3 py-2 text-[11px] text-white/50">
              <span className="inline-flex gap-0.5">
                <span className="animate-bounce">•</span>
                <span className="animate-bounce [animation-delay:0.15s]">•</span>
                <span className="animate-bounce [animation-delay:0.3s]">•</span>
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-white/10 px-3 py-2.5">
        <div className="rounded-full bg-white/10 px-3 py-1.5 text-[11px] text-white/30">Message the concierge…</div>
      </div>
    </div>
  );
}
