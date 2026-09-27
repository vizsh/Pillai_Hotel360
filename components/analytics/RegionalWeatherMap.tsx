"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle, CircleMarker, ZoomControl, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Radar, ShieldAlert, Pause, Play } from "lucide-react";
import { NewsWeatherOverlay, IR_LEGEND, TEMP_LEGEND, type NewsLayer } from "./NewsWeatherOverlay";
import { useSim } from "@/store/sim";
import { useWeatherWhatIf } from "@/store/weatherWhatIf";
import { forecastWeather } from "@/lib/intelligence/weather";
import { getHazardEvents } from "@/lib/intelligence/socialSignals";
import { useCurrentWeatherCondition } from "@/hooks/useCurrentWeatherCondition";
import { cn } from "@/lib/utils";

/** The literal "geospatial map visualization" the HackCelestial midnight task asks for, real
 * lat/lng, not the property's internal zone abstraction (that one stays too — see
 * WeatherImpactMap.tsx — this is a second, complementary view at the regional scale it can't
 * show). Layers, all real:
 *  - Esri's free dark-canvas basemap (arcgisonline.com, no key required).
 *  - RainViewer live precipitation radar tiles (api.rainviewer.com, no key) — genuinely live
 *    weather imagery, not an illustration of it.
 *  - GDACS hazard events (lib/intelligence/socialSignals.ts's getHazardEvents()) plotted at
 *    their real reported coordinates.
 *  - A handful of real regional entities the brief names by category — transportation
 *    (airports), attraction demand (beaches), traveler behaviour (the city centre) — so the
 *    map shows the actual ecosystem the weather propagates through, not just the one building.
 *  - An animated impact-propagation ripple from the resort, paced and coloured by whichever
 *    weather condition is currently in effect (useCurrentWeatherCondition — the same source
 *    the 3D twin's WeatherFX reads, so the two are never showing different weather). */

const RESORT: [number, number] = [15.2993, 74.124];
const ENTITIES: { name: string; pos: [number, number]; kind: "airport" | "city" | "beach" }[] = [
  { name: "Manohar International Airport (Mopa)", pos: [15.66, 73.8340], kind: "airport" },
  { name: "Dabolim Airport", pos: [15.3808, 73.8314], kind: "airport" },
  { name: "Panjim (city centre)", pos: [15.4909, 73.8278], kind: "city" },
  { name: "Calangute Beach", pos: [15.5439, 73.7553], kind: "beach" },
  { name: "Baga Beach", pos: [15.5553, 73.7517], kind: "beach" },
];
const CONDITION_TINT: Record<string, string> = { clear: "#2dd4bf", rain: "#38bdf8", heatwave: "#f5a524" };

