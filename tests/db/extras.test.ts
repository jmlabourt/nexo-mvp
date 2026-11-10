// Registros extra (migración 20261109120000) en un Postgres real (PGlite): quién lee y quién escribe cada colección,
// qué no se puede reescribir, qué no ve Planta y el aislamiento entre empresas.
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { DEFAULT_SETTINGS } from "@/lib/constants";
import { buildSeed } from "@/lib/seed-data";
import { orderSeedRows } from "@/lib/supabase/mappers";
import { workspacePayload } from "@/lib/supabase/workspace";
import { asUser, createDb, errorAs, signUp } from "./harness";

let db: PGlite;
let org = "";
let laura = ""; // Gerencia
let ana = ""; // Administración
let martin = ""; // Compras
let carla = ""; // Jefe de planta
let outsider = "";

const seed = buildSeed(new Date());
const today = new Date().toISOString().slice(0, 10);
const view = async (u: string) => (await asUser(db, u, async (tx) => (await tx.query<{ r: Record<string, unknown> }>("select ledger_extras_workspace() as r")).rows[0].r)) as Record<string, unknown>;
const commit = (u: string, p: unknown) => asUser(db, u, (tx) => tx.query("select ledger_extras_commit($1::jsonb)", [JSON.stringify(p)]));
const fail = (u: string, p: unknown) => errorAs(db, u, (tx) => tx.query("select ledger_extras_commit($1::jsonb)", [JSON.stringify(p)]));
const up = (...rows: unknown[]) => ({ upsert: rows });
const request = { id: "pr-1", orderId: "oc-1", amount: 500, date: today, reason: "Anticipo", by: "Martín", at: new Date().toISOString() };

beforeAll(async () => {
  db = await createDb();
  laura = await signUp(db, "laura@demo.com", "Laura Gómez");
  org = (await db.query<{ organization_id: string }>("select organization_id from organization_members where user_id = $1", [laura])).rows[0].organization_id;
  const payload = workspacePayload(org, { projects: seed.projects, operators: seed.operators, stock: seed.stock, requests: [], assignments: [], orders: [], settings: { ...DEFAULT_SETTINGS }, resolvedAlertIds: [] });
  await asUser(db, laura, (tx) => tx.query("select reset_workspace($1::jsonb)", [JSON.stringify(payload)]));
  await asUser(db, laura, (tx) => tx.query("select compras_load_orders($1::jsonb)", [JSON.stringify(orderSeedRows(seed.orders))]));
  const inv = (p: Record<string, unknown>) => asUser(db, laura, (tx) => tx.query("select admin_invite_member($1::jsonb)", [JSON.stringify(p)]));
  await inv({ email: "ana@demo.com", display_name: "Ana Torres", role: "comercial" });
  await inv({ email: "martin@demo.com", display_name: "Martín Ruiz", role: "compras" });
  await inv({ email: "carla@demo.com", display_name: "Carla Pérez", role: "jefe_planta" });
  ana = await signUp(db, "ana@demo.com", "Ana");
  martin = await signUp(db, "martin@demo.com", "Martín");
  carla = await signUp(db, "carla@demo.com", "Carla");
  outsider = await signUp(db, "otra@empresa.com", "Otra Persona");
}, 120_000);

describe("empresa nueva", () => {
  it("arranca sin ningún registro extra", async () => {
    expect(await view(laura)).toMatchObject({ paymentRequests: [], financialCorrections: [], externalWork: [], externalRates: [], capacityAdjustments: [], capacityPlans: [], materialCatalog: [] });
    expect((await view(laura)).quoteDefaults).toBeUndefined();
  });
  it("las tablas no se leen ni escriben directo", async () => {
    expect(await errorAs(db, ana, (tx) => tx.query("insert into ledger_extras (organization_id, collection, id, data) values ($1, 'quoteDefaults', 'singleton', '{}')", [org]))).toMatch(/permission denied|row-level/);
  });
});

