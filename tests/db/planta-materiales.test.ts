// Jefe de planta: entrega de materiales y cierre del día (migración 20261024120000), en un Postgres real (PGlite).
// Los argumentos se arman con las mismas funciones puras que usa la pantalla del Jefe, con los lotes SIN costo (como
// los recibe el Jefe): la base pone el costo del lote.
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import type { MaterialDelivery } from "@/types";
import { DEFAULT_SETTINGS } from "@/lib/constants";
import { buildSeed, STAR_PROJECT_ID } from "@/lib/seed-data";
import { workspacePayload } from "@/lib/supabase/workspace";
import { closeDay, closeDayPayload, deliverMaterial, deliveryPayload } from "@/lib/plant-materials";
import type { StockState } from "@/lib/stock";
import { asUser, createDb, errorAs, signUp } from "./harness";

let db: PGlite;
let org = "";
let laura = ""; // Administrativo
let carla = ""; // Jefe de planta
let martin = ""; // Compras
let juan = ""; // Operario

const seed = buildSeed(new Date());
const star = seed.projects.find((p) => p.id === STAR_PROJECT_ID)!;
/** Como lo ve el Jefe: lotes sin costo. */
const blind = (s: StockState): StockState => ({ lots: s.lots.map((l) => ({ ...l, unitCost: 0, supplier: undefined })), movements: s.movements });
const today = new Date().toISOString().slice(0, 10);
const ctx = (actor: string) => ({ actor, now: new Date().toISOString(), today });

const rows = async (userId: string, sql: string, params: unknown[] = []) =>
  asUser(db, userId, async (tx) => (await tx.query<Record<string, unknown>>(sql, params)).rows);
const rpc = (userId: string, fn: string, p: unknown) => asUser(db, userId, (tx) => tx.query(`select ${fn}($1::jsonb) as r`, [JSON.stringify(p)]));
const rpcError = (userId: string, fn: string, p: unknown) => errorAs(db, userId, (tx) => tx.query(`select ${fn}($1::jsonb)`, [JSON.stringify(p)]));

const MONEY = ["unit_cost", "unitCost", "supplier", "total", "amount", "sales_price"];
function keysDeep(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => keysDeep(x, out));
  else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      out.add(k);
      keysDeep(x, out);
    }
  }
  return out;
}

const balance = async (lotPlace: string) =>
  Number(
    (
      await db.query<{ q: string }>(
        `select coalesce(sum(case when m.to_place = $2::jsonb then m.quantity else 0 end),0) - coalesce(sum(case when m.from_place = $2::jsonb then m.quantity else 0 end),0) as q
         from stock_movements m join stock_lots l on l.organization_id = m.organization_id and l.id = m.lot_id
         where m.organization_id = $1 and l.material_id = $3`,
        [org, lotPlace.split("|")[0], lotPlace.split("|")[1]],
      )
    ).rows[0].q,
  );
const WAREHOUSE = JSON.stringify({ type: "warehouse" });
const IN_STAR = JSON.stringify({ type: "project", projectId: STAR_PROJECT_ID });

beforeAll(async () => {
  db = await createDb();
  laura = await signUp(db, "laura@demo.com", "Laura Gómez");
  org = (await db.query<{ organization_id: string }>("select organization_id from organization_members where user_id = $1", [laura])).rows[0].organization_id;
  const payload = workspacePayload(org, { projects: seed.projects, operators: seed.operators, stock: seed.stock, requests: [], assignments: [], orders: [], settings: { ...DEFAULT_SETTINGS }, resolvedAlertIds: [] });
  await asUser(db, laura, (tx) => tx.query("select reset_workspace($1::jsonb)", [JSON.stringify(payload)]));
  const inv = (p: Record<string, unknown>) => asUser(db, laura, (tx) => tx.query("select admin_invite_member($1::jsonb)", [JSON.stringify(p)]));
  await inv({ email: "carla@demo.com", display_name: "Carla Sosa", role: "jefe_planta" });
  await inv({ email: "martin@demo.com", display_name: "Martín Ruiz", role: "compras" });
  await inv({ email: "juan@demo.com", display_name: "Juan Pérez", role: "operator", operator_id: "op-juan" });
  carla = await signUp(db, "carla@demo.com", "Carla");
  martin = await signUp(db, "martin@demo.com", "Martín");
  juan = await signUp(db, "juan@demo.com", "Juan");
}, 120_000);

