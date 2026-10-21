// Registros de la demo integral: facturación y cobros, contrato vigente, pagos a proveedores, BOM versionado,
// entrega real, horas internas, rubros, tarifas y directorios. Todo son funciones puras.
import { describe, expect, it } from "vitest";
import type { Project, PurchaseOrder } from "@/types";
import {
  EMPTY_LEDGER,
  addRate,
  addRubro,
  applyAdvance,
  billingStatus,
  bomChanges,
  confirmHandover,
  confirmSupplierPayment,
  currentContract,
  draftBom,
  hourlyCostAt,
  paidOf,
  publishBom,
  publishedBom,
  registerCollection,
  registerSalesInvoice,
  reviseContract,
  saveBomDraft,
  startBomDraft,
  unassignedMaterials,
  upsertClient,
} from "@/lib/ledger";
import { demoData } from "@/store/use-app-store";

const ctx = { actor: "Prueba", now: "2026-10-21T12:00:00.000Z" };
const base = demoData().projects;
const approved = (): Project => {
  const p = base.find((x) => x.status !== "quotation" && !x.isClosed && x.items.length > 0)!;
  return { ...p, budgetLines: p.budgetLines.map((l, i) => (l.category === "materials" ? { ...l, notes: `Mueble: ${p.items[i % p.items.length].name} × ${p.items[i % p.items.length].quantity}` } : l)) };
};
const quote = (): Project => base.find((x) => x.status === "quotation")!;

describe("facturación y cobros", () => {
  it("cotizado ≠ contratado ≠ facturado ≠ cobrado; el estado sale de los registros", () => {
    const p = { ...approved(), salesPrice: 1_000_000, baseline: undefined };
    let l = registerSalesInvoice(EMPTY_LEDGER, p, { number: "A-1", date: "2026-10-01", amount: 400_000 }, ctx);
    expect(billingStatus(p, l)).toMatchObject({ contracted: 1_000_000, invoiced: 400_000, collected: 0, pendingToInvoice: 600_000, invoicedUncollected: 400_000, status: "facturado_parcial" });
    const inv = l.salesInvoices[0].id;
    l = registerCollection(l, p, { invoiceId: inv, date: "2026-10-10", amount: 150_000 }, ctx);
    expect(billingStatus(p, l)).toMatchObject({ collected: 150_000, invoicedUncollected: 250_000, status: "cobrado_parcial" });
    expect(billingStatus(quote(), l).contracted).toBe(0);
  });

  it("un cobro no supera lo pendiente de la factura y no se repite el número", () => {
    const p = approved();
    const l = registerSalesInvoice(EMPTY_LEDGER, p, { number: "A-1", date: "2026-10-01", amount: 100 }, ctx);
    expect(() => registerCollection(l, p, { invoiceId: l.salesInvoices[0].id, date: "2026-10-02", amount: 101 }, ctx)).toThrow();
    expect(() => registerSalesInvoice(l, p, { number: "a-1", date: "2026-10-01", amount: 5 }, ctx)).toThrow(/Ya hay/);
    expect(() => registerSalesInvoice(EMPTY_LEDGER, quote(), { number: "Q", date: "2026-10-01", amount: 5 }, ctx)).toThrow(/cotización/);
  });

  it("un anticipo se aplica después a la factura sin contarse dos veces", () => {
    const p = approved();
    let l = registerCollection(EMPTY_LEDGER, p, { date: "2026-10-01", amount: 300 }, ctx);
    expect(billingStatus(p, l)).toMatchObject({ collected: 300, advances: 300, invoicedUncollected: 0 });
    l = registerSalesInvoice(l, p, { number: "B-1", date: "2026-10-05", amount: 1000 }, ctx);
    l = applyAdvance(l, l.collections[0].id, l.salesInvoices[0].id);
    expect(billingStatus(p, l)).toMatchObject({ collected: 300, advances: 0, invoicedUncollected: 700 });
    expect(l.collections).toHaveLength(1);
  });

  it("facturar de más avisa (overInvoiced) sin cambiar el contrato", () => {
    const p = { ...approved(), salesPrice: 100, baseline: undefined };
    const l = registerSalesInvoice(EMPTY_LEDGER, p, { number: "C-1", date: "2026-10-01", amount: 120 }, ctx);
    expect(billingStatus(p, l)).toMatchObject({ contracted: 100, overInvoiced: 20 });
  });
});

describe("contrato vigente", () => {
  it("la revisión con motivo cambia el vigente y conserva el original", () => {
    const p = approved();
    const original = currentContract(p, EMPTY_LEDGER);
    const l = reviseContract(EMPTY_LEDGER, p, original + 5000, "Adicional de dos estantes", ctx);
    expect(currentContract(p, l)).toBe(original + 5000);
    expect(l.contractRevisions[0]).toMatchObject({ previous: original, reason: "Adicional de dos estantes" });
    expect(() => reviseContract(EMPTY_LEDGER, p, original + 1, "", ctx)).toThrow(/motivo/);
    expect(() => reviseContract(EMPTY_LEDGER, quote(), 10, "motivo", ctx)).toThrow();
  });
});

describe("pagos a proveedores", () => {
  const order = { id: "oc-1", status: "invoiced", invoiceAmount: 500 } as PurchaseOrder;
  it("Gerencia confirma el pago sobre la factura cargada; sin factura no se paga", () => {
    const l = confirmSupplierPayment(EMPTY_LEDGER, order, { date: "2026-10-03", amount: 500, reference: "Transferencia 123" }, ctx);
    expect(paidOf(l, "oc-1")).toBe(500);
    expect(() => confirmSupplierPayment(EMPTY_LEDGER, { ...order, status: "sent", invoiceAmount: undefined } as PurchaseOrder, { date: "2026-10-03", amount: 5, reference: "x" }, ctx)).toThrow(/factura/);
  });
});

