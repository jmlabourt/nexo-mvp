// @vitest-environment jsdom
// Pruebas de aceptación (pedido §11) sobre UN SOLO estado: el modo demostración. Cada escenario recorre la misma OT
// entre sesiones con las acciones del store, y las cifras se recomputan con los selectores puros (nunca se cargan dos
// veces). Lo visual (capturas, móvil) se prueba aparte con Playwright (e2e/demo-aceptacion.mjs).
import { beforeAll, describe, expect, it } from "vitest";
import type { SessionKey } from "@/lib/permissions";
import { useAppStore } from "@/store/use-app-store";
import { withPublishedBom } from "@/lib/bom-needs";
import { materialNeeds } from "@/lib/purchasing";
import { billingStatus, confirmHandover, confirmSupplierPayment, draftBom, paidOf, publishBom, publishedBom, registerCollection, registerInternalHours, registerSalesInvoice, saveBomDraft, setFinancialRate, setPaymentTerms, staffHoursCost, startBomDraft } from "@/lib/ledger";
import { billingByOt, billingMonths, closureOf, profitView } from "@/lib/tablero";
import { deliveryBalance, openDeliveries } from "@/lib/plant-materials";
import { quoteFinancialPct } from "@/lib/financial";
import { generalState } from "@/lib/gerencia";
import { unresolvedMaterial as projectHoldings } from "@/lib/material-flow";
import { todayISO } from "@/lib/formatting";
import { DEMO_DATA_KEY } from "@/store/demo-local";

const st = () => useAppStore.getState();
const as = (session: SessionKey, operatorId?: string) => useAppStore.setState({ currentMode: session, actingOperatorId: operatorId ?? null });
const ok = <T,>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const project = (id: string) => st().projects.find((p) => p.id === id)!;
const needsNow = () => materialNeeds(st().projects.map((p) => withPublishedBom(p, st().ledger)), st().orders, st().stock, todayISO());
const today = todayISO();

beforeAll(() => {
  window.localStorage.clear();
  useAppStore.setState({ demoLocal: false, organizationId: "org-real", projects: [] });
  st().enterLocalDemo();
});

describe("escenario de prueba", () => {
  it("al menos 5 proyectos: 2 en cotización, 2 en ejecución, 1 cerrado; sin empresa real", () => {
    const states = st().projects.map(generalState);
    expect(st().projects.length).toBeGreaterThanOrEqual(5);
    expect(states.filter((s) => s === "quotation").length).toBeGreaterThanOrEqual(2);
    expect(states.filter((s) => s === "in_progress" || s === "approved").length).toBeGreaterThanOrEqual(2);
    expect(states.filter((s) => s === "closed").length).toBeGreaterThanOrEqual(1);
    expect(st().organizationId).toBeNull();
  });
});

describe("2. cotización: aprobar congela; rechazar no es venta", () => {
  it("aprobar P-1056 guarda el presupuesto base; rechazar P-1059 con motivo no suma a la facturación", () => {
    as("administracion");
    ok(st().changeProjectStatus("p-1056", "approved"));
    expect(project("p-1056").baseline?.salesPrice).toBe(project("p-1056").salesPrice);
    ok(st().rejectQuote("p-1059", "El cliente eligió otra propuesta"));
    expect(generalState(project("p-1059"))).toBe("quotation");
    expect(billingByOt(st().projects, st().ledger).some((r) => r.project.id === "p-1059")).toBe(false);
    expect(billingByOt(st().projects, st().ledger).some((r) => r.project.id === "p-1056")).toBe(true);
  });
});

