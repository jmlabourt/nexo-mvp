// Registros de la empresa (migración 20261028120000) en un Postgres real (PGlite): permisos por rol, reglas del negocio,
// aislamiento entre empresas y recorrido de ida y vuelta del escenario de la demo.
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import type { Ledger } from "@/types";
import { DEFAULT_SETTINGS } from "@/lib/constants";
import { buildSeed, STAR_PROJECT_ID } from "@/lib/seed-data";
import { workspacePayload } from "@/lib/supabase/workspace";
import { orderSeedRows } from "@/lib/supabase/mappers";
import { demoScenario } from "@/lib/demo/escenario";
import { billingStatus, currentContract, normalizeLedger, publishedBom } from "@/lib/ledger";
import { asUser, createDb, errorAs, signUp } from "./harness";

let db: PGlite;
let org = "";
let laura = ""; // Administrativo (Gerencia)
let carla = ""; // Jefe de planta
let martin = ""; // Compras
let juan = ""; // Operario
let outsider = ""; // otra empresa

const seed = buildSeed(new Date());
const QUOTE = seed.projects.find((p) => p.status === "quotation")!.id;
const CLOSED = seed.projects.find((p) => p.isClosed)!.id;
const ACTIVE = STAR_PROJECT_ID; // en producción
const ITEM = seed.projects.find((p) => p.id === ACTIVE)!.items[0].id;
const today = new Date().toISOString().slice(0, 10);

const rows = async (userId: string, sql: string, params: unknown[] = []) =>
  asUser(db, userId, async (tx) => (await tx.query<Record<string, unknown>>(sql, params)).rows);
const commit = (userId: string, p: unknown) => asUser(db, userId, (tx) => tx.query("select ledger_commit($1::jsonb)", [JSON.stringify(p)]));
const commitError = (userId: string, p: unknown) => errorAs(db, userId, (tx) => tx.query("select ledger_commit($1::jsonb)", [JSON.stringify(p)]));
const view = async (userId: string): Promise<Ledger> => {
  const [r] = await rows(userId, "select ledger_workspace() as r");
  return normalizeLedger(r.r as Partial<Ledger>);
};
const up = (...list: unknown[]) => ({ upsert: list });

beforeAll(async () => {
  db = await createDb();
  laura = await signUp(db, "laura@demo.com", "Laura Gómez");
  org = (await db.query<{ organization_id: string }>("select organization_id from organization_members where user_id = $1", [laura])).rows[0].organization_id;
  const payload = workspacePayload(org, { projects: seed.projects, operators: seed.operators, stock: seed.stock, requests: [], assignments: [], orders: [], settings: { ...DEFAULT_SETTINGS }, resolvedAlertIds: [] });
  await asUser(db, laura, (tx) => tx.query("select reset_workspace($1::jsonb)", [JSON.stringify(payload)]));
  await asUser(db, laura, (tx) => tx.query("select compras_load_orders($1::jsonb)", [JSON.stringify(orderSeedRows(seed.orders))]));
  const inv = (p: Record<string, unknown>) => asUser(db, laura, (tx) => tx.query("select admin_invite_member($1::jsonb)", [JSON.stringify(p)]));
  await inv({ email: "carla@demo.com", display_name: "Carla Sosa", role: "jefe_planta" });
  await inv({ email: "martin@demo.com", display_name: "Martín Ruiz", role: "compras" });
  await inv({ email: "juan@demo.com", display_name: "Juan Pérez", role: "operator", operator_id: "op-juan" });
  carla = await signUp(db, "carla@demo.com", "Carla");
  martin = await signUp(db, "martin@demo.com", "Martín");
  juan = await signUp(db, "juan@demo.com", "Juan");
  outsider = await signUp(db, "otra@empresa.com", "Otra Persona");
  // Esa persona crea su propia empresa (sin datos todavía).
}, 120_000);

