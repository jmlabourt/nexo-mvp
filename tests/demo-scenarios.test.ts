// Escenarios obligatorios de la demo, sobre el seed real de P-1042.
import { describe, expect, it } from "vitest";
import { buildSeed, MAIN_DEMO_PROJECT_ID } from "@/lib/seed-data";
import { projectEconomics } from "@/lib/calculations";
import { economicHealth, projectAlerts } from "@/lib/alerts";
import { reconciliationSummary, materialRows } from "@/lib/material-reconciliation";
import { DEFAULT_SETTINGS as S } from "@/lib/constants";
import * as ops from "@/lib/project-operations";
import { todayISO } from "@/lib/formatting";
import { historyLearnings } from "@/lib/insights";

const ctx = { actor: "Test", now: new Date().toISOString() };
const today = todayISO();

function seed() {
  const s = buildSeed(new Date());
  const p = s.projects.find((x) => x.id === MAIN_DEMO_PROJECT_ID);
  if (!p) throw new Error("no P-1042");
  return { ...s, p };
}

describe("P-1042 — escenarios 1 a 3", () => {
  it("esperado 40%, proyectado ≈31%, En riesgo, causa Materiales", () => {
    const { p } = seed();
    const e = projectEconomics(p);
    expect(e.budgetTotal).toBe(7_200_000);
    expect(e.expectedProfit).toBe(4_800_000);
    expect(e.expectedMargin).toBeCloseTo(40);
    expect(e.projectedMargin!).toBeGreaterThan(30);
    expect(e.projectedMargin!).toBeLessThan(32);
    expect(e.mainDeviation?.category).toBe("materials");
    expect(e.materialActualCost).toBeGreaterThan(4_700_000);
    expect(e.materialActualCost).toBeLessThan(4_900_000);
    expect(economicHealth(p, S, today)).toBe("risk");
  });
  it("melamina blanca: 10 presup., 12 compradas, 9 consumidas, 1 desperdicio, 2 sobrante", () => {
    const { p } = seed();
    const row = materialRows(p).find((r) => r.key === "mel-blanca-18")!;
    expect([row.budgetQty, row.purchasedQty, row.consumedQty, row.wasteQty, row.leftoverQty]).toEqual([10, 12, 9, 1, 2]);
    expect(row.imputedCost).toBe(500_000);
    const mdf = materialRows(p).find((r) => r.key === "mdf-18")!;
    expect(mdf.consumedQty).toBe(7);
    expect(mdf.variance).toBeGreaterThan(0);
  });
});

describe("escenario 4 y 5 — compra NO cambia margen, consumo SÍ", () => {
  it("registrar compra de 2 placas no modifica costo imputable ni margen", () => {
    const { p } = seed();
    const before = projectEconomics(p);
    const after = ops.addPurchase(p, { materialId: "mel-blanca-18", materialName: "Melamina blanca 18 mm", quantity: 2, unit: "placa", unitCost: 50_000, date: today }, ctx);
    const e = projectEconomics(after);
    expect(e.actualCostToDate).toBe(before.actualCostToDate);
    expect(e.projectedMargin).toBe(before.projectedMargin);
    expect(e.purchasesTotal).toBe(before.purchasesTotal + 100_000);
    // pero sí aparece como material comprado sin reconciliar
    const row = reconciliationSummary(after).pending.find((r) => r.key === "mel-blanca-18");
    expect(row?.unexplainedQty).toBe(2);
  });
  it("registrar consumo de 2 placas sí cambia costo y margen", () => {
    const { p, reusableMaterials } = seed();
    const before = projectEconomics(p);
    const res = ops.addMaterialUsage(p, reusableMaterials, {
      materialId: "mel-blanca-18", materialName: "Melamina blanca 18 mm", unit: "placa", source: "purchased_for_project",
      quantityConsumed: 2, wasteQuantity: 0, reusableLeftoverQuantity: 0, date: today,
    }, S, ctx);
    const e = projectEconomics(res.project);
    expect(e.actualCostToDate).toBe(before.actualCostToDate + 100_000);
    expect(e.projectedMargin!).toBeLessThan(before.projectedMargin!);
    expect(res.usage.unitCostOrigin).toBe("purchase");
  });
});

