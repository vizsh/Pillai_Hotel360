"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Send, ChevronRight } from "lucide-react";
import { useSim } from "@/store/sim";
import { useTwin } from "@/store/twin";
import { getModel } from "@/lib/architecture/model";
import { handleGuestMessage } from "@/lib/intelligence/concierge";
import { fmtClock } from "@/lib/sim/engine";
import { AnalyticsShell, Card } from "./AnalyticsShell";
import { Button, Provenance, Stat, Tag } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

const suggestions = [
  "The AC is rattling and not cooling, please fix asap",
  "Can we get extra towels and two pillows?",
  "Book a table for four at 8pm tonight",
  "What time does the pool open?",
  "Two club sandwiches and coffee to the room please",
  "The room next door is extremely noisy, can't sleep",
];

const intentColor: Record<string, string> = {
  housekeeping: "#f5a524",
  maintenance: "#f4436c",
  fnb: "#c084fc",
  concierge: "#34d399",
  amenity: "#60a5fa",
  complaint: "#f4436c",
  info: "#2dd4bf",
  smalltalk: "#5b6879",
  unknown: "#5b6879",
};

export function ConciergePage() {
  const { state, mutate } = useSim();
  useSim((s) => s.version);
  const model = getModel();
  const [text, setText] = useState("");
  const scroller = useRef<HTMLDivElement>(null);

  const occupied = Object.values(state.rooms).filter((r) => r.guestId);
  const [roomId, setRoomId] = useState<string | null>(null);
  const activeRoom = roomId ?? occupied[0]?.id ?? null;

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [state.chat.length, activeRoom]);

  const send = (msg: string) => {
    if (!msg.trim() || !activeRoom) return;
    mutate((s) => handleGuestMessage(s, model, activeRoom, msg.trim()));
    setText("");
  };

  const room = activeRoom ? model.roomById.get(activeRoom) : null;
  const guest = activeRoom && state.rooms[activeRoom]?.guestId ? state.guests[state.rooms[activeRoom].guestId!] : null;
  const roomChat = activeRoom ? state.chat.filter((m) => m.roomId === activeRoom) : [];

  const messageCount = (id: string) => state.chat.filter((m) => m.roomId === id).length;
  const roomsSorted = [...occupied].sort((a, b) => messageCount(b.id) - messageCount(a.id));

  const log = state.chat
    .filter((m) => m.role === "concierge" && m.intent)
    .slice(-40)
    .reverse();

  const total = state.chat.filter((m) => m.role === "concierge" && m.intent).length;
  const highUrgency = state.chat.filter((m) => m.urgency === "high").length;
  const avgConf = total ? state.chat.filter((m) => m.role === "concierge" && m.confidence !== undefined).reduce((s, m) => s + (m.confidence ?? 0), 0) / Math.max(1, state.chat.filter((m) => m.role === "concierge" && m.confidence !== undefined).length) : 0;
  const dispatched = state.chat.filter((m) => m.role === "concierge" && m.requestId).length;

  return (
    <AnalyticsShell title="AI Concierge" subtitle="Weighted keyword intent classification with urgency detection. Every message is turned into a task and dispatched to a staff agent you can watch on the twin — no external model, fully explainable.">
      <div className="grid grid-cols-5 gap-4">
        <Stat label="Messages classified" value={String(total)} />
        <Stat label="Tasks dispatched" value={String(dispatched)} sub={total ? `${((dispatched / total) * 100).toFixed(0)}% of messages` : undefined} />
        <Stat label="Avg. confidence" value={avgConf.toFixed(2)} />
        <Stat label="High urgency" value={String(highUrgency)} accent={highUrgency ? "var(--warm)" : undefined} />
        <Stat label="In-house guests" value={String(occupied.length)} />
      </div>

      <div className="grid grid-cols-12 gap-4">
        <Card title="In-house guests" className="col-span-3">
          <div className="scrollbar-thin flex max-h-[560px] flex-col gap-0.5 overflow-y-auto">
            {roomsSorted.map((r) => {
              const g = state.guests[r.guestId!];
              const n = messageCount(r.id);
              return (
                <button
                  key={r.id}
                  onClick={() => setRoomId(r.id)}
                  className={cn("flex items-center gap-2 rounded-md px-2 py-2 text-left", activeRoom === r.id ? "bg-accent/15" : "hover:bg-white/5")}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] text-hi">
                      {model.roomById.get(r.id)!.number} · {g?.name}
                    </div>
                    <div className="truncate text-[10.5px] text-low">
                      {g?.segment.replace("-", " ")} · {g?.loyalty}
                    </div>
                  </div>
                  {n > 0 && <span className="mono rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] text-mid">{n}</span>}
                </button>
              );
            })}
            {roomsSorted.length === 0 && <p className="p-2 text-[12px] text-low">No occupied rooms.</p>}
          </div>
        </Card>

        <Card className="col-span-5 flex h-[608px] flex-col p-0">
          <div className="flex items-center justify-between border-b border-stroke px-4 py-3">
            <div>
              <div className="text-[13.5px] font-medium text-hi">{room ? `${room.number} · ${guest?.name ?? "—"}` : "Select a guest"}</div>
              <div className="text-[10.5px] text-low">{guest ? `${guest.segment.replace("-", " ")} · via ${guest.channel}` : "Pick an in-house guest to start"}</div>
            </div>
            {guest && <Tag>{guest.loyalty}</Tag>}
          </div>
          <div ref={scroller} className="scrollbar-thin flex-1 space-y-2 overflow-y-auto px-4 py-3">
            {roomChat.length === 0 && (
              <div className="rounded-lg bg-white/[0.03] p-3 text-[11.5px] leading-relaxed text-mid">
                {room ? `Type as a guest in ${room.number}. Messages are classified by intent, turned into a task, and dispatched to a staff agent you can watch on the twin.` : "Select an in-house guest on the left to begin."}
              </div>
            )}
            {roomChat.map((m) => (
              <div key={m.id} className={cn("flex flex-col", m.role === "guest" ? "items-end" : "items-start")}>
                <div className={cn("max-w-[85%] rounded-xl px-3 py-2 text-[12.5px] leading-snug", m.role === "guest" ? "rounded-br-sm bg-accent/20 text-hi" : "rounded-bl-sm bg-white/[0.06] text-mid")}>{m.text}</div>
                {m.intent && (
                  <div className="mono mt-0.5 flex items-center gap-1.5 text-[10px] text-low">
                    <span className="uppercase tracking-wider" style={{ color: intentColor[m.intent] }}>
                      {m.intent}
                    </span>
                    {m.confidence !== undefined && <span>conf {m.confidence.toFixed(2)}</span>}
                    {m.urgency === "high" && <span className="text-warm">urgent</span>}
                    {m.requestId && (
                      <Link href="/command" onClick={() => useTwin.getState().select({ kind: "room", id: activeRoom! })} className="hover:text-hi">
                        task {m.requestId.toUpperCase()} · {state.requests[m.requestId]?.status ?? "done"}
                        {state.requests[m.requestId]?.assignedTo ? ` · ${state.staff[state.requests[m.requestId]!.assignedTo!]?.name}` : ""}
                      </Link>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="scrollbar-thin flex gap-1 overflow-x-auto border-t border-stroke px-3 py-2">
            {suggestions.map((s) => (
              <button key={s} disabled={!activeRoom} onClick={() => send(s)} className="shrink-0 rounded-full border border-stroke px-2 py-1 text-[10.5px] text-mid hover:border-accent/50 hover:text-hi disabled:opacity-40">
                {s.length > 40 ? s.slice(0, 38) + "…" : s}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(text);
            }}
            className="flex items-center gap-2 border-t border-stroke p-3"
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={!activeRoom}
              placeholder={activeRoom ? "Message the concierge…" : "Select a guest first"}
              className="h-9 flex-1 rounded-md border border-stroke bg-transparent px-3 text-[12.5px] text-hi outline-none placeholder:text-low focus:border-accent/60 disabled:opacity-50"
            />
            <Button type="submit" size="icon" variant="primary" aria-label="Send" disabled={!activeRoom}>
              <Send size={14} />
            </Button>
          </form>
        </Card>

        <Card title="Classification log" right={<Provenance module="concierge" />} className="col-span-4">
          <div className="scrollbar-thin flex max-h-[560px] flex-col gap-1 overflow-y-auto">
            {log.length === 0 && <p className="text-[12px] text-low">No messages classified yet.</p>}
            {log.map((m) => {
              const r = m.roomId ? model.roomById.get(m.roomId) : null;
              return (
                <button
                  key={m.id}
                  onClick={() => m.roomId && setRoomId(m.roomId)}
                  className="flex items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-white/5"
                >
                  <span className="h-1.5 w-1.5 shrink-0 translate-y-1.5 rounded-full" style={{ background: intentColor[m.intent!] }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="mono text-[10px] uppercase tracking-wider" style={{ color: intentColor[m.intent!] }}>
                        {m.intent}
                      </span>
                      <span className="mono text-[10px] text-low">conf {m.confidence?.toFixed(2)}</span>
                      {m.urgency === "high" && <Tag color="#f5a524">urgent</Tag>}
                      <ChevronRight size={10} className="text-low" />
                      <span className="text-[10.5px] text-mid">{r?.number}</span>
                    </div>
                    <p className="mt-0.5 truncate text-[11.5px] text-hi">{m.text}</p>
                  </div>
                  <span className="mono shrink-0 text-[10px] text-low">{fmtClock(m.t)}</span>
                </button>
              );
            })}
          </div>
        </Card>
      </div>
    </AnalyticsShell>
  );
}
