// Cinco sesiones · Gerencia: cálculos del Dashboard (lib/gerencia.ts) y su documentación (lib/indicators.ts).
import { describe, expect, it } from "vitest";
import type { ActualEntry, ClientInvoice, Operator, Opportunity } from "@/types";
import { buildSeed } from "@/lib/seed-data";
import { projectEconomics, materialActualCost } from "@/lib/calculations";
import {
  billingByMonth,
  billingRows,
  billingSummary,
  capacityFromOperators,
  capacityHours,
  capacityRows,
  codeSlug,
  costRows,
  delayImpact,
  filterProfit,
  formatProjectCode,
  generalState,
  hoursRows,
  inflationLoss,
  loadByRubro,
  opportunities,
  overdueCollections,
  periodOf,
  profitRows,
  projectCodeError,
  projectedTotals,
  workingDaysIn,
} from "@/lib/gerencia";
import { DEFAULT_MANAGEMENT_PARAMS, exampleInvoices, exampleOpportunities } from "@/lib/demo/ejemplos";
import { INDICATORS } from "@/lib/indicators";

const today = "2026-10-20";
const seed = buildSeed(new Date(`${today}T12:00:00`));
const byCode = (c: string) => seed.projects.find((p) => p.code === c)!;
const invoices = exampleInvoices(seed.projects, today);

describe("períodos", () => {
  it("mes, trimestre, año y personalizado", () => {
    expect(periodOf("month", today)).toMatchObject({ from: "2026-10-01", to: "2026-10-31", label: "octubre 2026" });
    expect(periodOf("quarter", today)).toMatchObject({ from: "2026-10-01", to: "2026-12-31", label: "4.º trimestre 2026" });
    expect(periodOf("year", today)).toMatchObject({ from: "2026-01-01", to: "2026-12-31" });
    expect(periodOf("custom", today, { from: "2026-09-15", to: "2026-10-15" })).toMatchObject({ from: "2026-09-15", to: "2026-10-15" });
    expect(workingDaysIn("2026-10-19", "2026-10-25")).toBe(5);
  });
});

describe("facturación: real, prevista y potencial nunca se mezclan", () => {
  it("una cotización no tiene facturación ni suma como venta", () => {
    expect(invoices.some((i) => i.projectId === byCode("P-1056").id)).toBe(false);
    expect(billingRows(seed.projects, invoices).some((r) => r.project.code === "P-1056")).toBe(false);
  });
  it("por proyecto: facturado + pendiente = precio de venta", () => {
    for (const r of billingRows(seed.projects, invoices)) expect(r.invoiced + r.pendingToInvoice).toBeCloseTo(r.salesPrice, 2);
    const closed = billingRows(seed.projects, invoices).find((r) => r.project.code === "P-0987")!;
    expect(closed.pendingToInvoice).toBe(0);
  });
  it("por mes y total general cierran entre sí", () => {
    const months = billingByMonth(seed.projects, invoices, "2026-01-01", "2026-12-31");
    const year = billingSummary(seed.projects, invoices, periodOf("year", today), today);
    expect(months.reduce((s, m) => s + m.issued, 0)).toBeCloseTo(year.periodInvoiced, 2);
    expect(year.totalInvoiced).toBeCloseTo(billingRows(seed.projects, invoices).reduce((s, r) => s + r.invoiced, 0), 2);
    const oct = billingSummary(seed.projects, invoices, periodOf("month", today), today);
    expect(oct.monthInvoiced).toBeCloseTo(months.find((m) => m.key === "2026-10")!.issued, 2);
    expect(oct.monthPlanned).toBeCloseTo(months.find((m) => m.key === "2026-10")!.planned, 2);
  });
  it("lo previsto no suma como facturado; al facturarlo, cambia la facturación del mes", () => {
    const planned = invoices.find((i) => i.status === "planned" && i.date.startsWith("2026-10"))!;
    const before = billingSummary(seed.projects, invoices, periodOf("month", today), today);
    const after = billingSummary(seed.projects, invoices.map((i) => (i.id === planned.id ? { ...i, status: "issued" as const } : i)), periodOf("month", today), today);
    expect(after.monthInvoiced).toBeCloseTo(before.monthInvoiced + planned.amount, 2);
    expect(after.monthPlanned).toBeCloseTo(before.monthPlanned - planned.amount, 2);
  });
  it("cobros demorados: facturas vencidas sin cobrar", () => {
    const overdue = overdueCollections(invoices, "2026-12-01");
    expect(overdue.every((i) => i.status === "issued" && !i.collectedAt)).toBe(true);
    expect(overdue.some((i) => i.projectId === byCode("P-1047").id)).toBe(true);
  });
});

