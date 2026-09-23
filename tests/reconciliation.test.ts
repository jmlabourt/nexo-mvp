import { describe, expect, it } from "vitest";
import { materialRows, reconciliationSummary } from "@/lib/material-reconciliation";
import { addLeftoverToPool, applyUsageToPool, consumeFromPool, PoolError } from "@/lib/reusable-pool";
import type { PurchaseEntry } from "@/types";
import { line, project, usage } from "./helpers";

const buy = (qty: number, materialId = "mel-blanca-18"): PurchaseEntry => ({
  id: `c${qty}${materialId}`, projectId: "p", materialId, materialName: "Melamina blanca 18 mm", quantity: qty, unit: "placa",
  unitCost: 50000, total: qty * 50000, date: "2026-01-02", createdBy: "t", createdAt: "x",
});

const budgetMel = line("materials", 10, 50000, { materialId: "mel-blanca-18", description: "Melamina blanca 18 mm", unit: "placa" });

describe("reconciliación de materiales (ejemplo de la spec)", () => {
  it("12 compradas, 9 consumidas, 1 desperdicio, 2 sobrante → reconciliado, imputado $500.000", () => {
    const p = project({
      budgetLines: [budgetMel],
      purchaseEntries: [buy(12)],
      materialUsages: [usage({ quantityConsumed: 9, wasteQuantity: 1, reusableLeftoverQuantity: 2 })],
    });
    const [row] = materialRows(p);
    expect(row.budgetQty).toBe(10);
    expect(row.purchasedQty).toBe(12);
    expect(row.purchasedCost).toBe(600000);
    expect(row.consumedCost).toBe(450000);
    expect(row.wasteCost).toBe(50000);
    expect(row.leftoverValue).toBe(100000);
    expect(row.imputedCost).toBe(500000);
    expect(row.variance).toBe(0);
    expect(row.unexplainedQty).toBe(0);
    expect(row.reconciled).toBe(true);
  });
  it("compra > uso registrado → diferencia no explicada", () => {
    const p = project({
      budgetLines: [budgetMel],
      purchaseEntries: [buy(12)],
      materialUsages: [usage({ quantityConsumed: 9, wasteQuantity: 1, reusableLeftoverQuantity: 1 })],
    });
    const s = reconciliationSummary(p);
    expect(s.allReconciled).toBe(false);
    expect(s.pending[0].unexplainedQty).toBe(1);
  });
  it("uso desde stock existente no requiere compra y no genera faltante", () => {
    const p = project({ materialUsages: [usage({ quantityConsumed: 4, source: "existing_stock" })] });
    const [row] = materialRows(p);
    expect(row.purchasedQty).toBe(0);
    expect(row.fromStockQty).toBe(4);
    expect(row.imputedCost).toBe(200000);
    expect(row.reconciled).toBe(true);
  });
  it("sobrante reutilizado se imputa al proyecto que lo usa y no a la compra", () => {
    const p = project({ materialUsages: [usage({ quantityConsumed: 2, source: "reused_leftover", unitCost: 40000 })] });
    const [row] = materialRows(p);
    expect(row.fromReusedQty).toBe(2);
    expect(row.imputedCost).toBe(80000);
    expect(row.reconciled).toBe(true);
  });
  it("sin registros de uso: nada imputado", () => {
    const p = project({ budgetLines: [budgetMel] });
    const [row] = materialRows(p);
    expect(row.imputedCost).toBe(0);
    expect(row.variance).toBe(-500000);
  });
});

describe("pool de sobrantes", () => {
  const origin = { id: "p", code: "P-1", name: "Test" };
  it("agrega el sobrante generado", () => {
    const pool = addLeftoverToPool([], usage({ quantityConsumed: 1, reusableLeftoverQuantity: 2 }), origin, "r1");
    expect(pool).toHaveLength(1);
    expect(pool[0]).toMatchObject({ quantity: 2, unitCost: 50000, originProjectId: "p" });
  });
  it("descuenta al reutilizar y elimina cuando llega a 0", () => {
    let pool = addLeftoverToPool([], usage({ quantityConsumed: 1, reusableLeftoverQuantity: 2 }), origin, "r1");
    pool = consumeFromPool(pool, "r1", 0.5);
    expect(pool[0].quantity).toBe(1.5);
    pool = consumeFromPool(pool, "r1", 1.5);
    expect(pool).toHaveLength(0);
  });
  it("no permite usar más de lo disponible", () => {
    const pool = addLeftoverToPool([], usage({ quantityConsumed: 1, reusableLeftoverQuantity: 1 }), origin, "r1");
    expect(() => consumeFromPool(pool, "r1", 2)).toThrow(PoolError);
  });
  it("applyUsageToPool: reutilizar consume del pool y puede generar nuevo sobrante", () => {
    const pool = addLeftoverToPool([], usage({ quantityConsumed: 1, reusableLeftoverQuantity: 3 }), origin, "r1");
    const next = applyUsageToPool(
      pool,
      usage({ source: "reused_leftover", reusableMaterialId: "r1", quantityConsumed: 2, wasteQuantity: 0.5, reusableLeftoverQuantity: 0.2 }),
      { id: "q", code: "P-2", name: "Otro" },
      "r2",
    );
    expect(next.find((x) => x.id === "r1")?.quantity).toBe(0.5);
    expect(next.find((x) => x.id === "r2")?.quantity).toBe(0.2);
  });
});
