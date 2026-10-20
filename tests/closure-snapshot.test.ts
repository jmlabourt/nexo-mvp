import { describe, expect, it } from "vitest";
import { actualCostToDate, budgetTotal, finalMargin, expectedMargin, materialActualCost } from "@/lib/calculations";
import { buildClosureSnapshot, CLOSURE_SCHEMA_VERSION } from "@/lib/closure-snapshot";
import { buildSeed } from "@/lib/seed-data";
import { line, project, usage } from "./helpers";

const closedProject = (extra: Parameters<typeof project>[0] = {}) =>
  project({ status: "completed", isClosed: true, closedAt: "2026-03-15T12:00:00Z", ...extra });

describe("cierre congelado del proyecto", () => {
  it("solo se congela un proyecto finalizado (el margen real final no existe antes)", () => {
    expect(() => buildClosureSnapshot(project({ status: "production" }))).toThrow(/finalizado/);
  });

  it("compra ≠ consumo ≠ desperdicio ≠ sobrante: el costo imputado sale del consumo + desperdicio", () => {
    // Spec §10: se presupuestan 10 placas, se compran 12, se usan 9, se desperdicia 1 y quedan 2 reutilizables.
    const p = closedProject({
      salesPrice: 1_000_000,
      budgetLines: [line("materials", 10, 50_000, { description: "Melamina blanca 18 mm", materialId: "mel-blanca-18", unit: "placa" })],
      purchaseEntries: [
        { id: "pe1", projectId: "p", materialId: "mel-blanca-18", materialName: "Melamina blanca 18 mm", quantity: 12, unit: "placa", unitCost: 50_000, total: 600_000, date: "2026-01-05", createdBy: "t", createdAt: "2026-01-05T10:00:00Z" },
      ],
      materialUsages: [usage({ quantityConsumed: 9, wasteQuantity: 1, reusableLeftoverQuantity: 2 })],
    });
    const s = buildClosureSnapshot(p);
    expect(s.materials).toHaveLength(1);
    expect(s.materials[0]).toMatchObject({
      material_id: "mel-blanca-18",
      budgeted_qty: 10,
      budgeted_cost: 500_000,
      purchased_qty: 12,
      consumed_qty: 9,
      waste_qty: 1,
      leftover_qty: 2,
      imputed_cost: 500_000,
    });
    // La compra de 600.000 NO es el costo del material.
    expect(s.actual_by_category.materials).toBe(500_000);
    expect(s.actual_by_category.materials).toBe(materialActualCost(p.materialUsages));
  });

  it("las cifras salen de lib/calculations (una sola fuente) y las categorías suman el total", () => {
    const p = closedProject({
      salesPrice: 2_000_000,
      budgetLines: [line("materials", 10, 50_000, { materialId: "m" }), line("labor", 100, 5_000, { unit: "h" }), line("transport", null, 100_000)],
      actualEntries: [
        { id: "a1", projectId: "p", date: "2026-02-01", type: "labor", category: "labor", description: "Armado", amount: 650_000, labor: { role: "Armado", hours: 130, hourlyCost: 5_000 }, rubro: "carpinteria_madera", createdBy: "t", createdAt: "2026-02-01T10:00:00Z" },
        { id: "a2", projectId: "p", date: "2026-02-10", type: "logistics", category: "transport", description: "Flete", amount: 120_000, createdBy: "t", createdAt: "2026-02-10T10:00:00Z" },
      ],
      materialUsages: [usage({ materialId: "m", quantityConsumed: 11, date: "2026-02-05" })],
    });
    const s = buildClosureSnapshot(p);
    expect(s.schema_version).toBe(CLOSURE_SCHEMA_VERSION);
    expect(s.budget_total).toBe(budgetTotal(p.budgetLines));
    expect(s.final_cost).toBe(actualCostToDate(p));
    expect(s.final_margin).toBe(finalMargin(p));
    expect(s.expected_margin).toBe(expectedMargin(p.salesPrice, p.budgetLines));
    const sum = (o: Record<string, number>) => Object.values(o).reduce((n, v) => n + v, 0);
    expect(sum(s.actual_by_category)).toBeCloseTo(s.final_cost, 2);
    expect(sum(s.budget_by_category)).toBeCloseTo(s.budget_total, 2);
    expect(s.margin_delta_points).toBeCloseTo((s.final_margin as number) - (s.expected_margin as number), 6);
    expect(s.first_cost_date).toBe("2026-02-01");
    expect(s.last_cost_date).toBe("2026-02-10");
    expect(s.hours_by_rubro.carpinteria_madera).toMatchObject({ actual_hours: 130, actual_cost: 650_000 });
  });

  it("el principal desvío es la categoría que más se pasó", () => {
    const p = closedProject({
      salesPrice: 1_000_000,
      budgetLines: [line("materials", 10, 10_000, { materialId: "m" })],
      materialUsages: [usage({ materialId: "m", quantityConsumed: 15, unitCost: 10_000 })],
    });
    const s = buildClosureSnapshot(p);
    expect(s.main_deviation_category).toBe("materials");
    expect(s.main_deviation_amount).toBe(50_000);
    expect(s.summary_text).toContain("Principal desvío: Materiales");
  });

  it("sin precio de venta no hay margen: queda en null y el texto lo dice (nunca un negativo falso)", () => {
    const s = buildClosureSnapshot(closedProject({ salesPrice: 0, budgetLines: [line("materials", 1, 100)] }));
    expect(s.expected_margin).toBeNull();
    expect(s.final_margin).toBeNull();
    expect(s.margin_delta_points).toBeNull();
    expect(s.summary_text).toContain("No tenía precio de venta");
  });

  it("el resumen usa el glosario: puntos de margen, nunca “pp”", () => {
    const p = closedProject({
      salesPrice: 1_000_000,
      budgetLines: [line("materials", 10, 50_000, { materialId: "m" })],
      materialUsages: [usage({ materialId: "m", quantityConsumed: 14 })],
    });
    const text = buildClosureSnapshot(p).summary_text;
    // Vocabulario de la Auditoría UX (Fase 1): "puntos de margen".
    expect(text).toMatch(/puntos de margen/);
    expect(text).not.toMatch(/\bpp\b/);
    expect(text).toContain("P-1");
  });

  it("proyecto cerrado sin ningún registro: no inventa datos", () => {
    const s = buildClosureSnapshot(closedProject({ budgetLines: [line("materials", 1, 100)] }));
    expect(s.final_cost).toBe(0);
    expect(s.materials[0].consumed_qty).toBe(0);
    expect(s.first_cost_date).toBeNull();
    expect(s.hours_by_rubro).toEqual({});
  });

  it("funciona con todos los proyectos finalizados de la demo y es serializable a JSON", () => {
    const finished = buildSeed(new Date("2026-10-19T12:00:00Z")).projects.filter((p) => p.isClosed && p.status === "completed");
    expect(finished.length).toBeGreaterThanOrEqual(4);
    for (const p of finished) {
      const s = buildClosureSnapshot(p);
      expect(s.project_id).toBe(p.id);
      expect(s.final_cost).toBeCloseTo(actualCostToDate(p), 2);
      expect(s.summary_text.length).toBeGreaterThan(40);
      expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    }
  });
});