describe("3. BOM: el borrador no llega a Compras; publicar sí; republicar no toca lo emitido", () => {
  it("una nueva versión cambia lo que falta pedir y deja las órdenes como estaban", () => {
    as("administracion");
    const p = project("p-1051");
    const item = p.items[0];
    const v1 = publishedBom(st().ledger, p.id, item.id)!;
    const line = v1.lines[0];
    const need = () => needsNow().find((n) => n.projectId === p.id && n.lineId === line.budgetLineId)!;
    const before = need().needed;
    const ordersBefore = JSON.stringify(st().orders);
    ok(st().recordLedger(["administracion"], (l, ctx) => startBomDraft(l, p, item.id, ctx)));
    const draft = draftBom(st().ledger, p.id, item.id)!;
    ok(st().recordLedger(["administracion"], (l) => saveBomDraft(l, draft.id, draft.lines.map((x, i) => (i === 0 ? { ...x, quantity: x.quantity + 3 } : x)))));
    expect(need().needed).toBe(before); // borrador: Compras sigue con la v1
    ok(st().recordLedger(["administracion"], (l, ctx) => publishBom(l, draft.id, ctx)));
    expect(publishedBom(st().ledger, p.id, item.id)!.version).toBe(2);
    expect(need().needed).toBe(before + 3);
    expect(JSON.stringify(st().orders)).toBe(ordersBefore);
  });
});

describe("4. Compras: una OC para dos OT, recepción parcial, factura; el pago de Gerencia no toca las ventas", () => {
  it("cada línea va a su OT; lo recibido entra como lote; pagar no cambia facturado ni cobrado", () => {
    as("compras");
    const needs = needsNow().filter((n) => n.toBuy > 0 && (n.projectId === "p-1051" || n.projectId === "p-1053"));
    const a = needs.find((n) => n.projectId === "p-1051")!;
    const b = needs.find((n) => n.projectId === "p-1053")!;
    const lotsBefore = st().stock.lots.length;
    const id = ok(
      st().saveOrder({
        supplier: "Maderas del Sur",
        date: today,
        lines: [a, b].map((n) => ({ projectId: n.projectId, budgetLineId: n.lineId, materialId: n.materialId, materialName: n.description, unit: n.unit, quantity: n.toBuy, unitCost: n.estimatedUnitCost || 1 })),
      }),
    );
    ok(st().sendOrder(id));
    const order = () => st().orders.find((o) => o.id === id)!;
    const half = Math.round((order().lines[0].quantity / 2) * 100) / 100;
    ok(st().receiveOrder(id, [{ lineId: order().lines[0].id, quantity: half }]));
    expect(order().received).toBe("partial");
    expect(st().stock.lots.length).toBe(lotsBefore + 1);
    const total = order().lines.reduce((s, l) => s + l.quantity * l.unitCost, 0);
    ok(st().invoiceOrder(id, { invoiceNumber: "A-0001-00001234", invoiceAmount: Math.round(total * 100) / 100, invoiceDate: today }));
    expect(order().status).toBe("invoiced");
    expect(project("p-1051").purchaseEntries.some((e) => e.supplier === "Maderas del Sur")).toBe(true);
    expect(project("p-1053").purchaseEntries.some((e) => e.supplier === "Maderas del Sur")).toBe(true);

    as("gerencia");
    const sales = billingStatus(project("p-1051"), st().ledger);
    ok(st().recordLedger(["gerencia"], (l, ctx) => confirmSupplierPayment(l, order(), { date: today, amount: order().invoiceAmount!, reference: "Transferencia 991" }, ctx)));
    expect(paidOf(st().ledger, id)).toBe(order().invoiceAmount);
    expect(billingStatus(project("p-1051"), st().ledger)).toEqual(sales);
    // Compras no paga.
    as("compras");
    expect(st().recordLedger(["gerencia"], (l) => l).ok).toBe(false);
  });
});

