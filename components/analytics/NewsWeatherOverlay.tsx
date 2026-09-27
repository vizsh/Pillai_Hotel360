"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";

/** Broadcast-style weather graphics drawn on a canvas over the Leaflet map: a satellite-IR cloud field,
 * a temperature field with city readouts, and a fronts-and-systems chart (L/H centres, cold and warm
 * fronts, rain zones). The fields are a seeded, animated demonstration model anchored to the twin's
 * current condition and temperature — they illustrate the scenario, they are not a live satellite feed
 * (the Radar layer is the live one). */
export type NewsLayer = "ir" | "temp" | "fronts";

const CITIES: [string, number, number][] = [
  ["Mumbai", 19.08, 72.88], ["Pune", 18.52, 73.86], ["Kolhapur", 16.7, 74.24], ["Ratnagiri", 16.99, 73.3], ["Panjim", 15.49, 73.83],
  ["Belagavi", 15.85, 74.5], ["Hubballi", 15.36, 75.12], ["Karwar", 14.81, 74.13], ["Mangaluru", 12.91, 74.86], ["Bengaluru", 12.97, 77.59],
  ["Nashik", 20.0, 73.79], ["Kochi", 9.93, 76.27], ["Hyderabad", 17.38, 78.48],
];

const hash = (x: number, y: number) => {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};
function vnoise(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x: number, y: number) => 0.5 * vnoise(x, y) + 0.27 * vnoise(x * 2.1, y * 2.1) + 0.15 * vnoise(x * 4.3, y * 4.3) + 0.08 * vnoise(x * 8.7, y * 8.7);

export const lowCentre = (ph: number, s: number) => ({ lon: 69.4 + 5.2 * ph, lat: 12.6 + 2.9 * ph + (s > 0.6 ? 0 : -0.8) });