function divIcon(emoji: string, size = 26) {
  return L.divIcon({ html: `<div style="font-size:${size * 0.6}px;line-height:${size}px;text-align:center;width:${size}px;height:${size}px;filter:drop-shadow(0 0 4px rgba(0,0,0,0.7))">${emoji}</div>`, className: "", iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}
const RESORT_ICON = divIcon("🏨", 34);
const ENTITY_EMOJI = { airport: "✈️", city: "🏙️", beach: "🏖️" };

function alertLeafletColor(level: string) {
  return level === "Red" ? "#f4436c" : level === "Orange" ? "#f5a524" : "#34d399";
}

/** RainViewer's own tile-set JSON — public, no key, no CORS restriction (used directly from
 * the browser by design, per their docs). Cached client-side for the component's lifetime;
 * refreshed on mount only, since radar frames update every ~10 minutes and this is a visual
 * aid, not a forecasting input. */
function useRadarTiles() {
  const [urlTemplate, setUrlTemplate] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("https://api.rainviewer.com/public/weather-maps.json")
      .then((r) => r.json())
      .then((d: { host: string; radar?: { past?: { path: string }[] } }) => {
        const frames = d.radar?.past;
        const latest = frames?.[frames.length - 1];
        if (!cancelled && latest) setUrlTemplate(`${d.host}${latest.path}/256/{z}/{x}/{y}/2/1_1.png`);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return urlTemplate;
}

function ViewController({ wide }: { wide: boolean }) {
  const map = useMap();
  useEffect(() => {
    const id = setTimeout(() => {
      map.invalidateSize();
      map.setView(wide ? [16.4, 74.6] : RESORT, wide ? 6.5 : 8, { animate: true });
    }, 60);
    return () => clearTimeout(id);
  }, [wide, map]);
  return null;
}

function Ripples({ color }: { color: string }) {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setPhase((p) => (p + 1) % 100), 120);
    return () => clearInterval(id);
  }, []);
  const rings = [0, 33, 66];
  return (
    <>
      {rings.map((offset, i) => {
        const t = ((phase + offset) % 100) / 100;
        const radius = 2000 + t * 45000;
        const opacity = 0.5 * (1 - t);
        return <Circle key={i} center={RESORT} radius={radius} pathOptions={{ color, weight: 1.5, fillColor: color, fillOpacity: opacity * 0.25, opacity }} />;
      })}
    </>
  );
}

export function RegionalWeatherMap() {
  const radarUrl = useRadarTiles();
  const [layer, setLayer] = useState<"radar" | NewsLayer>("ir");
  const showRadar = layer === "radar";
  const [playing, setPlaying] = useState(true);
  const [hour, setHour] = useState(0);
  const phase = useRef(0);
  const wifActive = useWeatherWhatIf((st) => st.active);
  const wifScenario = useWeatherWhatIf((st) => st.scenario);
  const simState = useSim((st) => st.state);
  const today = forecastWeather(simState)[0];
  const scenarioTemp = wifActive ? wifScenario.tempC : today.tempC;
  const scenarioRain = wifActive ? wifScenario.rainProbability : today.rainProbability;
  const hazards = getHazardEvents();
  const condition = useCurrentWeatherCondition();
  const tint = CONDITION_TINT[condition] ?? CONDITION_TINT.clear;
  const severity = condition === "rain" ? Math.max(0.55, scenarioRain) : condition === "heatwave" ? 0.25 : 0.4;
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const base = phase.current;
    const loop = (now: number) => {
      if (playing) {
        phase.current = (base + (now - t0) / 42000) % 1;
        const nh = Math.round(phase.current * 24);
        setHour((h) => (nh === h ? h : nh));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing]);
  const stamp = hour === 0 ? "NOW" : `+${hour} h`;
  const layers: { id: "radar" | NewsLayer; label: string }[] = [
    { id: "ir", label: "Satellite IR" },
    { id: "temp", label: "Temperature" },
    { id: "fronts", label: "Fronts & systems" },
    { id: "radar", label: "Live radar" },
  ];
  const nearbyHazards = useMemo(() => hazards.filter((h) => Math.abs(h.lat - RESORT[0]) < 12 && Math.abs(h.lon - RESORT[1]) < 12), [hazards]);

  return (
    <div className="relative overflow-hidden rounded-xl border border-sky-500/30 shadow-[0_0_50px_-16px_#38bdf8]">
      <div className="flex items-center justify-between border-b border-stroke bg-deep/90 px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <Radar size={14} className="text-sky-400" />
          <span className="font-display text-[14.5px] font-semibold text-hi">Regional Weather Map</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-stroke">
            {layers.map((l) => (
              <button key={l.id} onClick={() => setLayer(l.id)} className={cn("mono px-2 py-1 text-[9.5px] uppercase tracking-wider transition-colors", layer === l.id ? "bg-sky-500/25 text-sky-200" : "bg-white/[0.03] text-low hover:text-hi")}>
                {l.label}
              </button>
            ))}
          </div>
          <span className="mono flex items-center gap-1 rounded bg-positive/15 px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider text-positive">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-positive" /> {layer === "radar" ? "live" : "demo model"}
          </span>
        </div>
      </div>

      <div className={cn("relative w-full transition-[height]", layer === "radar" ? "h-[420px]" : "h-[560px]")}>
        <MapContainer center={[16.4, 74.6]} zoom={6.5} zoomSnap={0.5} zoomControl={false} scrollWheelZoom={false} style={{ height: "100%", width: "100%", background: "#05070a" }}>
          <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" className={layer === "ir" ? "map-ir-filter" : layer === "temp" ? "map-temp-filter" : "map-dark-filter"} />
          {/* RainViewer's own docs: radar tiles only exist up to zoom 7 — maxNativeZoom makes
              Leaflet request the real z7 tile and scale it up at deeper zooms instead of
              requesting an out-of-range tile, which RainViewer serves as a literal
              "Zoom Level Not Supported" placeholder image (confirmed by fetching one directly). */}
          {showRadar && radarUrl && <TileLayer url={radarUrl} opacity={0.55} maxNativeZoom={7} />}

          <ZoomControl position="topright" />
          <ViewController wide={layer !== "radar"} />
          {layer === "radar" && <Ripples color={tint} />}
          {layer !== "radar" && <NewsWeatherOverlay layer={layer} severity={severity} baseTemp={scenarioTemp} phase={phase} label={condition} />}

          <CircleMarker center={RESORT} radius={9} pathOptions={{ color: tint, weight: 2, fillColor: tint, fillOpacity: 0.85 }} />
          <Marker position={RESORT} icon={RESORT_ICON}>
            <Popup>
              <b>Azure Bay Resort</b>
              <br />
              Current condition: {condition}
            </Popup>
          </Marker>

          {ENTITIES.map((e) => (
            <Marker key={e.name} position={e.pos} icon={divIcon(ENTITY_EMOJI[e.kind])}>
              <Popup>
                <b>{e.name}</b>
                <br />
                {e.kind === "airport" ? "Guest transfers slow down first here on a storm day." : e.kind === "beach" ? "Outdoor attraction demand — the first thing rain suppresses." : "Regional traveler activity centre."}
              </Popup>
            </Marker>
          ))}

          {nearbyHazards.map((h) => (
            <CircleMarker key={h.id} center={[h.lat, h.lon]} radius={8} pathOptions={{ color: alertLeafletColor(h.alertLevel), weight: 2, fillColor: alertLeafletColor(h.alertLevel), fillOpacity: 0.6 }}>
              <Popup>
                <b>
                  {h.eventType} · {h.name}
                </b>
                <br />
                Alert level: {h.alertLevel}
                <br />
                <a href={h.url} target="_blank" rel="noopener noreferrer">
                  GDACS report ↗
                </a>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>

        {layer !== "radar" && (
          <>
            <div className="pointer-events-none absolute left-3 top-3 z-[500] flex flex-col gap-0.5 rounded-md border-l-4 border-[#f5a524] bg-black/80 px-3 py-1.5 shadow-lg">
              <span className="text-[13px] font-extrabold uppercase tracking-wide text-white">{layer === "ir" ? "Satellite · cloud tops" : layer === "temp" ? "Temperatures (°C)" : "Weather systems"}</span>
              <span className="mono text-[9.5px] uppercase tracking-wider text-[#f5a524]">Konkan coast · {condition === "rain" ? "storm scenario" : condition === "heatwave" ? "heatwave scenario" : "fair-weather scenario"} · {stamp}</span>
            </div>
            {layer !== "fronts" && (
              <div className="pointer-events-none absolute right-16 top-3 z-[500] w-44 rounded-md bg-black/75 px-2 py-1.5">
                <div className="h-2.5 rounded-sm" style={{ background: layer === "ir" ? IR_LEGEND : TEMP_LEGEND }} />
                <div className="mono mt-1 flex justify-between text-[8.5px] text-mid">
                  {layer === "ir" ? (<><span>clear</span><span>cloud</span><span>deep convection</span></>) : (<><span>18°</span><span>31°</span><span>44°</span></>)}
                </div>
              </div>
            )}
            <div className="absolute inset-x-3 bottom-2 z-[500] flex items-center gap-2 rounded-md bg-black/75 px-2.5 py-1.5">
              <button onClick={() => setPlaying((p) => !p)} className="grid h-6 w-6 place-items-center rounded bg-white/10 text-hi" aria-label={playing ? "Pause" : "Play"}>{playing ? <Pause size={12} /> : <Play size={12} />}</button>
              <input type="range" min={0} max={24} value={hour} onChange={(e) => { setPlaying(false); phase.current = Number(e.target.value) / 24; setHour(Number(e.target.value)); }} className="h-1 flex-1 accent-[#f5a524]" aria-label="Forecast hour" />
              <span className="mono w-14 text-right text-[10px] text-[#f5a524]">{stamp}</span>
            </div>
          </>
        )}
        <div className={cn("pointer-events-none absolute left-2 flex flex-col gap-1 rounded-lg border border-stroke bg-black/70 px-2.5 py-2 backdrop-blur-sm", layer === "radar" ? "bottom-2" : "hidden")}>
          <span className="mono text-[9px] uppercase tracking-wider text-low">Legend</span>
          <span className="flex items-center gap-1.5 text-[10px] text-mid">🏨 Resort (epicentre)</span>
          <span className="flex items-center gap-1.5 text-[10px] text-mid">✈️ 🏙️ 🏖️ Regional entities</span>
          {nearbyHazards.length > 0 && (
            <span className="flex items-center gap-1.5 text-[10px] text-mid">
              <ShieldAlert size={11} className="text-warm" /> {nearbyHazards.length} GDACS hazard{nearbyHazards.length > 1 ? "s" : ""} in region
            </span>
          )}
        </div>
      </div>

      <style>{`
        /* OpenStreetMap's standard raster tiles are the single most reliable free, no-key tile
           source there is (every "dark" alternative tried either now requires a key — CARTO —
           or hit an access block during testing — Esri, direct OSM access without a browser's
           own headers). A CSS filter turns the ordinary light tiles dark to match the rest of
           this dashboard, instead of depending on a specific provider's own dark style staying
           free indefinitely. */
        .map-ir-filter { filter: grayscale(1) brightness(0.62) contrast(1.15); }
        .map-temp-filter { filter: grayscale(1) brightness(0.7) contrast(1.1); }
        .map-dark-filter { filter: invert(1) hue-rotate(180deg) brightness(0.92) contrast(0.9) saturate(0.7); }
      `}</style>
    </div>
  );
}