describe("5. Planta: reservar, liberar, rendir y dejar parte en producción de un día a otro", () => {
  it("liberado = consumido + desperdiciado + devuelto + en producción; nada se consume solo", () => {
    as("jefe_planta");
    const p = project("p-1051");
    const held = projectHoldings(st().stock, p.id)[0]; // lo recibido para la OT queda reservado al proyecto
    expect(held).toBeTruthy();
    const usagesBefore = project(p.id).materialUsages.length;
    ok(st().deliverMaterial({ projectId: p.id, itemId: p.items[0].id, materialId: held.lot.materialId, quantity: 2, source: "project", date: today }));
    expect(project(p.id).materialUsages.length).toBe(usagesBefore); // liberar no es consumir
    const d = () => openDeliveries(st().deliveries, p.id)[0];
    ok(st().closeDay({ projectId: p.id, date: today, units: [], deliveries: [{ id: d().id, consumed: 1, waste: 0.25, leftover: 0.25 }] }));
    const after = deliveryBalance(d());
    expect(after).toEqual({ released: 2, consumed: 1, waste: 0.25, returned: 0.25, inProduction: 0.5 });
    expect(after.consumed + after.waste + after.returned + after.inProduction).toBe(after.released);
    const usages = project(p.id).materialUsages.slice(usagesBefore);
    expect(usages.reduce((s, u) => s + u.quantityConsumed + u.wasteQuantity, 0)).toBe(1.25);
    expect(usages.every((u) => u.unitCost === held.lot.unitCost)).toBe(true); // costo del lote
    // Al día siguiente se rinde lo que quedaba en producción.
    const id = d().id;
    ok(st().closeDay({ projectId: p.id, date: today, units: [], deliveries: [{ id, consumed: 0.5, waste: 0, leftover: 0 }] }));
    expect(st().deliveries.find((x) => x.id === id)!.closedAt).toBeTruthy();
  });
});

describe("6. Horas de todos los roles", () => {
  it("operario 8 h; Jefe corrige 3 h a A y 5 h a B con historial; diseño 3 h a la OT y 2 h internas; Gerencia no carga", () => {
    as("jefe_planta");
    const op = st().operators.find((o) => o.active)!;
    const A = project("p-1051");
    const B = project("p-1053");
    const asgA = ok(st().saveAssignment({ projectId: A.id, itemId: A.items[0].id, rubro: A.items[0].rubros[0].rubro, operatorId: op.id, date: today, plannedHours: 4 }));
    const asgB = ok(st().saveAssignment({ projectId: B.id, itemId: B.items[0].id, rubro: B.items[0].rubros[0].rubro, operatorId: op.id, date: today, plannedHours: 4 }));
    // El operario solo ve sus tareas y carga 8 h en la primera.
    as("operario", op.id);
    const hoursOf = (pid: string) => project(pid).actualEntries.filter((e) => e.operatorId === op.id && e.date === today && e.labor).reduce((s, e) => s + (e.labor?.hours ?? 0), 0);
    const costOf = (pid: string) => project(pid).actualEntries.filter((e) => e.operatorId === op.id && e.date === today && e.labor).reduce((s, e) => s + e.amount, 0);
    const baseA = hoursOf(A.id);
    const baseB = hoursOf(B.id);
    const baseCostA = costOf(A.id);
    const baseCostB = costOf(B.id);
    ok(st().logHours(A.id, { assignmentId: asgA, hours: 8, confirmHighHours: true }));
    const entry = project(A.id).actualEntries.find((e) => e.assignmentId === asgA && e.labor?.hours === 8)!;
    const cost8 = entry.amount;
    as("jefe_planta");
    ok(st().correctHoursLocal({ entryId: entry.id, reason: "Trabajó la tarde en la OT B", allocations: [{ assignmentId: asgA, hours: 3 }, { assignmentId: asgB, hours: 5 }] }));
    expect(hoursOf(A.id) - baseA).toBe(3);
    expect(hoursOf(B.id) - baseB).toBe(5);
    // El costo se reparte en la misma proporción y el total no cambia (sin duplicar).
    expect(costOf(A.id) - baseCostA).toBeCloseTo((cost8 * 3) / 8, 1);
    expect(costOf(B.id) - baseCostB).toBeCloseTo((cost8 * 5) / 8, 1);
    expect(costOf(A.id) - baseCostA + costOf(B.id) - baseCostB).toBeCloseTo(cost8, 1);
    expect(project(B.id).activity.at(-1)?.message).toMatch(/Trabajó la tarde en la OT B/);

    as("administracion");
    const person = "Diseño (prueba)";
    ok(st().recordLedger(["administracion"], (l, ctx) => registerInternalHours(l, { employeeId: person, projectId: A.id, date: today, hours: 3, task: "Planos", hourlyCost: 10_000 }, ctx)));
    ok(st().recordLedger(["administracion"], (l, ctx) => registerInternalHours(l, { employeeId: person, date: today, hours: 2, task: "Orden del estudio" }, ctx)));
    expect(staffHoursCost(st().ledger, A.id)).toBe(30_000);
    const internal = st().ledger.internalHours.filter((h) => h.employeeId === person && !h.projectId);
    expect(internal.map((h) => h.hours)).toEqual([2]);
    // Las 2 h internas no van a ninguna OT: la suma imputada a proyectos sigue siendo solo las 3 h.
    expect(st().projects.reduce((s, p) => s + staffHoursCost(st().ledger, p.id), 0)).toBe(30_000);
    // Compras y Jefe registran las suyas; Gerencia no puede.
    as("compras");
    ok(st().recordLedger(["administracion", "compras", "jefe_planta"], (l, ctx) => registerInternalHours(l, { employeeId: "Compras", date: today, hours: 1, task: "Pedidos" }, ctx)));
    as("jefe_planta");
    ok(st().recordLedger(["administracion", "compras", "jefe_planta"], (l, ctx) => registerInternalHours(l, { employeeId: "Jefe", projectId: B.id, date: today, hours: 1, task: "Control", hourlyCost: 1 }, ctx)));
    as("gerencia");
    expect(st().recordLedger(["administracion", "compras", "jefe_planta"], (l, ctx) => registerInternalHours(l, { employeeId: "Gerencia", date: today, hours: 1, task: "x" }, ctx)).ok).toBe(false);
  });
});

