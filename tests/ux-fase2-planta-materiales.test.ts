// Jefe de planta: entrega de materiales y cierre del día (docs/PLANTA_MATERIALES.md). Funciones puras.
// Compra ≠ entrega ≠ consumo ≠ desperdicio ≠ sobrante reutilizable: solo consumo y desperdicio son costo.
import { describe, expect, it } from "vitest";
import { buildSeed, STAR_PROJECT_ID } from "@/lib/seed-data";
import { DEFAULT_SETTINGS as S } from "@/lib/constants";
import { actualCostToDate } from "@/lib/calculations";
import { profitOverview } from "@/lib/dashboard";
import { availableInWarehouse, availableToProject, warehouseHoldings } from "@/lib/stock";
import { closeDay, closeDayError, deliverMaterial, deliveryError, deliveryOptions, deliveryReviewAlerts, openDeliveries } from "@/lib/plant-materials";

const today = "2026-10-19";

const freshProductionState = () => {
  const seed = buildSeed(new Date(`${today}T12:00:00`));
  const star = seed.projects.find((p) => p.id === STAR_PROJECT_ID)!;
  const ctx = { actor: "Carla Sosa", now: `${today}T18:00:00Z`, today };
  return { seed, star, ctx };
};

const freshCloseDayScenario = () => {
  const { seed, star, ctx } = freshProductionState();
  const d1 = deliverMaterial(star, seed.stock, [], { projectId: star.id, itemId: "itm-mesas", materialId: "mel-blanca-18", quantity: 2, source: "warehouse", date: today }, ctx);
  const d2 = deliverMaterial(star, d1.stock, [d1.delivery], { projectId: star.id, itemId: "itm-sillas", materialId: "multilaminado-18", quantity: 4, source: "project", date: today }, ctx);
  const deliveries = [d1.delivery, d2.delivery];
  const input = {
    projectId: star.id,
    date: today,
    units: [{ itemId: "itm-mesas", units: 6 }],
    deliveries: [
      { id: d1.delivery.id, consumed: 1.25, waste: 0.25, leftover: 0.5 },
      { id: d2.delivery.id, consumed: 3, waste: 0, leftover: 0 },
    ],
  };
  const r = closeDay(star, d2.stock, deliveries, input, ctx);
  return { seed, star, ctx, d1, d2, deliveries, input, r };
};

describe("entrega de material (solo cantidades, no es costo)", () => {
  it("del depósito: baja el stock libre, sube lo asignado al proyecto, el costo real no cambia", () => {
    const { seed, star, ctx } = freshProductionState();
    const before = availableInWarehouse(seed.stock, "mel-blanca-18");
    const r = deliverMaterial(star, seed.stock, [], { projectId: star.id, itemId: "itm-mesas", operatorId: "op-juan", materialId: "mel-blanca-18", quantity: 2, source: "warehouse", date: today }, ctx);
    expect(availableInWarehouse(r.stock, "mel-blanca-18")).toBeCloseTo(before - 2, 6);
    expect(availableToProject(r.stock, star.id, "mel-blanca-18")).toBeCloseTo(2, 6);
    expect(r.change.movements.every((m) => m.kind === "assign")).toBe(true);
    expect(r.delivery).toMatchObject({ quantity: 2, source: "warehouse", itemId: "itm-mesas", operatorId: "op-juan" });
    expect(actualCostToDate(star)).toBe(actualCostToDate({ ...star }));
  });
  it("de lo asignado: sin movimiento, y no se puede entregar dos veces lo mismo", () => {
    const { seed, star, ctx } = freshProductionState();
    const r = deliverMaterial(star, seed.stock, [], { projectId: star.id, itemId: "itm-sillas", materialId: "multilaminado-18", quantity: 10, source: "project", date: today }, ctx);
    expect(r.change.movements).toEqual([]);
    expect(deliveryOptions(seed.stock, [r.delivery], star.id).find((o) => o.materialId === "multilaminado-18")?.project).toBeCloseTo(1.5, 6);
    expect(deliveryError(star, seed.stock, [r.delivery], { projectId: star.id, itemId: "itm-sillas", materialId: "multilaminado-18", quantity: 2, source: "project", date: today }, today)).toMatch(/no tiene tanto material asignado sin entregar/);
  });
  it("valida producto, cantidad, fecha y saldo del depósito", () => {
    const { seed, star } = freshProductionState();
    const base = { projectId: star.id, itemId: "itm-mesas", materialId: "perfil-alu", quantity: 1, source: "warehouse" as const, date: today };
    expect(deliveryError(star, seed.stock, [], base, today)).toBeNull();
    expect(deliveryError(star, seed.stock, [], { ...base, itemId: "x" }, today)).toMatch(/producto/);
    expect(deliveryError(star, seed.stock, [], { ...base, quantity: 0 }, today)).toMatch(/mayor a cero/);
    expect(deliveryError(star, seed.stock, [], { ...base, date: "2026-10-20" }, today)).toMatch(/futura/);
    expect(deliveryError(star, seed.stock, [], { ...base, quantity: 50 }, today)).toMatch(/No hay tanto material libre/);
    const closed = seed.projects.find((p) => p.id === "p-0987")!;
    expect(deliveryError(closed, seed.stock, [], { ...base, projectId: closed.id }, today)).toMatch(/Aprobado e Instalación/);
  });
});