describe("rentabilidad y ganancias", () => {
  const rows = profitRows(seed.projects);
  it("ganancia = precio − costo; rentabilidad = ganancia / precio × 100 (mismos números que el proyecto)", () => {
    for (const r of rows) {
      const e = projectEconomics(r.project);
      expect(r.projectedProfit).toBeCloseTo(r.salesPrice - r.projectedCost, 2);
      expect(r.projectedMargin).toBeCloseTo(((r.salesPrice - r.projectedCost) / r.salesPrice) * 100, 6);
      expect(r.projectedCost).toBe(e.projectedFinalCost);
      expect(r.pendingCost).toBeCloseTo(r.projectedCost - r.actualCost, 2);
    }
  });
  it("la rentabilidad final existe solo en los cerrados", () => {
    expect(rows.filter((r) => r.finalMargin !== null).every((r) => r.state === "closed")).toBe(true);
  });
  it("totales proyectados: solo aprobados y en proceso", () => {
    const t = projectedTotals(rows);
    expect(t.activeCount).toBe(seed.projects.filter((p) => ["approved", "in_progress"].includes(generalState(p))).length);
    expect(t.projectedMargin).toBeCloseTo((t.projectedProfit / t.salesPrice) * 100, 6);
  });
  it("filtros: con pérdida, desvío importante, mayor y menor rentabilidad", () => {
    expect(filterProfit(rows, "deviation", 5).map((r) => r.project.code)).toContain("P-1042");
    const worst = filterProfit(rows, "worst", 5);
    expect(worst[0].projectedMargin).toBeLessThanOrEqual(worst[worst.length - 1].projectedMargin ?? Infinity);
    expect(filterProfit(rows, "loss", 5).every((r) => (r.projectedProfit ?? 0) < 0)).toBe(true);
  });
});

describe("costos reales por tipo", () => {
  it("materiales comprados y no consumidos no son costo (compra ≠ consumo)", () => {
    const p = byCode("P-1058");
    const rows = costRows([p]);
    const consumed = rows.find((r) => r.key === "materials")!.actual + rows.find((r) => r.key === "waste")!.actual;
    expect(consumed).toBeCloseTo(materialActualCost(p.materialUsages) + p.actualEntries.filter((e) => e.category === "materials").reduce((s, e) => s + e.amount, 0), 2);
    expect(p.purchaseEntries.reduce((s, e) => s + e.total, 0)).toBeGreaterThan(consumed);
  });
  it("producción: horas reales × costo horario de cada operario; Diseño aparte", () => {
    const p = byCode("P-1058");
    const labor = p.actualEntries.filter((e) => e.category === "labor" && e.labor);
    const rows = costRows([p]);
    expect(rows.find((r) => r.key === "labor")!.actual).toBeCloseTo(p.actualEntries.filter((e) => e.category === "labor").reduce((s, e) => s + e.amount, 0), 2);
    for (const e of labor) expect(e.amount).toBeCloseTo((e.labor?.hours ?? 0) * (e.labor?.hourlyCost ?? 0), 2);
    // Una hora de Diseño cargada suma a Diseño, no a producción.
    const design: ActualEntry = { ...labor[0], id: "d1", category: "design", amount: 27_000, labor: { ...labor[0].labor!, hours: 1, hourlyCost: 27_000 } };
    const withDesign = costRows([{ ...p, actualEntries: [...p.actualEntries, design] }]);
    expect(withDesign.find((r) => r.key === "design")!.actual - rows.find((r) => r.key === "design")!.actual).toBe(27_000);
    expect(withDesign.find((r) => r.key === "labor")!.actual).toBe(rows.find((r) => r.key === "labor")!.actual);
  });
});