describe("7. Dashboard de Gerencia: facturas, cobros y condiciones en distintas fechas", () => {
  it("por OT, por mes y total, sin duplicar; la rentabilidad de hoy es parcial y no definitiva", () => {
    as("gerencia");
    const p = project("p-1056");
    ok(st().recordLedger(["gerencia"], (l) => setPaymentTerms(l, { projectId: p.id, daysAfterDelivery: 30, schedule: [{ id: "", label: "Seña", amount: 1_000_000, date: "2026-11-15" }] })));
    ok(st().recordLedger(["gerencia"], (l, ctx) => registerCollection(l, p, { date: "2026-09-30", amount: 500_000 }, ctx))); // anticipo
    ok(st().recordLedger(["gerencia"], (l, ctx) => registerSalesInvoice(l, p, { number: "B-0001-00000777", date: "2026-10-02", amount: 2_000_000 }, ctx)));
    const b = billingStatus(project(p.id), st().ledger);
    expect(b).toMatchObject({ invoiced: 2_000_000, collected: 500_000, advances: 500_000, planned: 1_000_000 });
    const months = billingMonths(st().projects, st().ledger, "2026-09-01", "2026-11-30").map((m) => [m.key, m.invoiced, m.collected, m.planned]);
    const sep = months.find((m) => m[0] === "2026-09")!;
    const oct = months.find((m) => m[0] === "2026-10")!;
    const nov = months.find((m) => m[0] === "2026-11")!;
    expect(sep[2]).toBeGreaterThanOrEqual(500_000);
    expect(oct[1]).toBeGreaterThanOrEqual(2_000_000);
    expect(nov[3]).toBeGreaterThanOrEqual(1_000_000);
    const total = billingByOt(st().projects, st().ledger).reduce((s, r) => s + r.collected, 0);
    const all = st().ledger.collections.filter((c) => generalState(project(c.projectId)) !== "quotation").reduce((s, c) => s + c.amount, 0);
    expect(total).toBeCloseTo(all, 2); // cada cobro una sola vez
    const v = profitView(project("p-1051"), st().ledger);
    expect(v.toDate.partial).toBe(true);
    expect(v.final).toBeNull();
  });
});