describe("lectura por rol (ledger_workspace)", () => {
  it("empresa nueva: todo vacío y sin romper", async () => {
    const l = await view(outsider);
    expect(l.salesInvoices).toEqual([]);
    expect(l.boms).toEqual([]);
    expect(l.financialMonthlyRatePct).toBeDefined();
  });
  it("un usuario sin cuenta activa no lee nada", async () => {
    await db.query("update organization_members set deactivated_at = now() where user_id = $1", [martin]);
    const e = await errorAs(db, martin, (tx) => tx.query("select ledger_workspace()"));
    await db.query("update organization_members set deactivated_at = null where user_id = $1", [martin]);
    expect(e).toMatch(/no tiene acceso/);
  });
});

describe("Gerencia: facturación y cobros", () => {
  const inv = { id: "fv-1", projectId: ACTIVE, number: "A-0001", date: today, amount: 1000, notes: "Primera" };
  it("no se factura una cotización", async () => {
    expect(await commitError(laura, { salesInvoices: up({ ...inv, id: "fv-q", projectId: QUOTE }) })).toMatch(/cotización no se factura/);
  });
  it("registra una factura y la lee con la forma del contrato", async () => {
    await commit(laura, { salesInvoices: up(inv) });
    const l = await view(laura);
    expect(l.salesInvoices).toHaveLength(1);
    expect(l.salesInvoices[0]).toMatchObject({ id: "fv-1", projectId: ACTIVE, number: "A-0001", amount: 1000, createdBy: "Laura Gómez" });
  });
  it("no repite el número de factura", async () => {
    expect(await commitError(laura, { salesInvoices: up({ ...inv, id: "fv-2", number: " a-0001 " }) })).toMatch(/Ya hay una factura con ese número/);
  });
  it("el cobro no supera el saldo de la factura; el anticipo se aplica una sola vez", async () => {
    expect(await commitError(laura, { collections: up({ id: "cb-x", projectId: ACTIVE, invoiceId: "fv-1", date: today, amount: 1500 }) })).toMatch(/pendientes/);
    await commit(laura, { collections: up({ id: "cb-1", projectId: ACTIVE, invoiceId: "fv-1", date: today, amount: 400 }, { id: "cb-adv", projectId: ACTIVE, date: today, amount: 600 }) });
    let l = await view(laura);
    const p = seed.projects.find((x) => x.id === ACTIVE)!;
    expect(billingStatus(p, l)).toMatchObject({ invoiced: 1000, collected: 1000, advances: 600 });
    // Aplicar el anticipo a la factura: el mismo dinero, sin duplicar.
    await commit(laura, { collections: up({ id: "cb-adv", projectId: ACTIVE, invoiceId: "fv-1", date: today, amount: 600 }) });
    l = await view(laura);
    expect(billingStatus(p, l)).toMatchObject({ invoiced: 1000, collected: 1000, advances: 0, invoicedUncollected: 0 });
    // Reenviar lo mismo no duplica; pero un cobro ya aplicado no se mueve a otra factura.
    expect(await commitError(laura, { collections: up({ id: "cb-adv", projectId: ACTIVE, invoiceId: "fv-1", date: today, amount: 600 }) })).toBeNull();
    await commit(laura, { salesInvoices: up({ id: "fv-2", projectId: ACTIVE, number: "A-0002", date: today, amount: 300 }) });
    expect(await commitError(laura, { collections: up({ id: "cb-adv", projectId: ACTIVE, invoiceId: "fv-2", date: today, amount: 600 }) })).toMatch(/no se modifica/);
    expect((await view(laura)).collections.filter((c) => c.id === "cb-adv")).toHaveLength(1);
  });
  it("una cotización no tiene cobros", async () => {
    expect(await commitError(laura, { collections: up({ id: "cb-q", projectId: QUOTE, date: today, amount: 10 }) })).toMatch(/cotización no tiene cobros/);
  });
  it("Compras, Jefe y Operario no ven ni escriben facturas ni cobros", async () => {
    for (const u of [martin, carla]) {
      const l = await view(u);
      expect(l.salesInvoices).toEqual([]);
      expect(l.collections).toEqual([]);
      expect(await commitError(u, { salesInvoices: up({ ...inv, id: "fv-z", number: "Z" }) })).toMatch(/Gerencia/);
    }
    expect(await errorAs(db, juan, (tx) => tx.query("select ledger_workspace()"))).toBeNull(); // el operario lee solo rubros
    expect((await view(juan)).salesInvoices).toEqual([]);
    expect(await commitError(juan, { salesInvoices: up(inv) })).toMatch(/no tiene acceso/);
  });
  it("las tablas no se leen ni se escriben directo", async () => {
    expect(await rows(martin, "select id from sales_invoices")).toEqual([]);
    expect(await rows(carla, "select id from collections")).toEqual([]);
    expect((await rows(laura, "select id from sales_invoices")).length).toBe(2);
    expect(
      await errorAs(db, laura, (tx) => tx.query("insert into sales_invoices (organization_id, id, project_id, number, date, amount) values ($1, 'fv-d', $2, 'D', current_date, 5)", [org, ACTIVE])),
    ).toMatch(/row-level security/);
  });
});