describe("pedidos de pago", () => {
  it("Compras los crea sin gestión bancaria; Administración y Compras los ven, Planta no", async () => {
    await commit(martin, { paymentRequests: up(request) });
    expect((await view(ana)).paymentRequests).toMatchObject([{ id: "pr-1", amount: 500 }]);
    expect((await view(martin)).paymentRequests).toHaveLength(1);
    expect((await view(carla)).paymentRequests).toBeUndefined();
  });
  it("Compras no crea una solicitud ya gestionada ni modifica las existentes", async () => {
    expect(await fail(martin, { paymentRequests: up({ ...request, id: "pr-2", banking: { instrument: "transfer", issuedOn: today, reference: "T" } }) })).toMatch(/Administración/);
    expect(await fail(martin, { paymentRequests: up({ ...request, banking: { instrument: "transfer", issuedOn: today, reference: "T" } }) })).toMatch(/no altera/);
  });
  it("Administración registra la gestión bancaria pero no cambia el importe, y no queda reescrita", async () => {
    const banking = { instrument: "transfer", issuedOn: today, reference: "TR-9" };
    expect(await fail(ana, { paymentRequests: up({ ...request, amount: 999, banking }) })).toMatch(/no modifica su obligación/);
    await commit(ana, { paymentRequests: up({ ...request, banking }) });
    expect((await view(ana)).paymentRequests).toMatchObject([{ id: "pr-1", banking }]);
    expect(await fail(ana, { paymentRequests: up({ ...request, banking: { ...banking, reference: "OTRO" } }) })).toMatch(/no se modifica/);
  });
  it("un pedido sin importe positivo se rechaza", async () => {
    expect(await fail(martin, { paymentRequests: up({ ...request, id: "pr-0", amount: 0 }) })).toMatch(/mayor a 0/);
  });
});

describe("correcciones financieras", () => {
  const fix = { id: "fc-1", entity: "invoice", targetId: "fv-1", before: { amount: 1 }, after: { amount: 2 }, reason: "Error de tipeo", by: "Ana Torres", at: new Date().toISOString() };
  it("las registra Administración y queda el historial; no se editan", async () => {
    await commit(ana, { financialCorrections: up(fix) });
    expect((await view(laura)).financialCorrections).toMatchObject([{ id: "fc-1", reason: "Error de tipeo" }]);
    expect(await fail(ana, { financialCorrections: up({ ...fix, reason: "Otro" }) })).toMatch(/no se modifica/);
  });
  it("Compras y Planta ni las ven ni las escriben", async () => {
    expect((await view(martin)).financialCorrections).toBeUndefined();
    expect(await fail(martin, { financialCorrections: up({ ...fix, id: "fc-2" }) })).toMatch(/Administración/);
    expect(await fail(carla, { financialCorrections: up({ ...fix, id: "fc-3" }) })).toMatch(/Administración/);
  });
});

