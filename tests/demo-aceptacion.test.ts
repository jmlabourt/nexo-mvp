// Los 20 recorridos de aceptación (§14) sobre el escenario base de la demo, con las mismas operaciones que usan las
// pantallas. Cada caso: acción → registros → efecto en otra sesión → resultado.
import { describe, expect, it } from "vitest";
import type { SessionKey } from "@/lib/permissions";
import type { CoreWorld, OpCtx } from "@/lib/core/types";
import * as op from "@/lib/core/ops";
import { buildDemoWorld } from "@/lib/core/seed";
import { adminPending, comprasAlerts, gerenciaAlerts, plantaAlerts } from "@/lib/core/alerts";
import { closeCheck } from "@/lib/core/closing";
import { collectedOf, pendingAt } from "@/lib/core/contract";
import { costEntry } from "@/lib/core/hours";
import { economics, laborCosts, materialCosts, updatedFinancial } from "@/lib/core/economics";
import { budgetLinesOf, enabledRubros, needRowsOf, publishedBom } from "@/lib/core/needs";
import { lineReceived, paidByProject } from "@/lib/core/orders";
import { allItemsDone, itemState, myDayTasks, releaseBalance } from "@/lib/core/plant";
import { asg, FREE, qtyAt } from "@/lib/core/stock";
import { dashboardCards, collectedByProject, collectionSeries, marginComparison } from "@/lib/core/dashboard";
import { quoteTotals } from "@/lib/core/quote";
import { CoreError } from "@/lib/core/util";

const PERSON: Record<SessionKey, string> = { gerencia: "emp-01", administracion: "emp-02", compras: "emp-04", jefe_planta: "emp-05", operario: "emp-06" };
const ctx = (w: CoreWorld, session: SessionKey, actorId = PERSON[session]): OpCtx => ({ session, actor: w.employees.find((e) => e.id === actorId)!.name, actorId, now: "2026-10-20T15:00:00.000Z", today: w.config.asOf });
const need = (w: CoreWorld, pid: string, mid: string) => needRowsOf(w, w.projects.find((p) => p.id === pid)!).find((n) => n.materialId === mid)!;
const proj = (w: CoreWorld, id: string) => w.projects.find((p) => p.id === id)!;

/** Cotización mínima aprobable para una OT nueva (un mueble, dos rubros). */
function newApprovedProject(w0: CoreWorld): [string, CoreWorld] {
  const [pid, created] = op.createProject(w0, { clientId: "cli-03", description: "Vitrina de prueba", startDate: "2026-10-26", dueDate: "2026-11-20", items: [{ name: "Vitrina", quantity: 2 }] }, ctx(w0, "administracion"));
  let w = created;
  const it = proj(w, pid).items[0].id;
  const q = proj(w, pid).quote;
  w = op.saveQuote(w, pid, {
    items: proj(w, pid).items,
    quote: {
      ...q,
      lines: [
        { id: "t1", itemId: it, rubroId: "rb-carp", kind: "material", materialId: "mat-mdf", quantity: 4, unit: "placa", unitCost: 62000 },
        { id: "t2", itemId: it, rubroId: "rb-carp", kind: "labor", quantity: 20, unit: "h", unitCost: 8500 },
        { id: "t3", itemId: it, rubroId: "rb-pint", kind: "labor", quantity: 6, unit: "h", unitCost: 8000 },
      ],
      plan: [{ id: "c1", label: "Seña", pct: 50, date: "2026-10-22" }, { id: "c2", label: "Saldo", pct: 50, date: "2026-11-25" }],
    },
  }, ctx(w, "administracion"));
  w = op.approveQuote(w, pid, ctx(w, "administracion"));
  return [pid, w];
}