describe("Pagos a proveedores", () => {
  it("solo sobre una orden con factura; Compras ve el estado y no paga", async () => {
    const draft = seed.orders.find((o) => o.status === "draft")!;
    const invoiced = seed.orders.find((o) => o.status === "invoiced")!;
    expect(await commitError(laura, { supplierPayments: up({ id: "pg-x", orderId: draft.id, date: today, amount: 10, reference: "TR-1" }) })).toMatch(/Primero Compras carga la factura/);
    await commit(laura, { supplierPayments: up({ id: "pg-1", orderId: invoiced.id, date: today, amount: 500, reference: "TR-1" }) });
    expect((await view(martin)).supplierPayments).toMatchObject([{ id: "pg-1", orderId: invoiced.id, amount: 500, by: "Laura Gómez" }]);
    expect((await view(carla)).supplierPayments).toEqual([]);
    expect(await commitError(martin, { supplierPayments: up({ id: "pg-2", orderId: invoiced.id, date: today, amount: 1, reference: "x" }) })).toMatch(/Gerencia/);
  });
});

describe("Contrato vigente y condiciones de pago", () => {
  it("no hay contrato en una cotización", async () => {
    expect(await commitError(laura, { contractRevisions: up({ id: "ct-q", projectId: QUOTE, next: 100, reason: "Prueba" }) })).toMatch(/En cotización se cambia el precio/);
  });
  it("la base pone el monto anterior y la hora; el original queda", async () => {
    const p = seed.projects.find((x) => x.id === ACTIVE)!;
    const original = currentContract(p, { contractRevisions: [] });
    await commit(laura, { contractRevisions: up({ id: "ct-1", projectId: ACTIVE, previous: 1, next: original + 5000, reason: "Ampliación de alcance", at: "2000-01-01T00:00:00Z" }) });
    const l = await view(laura);
    expect(l.contractRevisions).toHaveLength(1);
    expect(l.contractRevisions[0].previous).toBe(original);
    expect(l.contractRevisions[0].at.slice(0, 4)).not.toBe("2000");
    expect(currentContract(p, l)).toBe(original + 5000);
    expect(await commitError(laura, { contractRevisions: up({ id: "ct-2", projectId: ACTIVE, next: original + 5000, reason: "Igual" }) })).toMatch(/mismo monto/);
    expect(await commitError(laura, { contractRevisions: up({ id: "ct-3", projectId: ACTIVE, next: original + 1, reason: "no" }) })).toMatch(/check|motivo|violates/i);
  });
  it("es historial: no se edita ni se borra", async () => {
    await expect(db.query("update contract_revisions set next = 1")).rejects.toThrow(/historial/);
    await expect(db.query("delete from contract_revisions")).rejects.toThrow(/historial/);
  });
  it("condiciones de pago: valida las cuotas y se reemplazan", async () => {
    const terms = { projectId: ACTIVE, daysAfterDelivery: 30, schedule: [{ id: "c1", label: "Seña", amount: 100, date: "2026-11-01" }] };
    await commit(laura, { paymentTerms: up(terms) });
    await commit(laura, { paymentTerms: up({ ...terms, daysAfterDelivery: 45 }) });
    const l = await view(laura);
    expect(l.paymentTerms).toHaveLength(1);
    expect(l.paymentTerms[0].daysAfterDelivery).toBe(45);
    expect(await commitError(laura, { paymentTerms: up({ ...terms, schedule: [{ id: "c", label: "x", amount: 0, date: "2026-11-01" }] }) })).toMatch(/importe mayor a cero/);
    expect(await commitError(laura, { paymentTerms: up({ ...terms, schedule: [{ id: "c", label: "x", amount: 5, date: "mañana" }] }) })).toMatch(/fecha/);
    expect(await commitError(laura, { paymentTerms: up({ ...terms, daysAfterDelivery: -1 }) })).toMatch(/check|violates/i);
  });
});