describe("escenario 6 — horas", () => {
  it("10 h × $15.000 = $150.000 y el margen se actualiza", () => {
    const { p } = seed();
    const before = projectEconomics(p);
    const after = ops.addActual(p, { type: "labor", description: "", date: today, labor: { role: "Carpintería", hours: 10, hourlyCost: 15_000 } }, S, ctx);
    const entry = after.actualEntries.at(-1)!;
    expect(entry.amount).toBe(150_000);
    expect(projectEconomics(after).projectedFinalCost).toBe(before.projectedFinalCost + 150_000);
  });
});

describe("escenario 7 — registro mobile sin precio", () => {
  it("2 placas + 0,2 desperdicio + 0,3 reutilizable: valoriza sola y agrega al pool", () => {
    const { p, reusableMaterials } = seed();
    const before = projectEconomics(p);
    const res = ops.addMaterialUsage(p, reusableMaterials, {
      materialId: "mel-blanca-18", materialName: "Melamina blanca 18 mm", unit: "placa", source: "purchased_for_project",
      quantityConsumed: 2, wasteQuantity: 0.2, reusableLeftoverQuantity: 0.3, date: today,
    }, S, { actor: "María Ruiz", now: new Date().toISOString() });
    expect(res.usage.unitCost).toBe(50_000);
    expect(projectEconomics(res.project).materialActualCost).toBe(before.materialActualCost + 110_000);
    expect(res.pool.length).toBe(reusableMaterials.length + 1);
    expect(res.project.activity[0].message).toMatch(/María Ruiz|reutilizables|superaron/);
    // Sin compra adicional, el uso "comprado" supera lo comprado → reconciliación lo marca
    const row = reconciliationSummary(res.project).rows.find((r) => r.key === "mel-blanca-18")!;
    expect(row.unexplainedQty).toBeCloseTo(-2.5);
  });
  it("reutilizar un sobrante descuenta del pool e imputa su valor", () => {
    const { p, reusableMaterials } = seed();
    const item = reusableMaterials.find((r) => r.materialId === "mel-grafito-18")!;
    const res = ops.addMaterialUsage(p, reusableMaterials, {
      materialId: "mel-grafito-18", materialName: "Melamina grafito 18 mm", unit: "placa", source: "reused_leftover",
      reusableMaterialId: item.id, quantityConsumed: 1, wasteQuantity: 0, reusableLeftoverQuantity: 0, date: today,
    }, S, ctx);
    expect(res.usage.unitCost).toBe(item.unitCost);
    const left = res.pool.find((r) => r.id === item.id);
    expect(left ? left.quantity : 0).toBeCloseTo(item.quantity - 1);
  });
});

describe("escenario 9 y 10 — cierre e historial", () => {
  it("cerrar calcula margen real y no admite nuevos registros", () => {
    const { p } = seed();
    const closed = ops.closeProject(p, ctx);
    const e = projectEconomics(closed);
    expect(closed.status).toBe("completed");
    expect(closed.closedAt).toBeDefined();
    expect(e.finalMargin).toBeCloseTo(((12_000_000 - e.actualCostToDate) / 12_000_000) * 100);
    expect(projectAlerts(closed, S, today)).toHaveLength(0);
    expect(() => ops.addPurchase(closed, { materialName: "X", quantity: 1, unit: "u", unitCost: 1, date: today }, ctx)).toThrow();
  });
  it("historial genera aprendizajes con los finalizados", () => {
    const { projects } = seed();
    const learnings = historyLearnings(projects.filter((x) => x.status === "completed"));
    expect(learnings.length).toBeGreaterThanOrEqual(3);
    expect(learnings[0].text).toMatch(/materiales terminaron/);
  });
  it("presupuesto bloqueado en producción", () => {
    const { p } = seed();
    expect(() => ops.addBudgetLine(p, { category: "other", description: "x", quantity: null, unit: "global", unitCost: 1 }, ctx)).toThrow(/bloqueado/);
  });
});