describe("horas presupuestadas vs reales", () => {
  it("por proyecto, mueble y rubro; lo real se filtra por período", () => {
    const p = byCode("P-1058");
    const all = hoursRows([p], "project")[0];
    expect(all.actual).toBeCloseTo(p.actualEntries.reduce((s, e) => s + (e.labor?.hours ?? 0), 0), 2);
    const furniture = hoursRows([p], "furniture");
    expect(furniture.map((r) => r.label)).toEqual(["P-1058 · Mesa de comedor", "P-1058 · Silla apilable"]);
    expect(furniture.find((r) => r.label.endsWith("Mesa de comedor"))!.deviation).toBe(14);
    const oct = hoursRows([p], "project", periodOf("month", today))[0];
    expect(oct.actual).toBeLessThanOrEqual(all.actual);
    expect(oct.budget).toBe(all.budget);
  });
});

describe("cotizaciones, carga futura y capacidad", () => {
  const opps = opportunities(seed.projects, exampleOpportunities(today));
  it("las cotizaciones de la base son oportunidades con sus horas; la probabilidad nunca se inventa", () => {
    const q = opps.find((o) => o.projectId === byCode("P-1056").id)!;
    expect(Object.values(q.hoursByRubro).reduce((s, x) => s + x, 0)).toBeGreaterThan(0);
    expect(q.probability).toBe(70);
    expect(opps.find((o) => o.ref === "Oportunidad 2")!.probability).toBeNull();
  });
  it("confirmada (aprobados) y potencial (cotizaciones) separadas; la ponderada usa solo probabilidades informadas", () => {
    const load = loadByRubro(seed.projects, opps, today, "2027-03-31", today);
    const noOpps = loadByRubro(seed.projects, [], today, "2027-03-31", today);
    expect(load.confirmed).toEqual(noOpps.confirmed);
    expect(Object.keys(noOpps.potential)).toEqual([]);
    const pot = Object.values(load.potential).reduce((s, x) => s + x, 0);
    const w = Object.values(load.weighted).reduce((s, x) => s + x, 0);
    expect(w).toBeLessThan(pot);
    // Oportunidad 2 (sin estimar) suma a potencial pero no a ponderada.
    const only2 = loadByRubro(seed.projects, opps.filter((o) => o.ref === "Oportunidad 2"), today, "2027-03-31", today);
    expect(Object.values(only2.potential).reduce((s, x) => s + x, 0)).toBeCloseTo(210, 0);
    expect(Object.values(only2.weighted)).toEqual([]);
  });
  it("aprobar una cotización pasa sus horas de potencial a confirmada", () => {
    const q = byCode("P-1056");
    const approved = seed.projects.map((p) => (p.id === q.id ? { ...p, status: "approved" as const } : p));
    const before = loadByRubro(seed.projects, opportunities(seed.projects, []), today, "2027-03-31", today);
    const after = loadByRubro(approved, opportunities(approved, []), today, "2027-03-31", today);
    const total = (r: Record<string, number>) => Object.values(r).reduce((s, x) => s + x, 0);
    expect(total(after.potential)).toBeLessThan(total(before.potential));
    expect(total(after.confirmed)).toBeGreaterThan(total(before.confirmed));
  });
  it("capacidad: cada operario una sola vez en su rubro principal", () => {
    const caps = capacityFromOperators(seed.operators, DEFAULT_MANAGEMENT_PARAMS.roleToRubro, 9.5);
    expect(caps.find((c) => c.rubro === "Carpintería madera")!.employees).toBe(2); // Carpintería + Armado
    expect(caps.reduce((s, c) => s + c.employees, 0)).toBe(seed.operators.filter((o) => o.active).length);
    expect(capacityHours(caps.find((c) => c.rubro === "Carpintería madera")!, "2026-11-02", "2026-11-06")).toBe(2 * 9.5 * 5);
    // Sofía (Diseño) trabaja de lunes a jueves.
    expect(capacityHours(caps.find((c) => c.rubro === "Diseño")!, "2026-11-02", "2026-11-06")).toBe(9.5 * 4);
  });
  it("brecha y situación por rubro; un operario dado de baja baja la capacidad", () => {
    const caps = capacityFromOperators(seed.operators, DEFAULT_MANAGEMENT_PARAMS.roleToRubro, 9.5);
    const load = { confirmed: { "Carpintería madera": 500 }, potential: { "Carpintería madera": 400 }, weighted: {} };
    const [row] = capacityRows(caps.filter((c) => c.rubro === "Carpintería madera"), load, "2026-11-01", "2026-11-30");
    expect(row.capacity).toBe(2 * 9.5 * 21);
    expect(row.gapConfirmed).toBeCloseTo(500 - 399, 2);
    expect(row.status).toBe("over");
    const fewer: Operator[] = seed.operators.map((o) => (o.id === "op-diego" ? { ...o, active: false } : o));
    expect(capacityFromOperators(fewer, DEFAULT_MANAGEMENT_PARAMS.roleToRubro, 9.5).find((c) => c.rubro === "Carpintería madera")!.employees).toBe(1);
  });
});