describe("trabajo externo", () => {
  const work = { id: "ew-1", kind: "hourly", projectId: seed.projects[0].id, rubro: "carpinteria", date: today, description: "Lustrado", hours: 8, estimatedCost: 4000, createdBy: "Carla", createdAt: new Date().toISOString() };
  it("Planta lo registra pero no confirma el costo", async () => {
    await commit(carla, { externalWork: up(work) });
    expect(await fail(carla, { externalWork: up({ ...work, id: "ew-2", confirmedCost: 1 }) })).toMatch(/Gerencia confirma/);
    // intenta colar un costo confirmado en una edición: se ignora y queda lo anterior
    await commit(carla, { externalWork: up({ ...work, description: "Lustrado y laqueado", confirmedCost: 99999, confirmedBy: "Carla" }) });
    const stored = (await db.query<{ data: Record<string, unknown> }>("select data from ledger_extras where organization_id = $1 and id = 'ew-1'", [org])).rows[0].data;
    expect(stored).toMatchObject({ description: "Lustrado y laqueado" });
    expect(stored.confirmedCost).toBeUndefined();
  });
  it("Gerencia confirma el costo con historial; Planta lo recibe sin costo confirmado", async () => {
    const costed = { ...work, description: "Lustrado y laqueado", confirmedCost: 4500, confirmedBy: "Laura Gómez", confirmedAt: new Date().toISOString(), costHistory: [{ next: 4500, by: "Laura Gómez", at: new Date().toISOString() }] };
    await commit(laura, { externalWork: up(costed) });
    expect(((await view(laura)).externalWork as Array<Record<string, unknown>>)[0]).toMatchObject({ confirmedCost: 4500 });
    const seenByPlant = ((await view(carla)).externalWork as Array<Record<string, unknown>>)[0];
    expect(seenByPlant.confirmedCost).toBeUndefined();
    expect(seenByPlant.costHistory).toBeUndefined();
    expect(seenByPlant.description).toBe("Lustrado y laqueado");
    // Planta edita de nuevo: el costo confirmado de Gerencia no se pisa
    await commit(carla, { externalWork: up({ ...seenByPlant, status: "completed" }) });
    const stored = (await db.query<{ data: Record<string, unknown> }>("select data from ledger_extras where organization_id = $1 and id = 'ew-1'", [org])).rows[0].data;
    expect(stored).toMatchObject({ status: "completed", confirmedCost: 4500, confirmedBy: "Laura Gómez" });
  });
  it("Compras y Administración no lo ven ni lo escriben; nada se elimina", async () => {
    expect((await view(martin)).externalWork).toBeUndefined();
    expect(await fail(martin, { externalWork: up({ ...work, id: "ew-9" }) })).toMatch(/Jefe de planta/);
    expect(await fail(carla, { externalWork: { remove: ["ew-1"] } })).toMatch(/no se elimina/);
  });
  it("las tarifas del trabajo externo son de Gerencia y no se reescriben", async () => {
    const rate = { rubro: "carpinteria", hourlyCost: 5000, validFrom: today, by: "Laura", at: new Date().toISOString() };
    expect(await fail(carla, { externalRates: up(rate) })).toMatch(/Gerencia/);
    await commit(laura, { externalRates: up(rate) });
    expect((await view(laura)).externalRates).toHaveLength(1);
    expect((await view(carla)).externalRates).toBeUndefined();
    expect(await fail(laura, { externalRates: up({ ...rate, hourlyCost: 1 }) })).toMatch(/no se modifica/);
  });
});

describe("capacidad de planta", () => {
  it("la declara el Jefe de planta (base, ajustes y planes); Compras y Administración no", async () => {
    await commit(carla, { capacityBase: { carpinteria: 120 }, capacityAdjustments: up({ id: "ca-1", date: today, hours: -16, note: "Feriado", by: "Carla", at: new Date().toISOString() }), capacityPlans: up({ id: "cp-1", rubro: "carpinteria", from: today, to: today, workers: 3, hoursPerWorker: 40, note: "", by: "Carla", at: new Date().toISOString() }) });
    const w = await view(laura);
    expect(w.capacityBase).toEqual({ carpinteria: 120 });
    expect(w.capacityAdjustments).toHaveLength(1);
    expect(w.capacityPlans).toHaveLength(1);
    expect(await fail(ana, { capacityBase: { carpinteria: 1 } })).toMatch(/Jefe de planta/);
    expect(await fail(martin, { capacityPlans: up({ id: "cp-2" }) })).toMatch(/Jefe de planta/);
  });
  it("el ajuste no se reescribe y la capacidad base no admite horas negativas", async () => {
    expect(await fail(carla, { capacityAdjustments: up({ id: "ca-1", date: today, hours: 5, note: "otro", by: "Carla", at: today }) })).toMatch(/no se modifica/);
    expect(await fail(carla, { capacityBase: { carpinteria: -5 } })).toMatch(/no negativas/);
  });
});