describe("§14 · recorridos de aceptación", () => {
  it("1 · cliente nuevo → OT automática única, visible para todas las sesiones", () => {
    const w0 = buildDemoWorld();
    const [cid, w1] = op.upsertClient(w0, { name: "Panadería Las Tres Espigas" }, ctx(w0, "administracion"));
    const [pid, w2] = op.createProject(w1, { clientId: cid, description: "Mostrador y estantes", startDate: "2026-11-02", dueDate: "2026-12-01", items: [{ name: "Mostrador", quantity: 1 }] }, ctx(w1, "administracion"));
    const p = proj(w2, pid);
    expect(p.ot).toBe("OT4312_PanaderiaTres_MostradorEstantes");
    expect(new Set(w2.projects.map((x) => x.ot)).size).toBe(w2.projects.length);
    expect(() => op.createProject(w2, { clientId: "cli-inexistente", description: "x y z", startDate: "2026-11-02", dueDate: "2026-12-01", items: [] }, ctx(w2, "administracion"))).toThrow(CoreError);
    // Borrar la cotización no libera el número.
    const w3 = op.deleteQuote(w2, pid, ctx(w2, "administracion"));
    const [, w4] = op.createProject(w3, { clientId: cid, description: "Otra", startDate: "2026-11-02", dueDate: "2026-12-01", items: [] }, ctx(w3, "administracion"));
    expect(w4.projects[0].otNumber).toBe(4313);
  });

  it("2 · cotizar un mueble con dos rubros → aprobar congela la cotización → BOM pendiente en Administración", () => {
    const [pid, w] = newApprovedProject(buildDemoWorld());
    const p = proj(w, pid);
    expect(p.status).toBe("approved");
    expect(p.baseline!.lines.length).toBe(3);
    // Precio = costo / (1 − m): materiales 248.000/(1 − 30 %) y horas (170.000 + 48.000)/(1 − 40 %).
    const t = quoteTotals(p.quote, p, 4);
    expect(t.materialsPrice).toBeCloseTo(248000 / 0.7, 2);
    expect(t.laborPrice).toBeCloseTo(218000 / 0.6, 2);
    expect(adminPending(w, w.config.asOf).bom.map((x) => x.id)).toContain(pid);
    expect(() => op.saveQuote(w, pid, { items: p.items, quote: p.quote }, ctx(w, "administracion"))).toThrow("congelada");
  });

  it("3 · BOM desde las líneas de ese mueble, cambio de cantidad, publicar → Compras con la necesidad correcta", () => {
    const [pid, approved] = newApprovedProject(buildDemoWorld());
    let w = op.saveBomDraft(approved, pid, null, ctx(approved, "administracion"));
    const draft = w.boms.find((b) => b.projectId === pid)!;
    expect(draft.lines.map((l) => [l.materialId, l.quantity])).toEqual([["mat-mdf", 4]]);
    w = op.saveBomDraft(w, pid, draft.lines.map((l) => ({ ...l, quantity: 5 })), ctx(w, "administracion"));
    expect(needRowsOf(w, proj(w, pid))).toEqual([]); // el borrador no llega a Compras
    w = op.publishBom(w, pid, ctx(w, "administracion"));
    expect(proj(w, pid).status).toBe("purchasing");
    expect(need(w, pid, "mat-mdf").toRegister).toBe(5);
  });

  it("4 · asignar 2 libres a una OT que necesita 5 → libre −2, OT +2, por comprar 3, pasa sola a Producción", () => {
    let w = buildDemoWorld();
    expect(qtyAt(w, FREE, "mat-mdf")).toBe(2);
    expect(need(w, "ot-4307", "mat-mdf").toRegister).toBe(5);
    w = op.assignStock(w, { materialId: "mat-mdf", projectId: "ot-4307", quantity: 2 }, ctx(w, "compras"));
    expect(qtyAt(w, FREE, "mat-mdf")).toBe(0);
    expect(qtyAt(w, asg("ot-4307"), "mat-mdf")).toBe(2);
    expect(need(w, "ot-4307", "mat-mdf").toRegister).toBe(3);
    expect(proj(w, "ot-4307").status).toBe("production");
    expect(proj(w, "ot-4307").activity[0]).toMatchObject({ kind: "status", auto: true, to: "production" });
    // OC por los 3: pendiente de registrar 0, pendiente de recibir 3.
    const [, w2] = op.registerOrder(w, { supplierId: "prov-01", date: "2026-10-20", expectedDate: "2026-10-23", lines: [{ projectId: "ot-4307", materialId: "mat-mdf", quantity: 3, unitPrice: 63000 }] }, ctx(w, "compras"));
    expect(need(w2, "ot-4307", "mat-mdf")).toMatchObject({ toRegister: 0, pendingReceipt: 3 });
  });

  it("5 · OC para dos OTs, recepción parcial → cada línea a su OT, neteo y precio por lote", () => {
    let w = buildDemoWorld();
    const [oid, w1] = op.registerOrder(w, { supplierId: "prov-03", date: "2026-10-20", expectedDate: "2026-10-22", lines: [{ projectId: "ot-4306", materialId: "mat-pol", quantity: 7, unitPrice: 25500 }, { projectId: "ot-4305", materialId: "mat-pol", quantity: 2, unitPrice: 25500 }] }, ctx(w, "compras"));
    w = w1;
    const o = w.orders.find((x) => x.id === oid)!;
    w = op.receiveMaterials(w, oid, { date: "2026-10-20", lines: [{ lineId: o.lines[0].id, quantity: 4 }, { lineId: o.lines[1].id, quantity: 2 }] }, ctx(w, "compras"));
    expect(qtyAt(w, asg("ot-4306"), "mat-pol")).toBe(4);
    expect(qtyAt(w, asg("ot-4305"), "mat-pol")).toBe(2);
    expect(need(w, "ot-4306", "mat-pol")).toMatchObject({ assigned: 4, pendingReceipt: 3, toRegister: 0, uncovered: 3 });
    expect(need(w, "ot-4305", "mat-pol")).toMatchObject({ assigned: 2, pendingReceipt: 0, toRegister: 0 });
    expect(w.lots.filter((l) => l.orderId === oid).every((l) => l.unitCost === 25500)).toBe(true);
  });

  it("6 · revertir una recepción indebida recupera saldos; se bloquea si el material ya se usó", () => {
    let w = buildDemoWorld();
    const [oid, w1] = op.registerOrder(w, { supplierId: "prov-01", date: "2026-10-20", lines: [{ projectId: "ot-4306", materialId: "mat-mdf", quantity: 3, unitPrice: 63000 }] }, ctx(w, "compras"));
    w = op.receiveMaterials(w1, oid, { date: "2026-10-20", lines: [{ lineId: w1.orders.find((o) => o.id === oid)!.lines[0].id, quantity: 3 }] }, ctx(w1, "compras"));
    expect(need(w, "ot-4306", "mat-mdf").toRegister).toBe(0);
    const rec = w.receipts.at(-1)!;
    const reverted = op.reverseReceipt(w, rec.id, "Era de otra OC", ctx(w, "compras"));
    expect(qtyAt(reverted, asg("ot-4306"), "mat-mdf")).toBe(0);
    expect(lineReceived(reverted, rec.lineId)).toBe(0);
    expect(need(reverted, "ot-4306", "mat-mdf")).toMatchObject({ pendingReceipt: 3, toRegister: 0 });
    // Con parte entregada a producción, no se puede revertir.
    const [, w2] = op.releaseMaterial(w, { projectId: "ot-4306", itemId: proj(w, "ot-4306").items[0].id, rubroId: "rb-carp", materialId: "mat-mdf", quantity: 1 }, ctx(w, "jefe_planta"));
    expect(() => op.reverseReceipt(w2, rec.id, "Era de otra OC", ctx(w2, "compras"))).toThrow("corregí primero");
    // En el escenario base ya hay una recepción revertida (OC-0020).
    expect(buildDemoWorld().receipts.filter((r) => r.reversal).length).toBe(1);
  });

  it("7 · Planta planifica un rubro válido; uno no cotizado no aparece y la regla lo rechaza", () => {
    const w = buildDemoWorld();
    const p = proj(w, "ot-4306");
    const barra = p.items[0].id;
    expect(enabledRubros(w, p, barra)).toEqual(["rb-carp", "rb-pint"]);
    const [, w1] = op.savePlan(w, { projectId: p.id, itemId: barra, rubroId: "rb-carp", date: "2026-10-27", hours: 6 }, ctx(w, "jefe_planta"));
    expect(w1.plans.length).toBe(w.plans.length + 1);
    expect(() => op.savePlan(w, { projectId: p.id, itemId: barra, rubroId: "rb-herr", date: "2026-10-27", hours: 6 }, ctx(w, "jefe_planta"))).toThrow("no está cotizado");
  });

  it("8 · Planta pide un rubro nuevo → Administración lo agrega como adicional sin tocar la cotización → recién ahí se planifica", () => {
    let w = buildDemoWorld();
    const req = w.rubroRequests.find((r) => r.status === "open")!; // OT4305 · Mostrador · Armado y montaje
    const before = JSON.stringify(proj(w, req.projectId).baseline);
    expect(() => op.savePlan(w, { projectId: req.projectId, itemId: req.itemId, rubroId: req.rubroId, date: "2026-10-22", hours: 3 }, ctx(w, "jefe_planta"))).toThrow(CoreError);
    expect(() => op.addAdditional(w, { projectId: req.projectId, itemId: req.itemId, rubroId: req.rubroId, hours: 6, hourlyCost: 8000, materials: [], requestId: req.id }, ctx(w, "jefe_planta"))).toThrow("sesión");
    const [, w1] = op.addAdditional(w, { projectId: req.projectId, itemId: req.itemId, rubroId: req.rubroId, hours: 6, hourlyCost: 8000, materials: [{ materialId: "mat-tor", quantity: 1, unitCost: 5500 }], requestId: req.id }, ctx(w, "administracion"));
    w = w1;
    expect(JSON.stringify(proj(w, req.projectId).baseline)).toBe(before);
    expect(w.rubroRequests.find((r) => r.id === req.id)!.status).toBe("approved");
    const [, w2] = op.savePlan(w, { projectId: req.projectId, itemId: req.itemId, rubroId: req.rubroId, date: "2026-10-22", hours: 3 }, ctx(w, "jefe_planta"));
    expect(w2.plans.length).toBe(w.plans.length + 1);
    // El BOM nuevo con el material del adicional alimenta Compras.
    let w3 = op.saveBomDraft(w2, req.projectId, null, ctx(w2, "administracion"));
    const d = w3.boms.find((b) => b.projectId === req.projectId && b.status === "draft")!;
    w3 = op.saveBomDraft(w3, req.projectId, [...d.lines, { itemId: req.itemId, rubroId: req.rubroId, materialId: "mat-tor", quantity: 1 }], ctx(w3, "administracion"));
    w3 = op.publishBom(w3, req.projectId, ctx(w3, "administracion"));
    expect(need(w3, req.projectId, "mat-tor").toRegister).toBe(1);
  });

  it("9 · asignar por día → Mi día precargado → el operario carga otra tarea válida → Planta corrige → cambia el costo de la OT correcta", () => {
    let w = buildDemoWorld();
    const today = w.config.asOf;
    const tasks = myDayTasks(w, "emp-11", today);
    expect(tasks.map((t) => [t.projectId, proj(w, t.projectId).items.find((i) => i.id === t.itemId)!.name])).toEqual([["ot-4306", "Mesa"]]);
    const p = proj(w, "ot-4306");
    const barra = p.items[0].id;
    const planBefore = JSON.stringify(w.plans);
    // Trabajó 8 h en la barra (otra tarea válida de la misma OT).
    w = op.saveDayHours(w, { employeeId: "emp-11", date: today, rows: [{ projectId: p.id, itemId: barra, rubroId: "rb-carp", hours: 8 }] }, ctx(w, "operario", "emp-11"));
    const costBefore = laborCosts(w, p.id).labor.cost;
    // Rubro inventado: rechazado.
    expect(() => op.saveDayHours(w, { employeeId: "emp-11", date: today, rows: [{ projectId: p.id, itemId: barra, rubroId: "rb-tapi", hours: 8 }] }, ctx(w, "operario", "emp-11"))).toThrow("rubro permitido");
    // Planta corrige: 6 h a la barra y el resto se pasa a otra OT.
    const entry = w.timeEntries.find((t) => t.employeeId === "emp-11" && t.date === today)!;
    w = op.correctEntry(w, entry.id, { projectId: p.id, itemId: barra, rubroId: "rb-carp", hours: 6 }, ctx(w, "jefe_planta"));
    const corrected = w.timeEntries.find((t) => t.id === entry.id)!;
    expect(corrected.corrections[0]).toMatchObject({ before: { hours: 8 }, after: { hours: 6 } });
    expect(laborCosts(w, p.id).labor.cost).toBeCloseTo(costBefore - 2 * 8000, 2);
    expect(JSON.stringify(w.plans)).toBe(planBefore);
  });

  it("10 · Trabajo interno de Planta, Compras, Administración y Operario: suma horas de la persona, no costo de OT", () => {
    let w = buildDemoWorld();
    const today = w.config.asOf;
    const costs = () => w.projects.filter((p) => p.baseline).map((p) => laborCosts(w, p.id).labor.cost + laborCosts(w, p.id).staff.cost);
    const before = costs();
    for (const [session, id] of [["jefe_planta", "emp-05"], ["compras", "emp-04"], ["administracion", "emp-03"], ["operario", "emp-09"]] as Array<[SessionKey, string]>) {
      const prev = w.timeEntries.filter((t) => t.employeeId === id && t.date === today).map((t) => ({ projectId: t.projectId, itemId: t.itemId, rubroId: t.rubroId, hours: t.hours }));
      w = op.saveDayHours(w, { employeeId: id, date: today, rows: [...prev, { hours: 2, note: "Orden del depósito" }] }, ctx(w, session, id));
      expect(w.timeEntries.some((t) => t.employeeId === id && t.date === today && !t.projectId && t.hours === 2)).toBe(true);
    }
    expect(costs()).toEqual(before);
    // Nadie carga horas de otro.
    expect(() => op.saveDayHours(w, { employeeId: "emp-06", date: today, rows: [{ hours: 1 }] }, ctx(w, "compras"))).toThrow("tus propias horas");
  });

  it("11 · liberar a producción y rendir: se conserva la suma física; consumido + desperdicio costean, devuelto vuelve a stock sin costo", () => {
    let w = buildDemoWorld();
    const p = proj(w, "ot-4305");
    const silla = p.items[2].id;
    const freeBefore = qtyAt(w, FREE, "mat-tel");
    const matBefore = materialCosts(w, p.id).total;
    const [rid, w1] = op.releaseMaterial(w, { projectId: p.id, itemId: silla, rubroId: "rb-tapi", materialId: "mat-tel", quantity: 4 }, ctx(w, "jefe_planta"));
    w = op.renderRelease(w1, { releaseId: rid, consumed: 2.5, waste: 0.5, returned: 0.5 }, ctx(w1, "jefe_planta"));
    const b = releaseBalance(w, w.releases.find((r) => r.id === rid)!);
    expect(b.consumed + b.waste + b.returned + b.inProduction).toBeCloseTo(4, 6);
    expect(b.inProduction).toBe(0.5);
    expect(materialCosts(w, p.id).total).toBeCloseTo(matBefore + 3 * 28500, 2);
    expect(qtyAt(w, FREE, "mat-tel")).toBe(freeBefore + 0.5);
    expect(w.lots.find((l) => l.materialId === "mat-tel" && w.movements.some((m) => m.ref && m.kind === "return" && m.lotId === l.id))!.unitCost).toBe(28500);
    expect(() => op.renderRelease(w, { releaseId: rid, consumed: 1, waste: 0, returned: 0 }, ctx(w, "jefe_planta"))).toThrow("En producción hay 0.5");
  });

  it("12 · 3/12 sillas sigue En proceso; 12/12 Finalizado; todos los muebles terminados avisan a Gerencia", () => {
    let w = buildDemoWorld();
    const p = proj(w, "ot-4306");
    const [barra, mesa, silla] = p.items.map((i) => i.id);
    w = op.setCompletedUnits(w, p.id, silla, 3, ctx(w, "jefe_planta"));
    expect(itemState(proj(w, p.id).items[2])).toBe("in_process");
    w = op.setCompletedUnits(w, p.id, silla, 12, ctx(w, "jefe_planta"));
    expect(itemState(proj(w, p.id).items[2])).toBe("done");
    expect(() => op.setCompletedUnits(w, p.id, silla, 13, ctx(w, "jefe_planta"))).toThrow("de 0 a 12");
    expect(() => op.setCompletedUnits(w, p.id, silla, 11, ctx(w, "administracion"))).toThrow("sesión");
    w = op.setCompletedUnits(w, p.id, barra, 1, ctx(w, "jefe_planta"));
    w = op.setCompletedUnits(w, p.id, mesa, 4, ctx(w, "jefe_planta"));
    expect(allItemsDone(proj(w, p.id))).toBe(true);
    expect(gerenciaAlerts(w, w.config.asOf).some((a) => a.kind === "ready_close" && a.projectId === p.id)).toBe(true);
  });

  it("13 · cerrar con material sin rendir o sin entrega: bloqueado con alerta en Planta; rendido y entregado: Gerencia cierra", () => {
    let w = buildDemoWorld();
    const id = "ot-4303";
    expect(closeCheck(w, proj(w, id)).blockers).toEqual(["Planta tiene que rendir Tornillo 4×40 (caja de 100): 2 asignado sin usar.", "Planta tiene que rendir Melamina blanca 18 mm: 1.5 en producción sin rendir."]);
    expect(() => op.closeProject(w, id, ctx(w, "gerencia"))).toThrow("rendir");
    expect(plantaAlerts(w, w.config.asOf).some((a) => a.kind === "rendition" && a.projectId === id)).toBe(true);
    const rel = w.releases.find((r) => r.projectId === id && releaseBalance(w, r).inProduction > 0)!;
    w = op.renderRelease(w, { releaseId: rel.id, consumed: 1, waste: 0.25, returned: 0.25 }, ctx(w, "jefe_planta"));
    w = op.unassignStock(w, { materialId: "mat-tor", projectId: id, quantity: 2 }, ctx(w, "jefe_planta"));
    expect(() => op.closeProject(w, id, ctx(w, "jefe_planta"))).toThrow("sesión");
    w = op.closeProject(w, id, ctx(w, "gerencia"));
    expect(proj(w, id).status).toBe("closed");
    expect(w.closures.find((c) => c.projectId === id)!.snapshot.operatingCost).toBeGreaterThan(0);
    // OT4304 ya estaba apta.
    expect(closeCheck(buildDemoWorld(), proj(buildDemoWorld(), "ot-4304")).canClose).toBe(true);
  });

  it("14 · anticipo y cuota se suman una sola vez; baja el saldo; no hay facturas de venta", () => {
    let w = buildDemoWorld();
    const id = "ot-4308";
    expect(collectedOf(w, id)).toBe(0);
    w = op.registerIncome(w, { projectId: id, date: "2026-10-19", amount: 3532000, reference: "Seña" }, ctx(w, "gerencia"));
    w = op.registerIncome(w, { projectId: id, date: "2026-10-20", amount: 1000000, reference: "Anticipo de cuota" }, ctx(w, "gerencia"));
    expect(collectedOf(w, id)).toBe(4532000);
    expect(pendingAt(w, proj(w, id), w.config.asOf)).toBe(8830000 - 4532000);
    expect(() => op.registerIncome(w, { projectId: id, date: "2026-10-20", amount: 5000000 }, ctx(w, "gerencia"))).toThrow("Supera el contrato");
    expect(() => op.registerIncome(w, { projectId: id, date: "2026-10-25", amount: 1 }, ctx(w, "gerencia"))).toThrow("futura");
    expect(Object.keys(w)).not.toContain("salesInvoices");
  });

  it("15 · costo financiero: previsto normal al cotizar; atraso del cliente → más días de capital inmovilizado", () => {
    const w = buildDemoWorld();
    const p = proj(w, "ot-4305");
    const e = economics(w, p, w.config.asOf);
    expect(e.financialBudgetToDate).toBeCloseTo(p.baseline!.costs.financial, 2); // el previsto ya terminó (cuota del 21/09)
    expect(e.financialAdditional).toBeGreaterThan(0);
    // Si el cliente hubiera pagado la cuota en fecha, el capital se recupera y el costo financiero baja.
    const paid = op.registerIncome(w, { projectId: p.id, date: "2026-09-21", amount: 1612000, reference: "Cuota en fecha" }, ctx(w, "gerencia"));
    expect(updatedFinancial(paid, p, w.config.asOf).total).toBeLessThan(e.financialUpdated);
    // Tasa única y tramos: cada tramo = capital × 4 % × días/30.
    for (const t of updatedFinancial(w, p, w.config.asOf).tramos) expect(t.amount).toBeCloseTo((t.capital * 0.04 * t.days) / 30, 2);
    // No hay registros de sueldos pagados: las horas son un supuesto declarado.
    expect(updatedFinancial(w, p, w.config.asOf).events.some((x) => x.basis === "assumption")).toBe(true);
  });

  it("16 · un pago a proveedor de una OC multi-OT se reparte por valor de línea sin sumar costo de material", () => {
    const w = buildDemoWorld();
    const o = w.orders.find((x) => x.number === "OC-0020")!;
    const parts = paidByProject(w, o);
    expect(parts.get("ot-4306")).toBeCloseTo((700000 * 582000) / 1300000, 2);
    expect((parts.get("ot-4306") ?? 0) + (parts.get("ot-4307") ?? 0)).toBeCloseTo(700000, 2);
    const matBefore = materialCosts(w, "ot-4307").total;
    const w2 = op.registerSupplierPayment(w, { orderId: o.id, date: "2026-10-20", amount: 100000 }, ctx(w, "gerencia"));
    expect(materialCosts(w2, "ot-4307").total).toBe(matBefore);
    expect(() => op.registerSupplierPayment(w, { orderId: o.id, date: "2026-10-20", amount: 700000 }, ctx(w, "gerencia"))).toThrow("Supera lo pagable");
  });

  it("17 · una tarifa nueva desde una fecha futura no cambia las horas anteriores", () => {
    let w = buildDemoWorld();
    const old = w.timeEntries.find((t) => t.employeeId === "emp-07" && t.date === "2026-10-19" && t.projectId)!;
    const before = costEntry(w, old).cost;
    w = op.addRate(w, { kind: "employee_cost", subjectId: "emp-07", value: 9200, validFrom: "2026-11-01" }, ctx(w, "gerencia"));
    expect(costEntry(w, old).cost).toBe(before);
    // Diego: el cambio vigente desde el 01/10 ya aplica a sus horas de octubre y no a las de septiembre.
    const sep = w.timeEntries.find((t) => t.employeeId === "emp-06" && t.date === "2026-09-28")!;
    const oct = w.timeEntries.find((t) => t.employeeId === "emp-06" && t.date === "2026-10-19")!;
    expect(costEntry(w, sep).rate).toBe(8000);
    expect(costEntry(w, oct).rate).toBe(8800);
    // Horas extra: Camila el 15/10 trabajó 10 h (2 h extra × 1,5).
    const extra = w.timeEntries.find((t) => t.employeeId === "emp-07" && t.date === "2026-10-15")!;
    expect(costEntry(w, extra)).toMatchObject({ overtimeHours: 2, cost: 8500 * (10 + 2 * 0.5) });
  });

  it("18 · el filtro Desde/Hasta recalcula tarjetas y gráficos con la misma ventana", () => {
    const w = buildDemoWorld();
    const today = w.config.asOf;
    const oct = { from: "2026-10-01", to: "2026-10-31" };
    const jul = { from: "2026-07-01", to: "2026-07-31" };
    const a = dashboardCards(w, oct, today);
    const b = dashboardCards(w, jul, today);
    expect(a.cutoff).toBe(today);
    expect(b.cutoff).toBe("2026-07-31");
    expect(a.collected).toBe(collectedByProject(w, oct).reduce((s, r) => s + r.amount, 0));
    expect(b.collected).toBe(collectedByProject(w, jul).reduce((s, r) => s + r.amount, 0));
    expect(collectionSeries(w, oct).buckets.reduce((s, x) => s + x.amount, 0)).toBeCloseTo(a.collected, 2);
    expect(b.margin.projectIds).toEqual([]); // ninguna OT cerrada en julio
    expect(dashboardCards(w, { from: "2026-08-01", to: "2026-08-31" }, today).margin.projectIds).toEqual(["ot-4301"]);
    expect(marginComparison(w, jul, today).find((r) => r.projectId === "ot-4301")!.stage).toBe("partial"); // a fin de julio seguía abierta
    // Pendiente de cobrar es saldo a la fecha de corte, no movimiento del período.
    expect(b.pending).not.toBe(a.pending);
  });

  it("19 · restaurar la demo vuelve exactamente al escenario base (determinista)", () => {
    const a = buildDemoWorld();
    const b = op.upsertClient(a, { name: "Cliente temporal" }, ctx(a, "administracion"))[1];
    expect(JSON.stringify(b)).not.toBe(JSON.stringify(a));
    expect(JSON.stringify(buildDemoWorld())).toBe(JSON.stringify(a));
  });

  it("20 · Administración vuelve una OT de Producción a Compras; una nueva asignación física la devuelve a Producción y el historial guarda ambos", () => {
    let w = buildDemoWorld();
    w = op.setStatusManual(w, "ot-4306", "purchasing", ctx(w, "administracion"));
    expect(proj(w, "ot-4306").status).toBe("purchasing");
    w = op.assignStock(w, { materialId: "mat-tap", projectId: "ot-4306", quantity: 1 }, ctx(w, "compras"));
    const p = proj(w, "ot-4306");
    expect(p.status).toBe("production");
    const status = p.activity.filter((a) => a.kind === "status").slice(0, 2);
    expect(status[0]).toMatchObject({ auto: true, from: "purchasing", to: "production" });
    expect(status[1]).toMatchObject({ auto: false, from: "production", to: "purchasing" });
    expect(() => op.setStatusManual(w, "ot-4306", "closed", ctx(w, "administracion"))).toThrow("Gerencia");
  });
});