describe("cierre del día", () => {
  it("consumo y desperdicio entran al costo real con el costo de su lote; el sobrante no", () => {
    const { star, seed, d1, d2, deliveries, input, r } = freshCloseDayScenario();
    const added = actualCostToDate(r.project) - actualCostToDate(star);
    const expected = r.usages.reduce((s, u) => s + (u.quantityConsumed + u.wasteQuantity) * u.unitCost, 0);
    expect(added).toBeCloseTo(expected, 2);
    expect(added).toBeGreaterThan(0);
    expect(r.usages.reduce((s, u) => s + u.quantityConsumed, 0)).toBeCloseTo(4.25, 6);
    expect(r.usages.reduce((s, u) => s + u.wasteQuantity, 0)).toBeCloseTo(0.25, 6);
  });
  it("el sobrante vuelve al depósito como lote sobrante con el mismo costo; lo no cerrado sigue en planta", () => {
    const { star, seed, d1, d2, deliveries, input, r } = freshCloseDayScenario();
    const leftover = warehouseHoldings(r.stock).filter((h) => h.lot.kind === "leftover" && h.lot.originProjectId === star.id && h.lot.materialId === "mel-blanca-18");
    expect(leftover.reduce((s, h) => s + h.quantity, 0)).toBeCloseTo(0.5, 6);
    const parent = r.stock.lots.find((l) => l.id === leftover[0].lot.parentLotId)!;
    expect(leftover[0].lot.unitCost).toBe(parent.unitCost);
    expect(availableToProject(r.stock, star.id, "multilaminado-18")).toBeCloseTo(11.5 - 3, 6);
    expect(openDeliveries(r.deliveries, star.id)).toEqual([]);
    expect(r.project.items.find((i) => i.id === "itm-mesas")?.completedUnits).toBe(6);
  });
  it("valida: más de lo entregado, negativos, entrega cerrada, unidades fuera de rango", () => {
    const { star, d1, d2, deliveries, input, r } = freshCloseDayScenario();
    expect(closeDayError(star, deliveries, { ...input, deliveries: [{ id: d1.delivery.id, consumed: 2, waste: 1, leftover: 0 }] }, today)).toMatch(/no pueden sumar más/);
    expect(closeDayError(star, deliveries, { ...input, deliveries: [{ id: d1.delivery.id, consumed: -1, waste: 0, leftover: 0 }] }, today)).toMatch(/negativas/);
    expect(closeDayError(star, r.deliveries, input, today)).toMatch(/ya está cerrada/);
    expect(closeDayError(star, deliveries, { ...input, units: [{ itemId: "itm-mesas", units: 11 }] }, today)).toBe("Las unidades terminadas van de 0 a 10.");
  });
  it("el Resumen del Administrativo cambia con el cierre (derivado de los datos)", () => {
    const { star, seed, r } = freshCloseDayScenario();
    const before = profitOverview(seed.projects, seed.assignments, today, S.dueSoonDays, S.marginWarningPp);
    const after = profitOverview(seed.projects.map((p) => (p.id === star.id ? r.project : p)), seed.assignments, today, S.dueSoonDays, S.marginWarningPp);
    const row = (o: typeof before) => o.rows.find((x) => x.project.id === star.id)!;
    expect(actualCostToDate(row(after).project)).toBeGreaterThan(actualCostToDate(row(before).project));
  });

  describe("Administrativo: 'Para revisar hoy' con costo", () => {
    it("entrega de ayer sin cierre: alerta con el valor de lo entregado y qué revisar", () => {
      const { star, seed, ctx, d1 } = freshCloseDayScenario();
      const y = deliverMaterial(star, seed.stock, [], { projectId: star.id, itemId: "itm-mesas", materialId: "mel-blanca-18", quantity: 2, source: "warehouse", date: "2026-10-18" }, ctx);
      const [a] = deliveryReviewAlerts(seed.projects, y.stock, [y.delivery], today);
      expect(a.kind).toBe("delivery_open");
      expect(a.title).toBe("Material entregado sin cierre del día desde el 18/10/2026");
      const lots = new Map(y.stock.lots.map((l) => [l.id, l.unitCost]));
      expect(a.impactAmount).toBeCloseTo(y.change.movements.reduce((s, m) => s + m.quantity * (lots.get(m.lotId) ?? 0), 0), 2);
      expect(a.action).toMatch(/Cierre del día/);
      expect(deliveryReviewAlerts(seed.projects, d1.stock, [d1.delivery], today)).toEqual([]);
    });
    it("cierre: consumido y desperdicio con su costo, sobrante que vuelve (no es costo)", () => {
      const { star, seed, r } = freshCloseDayScenario();
      const projects = seed.projects.map((p) => (p.id === star.id ? r.project : p));
      const [a] = deliveryReviewAlerts(projects, r.stock, r.deliveries, today);
      expect(a.kind).toBe("day_close");
      expect(a.level).toBe("warning");
      expect(a.title).toMatch(/^Cierre del día 19\/10\/2026: desperdicio \$ [\d.]+$/);
      expect(a.impactAmount).toBeCloseTo(actualCostToDate(r.project) - actualCostToDate(star), 2);
      expect(a.message).toMatch(/Sobrante reutilizable: 0,5 placas de Melamina blanca 18 mm, vuelve al depósito \(\$ [\d.]+, no es costo\)/);
      expect(deliveryReviewAlerts(projects, r.stock, r.deliveries, "2026-10-30")).toEqual([]);
    });
  });
});
