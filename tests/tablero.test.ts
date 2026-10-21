// Gerencia (demo integral): facturación por OT y mes, rentabilidad presupuestada / hasta hoy / final y cierre.
import { describe, expect, it } from "vitest";
import type { Ledger, Project, PurchaseOrder } from "@/types";
import { EMPTY_LEDGER, confirmHandover, registerCollection, registerSalesInvoice } from "@/lib/ledger";
import { aggregateMargin, billingByOt, billingMonths, closeCheck, profitView } from "@/lib/tablero";
import { demoData } from "@/store/use-app-store";

const ctx = { actor: "Prueba", now: "2026-10-21T12:00:00.000Z" };
const data = demoData();
const running = (): Project => data.projects.find((p) => p.status !== "quotation" && !p.isClosed && p.items.length > 0)!;
const finished = (): Project => ({ ...running(), items: running().items.map((i) => ({ ...i, completedUnits: i.quantity })) });
const emptyStock = { ...data.stock, lots: [], movements: [] };

describe("facturación por OT y por mes", () => {
  it("facturado por fecha de emisión y cobrado por fecha de ingreso, en meses distintos", () => {
    const p = running();
    let l: Ledger = registerSalesInvoice(EMPTY_LEDGER, p, { number: "F-1", date: "2026-09-28", amount: 1000 }, ctx);
    l = registerCollection(l, p, { invoiceId: l.salesInvoices[0].id, date: "2026-10-05", amount: 1000 }, ctx);
    const months = billingMonths(data.projects, l, "2026-09-01", "2026-10-31");
    expect(months.map((m) => [m.key, m.invoiced, m.collected])).toEqual([
      ["2026-09", 1000, 0],
      ["2026-10", 0, 1000],
    ]);
    const row = billingByOt(data.projects, l).find((r) => r.project.id === p.id)!;
    expect(row).toMatchObject({ invoiced: 1000, collected: 1000 });
    expect(billingByOt(data.projects, l).some((r) => r.project.status === "quotation")).toBe(false);
  });
});

describe("rentabilidad", () => {
  it("hasta hoy es PARCIAL y la final es 'No calculable' mientras el proyecto siga abierto", () => {
    const v = profitView(running(), EMPTY_LEDGER);
    expect(v.toDate.partial).toBe(true);
    expect(v.final).toBeNull();
    expect(v.finalReason).toMatch(/No calculable/);
  });

  it("cerrado con costos pendientes: la final no se calcula", () => {
    const p = { ...running(), isClosed: true, status: "completed" as const };
    const l = { ...EMPTY_LEDGER, closures: [{ projectId: p.id, date: "2026-10-21", by: "x", pendingCosts: ["OC-1 sin factura"] }] };
    expect(profitView(p, l).finalReason).toMatch(/costos pendientes/);
    expect(profitView(p, { ...l, closures: [{ ...l.closures[0], pendingCosts: [] }] }).final).not.toBeNull();
  });

  it("margen agregado = Σ ganancias / Σ contratos (no el promedio de porcentajes)", () => {
    // 10 % de 1.000 y 50 % de 100: el promedio daría 30 %; el agregado es 150 / 1.100 = 13,64 %.
    expect(aggregateMargin([{ profit: 100, contract: 1000 }, { profit: 50, contract: 100 }]).margin).toBeCloseTo(13.64, 2);
    expect(aggregateMargin([]).margin).toBeNull();
  });
});

describe("cierre", () => {
  it("bloquea sin unidades terminadas o sin la entrega real; los costos pendientes solo avisan", () => {
    const p = running();
    const order = { id: "oc", number: "OC-9", supplier: "Proveedor", status: "sent", lines: [{ projectId: p.id }] } as unknown as PurchaseOrder;
    expect(closeCheck({ ...p, items: p.items.map((i) => ({ ...i, completedUnits: 0 })) }, EMPTY_LEDGER, emptyStock, []).blockers.join(" ")).toMatch(/unidades terminadas/);
    expect(closeCheck(finished(), EMPTY_LEDGER, emptyStock, []).blockers.join(" ")).toMatch(/entrega real/);
    const l = confirmHandover(EMPTY_LEDGER, finished(), { date: "2026-10-20" }, ctx);
    const check = closeCheck(finished(), l, emptyStock, [order]);
    expect(check.blockers).toEqual([]);
    expect(check.warnings).toEqual(["OC-9 (Proveedor) sin factura del proveedor"]);
  });
});

describe("planta: material en producción entre días", () => {
  it("liberado = consumido + desperdiciado + devuelto + en producción, y lo no rendido sigue abierto", async () => {
    const { closeDay, deliveryBalance, inProduction } = await import("@/lib/plant-materials");
    const p = running();
    const d = { id: "del-1", projectId: p.id, itemId: p.items[0].id, materialId: "m", materialName: "Placa", unit: "u", quantity: 10, source: "project" as const, date: "2026-10-20", createdBy: "x", createdAt: "" };
    const ctx2 = { actor: "Jefe", now: "2026-10-21T12:00:00Z", today: "2026-10-21", carryOver: true };
    // Sin stock asignado no hay consumo real que mover: probamos solo el balance con devuelto 0 y consumo 0 → nada que rendir.
    const r = closeDay(p, emptyStock, [d], { projectId: p.id, date: "2026-10-21", units: [{ itemId: p.items[0].id, units: 0 }], deliveries: [] }, ctx2);
    expect(r.deliveries[0].closedAt).toBeUndefined();
    const half = { ...d, consumed: 4, waste: 1, leftover: 2 };
    expect(inProduction(half)).toBe(3);
    const b = deliveryBalance(half);
    expect(b.consumed + b.waste + b.returned + b.inProduction).toBe(b.released);
  });
});

describe("capacidad semanal y mensual", () => {
  it("cada persona cuenta una vez; cambiar la jornada recalcula; potencial aparte de confirmado", async () => {
    const { capacityTimeline } = await import("@/lib/tablero");
    const { capacityFromOperators, opportunities } = await import("@/lib/gerencia");
    const ops = data.operators.filter((o) => o.active);
    const caps8 = capacityFromOperators(ops, {}, 8);
    const caps6 = capacityFromOperators(ops, {}, 6);
    expect(caps8.reduce((s, c) => s + c.employees, 0)).toBe(ops.length);
    const opps = opportunities(data.projects, []);
    const w8 = capacityTimeline(caps8, data.projects, opps, "2026-10-19", "week");
    const w6 = capacityTimeline(caps6, data.projects, opps, "2026-10-19", "week");
    expect(w8).toHaveLength(8);
    expect(w6[0].capacity).toBeCloseTo((w8[0].capacity * 6) / 8, 6);
    expect(w8[0].confirmed).toBe(w6[0].confirmed);
    expect(capacityTimeline(caps8, data.projects, opps, "2026-10-19", "month")).toHaveLength(4);
  });
});