describe("BOM por versiones", () => {
  const draft = { id: "bom-1", projectId: ACTIVE, itemId: ITEM, version: 9, status: "draft", notes: "Para Compras", lines: [{ id: "l1", material: "Multilaminado 18 mm", quantity: 12, unit: "placa" }, { id: "l2", material: "Tapacanto", quantity: 40, unit: "m" }] };
  it("no hay BOM en una cotización", async () => {
    expect(await commitError(laura, { boms: up({ ...draft, id: "bom-q", projectId: QUOTE }) })).toMatch(/BOM|mueble/);
  });
  it("el borrador solo lo ve Administración; la versión la numera la base", async () => {
    await commit(laura, { boms: up(draft) });
    const l = await view(laura);
    expect(l.boms).toHaveLength(1);
    expect(l.boms[0]).toMatchObject({ id: "bom-1", status: "draft", version: 1, notes: "Para Compras" });
    expect(l.boms[0].lines.map((x) => x.material)).toEqual(["Multilaminado 18 mm", "Tapacanto"]);
    expect((await view(martin)).boms).toEqual([]);
    expect((await view(carla)).boms).toEqual([]);
  });
  it("un solo borrador por mueble", async () => {
    expect(await commitError(laura, { boms: up({ ...draft, id: "bom-2" }) })).toMatch(/ya tiene un borrador/);
  });
  it("publicar exige materiales; Compras y el Jefe ven solo lo publicado, sin notas", async () => {
    expect(await commitError(laura, { boms: up({ id: "bom-1", projectId: ACTIVE, itemId: ITEM, status: "published", lines: [] }) })).toMatch(/no tiene materiales/);
    await commit(laura, { boms: up({ ...draft, status: "published" }) });
    for (const u of [martin, carla]) {
      const l = await view(u);
      expect(publishedBom(l, ACTIVE, ITEM)?.lines).toHaveLength(2);
      expect(l.boms[0].notes).toBeUndefined();
    }
  });
  it("lo publicado no se modifica ni se elimina; una versión nueva suma sin pisar", async () => {
    expect(await commitError(laura, { boms: up({ ...draft, lines: [{ id: "l1", material: "Otro", quantity: 1, unit: "u" }] }) })).toMatch(/publicada/);
    expect(await commitError(laura, { boms: { remove: ["bom-1"] } })).toMatch(/publicada/);
    await commit(laura, { boms: up({ ...draft, id: "bom-3", lines: [{ id: "n1", material: "Multilaminado 18 mm", quantity: 14, unit: "placa" }] }) });
    let l = await view(laura);
    expect(l.boms.map((b) => [b.id, b.version, b.status])).toEqual([["bom-1", 1, "published"], ["bom-3", 2, "draft"]]);
    // El borrador sí se puede quitar.
    await commit(laura, { boms: { remove: ["bom-3"] } });
    l = await view(laura);
    expect(l.boms.map((b) => b.id)).toEqual(["bom-1"]);
    await commit(laura, { boms: up({ ...draft, id: "bom-4", lines: [{ id: "m1", material: "Multilaminado 18 mm", quantity: 14, unit: "placa" }], status: "published" }) });
    expect((await view(martin)).boms.map((b) => [b.version, b.status])).toEqual([[1, "published"], [2, "published"]]);
  });
  it("valida las líneas", async () => {
    expect(await commitError(laura, { boms: up({ ...draft, id: "bom-5", itemId: seed.projects.find((p) => p.id === ACTIVE)!.items[1].id, lines: [{ id: "z", material: " ", quantity: 1, unit: "u" }] }) })).toMatch(/material/);
  });
});

