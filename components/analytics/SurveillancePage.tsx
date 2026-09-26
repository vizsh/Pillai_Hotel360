"use client";

import { useEffect, useRef, useState } from "react";
import { useSim } from "@/store/sim";
import { addAlert } from "@/lib/sim/engine";
import { loadCocoModel, type DetectedObject } from "@/lib/vision/coco";
import { FireHeuristicDetector } from "@/lib/vision/fireHeuristic";
import { AltercationHeuristicDetector } from "@/lib/vision/altercationHeuristic";
import { scoreParkingGrid, GRID_COLS, GRID_ROWS, type ParkingZone } from "@/lib/vision/parkingGrid";
import { CLIPS, CATEGORY_META, type DetectionCategory, type ClipMeta } from "@/lib/vision/manifest";
import { AnalyticsShell, Card } from "./AnalyticsShell";
import { Button, Tag } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

const SAMPLE_INTERVAL_MS = 280;

type ModelStatus = "idle" | "loading" | "ready";

/** Runs entirely once per explicit "Run detection" click — no auto-loop, no auto-restart on
 * end (per instruction: looping caused delay and alert spam). Detection boxes and heuristic
 * readouts are drawn live on an overlay canvas as the clip plays through exactly once; a
 * confirmed (persistence-gated) event writes a real alert into the same state.alerts/feed the
 * rest of the app uses, so it shows up in BottomDock like anything else. */