let stock: StockState = seed.stock;
let project = star;
let deliveries: MaterialDelivery[] = [];
let fromWarehouse: MaterialDelivery;
let fromProject: MaterialDelivery;

describe("lectura del Jefe: cantidades sin costos", () => {
  it("planta_stock devuelve lotes y movimientos sin costo ni proveedor", async () => {
    const [r] = await rows(carla, "select planta_stock() as r");
    const json = r.r as Record<string, unknown[]>;
    expect(json.stock_lots.length).toBe(seed.stock.lots.length);
    for (const k of MONEY) expect(keysDeep(json).has(k)).toBe(false);
  });
  it("Compras y Operario no la pueden llamar", async () => {
    expect(await errorAs(db, martin, (tx) => tx.query("select planta_stock()"))).toMatch(/Jefe de planta|Administrativo/);
    expect(await errorAs(db, juan, (tx) => tx.query("select planta_stock()"))).toMatch(/Jefe de planta|Administrativo/);
  });
});

describe("entrega de material", () => {
  it("del depósito: descuenta el stock libre y queda el registro, sin costo", async () => {
    const before = await balance(`${WAREHOUSE}|mel-blanca-18`);
    const r = deliverMaterial(project, blind(stock), deliveries, { projectId: STAR_PROJECT_ID, itemId: "itm-mesas", operatorId: "op-juan", materialId: "mel-blanca-18", quantity: 2, source: "warehouse", date: today }, ctx("Carla"));
    await rpc(carla, "planta_deliver_material", deliveryPayload(r));
    expect(await balance(`${WAREHOUSE}|mel-blanca-18`)).toBeCloseTo(before - 2, 6);
    expect(await balance(`${IN_STAR}|mel-blanca-18`)).toBeCloseTo(2, 6);
    const [d] = await rows(laura, "select material_id, quantity::text as q, source, item_id, operator_id, closed_at from material_deliveries where id = $1", [r.delivery.id]);
    expect(d).toEqual({ material_id: "mel-blanca-18", q: "2", source: "warehouse", item_id: "itm-mesas", operator_id: "op-juan", closed_at: null });
    // Reintento: no duplica.
    await rpc(carla, "planta_deliver_material", deliveryPayload(r));
    expect(await balance(`${WAREHOUSE}|mel-blanca-18`)).toBeCloseTo(before - 2, 6);
    fromWarehouse = r.delivery;
    deliveries = [...deliveries, r.delivery];
    stock = { lots: seed.stock.lots, movements: r.stock.movements };
  });
  it("de lo ya asignado al proyecto: sin movimiento, controla que no se entregue dos veces lo mismo", async () => {
    const r = deliverMaterial(project, blind(stock), deliveries, { projectId: STAR_PROJECT_ID, itemId: "itm-sillas", materialId: "multilaminado-18", quantity: 4, source: "project", date: today }, ctx("Carla"));
    expect(r.change.movements).toEqual([]);
    await rpc(carla, "planta_deliver_material", deliveryPayload(r));
    fromProject = r.delivery;
    deliveries = [...deliveries, r.delivery];
    const tooMuch = { ...deliveryPayload(r), id: "del-x", quantity: 8 }; // quedan 7,5 sin entregar
    expect(await rpcError(carla, "planta_deliver_material", tooMuch)).toMatch(/no tiene tanto material asignado sin entregar/);
  });
  it("valida depósito, producto, operario, fecha y proyecto", async () => {
    const base = deliverMaterial(project, blind(stock), deliveries, { projectId: STAR_PROJECT_ID, itemId: "itm-mesas", materialId: "perfil-alu", quantity: 1, source: "warehouse", date: today }, ctx("Carla"));
    const p = deliveryPayload(base);
    expect(await rpcError(carla, "planta_deliver_material", { ...p, id: "del-a", quantity: 99, movements: p.movements.map((m) => ({ ...m, quantity: 99 })) })).toMatch(/No hay tanto material libre/);
    expect(await rpcError(carla, "planta_deliver_material", { ...p, id: "del-b", item_id: "itm-nada" })).toMatch(/producto del proyecto/);
    expect(await rpcError(carla, "planta_deliver_material", { ...p, id: "del-c", operator_id: "op-nadie" })).toMatch(/operario activo/);
    expect(await rpcError(carla, "planta_deliver_material", { ...p, id: "del-d", date: "2999-01-01" })).toMatch(/fecha futura/);
    expect(await rpcError(carla, "planta_deliver_material", { ...p, id: "del-e", project_id: "p-0987" })).toMatch(/entre Aprobado e Instalación/);
    expect(await rpcError(carla, "planta_deliver_material", { ...p, id: "del-f", movements: p.movements.map((m) => ({ ...m, to_place: { type: "consumed", projectId: STAR_PROJECT_ID } })) })).toMatch(/inválido/);
  });
  it("Compras y Operario no entregan; nadie escribe la tabla directo; Compras y Operario no la leen", async () => {
    const p = { id: "del-z", project_id: STAR_PROJECT_ID, item_id: "itm-mesas", material_id: "multilaminado-18", quantity: 1, source: "project", date: today, movements: [] };
    expect(await rpcError(martin, "planta_deliver_material", p)).toMatch(/Jefe de planta/);
    expect(await rpcError(juan, "planta_deliver_material", p)).toMatch(/Jefe de planta/);
    expect(
      await errorAs(db, carla, (tx) =>
        tx.query("insert into material_deliveries (organization_id, id, project_id, material_id, material_name, quantity, source, date) values ($1, 'x', $2, 'm', 'm', 1, 'project', current_date)", [org, STAR_PROJECT_ID]),
      ),
    ).toMatch(/row-level security/);
    expect(await rows(martin, "select id from material_deliveries")).toEqual([]);
    expect(await rows(juan, "select id from material_deliveries")).toEqual([]);
    expect((await rows(carla, "select id from material_deliveries")).length).toBe(2);
  });
});

