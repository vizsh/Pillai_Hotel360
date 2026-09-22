import { describe, expect, it } from "vitest";
import { assessInventory, holtForecast } from "@/lib/intelligence/inventory";
import type { InventoryItem } from "@/lib/sim/types";

describe("holtForecast", () => {
  it("forecasts a flat series as flat", () => {
    const f = holtForecast(Array(10).fill(50));
    for (const v of f.next7) expect(v).toBeCloseTo(50, 0);
    expect(f.sd).toBeCloseTo(0, 5);
  });

  it("picks up an upward trend", () => {
    const series = Array.from({ length: 10 }, (_, i) => 10 + i * 5);
    const f = holtForecast(series);
    expect(f.trend).toBeGreaterThan(0);
    // Forecast should keep climbing, not flatten out or reverse.
    expect(f.next7[6]).toBeGreaterThan(f.next7[0]);
  });

  it("never forecasts a negative quantity", () => {
    const series = [20, 15, 8, 2, 0, 0];
    const f = holtForecast(series);
    for (const v of f.next7) expect(v).toBeGreaterThanOrEqual(0);
  });

  it("handles a single data point without throwing", () => {
    const f = holtForecast([42]);
    expect(f.level).toBe(42);
    expect(f.next7).toHaveLength(7);
  });
});

function fixture(overrides: Partial<InventoryItem>): InventoryItem {
  return {
    id: "test-item",
    name: "Test Item",
    category: "housekeeping",
    unit: "pcs",
    stock: 100,
    dailyUse: 10,
    useHistory: Array(14).fill(10),
    leadDays: 5,
    unitCost: 50,
    reorderPoint: 0,
    reorderQty: 0,
    onOrder: 0,
    orderEta: null,
    storeZone: "z-hk-1",
    ...overrides,
  };
}

describe("assessInventory", () => {
  it("recommends reordering once stock drops under the computed reorder point", () => {
    const low = assessInventory(fixture({ stock: 5 }), 1);
    expect(low.shouldOrder).toBe(true);
    const high = assessInventory(fixture({ stock: 500 }), 1);
    expect(high.shouldOrder).toBe(false);
  });

  it("does not flag a reorder already in flight", () => {
    const a = assessInventory(fixture({ stock: 5, onOrder: 50 }), 1);
    expect(a.shouldOrder).toBe(false);
  });

  it("produces a positive reorder point and EOQ for realistic demand", () => {
    const a = assessInventory(fixture({}), 1);
    expect(a.reorderPoint).toBeGreaterThan(0);
    expect(a.eoq).toBeGreaterThan(0);
  });

  it("projects an earlier stockout day when occupancy factor is higher", () => {
    const busy = assessInventory(fixture({ stock: 30 }), 1.2);
    const quiet = assessInventory(fixture({ stock: 30 }), 0.5);
    if (busy.stockoutDay !== null && quiet.stockoutDay !== null) {
      expect(busy.stockoutDay).toBeLessThanOrEqual(quiet.stockoutDay);
    }
  });
});
