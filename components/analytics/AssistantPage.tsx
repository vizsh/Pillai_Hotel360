"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Send, Sparkles, Volume2, VolumeX } from "lucide-react";
import { useSim } from "@/store/sim";
import { useSession } from "@/store/session";
import { getModel } from "@/lib/architecture/model";
import { buildOpsSnapshot } from "@/lib/ai/opsSnapshot";
import { LANGUAGE_LABELS, LANGUAGE_SPEECH_TAG, type AssistantLanguage } from "@/lib/ai/opsAssistantPrompt";
import { ROLES } from "@/lib/rbac";
import { AnalyticsShell, Card } from "./AnalyticsShell";
import { Button, Provenance } from "@/components/ui/primitives";
import { Markdown } from "@/components/ui/Markdown";
import { cn } from "@/lib/utils";

type OllamaStatus = { reachable: boolean; chatModelPulled: boolean; embedModelPulled: boolean; models: string[] };

interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolsUsed?: string[];
  guardrailTripped?: boolean;
}

const suggestions = ["Who is staying in room 204?", "What problems need attention right now?", "List our VIP guests", "How is the resort doing today?", "Which guests seem unhappy?", "Any SLA breaches open?"];

// Minimal ambient types for the Web Speech API — not in TS's DOM lib by default, and this
// stays entirely optional/feature-detected (`window.webkitSpeechRecognition`), never a hard
// dependency: voice is a convenience layer over the same text pipeline, not a separate path.
interface SpeechRecognitionEventLike {
  results: { 0: { transcript: string } }[];
}
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export function AssistantPage() {
  const { state } = useSim();
  useSim((s) => s.version);
  const { role } = useSession();
  const model = getModel();
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [thinking, setThinking] = useState(false);
  const [language, setLanguage] = useState<AssistantLanguage>("en");
  const [ollama, setOllama] = useState<OllamaStatus | null>(null);
  const [listening, setListening] = useState(false);
  const [speakReplies, setSpeakReplies] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [voiceSupported] = useState(() => typeof window !== "undefined" && ("webkitSpeechRecognition" in window || "SpeechRecognition" in window));
  const msgIdRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/ops-assistant")
      .then((r) => r.json())
      .then((s: OllamaStatus) => {
        if (!cancelled) setOllama(s);
      })
      .catch(() => {
        if (!cancelled) setOllama({ reachable: false, chatModelPulled: false, embedModelPulled: false, models: [] });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, thinking]);

  const aiReady = ollama?.reachable && ollama.chatModelPulled;

  const send = (msg: string) => {
    const trimmed = msg.trim();
    if (!trimmed || !aiReady) return;
    const userMsg: AssistantMessage = { id: `u-${++msgIdRef.current}`, role: "user", content: trimmed };
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((m) => [...m, userMsg]);
    setText("");
    setThinking(true);

    const snapshot = buildOpsSnapshot(state, model, role);

    fetch("/api/ops-assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: trimmed, snapshot, language, history }),
    })
      .then((r) => r.json())
      .then((data: { ok: boolean; reply?: string; toolsUsed?: string[]; guardrailTripped?: boolean }) => {
        if (data.ok && data.reply) {
          setMessages((m) => [...m, { id: `a-${++msgIdRef.current}`, role: "assistant", content: data.reply!, toolsUsed: data.toolsUsed, guardrailTripped: data.guardrailTripped }]);
          if (speakReplies && typeof window !== "undefined" && "speechSynthesis" in window) {
            const utter = new SpeechSynthesisUtterance(data.reply!.replace(/[|*#-]/g, ""));
            utter.lang = LANGUAGE_SPEECH_TAG[language];
            window.speechSynthesis.speak(utter);
          }
        }
      })
      .catch(() => {})
      .finally(() => setThinking(false));
  };

  const toggleListening = () => {
    if (!voiceSupported) return;
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const Ctor = (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike; SpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition ?? (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition;
    if (!Ctor) return;
    const recognition = new Ctor();
    recognition.lang = LANGUAGE_SPEECH_TAG[language];
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (e) => {
      const transcript = e.results[0]?.[0]?.transcript;
      if (transcript) setText(transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  };

  return (
    <AnalyticsShell title="Ops Assistant" subtitle="Ask anything about the live resort — who's in which room, what needs attention, guest lists — answered by a local Ollama model calling real tools against the current simulation, not a canned FAQ.">
      <Card title="Local AI assistant (Ollama, tool-calling)" right={<Provenance kind="modeled" />}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className={cn("h-2 w-2 rounded-full", ollama === null ? "bg-low" : aiReady ? "bg-positive" : "bg-critical")} />
            {ollama === null ? (
              <span className="text-[12px] text-low">Checking Ollama…</span>
            ) : !ollama.reachable ? (
              <span className="text-[12px] text-mid">
                Ollama not reachable — run <code className="mono text-accent">ollama serve</code>.
              </span>
            ) : !ollama.chatModelPulled ? (
              <span className="text-[12px] text-mid">
                No chat model pulled — run <code className="mono text-accent">ollama pull llama3.1:8b</code>.
              </span>
            ) : (
              <span className="text-[12px] text-mid">
                Connected — <span className="text-hi">llama3.1:8b</span> with tool access to live rooms, guests, requests and KPIs.
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md bg-white/5 p-0.5">
              {(["en", "hi", "mr"] as const).map((l) => (
                <button key={l} onClick={() => setLanguage(l)} className={cn("rounded px-2 py-1 text-[11px]", language === l ? "bg-accent/20 text-accent" : "text-low hover:text-hi")}>
                  {LANGUAGE_LABELS[l].split(" ")[0]}
                </button>
              ))}
            </div>
            <Button size="sm" variant={speakReplies ? "primary" : "outline"} onClick={() => setSpeakReplies((v) => !v)} aria-label="Toggle spoken replies">
              {speakReplies ? <Volume2 size={12} /> : <VolumeX size={12} />}
            </Button>
          </div>
        </div>
        <p className="mt-2 text-[10.5px] text-low">
          Answers respect your current role (<span className="text-mid">{ROLES[role].label}</span>) — guest spend is masked exactly as it is on the Guests page. Local CPU inference can take 30-90s per question, longer when a tool call is needed.
        </p>
      </Card>

      <Card className="flex h-[560px] flex-col p-0">
        <div ref={scroller} className="scrollbar-thin flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {messages.length === 0 && (
            <div className="rounded-lg bg-white/[0.03] p-3 text-[11.5px] leading-relaxed text-mid">Ask about any room, guest, open issue, or the resort&apos;s overall numbers — the assistant calls real tools against the live simulation to answer, not a fixed script.</div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={cn("flex flex-col", m.role === "user" ? "items-end" : "items-start")}>
              <div className={cn("max-w-[90%] rounded-xl px-3 py-2 text-[12.5px]", m.role === "user" ? "rounded-br-sm bg-accent/20 text-hi" : "rounded-bl-sm border border-accent/30 bg-accent/[0.05] text-mid")}>
                {m.role === "assistant" ? <Markdown text={m.content} className="flex flex-col gap-1" /> : m.content}
              </div>
              {m.toolsUsed && m.toolsUsed.length > 0 && (
                <div className="mono mt-0.5 flex items-center gap-1 text-[10px] text-accent/80">
                  <Sparkles size={9} /> used: {m.toolsUsed.join(", ")}
                </div>
              )}
              {m.guardrailTripped && <div className="mt-0.5 text-[10px] text-warm">guardrail: reply replaced (compensation/discount language)</div>}
            </div>
          ))}
          {thinking && (
            <div className="flex flex-col items-start">
              <div className="rounded-xl rounded-bl-sm border border-accent/30 bg-accent/[0.06] px-3 py-2 text-[11.5px] text-low">
                <Sparkles size={11} className="mr-1 inline animate-pulse text-accent" /> thinking… local inference, can take up to a minute
              </div>
            </div>
          )}
        </div>
        <div className="scrollbar-thin flex gap-1 overflow-x-auto border-t border-stroke px-3 py-2">
          {suggestions.map((s) => (
            <button key={s} disabled={!aiReady} onClick={() => send(s)} className="shrink-0 rounded-full border border-stroke px-2 py-1 text-[10.5px] text-mid hover:border-accent/50 hover:text-hi disabled:opacity-40">
              {s}
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
          {voiceSupported && (
            <Button type="button" size="icon" variant={listening ? "primary" : "outline"} onClick={toggleListening} aria-label="Voice input" disabled={!aiReady}>
              {listening ? <MicOff size={13} /> : <Mic size={13} />}
            </Button>
          )}
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={!aiReady}
            placeholder={aiReady ? `Ask in ${LANGUAGE_LABELS[language]}…` : "Ollama not connected"}
            className="h-9 flex-1 rounded-md border border-stroke bg-transparent px-3 text-[12.5px] text-hi outline-none placeholder:text-low focus:border-accent/60 disabled:opacity-50"
          />
          <Button type="submit" size="icon" variant="primary" aria-label="Send" disabled={!aiReady}>
            <Send size={14} />
          </Button>
        </form>
      </Card>
    </AnalyticsShell>
  );
}