describe("9. Gasto financiero desde Configuración", () => {
  it("la tasa de Gerencia se usa en el cotizador: 5 % mensual, 30 + 30 días → 10 % ($100.000 sobre $1.000.000)", () => {
    as("gerencia");
    ok(st().recordLedger(["gerencia"], (l) => setFinancialRate(l, 5)));
    const r = quoteFinancialPct({ startDate: "2026-11-01", deliveryDate: "2026-12-01", daysAfterDelivery: 30, seniaPct: 0, installments: 1 }, st().ledger.financialMonthlyRatePct);
    expect(r.ok && (1_000_000 * r.amount) / 100).toBe(100_000);
  });
});

describe("10. Entrega y cierre", () => {
  it("bloquea con material en producción; con todo rendido Gerencia cierra aun con costos pendientes y la final queda incompleta", () => {
    const p = project("p-1058");
    as("jefe_planta");
    for (const i of p.items) ok(st().setCompletedUnits(p.id, i.id, i.quantity));
    ok(st().recordLedger(["jefe_planta"], (l, ctx) => confirmHandover(l, project(p.id), { date: today }, ctx)));
    // Material liberado y sin rendir: bloquea.
    const held = projectHoldings(st().stock, p.id)[0];
    if (held) ok(st().deliverMaterial({ projectId: p.id, itemId: p.items[0].id, materialId: held.lot.materialId, quantity: Math.min(1, held.quantity), source: "project", date: today }));
    as("gerencia");
    const blocked = st().closeProject(p.id);
    expect(blocked.ok).toBe(false);
    // El Jefe rinde todo y Gerencia devuelve al depósito lo que no se usó.
    as("jefe_planta");
    for (const d of openDeliveries(st().deliveries, p.id)) ok(st().closeDay({ projectId: p.id, date: today, units: [], deliveries: [{ id: d.id, consumed: d.quantity - (d.consumed ?? 0), waste: 0, leftover: 0 }] }));
    as("gerencia");
    for (const h of projectHoldings(st().stock, p.id)) ok(st().releaseStock({ projectId: p.id, lotId: h.lot.id, materialId: h.lot.materialId, materialName: h.lot.materialName, unit: h.lot.unit, quantity: h.quantity, date: today }));
    const r = st().closeProject(p.id);
    if (!r.ok) throw new Error(r.error);
    expect(project(p.id).isClosed).toBe(true);
    const closure = closureOf(st().ledger, p.id)!;
    expect(closure.pendingCosts.length).toBeGreaterThan(0); // OC-0003 sin factura
    expect(profitView(project(p.id), st().ledger).final).toBeNull();
  });
});

describe("11. Persistencia de la demo", () => {
  it("recargar conserva todo; restaurar vuelve al escenario coherente", () => {
    const snapshot = JSON.stringify({ projects: st().projects, ledger: st().ledger, orders: st().orders, deliveries: st().deliveries });
    expect(window.localStorage.getItem(DEMO_DATA_KEY)).toBeTruthy();
    // "Recarga": se pierde la memoria y se vuelve a abrir desde el navegador.
    useAppStore.setState({ demoLocal: false, projects: [], orders: [], deliveries: [] });
    st().enterLocalDemo();
    expect(JSON.stringify({ projects: st().projects, ledger: st().ledger, orders: st().orders, deliveries: st().deliveries })).toBe(snapshot);
    st().restoreLocalDemo();
    expect(project("p-1058").isClosed).toBe(false);
    expect(project("p-1059").activity.some((a) => a.kind === "rejected")).toBe(false);
    expect(st().organizationId).toBeNull();
  });
});