describe("Entrega real al cliente (Jefe de planta)", () => {
  it("exige todas las unidades terminadas; la confirma el Jefe y es una sola vez", async () => {
    const h = { id: "ent-1", projectId: ACTIVE, date: today, notes: "Entregado en obra" };
    expect(await commitError(carla, { handovers: up(h) })).toMatch(/terminadas todas las unidades/);
    await db.query("update project_items set completed_units = quantity where organization_id = $1 and project_id = $2", [org, ACTIVE]);
    expect(await commitError(martin, { handovers: up(h) })).toMatch(/Jefe de planta/);
    await commit(carla, { handovers: up(h) });
    expect(await commitError(carla, { handovers: up({ ...h, id: "ent-2" }) })).toMatch(/ya está confirmada/);
    expect((await view(laura)).handovers).toMatchObject([{ id: "ent-1", projectId: ACTIVE, by: "Carla Sosa" }]);
    expect((await view(martin)).handovers).toEqual([]);
  });
  it("un proyecto cerrado no admite entrega", async () => {
    expect(await commitError(carla, { handovers: up({ id: "ent-c", projectId: CLOSED, date: today }) })).toMatch(/cerrado/);
  });
});

describe("Horas propias (Administración, Compras, Jefe)", () => {
  it("cada uno carga las suyas; la base congela el costo y solo Gerencia lo ve", async () => {
    await commit(martin, { internalHours: up({ id: "hs-1", projectId: ACTIVE, date: today, hours: 2.5, task: "Pedidos a proveedores", hourlyCost: 99999 }, { id: "hs-2", date: today, hours: 1, task: "Trabajo interno" }) });
    await commit(carla, { internalHours: up({ id: "hs-3", projectId: ACTIVE, date: today, hours: 1, task: "Control de calidad" }) });
    const mine = (await view(martin)).internalHours;
    expect(mine.map((h) => h.id)).toEqual(["hs-1", "hs-2"].sort());
    expect(mine.every((h) => h.hourlyCost === undefined)).toBe(true);
    const all = (await view(laura)).internalHours;
    expect(all).toHaveLength(3);
    const costed = all.find((h) => h.id === "hs-1")!;
    expect(costed.hourlyCost).not.toBe(99999);
    expect(all.find((h) => h.id === "hs-2")!.hourlyCost).toBeUndefined();
    // Sin tarifas cargadas, rige la inicial de la app (Administración: 27.000); con una tarifa cargada, esa.
    expect(costed.hourlyCost).toBe(27000);
    await db.query("insert into hour_rates (organization_id, id, name, hourly_rate, category, position, kind) values ($1, 'admin', 'Administración', 31000, 'admin', 2, 'admin')", [org]);
    await commit(martin, { internalHours: up({ id: "hs-5", projectId: ACTIVE, date: today, hours: 1, task: "Con tarifa cargada" }) });
    expect((await view(laura)).internalHours.find((h) => h.id === "hs-5")!.hourlyCost).toBe(31000);
  });
  it("una tarifa propia de la persona manda sobre la general, sin revalorizar lo ya cargado", async () => {
    await commit(laura, { rates: up({ id: "tr-1", scope: "employee", subjectId: martin, hourlyRate: 7777, validFrom: "2020-01-01" }) });
    await commit(martin, { internalHours: up({ id: "hs-4", projectId: ACTIVE, date: today, hours: 1, task: "Seguimiento" }) });
    const all = (await view(laura)).internalHours;
    expect(all.find((h) => h.id === "hs-4")!.hourlyCost).toBe(7777);
    expect(all.find((h) => h.id === "hs-1")!.hourlyCost).not.toBe(7777);
  });
  it("valida horas, tarea y proyecto; son historial", async () => {
    expect(await commitError(martin, { internalHours: up({ id: "hs-x", date: today, hours: 25, task: "Largo" }) })).toMatch(/check|violates/i);
    expect(await commitError(martin, { internalHours: up({ id: "hs-y", date: today, hours: 1, task: "x" }) })).toMatch(/check|violates/i);
    expect(await commitError(martin, { internalHours: up({ id: "hs-z", projectId: QUOTE, date: today, hours: 1, task: "Cotización" }) })).toMatch(/cotización/);
    expect(await commitError(martin, { internalHours: up({ id: "hs-w", projectId: CLOSED, date: today, hours: 1, task: "Cerrado" }) })).toMatch(/cerrado/);
    await expect(db.query("delete from staff_hours")).rejects.toThrow(/historial/);
  });
});

