import type { ResortModel } from "@/lib/architecture/types";
import type { InventoryItem, Recommendation, SimState } from "@/lib/sim/types";
import { clamp } from "@/lib/utils";

export interface Forecast {
  level: number;
  trend: number;
  next7: number[];
  sd: number;
}

export function holtForecast(series: number[], alpha = 0.4, beta = 0.15): Forecast {
  if (series.length < 2) return { level: series[0] ?? 0, trend: 0, next7: Array(7).fill(series[0] ?? 0), sd: 0 };
  let level = series[0];
  let trend = series[1] - series[0];
  const errs: number[] = [];
  for (let i = 1; i < series.length; i++) {
    const prev = level + trend;
    errs.push(series[i] - prev);
    const nl = alpha * series[i] + (1 - alpha) * (level + trend);
    trend = beta * (nl - level) + (1 - beta) * trend;
    level = nl;
  }
  const sd = Math.sqrt(errs.reduce((s, e) => s + e * e, 0) / Math.max(1, errs.length));
  return { level, trend, next7: Array.from({ length: 7 }, (_, k) => Math.max(0, level + trend * (k + 1))), sd };
}

export interface InventoryAssessment {
  item: InventoryItem;
  forecast: Forecast;
  daysCover: number;
  stockoutDay: number | null;
  reorderPoint: number;
  eoq: number;
  shouldOrder: boolean;
}

export function assessInventory(it: InventoryItem, occFactor: number): InventoryAssessment {
  const f = holtForecast(it.useHistory);
  const daily = Math.max(0.1, f.level * (0.7 + occFactor * 0.3));
  const safety = 1.65 * f.sd * Math.sqrt(it.leadDays);
  const reorderPoint = Math.round(daily * it.leadDays + safety);
  const eoq = Math.round(Math.sqrt((2 * daily * 365 * 450) / (it.unitCost * 0.22)));
  let stock = it.stock;
  let stockoutDay: number | null = null;
  for (let d = 0; d < 7; d++) {
    stock -= f.next7[d] * (0.7 + occFactor * 0.3);
    if (stock <= 0) {
      stockoutDay = d + 1;
      break;
    }
  }
  return { item: it, forecast: f, daysCover: it.stock / daily, stockoutDay, reorderPoint, eoq, shouldOrder: it.stock < reorderPoint && it.onOrder === 0 };
}

export function inventoryRecommendations(state: SimState, model: ResortModel): Recommendation[] {
  const occFactor = state.kpis.occupancy / 0.85;
  const out: Recommendation[] = [];
  for (const it of Object.values(state.inventory)) {
    const a = assessInventory(it, occFactor);
    if (!a.shouldOrder) continue;
    const qty = Math.max(a.eoq, Math.round(a.reorderPoint * 1.2 - it.stock));
    out.push({
      id: `rec-inv-${it.id}`,
      module: "inventory",
      title: `Reorder ${it.name} · ${qty} ${it.unit}`,
      body: `${Math.round(it.stock)} ${it.unit} on hand, ${a.daysCover.toFixed(1)} days cover against a ${it.leadDays}-day lead time.${a.stockoutDay ? ` Stockout projected on day ${a.stockoutDay}.` : ""}`,
      confidence: clamp(0.6 + Math.min(0.3, it.useHistory.length / 40), 0, 0.92),
      basis: [
        `Holt linear forecast: level ${a.forecast.level.toFixed(1)}/day, trend ${a.forecast.trend >= 0 ? "+" : ""}${a.forecast.trend.toFixed(2)}/day`,
        `reorder point ${a.reorderPoint} = lead-time demand + 1.65σ safety stock (σ=${a.forecast.sd.toFixed(1)})`,
        `EOQ ${a.eoq} ${it.unit} at ₹${it.unitCost}/unit, 22% holding cost`,
      ],
      impact: `Prevents a stockout affecting ${it.category === "fnb" ? "F&B service" : it.category === "housekeeping" ? "room turnovers" : "operations"}. Order value ≈ ₹${Math.round(qty * it.unitCost).toLocaleString("en-IN")}.`,
      action: `Raise PO for ${qty} ${it.unit}, ETA ${it.leadDays} days.`,
      targetKind: "inventory",
      targetId: it.id,
      createdAt: state.t,
      status: "pending",
      payload: { itemId: it.id, qty },
    });
  }
  return out;
}