describe("rentabilidad objetivo", () => {
  it("la fija Gerencia entre 0 y 100 %; Administración la lee para cotizar", async () => {
    expect(await fail(ana, { quoteDefaults: { materialsTargetPct: 30, laborTargetPct: 30 } })).toMatch(/Gerencia/);
    expect(await fail(laura, { quoteDefaults: { materialsTargetPct: 100, laborTargetPct: 30 } })).toMatch(/entre 0 y menos de 100/);
    expect(await fail(laura, { quoteDefaults: { materialsTargetPct: "30", laborTargetPct: 30 } })).toMatch(/números/);
    await commit(laura, { quoteDefaults: { materialsTargetPct: 25, laborTargetPct: 35 } });
    expect((await view(ana)).quoteDefaults).toEqual({ materialsTargetPct: 25, laborTargetPct: 35 });
    await commit(laura, { quoteDefaults: { materialsTargetPct: 20, laborTargetPct: 35 } });
    expect((await view(ana)).quoteDefaults).toEqual({ materialsTargetPct: 20, laborTargetPct: 35 });
    expect((await view(martin)).quoteDefaults).toBeUndefined();
  });
});

describe("catálogo de materiales", () => {
  const mat = { id: "m-1", name: "Melamina blanca 18mm", unit: "placa", referenceCost: 52000, active: true, validFrom: today };
  it("lo administra Administración; Planta lo recibe sin precio", async () => {
    expect(await fail(martin, { materialCatalog: up(mat) })).toMatch(/Administración/);
    expect(await fail(ana, { materialCatalog: up({ ...mat, name: " " }) })).toMatch(/nombre y costo/);
    await commit(ana, { materialCatalog: up(mat) });
    expect((await view(martin)).materialCatalog).toMatchObject([{ id: "m-1", referenceCost: 52000 }]);
    const plant = ((await view(carla)).materialCatalog as Array<Record<string, unknown>>)[0];
    expect(plant.name).toBe("Melamina blanca 18mm");
    expect(plant.referenceCost).toBeUndefined();
  });
  it("desactivar conserva el material y su identificador", async () => {
    await commit(ana, { materialCatalog: up({ ...mat, active: false }) });
    expect((await view(ana)).materialCatalog).toMatchObject([{ id: "m-1", active: false, referenceCost: 52000 }]);
    expect(await fail(ana, { materialCatalog: { remove: ["m-1"] } })).toMatch(/no se elimina/);
  });
});

describe("aislamiento y carga masiva", () => {
  it("otra empresa no ve nada de esta ni puede escribir en ella", async () => {
    // Es Administrativa de su propia empresa: ve solo la suya, que está vacía.
    const w = await view(outsider);
    expect(w.externalWork).toEqual([]);
    expect(w.paymentRequests).toEqual([]);
    expect(w.materialCatalog).toEqual([]);
    expect(w.quoteDefaults).toBeUndefined();
    await asUser(db, outsider, (tx) => tx.query("select ledger_extras_commit($1::jsonb)", [JSON.stringify({ materialCatalog: up({ id: "m-1", name: "Otro", unit: "u", referenceCost: 1, validFrom: today }) })]));
    expect((await view(ana)).materialCatalog).toMatchObject([{ id: "m-1", name: "Melamina blanca 18mm" }]); // mismo id, otra empresa: no se pisa
  });
  it("una colección inventada se rechaza", async () => {
    expect(await fail(laura, { personnel: up({ id: "x" }) })).toMatch(/no permitida/);
  });
  it("solo un Administrativo carga o vacía; vaciar deja la empresa sin registros", async () => {
    expect(await errorAs(db, ana, (tx) => tx.query("select ledger_extras_reset('{}'::jsonb)"))).toMatch(/Administrativo/);
    await asUser(db, laura, (tx) => tx.query("select ledger_extras_reset($1::jsonb)", [JSON.stringify({ quoteDefaults: { materialsTargetPct: 30, laborTargetPct: 30 }, paymentRequests: [request] })]));
    const w = await view(laura);
    expect(w.quoteDefaults).toEqual({ materialsTargetPct: 30, laborTargetPct: 30 });
    expect(w.paymentRequests).toHaveLength(1);
    expect(w.externalWork).toEqual([]);
    await asUser(db, laura, (tx) => tx.query("select ledger_extras_reset(null)"));
    expect((await db.query<{ c: number }>("select count(*)::int as c from ledger_extras where organization_id = $1", [org])).rows[0].c).toBe(0);
  });
});