describe("Catálogo de rubros, tarifas, costos generales, tasa financiera", () => {
  it("Gerencia los maneja; el resto solo ve los rubros", async () => {
    await commit(laura, {
      rubroCatalog: up({ id: "rubro_pintura", name: "Pintura", active: true }),
      generalCosts: up({ id: "cg-1", name: "Alquiler", monthlyAmount: 500000 }),
      financialMonthlyRatePct: 7.5,
    });
    expect((await view(laura)).financialMonthlyRatePct).toBe(7.5);
    expect((await view(laura)).generalCosts).toMatchObject([{ id: "cg-1", monthlyAmount: 500000 }]);
    expect((await view(martin)).rubroCatalog).toMatchObject([{ id: "rubro_pintura", name: "Pintura" }]);
    expect((await view(juan)).rubroCatalog).toHaveLength(1);
    expect((await view(martin)).generalCosts).toEqual([]);
    expect((await view(carla)).rates).toEqual([]);
    expect(await commitError(martin, { rubroCatalog: up({ id: "r2", name: "X" }) })).toMatch(/Gerencia/);
    expect(await commitError(laura, { rubroCatalog: up({ id: "r3", name: " pintura " }) })).toMatch(/Ya hay un rubro/);
    expect(await commitError(laura, { financialMonthlyRatePct: 80 })).toMatch(/0 a 50/);
    await commit(laura, { generalCosts: { remove: ["cg-1"] }, rubroCatalog: up({ id: "rubro_pintura", name: "Pintura al horno", active: false }) });
    expect((await view(laura)).generalCosts).toEqual([]);
    expect((await view(laura)).rubroCatalog[0]).toMatchObject({ name: "Pintura al horno", active: false });
  });
  it("las tarifas y el historial no se eliminan", async () => {
    expect(await commitError(laura, { rates: { remove: ["tr-1"] } })).toMatch(/no se elimina/);
    expect(await commitError(laura, { salesInvoices: { remove: ["fv-1"] } })).toMatch(/no se elimina/);
    await expect(db.query("delete from rate_records")).rejects.toThrow(/historial/);
  });
  it("el Administrativo sin acceso comercial no cuenta como Gerencia", async () => {
    // Un `member` sin acceso comercial trabaja como Jefe de planta: no ve ni escribe lo de Gerencia.
    await db.query("update organization_members set role = 'member', can_view_commercial = false where user_id = $1", [carla]);
    expect((await view(carla)).rates).toEqual([]);
    expect(await commitError(carla, { financialMonthlyRatePct: 9 })).toMatch(/Gerencia/);
    await db.query("update organization_members set role = 'jefe_planta' where user_id = $1", [carla]);
  });
});

describe("Directorios", () => {
  it("clientes: se completan los datos y no se duplican; los de los proyectos ya están", async () => {
    const before = (await view(laura)).clients;
    expect(before.length).toBeGreaterThan(5);
    const first = before[0];
    await commit(laura, { clients: up({ ...first, contact: "Ana", phone: "11 5555 0000", active: true }) });
    expect((await view(laura)).clients.find((c) => c.id === first.id)).toMatchObject({ contact: "Ana", phone: "11 5555 0000" });
    await commit(laura, { clients: up({ id: "cli-nuevo", name: "Cliente Nuevo SA", active: true }) });
    expect(await commitError(laura, { clients: up({ id: "cli-otro", name: "  cliente nuevo sa" }) })).toMatch(/Ya hay un cliente/);
    expect((await view(martin)).clients).toEqual([]);
  });
  it("proveedores: Gerencia y Compras los cargan; el Jefe no", async () => {
    await commit(martin, { suppliers: up({ id: "prov-1", name: "Maderera Oeste", contact: "Luis", active: true }) });
    await commit(laura, { suppliers: up({ id: "prov-1", name: "Maderera Oeste", contact: "Luis G.", active: true }) });
    expect((await view(martin)).suppliers).toMatchObject([{ id: "prov-1", contact: "Luis G." }]);
    expect(await commitError(martin, { suppliers: up({ id: "prov-2", name: "maderera oeste" }) })).toMatch(/Ya hay un proveedor/);
    expect(await commitError(carla, { suppliers: up({ id: "prov-3", name: "Otro" }) })).toMatch(/proveedores/);
    expect((await view(carla)).suppliers).toEqual([]);
  });
});