/** Cloud-top "coldness" 0..1 (higher = colder, taller cloud). */
export function cloudAt(lat: number, lon: number, ph: number, s: number): number {
  const base = fbm(lon * 1.5 - ph * 2.2, lat * 1.5 + ph * 0.6);
  let c = base * 0.62 - 0.08;
  const L = lowCentre(ph, s);
  const dx = (lon - L.lon) * Math.cos((lat * Math.PI) / 180), dy = lat - L.lat;
  const r = Math.hypot(dx, dy);
  const env = Math.exp(-Math.pow(r / (2.3 + s * 1.2), 2));
  const spiral = 0.5 + 0.5 * Math.cos(2 * Math.atan2(dy, dx) - r * 2.4 + ph * 12.5);
  c += s * env * (0.35 + 0.65 * spiral) * 0.95 + s * env * 0.25 * fbm(lon * 6, lat * 6 + ph * 3);
  const coast = 0.14 * s * Math.exp(-Math.pow((lon - (73.2 + (19 - lat) * 0.3)) / 1.3, 2));
  return Math.max(0, Math.min(1, c + coast));
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function ramp(stops: [number, number, number, number][], v: number): [number, number, number] {
  for (let i = 1; i < stops.length; i++) {
    if (v <= stops[i][0]) {
      const [v0, r0, g0, b0] = stops[i - 1], [v1, r1, g1, b1] = stops[i];
      const t = (v - v0) / (v1 - v0 || 1);
      return [lerp(r0, r1, t), lerp(g0, g1, t), lerp(b0, b1, t)];
    }
  }
  const l = stops[stops.length - 1];
  return [l[1], l[2], l[3]];
}
const IR_STOPS: [number, number, number, number][] = [[0.28, 60, 66, 74], [0.4, 175, 180, 186], [0.5, 40, 160, 220], [0.6, 30, 200, 210], [0.68, 60, 200, 90], [0.78, 240, 230, 40], [0.88, 245, 150, 30], [1, 190, 30, 30]];
const TEMP_STOPS: [number, number, number, number][] = [[18, 40, 90, 200], [24, 30, 170, 220], [28, 60, 200, 120], [32, 240, 220, 60], [36, 245, 150, 40], [40, 220, 50, 40], [44, 190, 40, 140]];

export const IR_LEGEND = "linear-gradient(90deg,#3c4249,#afb4ba,#28a0dc,#1ec8d2,#3cc85a,#f0e628,#f5961e,#be1e1e)";
export const TEMP_LEGEND = "linear-gradient(90deg,#285ac8,#1eaadc,#3cc878,#f0dc3c,#f59628,#dc3228,#be288c)";

export function NewsWeatherOverlay({ layer, severity, baseTemp, phase, label }: { layer: NewsLayer; severity: number; baseTemp: number; phase: React.MutableRefObject<number>; label: string }) {
  const map = useMap();
  const ref = useRef<HTMLCanvasElement | null>(null);
  const off = useRef<HTMLCanvasElement | null>(null);
  const props = useRef({ layer, severity, baseTemp, label });
  useEffect(() => {
    props.current = { layer, severity, baseTemp, label };
  });

  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;inset:0;z-index:450;pointer-events:none;width:100%;height:100%";
    map.getContainer().appendChild(canvas);
    ref.current = canvas;
    let raf = 0, last = 0;

    const tempAt = (lat: number, lon: number, ph: number, s: number, base: number) => {
      const coast = 72.85 + (19.1 - lat) * 0.3;
      const sea = lon < coast;
      const cloud = cloudAt(lat, lon, ph, s);
      let t = base + (sea ? -3.5 + 0.8 * fbm(lon * 3, lat * 3) : 0.5 + Math.min(7, (lon - coast) * 2.4) + (fbm(lon * 2.4, lat * 2.4) - 0.5) * 6);
      t -= cloud * s * 5;
      return t;
    };

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - last < 90) return;
      last = now;
      const { layer, severity: s, baseTemp: bt } = props.current;
      const size = map.getSize();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (canvas.width !== size.x * dpr || canvas.height !== size.y * dpr) {
        canvas.width = size.x * dpr;
        canvas.height = size.y * dpr;
      }
      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.x, size.y);
      const ph = phase.current;
      const cell = 5;
      if (layer === "ir" || layer === "temp") {
        const w = Math.ceil(size.x / cell), h = Math.ceil(size.y / cell);
        if (!off.current || off.current.width !== w || off.current.height !== h) {
          off.current = document.createElement("canvas");
          off.current.width = w;
          off.current.height = h;
        }
        const octx = off.current.getContext("2d")!;
        const img = octx.createImageData(w, h);
        for (let gy = 0; gy < h; gy++) {
          for (let gx = 0; gx < w; gx++) {
            const ll = map.containerPointToLatLng([gx * cell + cell / 2, gy * cell + cell / 2]);
            const i = (gy * w + gx) * 4;
            if (layer === "ir") {
              const c = cloudAt(ll.lat, ll.lng, ph, s);
              if (c < 0.3) continue;
              const [r, g, b] = ramp(IR_STOPS, c);
              img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = (c < 0.4 ? 0.55 : 0.85) * 255 * Math.min(1, (c - 0.3) * 8);
            } else {
              const [r, g, b] = ramp(TEMP_STOPS, tempAt(ll.lat, ll.lng, ph, s, bt));
              img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 158;
            }
          }
        }
        octx.putImageData(img, 0, 0);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(off.current, 0, 0, w * cell, h * cell);
      }
      if (layer === "temp") {
        ctx.font = "700 15px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        for (const [name, lat, lon] of CITIES) {
          const p = map.latLngToContainerPoint([lat, lon]);
          if (p.x < 20 || p.y < 20 || p.x > size.x - 20 || p.y > size.y - 20) continue;
          const t = Math.round(tempAt(lat, lon, ph, s, bt));
          ctx.lineWidth = 4; ctx.strokeStyle = "rgba(0,0,0,0.75)"; ctx.strokeText(String(t), p.x, p.y);
          ctx.fillStyle = "#fff"; ctx.fillText(String(t), p.x, p.y);
          ctx.font = "600 9px system-ui, sans-serif";
          ctx.lineWidth = 3; ctx.strokeText(name, p.x, p.y + 13); ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.fillText(name, p.x, p.y + 13);
          ctx.font = "700 15px system-ui, sans-serif";
        }
      }
      if (layer === "fronts") {
        const L = lowCentre(ph, s);
        const P = (lat: number, lon: number) => map.latLngToContainerPoint([lat, lon]);
        // rain zones
        ctx.setLineDash([7, 5]); ctx.lineWidth = 2; ctx.strokeStyle = "rgba(240,170,60,0.95)";
        const zone = (lat: number, lon: number, rx: number, ry: number, txt: string, rot = 0) => {
          const c = P(lat, lon), e = P(lat, lon + rx), n = P(lat + ry, lon);
          const a = Math.abs(e.x - c.x), b = Math.abs(n.y - c.y);
          ctx.beginPath(); ctx.ellipse(c.x, c.y, a, b, rot, 0, Math.PI * 2); ctx.stroke();
          ctx.setLineDash([]); ctx.font = "italic 700 12px system-ui"; ctx.fillStyle = "rgba(245,190,90,1)"; ctx.textAlign = "center";
          ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,0.7)"; ctx.strokeText(txt, c.x, c.y); ctx.fillText(txt, c.x, c.y);
          ctx.setLineDash([7, 5]); ctx.lineWidth = 2; ctx.strokeStyle = "rgba(240,170,60,0.95)";
        };
        if (s > 0.35) zone(L.lat + 0.3, L.lon + 0.6, 2.6, 1.9, s > 0.7 ? "Heavy rain / T-storms" : "Rain", -0.25);
        if (s > 0.55) zone(15.6 + 0.8 * (1 - ph), 73.7, 1.3, 2.2, "Rain / T-storms", 0.5);
        ctx.setLineDash([]);
        // fronts
        const path = (pts: [number, number][]) => pts.map(([la, lo]) => P(la, lo));
        const cold = path([[L.lat, L.lon], [L.lat - 1.3, L.lon - 0.9], [L.lat - 2.6, L.lon - 1.2], [L.lat - 3.8, L.lon - 0.6]]);
        const warm = path([[L.lat, L.lon], [L.lat + 0.5, L.lon + 1.8], [L.lat + 1.5, L.lon + 3.1], [L.lat + 2.9, L.lon + 4.0]]);
        const trace = (pts: { x: number; y: number }[], color: string, mark: (x: number, y: number, ang: number) => void) => {
          ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length - 1; i++) ctx.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
          ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y); ctx.stroke();
          let acc = 0;
          for (let i = 1; i < pts.length; i++) {
            const dx = pts[i].x - pts[i - 1].x, dy = pts[i].y - pts[i - 1].y, len = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
            for (let d = 14 - acc; d < len; d += 30) mark(pts[i - 1].x + Math.cos(ang) * d, pts[i - 1].y + Math.sin(ang) * d, ang);
            acc = (acc + len) % 30;
          }
        };
        trace(cold, "#3b6fe0", (x, y, a) => { ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.fillStyle = "#3b6fe0"; ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.lineTo(0, -10); ctx.fill(); ctx.restore(); });
        trace(warm, "#e0483b", (x, y, a) => { ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.fillStyle = "#e0483b"; ctx.beginPath(); ctx.arc(0, 0, 6, Math.PI, 0); ctx.fill(); ctx.restore(); });
        const sym = (lat: number, lon: number, ch: string, col: string) => {
          const p = P(lat, lon); ctx.font = "900 46px Georgia, serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.lineWidth = 5; ctx.strokeStyle = "rgba(0,0,0,0.7)"; ctx.strokeText(ch, p.x, p.y); ctx.fillStyle = col; ctx.fillText(ch, p.x, p.y);
        };
        sym(L.lat, L.lon, "L", "#ff3b30");
        sym(19.4 + 0.6 * Math.sin(ph * 6.28), 69.8 + 1.2 * ph, "H", "#3b7bff");
        sym(13.3 - 0.4 * ph, 81.5, "H", "#3b7bff");
        sym(19.6, 80.5 - 1.5 * ph, "L", "#ff3b30");
        if (s > 0.7) {
          const p = P(15.9, 73.4); ctx.font = "italic 800 13px system-ui"; ctx.textAlign = "center"; ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,0.8)";
          ctx.strokeText("Flash flooding possible", p.x, p.y); ctx.fillStyle = "#ff3b30"; ctx.fillText("Flash flooding possible", p.x, p.y);
        } else if (props.current.baseTemp >= 35) {
          const p = P(16.4, 74.6); ctx.font = "italic 800 13px system-ui"; ctx.textAlign = "center"; ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,0.8)";
          ctx.strokeText("Extreme heat advisory", p.x, p.y); ctx.fillStyle = "#ffb020"; ctx.fillText("Extreme heat advisory", p.x, p.y);
        }
      }
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      canvas.remove();
    };
  }, [map, phase]);

  return null;
}