describe("estimaciones financieras (nunca gasto real)", () => {
  it("inflación: plazo original y atraso por separado, sin contar dos veces el mismo período", () => {
    const base = inflationLoss(1_000_000, 3, "2026-10-01", "2026-10-31");
    expect(base.originalLoss).toBeCloseTo(1_000_000 * (1 - 1 / 1.03), 0);
    expect(base.delayLoss).toBe(0);
    const late = inflationLoss(1_000_000, 3, "2026-10-01", "2026-10-31", "2026-11-30");
    expect(late.originalLoss).toBe(base.originalLoss);
    expect(late.total).toBeCloseTo(1_000_000 * (1 - 1 / 1.03 ** 2), 0);
    expect(late.originalLoss + late.delayLoss).toBeCloseTo(late.total, 2);
    expect(inflationLoss(1_000_000, 0, "2026-10-01", "2026-12-31").total).toBe(0);
  });
  it("atraso: días hábiles vencidos × equipo × jornada × tarifa; nada si está en fecha", () => {
    const late = byCode("P-1047");
    const d = delayImpact(late, today, 19_000, 9.5);
    expect(d.lateDays).toBe(2); // venció el domingo 18/10: lunes 19 y martes 20
    expect(d.amount).toBe(d.lateDays * d.crew * 9.5 * 19_000);
    expect(delayImpact(byCode("P-1058"), today, 19_000, 9.5).amount).toBe(0);
  });
});

describe("nomenclatura de proyectos", () => {
  it("OT4300_Samsung_AltoPalermo y sin duplicados", () => {
    expect(codeSlug("Alto Palermo")).toBe("AltoPalermo");
    expect(formatProjectCode("{prefijo}{numero}_{cliente}_{nombre}", { prefix: "OT", number: 4300, client: "Samsung", name: "Alto Palermo" })).toBe("OT4300_Samsung_AltoPalermo");
    expect(projectCodeError("{prefijo}{numero}", "OT4300", ["OT4300"])).toMatch(/ya existe/);
    expect(projectCodeError("{prefijo}_{cliente}", "OT_X", [])).toMatch(/numero/);
  });
});

describe("indicadores documentados en Configuración", () => {
  it("los 24 indicadores del pedido tienen significado, fórmula, fuente, parámetros, período, límites y actualización", () => {
    expect(INDICATORS).toHaveLength(24);
    for (const i of INDICATORS) for (const k of ["meaning", "formula", "source", "params", "period", "limits", "updates"] as const) expect(i[k].length).toBeGreaterThan(3);
    expect(new Set(INDICATORS.map((i) => i.id)).size).toBe(24);
  });
  it("datos de ejemplo coherentes: cada factura es de un proyecto confirmado y no supera su precio", () => {
    const sums = new Map<string, number>();
    for (const i of invoices as ClientInvoice[]) sums.set(i.projectId, (sums.get(i.projectId) ?? 0) + i.amount);
    for (const [id, total] of sums) expect(total).toBeCloseTo(seed.projects.find((p) => p.id === id)!.salesPrice, 2);
    const extra: Opportunity[] = exampleOpportunities(today);
    expect(extra.every((o) => o.probability === null || (o.probability >= 0 && o.probability <= 100))).toBe(true);
  });
});