describe("Aislamiento entre empresas", () => {
  it("otra empresa no ve nada de esta ni puede escribir sobre sus proyectos", async () => {
    const l = await view(outsider);
    expect(l.salesInvoices).toEqual([]);
    expect(l.clients).toEqual([]);
    expect(l.rubroCatalog).toEqual([]);
    expect(await commitError(outsider, { salesInvoices: up({ id: "fv-hack", projectId: ACTIVE, number: "HACK", date: today, amount: 1 }) })).toMatch(/foreign key|violates|no se factura/i);
    expect(await commitError(outsider, { collections: up({ id: "cb-hack", projectId: ACTIVE, invoiceId: "fv-1", date: today, amount: 1 }) })).toBeTruthy();
    expect(await rows(outsider, "select id from sales_invoices")).toEqual([]);
  });
  it("lo suyo queda en su empresa", async () => {
    await commit(outsider, { rubroCatalog: up({ id: "rubro_pintura", name: "Pintura", active: true }), financialMonthlyRatePct: 3 });
    expect((await view(outsider)).rubroCatalog).toHaveLength(1);
    expect((await view(outsider)).financialMonthlyRatePct).toBe(3);
    expect((await view(laura)).financialMonthlyRatePct).toBe(7.5);
  });
  it("no acepta colecciones desconocidas", async () => {
    expect(await commitError(laura, { projects: up({ id: "x" }) })).toMatch(/no permitida/);
  });
});

describe("Cargar el escenario de la demo en la base y leerlo de vuelta", () => {
  it("ledger_reset: lo que sale es lo que entró (facturación por proyecto, BOM, tarifas…)", async () => {
    const scenario = demoScenario({ projects: seed.projects, stock: seed.stock, orders: seed.orders });
    const payload = workspacePayload(org, { projects: scenario.projects, operators: seed.operators, stock: seed.stock, requests: [], assignments: [], orders: [], settings: { ...DEFAULT_SETTINGS }, resolvedAlertIds: [] });
    await asUser(db, laura, (tx) => tx.query("select reset_workspace($1::jsonb)", [JSON.stringify(payload)]));
    await asUser(db, laura, (tx) => tx.query("select compras_load_orders($1::jsonb)", [JSON.stringify(orderSeedRows(seed.orders))]));
    await asUser(db, laura, (tx) => tx.query("select ledger_reset($1::jsonb)", [JSON.stringify(scenario.ledger)]));
    const back = await view(laura);
    for (const key of ["salesInvoices", "collections", "supplierPayments", "contractRevisions", "boms", "handovers", "rubroCatalog", "rates", "generalCosts"] as const) {
      expect(back[key].length, key).toBe(scenario.ledger[key].length);
    }
    expect(back.paymentTerms.length).toBe(scenario.ledger.paymentTerms.length);
    expect(back.financialMonthlyRatePct).toBe(scenario.ledger.financialMonthlyRatePct);
    for (const p of scenario.projects) {
      expect(billingStatus(p, back), p.id).toEqual(billingStatus(p, scenario.ledger));
      expect(currentContract(p, back), p.id).toBe(currentContract(p, scenario.ledger));
    }
    // Lo de antes (de este archivo) ya no está: se reemplazó todo.
    expect(back.salesInvoices.find((i) => i.id === "fv-1")).toBeUndefined();
  });
  it("ledger_reset(null) deja la empresa en blanco; solo lo hace un Administrativo", async () => {
    expect(await errorAs(db, martin, (tx) => tx.query("select ledger_reset(null)"))).toMatch(/Administrativo/);
    await asUser(db, laura, (tx) => tx.query("select ledger_reset(null)"));
    const back = await view(laura);
    expect(back.salesInvoices).toEqual([]);
    expect(back.boms).toEqual([]);
    expect(back.rubroCatalog).toEqual([]);
    expect(back.financialMonthlyRatePct).toBe(5);
  });
});