export function SurveillancePage() {
  const [category, setCategory] = useState<DetectionCategory>("fire");
  const [clip, setClip] = useState<ClipMeta>(CLIPS.fire[0]);
  const [modelStatus, setModelStatus] = useState<ModelStatus>("idle");
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [parkingZones, setParkingZones] = useState<ParkingZone[] | null>(null);
  const [liveReadout, setLiveReadout] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const busyRef = useRef(false);
  const runIdRef = useRef(0);
  const detectorsRef = useRef<{ fire?: FireHeuristicDetector; alt?: AltercationHeuristicDetector }>({});
  const confirmedCountRef = useRef(0);
  const parkingZonesRef = useRef<ParkingZone[] | null>(null);

  const append = (line: string) => setLog((prev) => [...prev.slice(-40), line]);

  const stop = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    setRunning(false);
  };

  useEffect(() => stop, [category, clip]);

  const drawBoxes = (ctx: CanvasRenderingContext2D, video: HTMLVideoElement, boxes: { x: number; y: number; w: number; h: number; label: string; color: string }[]) => {
    const sx = ctx.canvas.width / video.videoWidth;
    const sy = ctx.canvas.height / video.videoHeight;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    for (const b of boxes) {
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x * sx, b.y * sy, b.w * sx, b.h * sy);
      ctx.font = "12px monospace";
      const textW = ctx.measureText(b.label).width + 6;
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x * sx, Math.max(0, b.y * sy - 15), textW, 15);
      ctx.fillStyle = "#0b0f14";
      ctx.fillText(b.label, b.x * sx + 3, Math.max(11, b.y * sy - 4));
    }
  };

  const run = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const myRun = ++runIdRef.current;
    stop();
    setLog([]);
    setParkingZones(null);
    parkingZonesRef.current = null;
    confirmedCountRef.current = 0;
    detectorsRef.current = { fire: new FireHeuristicDetector(), alt: new AltercationHeuristicDetector() };

    if (modelStatus !== "ready" && category !== "fire") {
      setModelStatus("loading");
      append("Loading COCO-SSD object detection model…");
      await loadCocoModel();
      if (myRun !== runIdRef.current) return;
      setModelStatus("ready");
      append("Model ready.");
    }
    const model = category !== "fire" ? await loadCocoModel() : null;

    video.currentTime = 0;
    await video.play();
    if (myRun !== runIdRef.current) return;
    setRunning(true);
    append(`Run started — ${CATEGORY_META[category].label} · ${clip.label}`);

    canvas.width = video.clientWidth;
    canvas.height = video.clientHeight;
    const ctx = canvas.getContext("2d")!;

    const finish = () => {
      stop();
      append(`Run complete — ${confirmedCountRef.current} confirmed event${confirmedCountRef.current === 1 ? "" : "s"}.`);
      if (category === "parking" && parkingZonesRef.current) {
        const occ = parkingZonesRef.current.filter((z) => z.occupied).length;
        append(`Final occupancy snapshot: ${occ}/${parkingZonesRef.current.length} zones occupied.`);
      }
    };

    const sampleOnce = async () => {
      if (myRun !== runIdRef.current || busyRef.current) return;
      if (video.ended || video.paused) {
        finish();
        return;
      }
      busyRef.current = true;
      try {
        canvas.width = video.clientWidth;
        canvas.height = video.clientHeight;

        if (category === "fire") {
          const s = detectorsRef.current.fire!.sample(video);
          drawBoxes(ctx, video, s.passed ? [{ x: 0, y: 0, w: video.videoWidth, h: video.videoHeight, label: "warm+flicker signature", color: "#f4436c" }] : []);
          setLiveReadout(`warm-pixel ratio ${(s.ratio * 100).toFixed(1)}% · flicker ${s.flicker.toFixed(4)} · gate ${s.passed ? "ARMED" : "clear"}`);
          if (s.justConfirmed) {
            confirmedCountRef.current++;
            const line = `FIRE signature confirmed at ${video.currentTime.toFixed(1)}s — ${(s.ratio * 100).toFixed(1)}% warm-pixel coverage, flicker variance ${s.flicker.toFixed(4)}, sustained across 4 of last 6 samples`;
            append(line);
            useSim.getState().mutate((st) =>
              addAlert(st, {
                severity: "critical",
                kind: "fire",
                targetKind: "zone",
                targetId: "cctv-fire",
                title: `Fire signature detected — ${clip.label}`,
                body: `${(s.ratio * 100).toFixed(1)}% of frame warm-pixel coverage with flicker variance ${s.flicker.toFixed(4)}, sustained 4/6 samples at ${video.currentTime.toFixed(1)}s into the feed.`,
              }),
            );
          }
        } else if (category === "altercation" && model) {
          const detections = await model.detect(video, 30, 0.35);
          const people = detections.filter((d) => d.class === "person");
          const s = detectorsRef.current.alt!.sample(people);
          drawBoxes(
            ctx,
            video,
            people.map((p) => ({ x: p.bbox[0], y: p.bbox[1], w: p.bbox[2], h: p.bbox[3], label: `person ${(p.score * 100).toFixed(0)}%`, color: s.passed ? "#fb7185" : "#60a5fa" })),
          );
          setLiveReadout(`people ${s.peopleCount} · max box-overlap ${(s.maxOverlapIoU * 100).toFixed(0)}% · motion ${s.avgMotion.toFixed(1)}px/sample · gate ${s.passed ? "ARMED" : "clear"}`);
          if (s.justConfirmed) {
            confirmedCountRef.current++;
            append(`ALTERCATION signature confirmed at ${video.currentTime.toFixed(1)}s — ${s.peopleCount} people, box-overlap ${(s.maxOverlapIoU * 100).toFixed(0)}%, motion ${s.avgMotion.toFixed(1)}px/sample, sustained 4/6 samples`);
            useSim.getState().mutate((st) =>
              addAlert(st, {
                severity: "critical",
                kind: "altercation",
                targetKind: "zone",
                targetId: "cctv-altercation",
                title: `Possible altercation detected — ${clip.label}`,
                body: `${s.peopleCount} people in sustained close contact (box-overlap ${(s.maxOverlapIoU * 100).toFixed(0)}%) with elevated motion (${s.avgMotion.toFixed(1)}px/sample), sustained 4/6 samples at ${video.currentTime.toFixed(1)}s into the feed.`,
              }),
            );
          }
        } else if (category === "parking" && model) {
          // COCO-SSD's default 0.5 confidence floor is tuned for street-level/frontal car
          // views; an overhead lot camera is a genuinely harder angle for a general-purpose
          // detector never trained on aerial imagery, so real (still-detected, just lower-
          // confidence) boxes were being discarded before ever reaching this page. Lowering
          // the floor surfaces those same real detections rather than pretending better ones
          // exist — the drawn score label is honest about how confident each box actually is.
          const detections: DetectedObject[] = await model.detect(video, 40, 0.15);
          const vehicles = detections.filter((d) => d.class === "car" || d.class === "truck" || d.class === "bus");
          drawBoxes(
            ctx,
            video,
            vehicles.map((v) => ({ x: v.bbox[0], y: v.bbox[1], w: v.bbox[2], h: v.bbox[3], label: `${v.class} ${(v.score * 100).toFixed(0)}%`, color: "#c084fc" })),
          );
          const zones = scoreParkingGrid(detections, video.videoWidth, video.videoHeight);
          parkingZonesRef.current = zones;
          setParkingZones(zones);
          const occ = zones.filter((z) => z.occupied).length;
          setLiveReadout(`${vehicles.length} vehicles detected · ${occ}/${zones.length} zones occupied`);
        }
      } catch (err) {
        append(`Sample error (continuing): ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        busyRef.current = false;
      }
    };

    intervalRef.current = setInterval(() => void sampleOnce(), SAMPLE_INTERVAL_MS);
    video.addEventListener(
      "ended",
      () => {
        if (myRun === runIdRef.current) finish();
      },
      { once: true },
    );
  };

  useEffect(() => stop, []);

  return (
    <AnalyticsShell title="Surveillance Intelligence" subtitle="Real, once-through detection over user-supplied test clips — no auto-loop. Click Run detection to analyze a clip; confirmed events post real alerts into the shared feed.">
      <div className="grid grid-cols-3 gap-3">
        {(Object.keys(CATEGORY_META) as DetectionCategory[]).map((c) => (
          <button
            key={c}
            onClick={() => {
              stop();
              setCategory(c);
              setClip(CLIPS[c][0]);
              setLog([]);
              setParkingZones(null);
              setLiveReadout("");
            }}
            className={cn("flex flex-col gap-1 rounded-lg border p-3 text-left", category === c ? "border-stroke-lit bg-white/[0.05]" : "border-stroke bg-white/[0.02] hover:bg-white/[0.03]")}
          >
            <Tag color={CATEGORY_META[c].color}>{CATEGORY_META[c].label}</Tag>
            <span className="text-[11px] leading-snug text-mid">{CATEGORY_META[c].description}</span>
          </button>
        ))}
      </div>

      <Card title="Clip">
        <div className="flex flex-wrap items-center gap-2">
          {CLIPS[category].map((c) => (
            <button
              key={c.id}
              onClick={() => {
                stop();
                setClip(c);
                setLog([]);
                setParkingZones(null);
                setLiveReadout("");
              }}
              className={cn("rounded-md border px-2.5 py-1 text-[11.5px]", clip.id === c.id ? "border-accent/60 bg-accent/10 text-accent" : "border-stroke text-mid hover:text-hi")}
            >
              {c.label}
            </button>
          ))}
          <Button size="sm" variant="primary" className="ml-auto" onClick={run} disabled={modelStatus === "loading"}>
            {modelStatus === "loading" ? "Loading model…" : running ? "Restart detection" : "Run detection"}
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-3 gap-4">
        <Card className="col-span-2" title={clip.label}>
          <div className="relative w-full overflow-hidden rounded-lg bg-black">
            <video ref={videoRef} src={clip.src} className="block w-full" muted playsInline />
            <canvas ref={canvasRef} className="pointer-events-none absolute left-0 top-0 h-full w-full" />
          </div>
          {liveReadout && <p className="mono mt-2 text-[11px] text-warm">{liveReadout}</p>}
        </Card>

        <div className="flex flex-col gap-3">
          {category === "parking" && parkingZones && (
            <Card title="Zone occupancy grid">
              <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)` }}>
                {parkingZones.map((z) => (
                  <div key={`${z.row}-${z.col}`} className={cn("flex aspect-video items-center justify-center rounded text-[10px] font-medium", z.occupied ? "bg-[#c084fc]/30 text-[#c084fc]" : "bg-white/5 text-low")}>
                    {z.occupied ? z.vehicleCount : "—"}
                  </div>
                ))}
              </div>
              <p className="mono mt-2 text-[10.5px] text-low">
                {parkingZones.filter((z) => z.occupied).length}/{parkingZones.length} zones occupied · {GRID_COLS}×{GRID_ROWS} grid over the frame
              </p>
            </Card>
          )}

          <Card title="Detection log">
            <ul className="scrollbar-thin flex max-h-[360px] flex-col gap-1.5 overflow-y-auto">
              {log.map((line, i) => (
                <li key={i} className="mono flex gap-2 text-[11px] leading-snug text-mid">
                  <span className="text-low">{String(i + 1).padStart(2, "0")}</span>
                  <span>{line}</span>
                </li>
              ))}
              {!log.length && <li className="text-[11.5px] text-low">Click Run detection to start — nothing runs automatically.</li>}
            </ul>
          </Card>
        </div>
      </div>
    </AnalyticsShell>
  );
}