describe("BOM versionado por mueble", () => {
  it("el borrador sale de los materiales cotizados del mismo mueble; solo el publicado cuenta; republicar es otra versión", () => {
    const p = approved();
    const item = p.items[0];
    let l = startBomDraft(EMPTY_LEDGER, p, item.id, ctx);
    const draft = draftBom(l, p.id, item.id)!;
    expect(draft.lines.length).toBeGreaterThan(0);
    expect(draft.lines.every((x) => p.budgetLines.find((b) => b.id === x.budgetLineId)?.notes?.startsWith(`Mueble: ${item.name} × `))).toBe(true);
    expect(publishedBom(l, p.id, item.id)).toBeNull();
    l = publishBom(l, draft.id, ctx);
    const v1 = publishedBom(l, p.id, item.id)!;
    expect(v1.version).toBe(1);

    l = startBomDraft(l, p, item.id, ctx);
    const d2 = draftBom(l, p.id, item.id)!;
    l = saveBomDraft(l, d2.id, d2.lines.map((x, i) => (i === 0 ? { ...x, quantity: x.quantity + 2 } : x)));
    expect(publishedBom(l, p.id, item.id)!.version).toBe(1);
    l = publishBom(l, d2.id, ctx);
    expect(publishedBom(l, p.id, item.id)!.version).toBe(2);
    // La versión 1 no cambió.
    expect(l.boms.find((b) => b.id === v1.id)).toEqual(v1);
    expect(bomChanges(l, p.id, item.id)).toEqual([{ material: v1.lines[0].material, unit: v1.lines[0].unit, before: v1.lines[0].quantity, after: v1.lines[0].quantity + 2 }]);
  });

  it("los materiales sin mueble quedan 'Pendiente de asignación' (nunca se reparten)", () => {
    const p = approved();
    const loose = { ...p, budgetLines: p.budgetLines.map((l) => (l.category === "materials" ? { ...l, notes: undefined } : l)) };
    expect(unassignedMaterials(loose).length).toBe(p.budgetLines.filter((l) => l.category === "materials" && l.quantity !== null).length);
    expect(draftBom(startBomDraft(EMPTY_LEDGER, loose, loose.items[0].id, ctx), loose.id, loose.items[0].id)!.lines).toEqual([]);
  });
});

describe("entrega real al cliente", () => {
  it("solo con todas las unidades terminadas, una sola vez", () => {
    const p = approved();
    expect(() => confirmHandover(EMPTY_LEDGER, { ...p, items: p.items.map((i) => ({ ...i, completedUnits: 0 })) }, { date: "2026-10-20" }, ctx)).toThrow(/terminadas/);
    const done = { ...p, items: p.items.map((i) => ({ ...i, completedUnits: i.quantity })) };
    const l = confirmHandover(EMPTY_LEDGER, done, { date: "2026-10-20" }, ctx);
    expect(l.handovers[0]).toMatchObject({ projectId: p.id, date: "2026-10-20", by: "Prueba" });
    expect(() => confirmHandover(l, done, { date: "2026-10-21" }, ctx)).toThrow(/ya está/);
  });
});

describe("rubros, tarifas y directorios", () => {
  it("rubros de texto libre sin duplicados", () => {
    const l = addRubro(EMPTY_LEDGER, "Tapicería");
    expect(l.rubroCatalog[0]).toMatchObject({ name: "Tapicería", active: true });
    expect(() => addRubro(l, "tapiceria")).toThrow(/existe/);
  });

  it("la excepción de la persona prevalece sobre el rubro, con vigencia", () => {
    let l = addRate(EMPTY_LEDGER, { scope: "rubro", subjectId: "armado", hourlyRate: 10, validFrom: "2026-01-01" }, ctx);
    l = addRate(l, { scope: "rubro", subjectId: "armado", hourlyRate: 12, validFrom: "2026-10-01" }, ctx);
    l = addRate(l, { scope: "employee", subjectId: "op-1", hourlyRate: 15, validFrom: "2026-10-10" }, ctx);
    expect(hourlyCostAt(l, { rubroId: "armado", employeeId: "op-1", date: "2026-09-15" }, 1)).toBe(10);
    expect(hourlyCostAt(l, { rubroId: "armado", employeeId: "op-1", date: "2026-10-05" }, 1)).toBe(12);
    expect(hourlyCostAt(l, { rubroId: "armado", employeeId: "op-1", date: "2026-10-15" }, 1)).toBe(15);
    expect(hourlyCostAt(l, { rubroId: "otro", date: "2026-10-15" }, 7)).toBe(7);
  });

  it("clientes: alta y edición sin duplicar nombres", () => {
    let l = upsertClient(EMPTY_LEDGER, { name: "Estudio Uno", active: true }, ctx);
    const id = l.clients[0].id;
    l = upsertClient(l, { id, name: "Estudio Uno SRL", active: true, phone: "123" }, ctx);
    expect(l.clients).toHaveLength(1);
    expect(l.clients[0]).toMatchObject({ name: "Estudio Uno SRL", phone: "123" });
    expect(() => upsertClient(l, { name: "estudio uno srl", active: true }, ctx)).toThrow();
  });
});