describe("cierre del día", () => {
  it("unidades terminadas + consumo, desperdicio y sobrante: el costo lo pone la base con el lote", async () => {
    const r = closeDay(
      project,
      blind(stock),
      deliveries,
      {
        projectId: STAR_PROJECT_ID,
        date: today,
        units: [{ itemId: "itm-mesas", units: 6 }],
        deliveries: [
          { id: fromWarehouse.id, consumed: 1.25, waste: 0.25, leftover: 0.5 },
          { id: fromProject.id, consumed: 3, waste: 0, leftover: 0 }, // 1 placa sigue en planta
        ],
      },
      ctx("Carla"),
    );
    // Del lado del Jefe los costos son 0…
    expect(r.usages.every((u) => u.unitCost === 0)).toBe(true);
    const leftoverBefore = await balance(`${WAREHOUSE}|mel-blanca-18`);
    await rpc(carla, "planta_close_day", closeDayPayload({ projectId: STAR_PROJECT_ID, date: today, units: [{ itemId: "itm-mesas", units: 6 }], deliveries: [
      { id: fromWarehouse.id, consumed: 1.25, waste: 0.25, leftover: 0.5 },
      { id: fromProject.id, consumed: 3, waste: 0, leftover: 0 },
    ] }, r));
    // …y en la base cada uso tiene el costo de su lote.
    // Un uso por lote (cada lote tiene su costo); sumados por material dan lo cerrado.
    const usages = await rows(laura, `select u.material_id, sum(u.quantity_consumed)::text as c, sum(u.waste_quantity)::text as w, bool_and(u.unit_cost = l.unit_cost and u.unit_cost > 0) as costed
      from material_usages u join stock_lots l on l.organization_id = u.organization_id and l.id = u.lot_id where u.notes like 'Cierre del día%' group by 1 order by 1`);
    expect(usages).toEqual([
      { material_id: "mel-blanca-18", c: "1.25", w: "0.25", costed: true },
      { material_id: "multilaminado-18", c: "3", w: "0", costed: true },
    ]);
    // Sobrante: vuelve al depósito como lote sobrante con el costo del lote de origen.
    expect(await balance(`${WAREHOUSE}|mel-blanca-18`)).toBeCloseTo(leftoverBefore + 0.5, 6);
    const [lot] = await rows(laura, "select (c.unit_cost = p.unit_cost) as same, c.kind from stock_lots c join stock_lots p on p.organization_id = c.organization_id and p.id = c.parent_lot_id where c.organization_id = $1 and c.kind = 'leftover' and c.origin_project_id = $2 and c.created_by = 'Carla Sosa'", [org, STAR_PROJECT_ID]);
    expect(lot).toEqual({ same: true, kind: "leftover" });
    // Unidades terminadas con la función de siempre.
    expect(await rows(laura, "select completed_units::text as u from project_items where id = 'itm-mesas'")).toEqual([{ u: "6" }]);
    // Entregas cerradas con lo que pasó; la placa que no se cerró sigue asignada al proyecto.
    expect(await rows(laura, "select id, consumed::text as c, waste::text as w, leftover::text as l, closed_at is not null as closed from material_deliveries order by date, created_at")).toEqual([
      { id: fromWarehouse.id, c: "1.25", w: "0.25", l: "0.5", closed: true },
      { id: fromProject.id, c: "3", w: "0", l: "0", closed: true },
    ]);
    // Reintento del mismo cierre: no duplica.
    await rpc(carla, "planta_close_day", { id: r.closeId, project_id: STAR_PROJECT_ID, date: today });
    expect((await rows(laura, "select id from material_usages where notes like 'Cierre del día%'")).length).toBe(r.usages.length);
    stock = r.stock;
    project = r.project;
    deliveries = r.deliveries;
  });
  it("valida: entrega ya cerrada, más de lo entregado, movimientos que no coinciden, unidades fuera de rango", async () => {
    const d2 = deliverMaterial(project, blind(stock), deliveries, { projectId: STAR_PROJECT_ID, itemId: "itm-mesas", materialId: "perfil-alu", quantity: 2, source: "warehouse", date: today }, ctx("Carla"));
    await rpc(carla, "planta_deliver_material", deliveryPayload(d2));
    const all = [...deliveries, d2.delivery];
    const ok = closeDay(project, blind(d2.stock), all, { projectId: STAR_PROJECT_ID, date: today, units: [], deliveries: [{ id: d2.delivery.id, consumed: 2, waste: 0, leftover: 0 }] }, ctx("Carla"));
    const p = closeDayPayload({ projectId: STAR_PROJECT_ID, date: today, units: [], deliveries: [{ id: d2.delivery.id, consumed: 2, waste: 0, leftover: 0 }] }, ok);
    expect(await rpcError(carla, "planta_close_day", { ...p, id: "cls-a", deliveries: [{ id: fromWarehouse.id, consumed: 0, waste: 0, leftover: 0 }] })).toMatch(/ya está cerrada/);
    expect(await rpcError(carla, "planta_close_day", { ...p, id: "cls-b", deliveries: [{ id: d2.delivery.id, consumed: 3, waste: 0, leftover: 0 }] })).toMatch(/no pueden sumar más/);
    expect(await rpcError(carla, "planta_close_day", { ...p, id: "cls-c", deliveries: [{ id: d2.delivery.id, consumed: 1, waste: 0, leftover: 0 }] })).toMatch(/no coincide con los movimientos/);
    expect(await rpcError(carla, "planta_close_day", { ...p, id: "cls-d", units: [{ item_id: "itm-mesas", units: 99 }] })).toMatch(/unidades terminadas van de 0 a 10/);
    // Nada de lo anterior quedó a medias.
    expect(await rows(laura, "select closed_at from material_deliveries where id = $1", [d2.delivery.id])).toEqual([{ closed_at: null }]);
    expect(await rows(laura, "select completed_units::text as u from project_items where id = 'itm-mesas'")).toEqual([{ u: "6" }]);
    expect(await rpcError(juan, "planta_close_day", p)).toMatch(/Jefe de planta/);
    expect(await rpcError(martin, "planta_close_day", p)).toMatch(/Jefe de planta/);
    await rpc(carla, "planta_close_day", p);
    expect(await rows(laura, "select closed_at is not null as c from material_deliveries where id = $1", [d2.delivery.id])).toEqual([{ c: true }]);
  });
  it("el Jefe sigue sin poder leer costos de las tablas de stock y usos", async () => {
    expect(await rows(carla, "select id from material_usages limit 1")).toEqual([]);
    expect(await rows(carla, "select unit_cost from stock_lots limit 1")).toEqual([]);
  });
});