describe("otras reglas del escenario", () => {
  it("las alertas desaparecen cuando cambia el dato: asignar el stock libre saca la compra urgente de MDF de OT4307", () => {
    let w = buildDemoWorld();
    const urgent = () => comprasAlerts(w, w.config.asOf).filter((a) => a.id === "urgent:ot-4307:mat-mdf");
    expect(urgent().length).toBe(1);
    w = op.assignStock(w, { materialId: "mat-mdf", projectId: "ot-4307", quantity: 2 }, ctx(w, "compras"));
    const [, w2] = op.registerOrder(w, { supplierId: "prov-01", date: w.config.asOf, lines: [{ projectId: "ot-4307", materialId: "mat-mdf", quantity: 3, unitPrice: 63000 }] }, ctx(w, "compras"));
    w = w2;
    expect(urgent().length).toBe(0);
  });

  it("registrar la jornada asignada sin horas saca el dato pendiente de Gerencia", () => {
    let w = buildDemoWorld();
    const incomplete = () => gerenciaAlerts(w, w.config.asOf).find((a) => a.id === "incomplete:ot-4305")?.detail ?? "";
    expect(incomplete()).toContain("1 jornada asignada sin horas");
    w = op.saveDayHours(w, { employeeId: "emp-09", date: "2026-10-16", rows: [{ projectId: "ot-4305", itemId: proj(w, "ot-4305").items[2].id, rubroId: "rb-pint", hours: 4 }] }, ctx(w, "operario", "emp-09"));
    expect(incomplete()).not.toContain("jornada asignada sin horas");
  });

  it("los muebles no se reparten materiales: cada línea cotizada está atada a su mueble por id", () => {
    const w = buildDemoWorld();
    for (const p of w.projects.filter((x) => x.baseline)) for (const l of budgetLinesOf(w, p)) expect(p.items.some((i) => i.id === l.itemId)).toBe(true);
    expect(publishedBom(w, "ot-4307")!.version).toBe(2);
  });
});
