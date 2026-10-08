// Lote 2 — Seguridad: políticas de la base probadas en un Postgres real (PGlite) con tres usuarios:
// Gestión (Laura), un operario activo (Juan) y un operario dado de baja (Diego).
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import type { Project } from "@/types";
import { DEFAULT_SETTINGS } from "@/lib/constants";
import { buildSeed, MAIN_DEMO_PROJECT_ID } from "@/lib/seed-data";
import { projectHoldings, type StockState } from "@/lib/stock";
import * as ops from "@/lib/project-operations";
import { workspacePayload } from "@/lib/supabase/workspace";
import { tallerCalls } from "@/lib/supabase/taller";
import { asUser, createDb, errorAs, signUp } from "./harness";

let db: PGlite;
let org = "";
let laura = "";
let juan = "";
let diego = "";
let outsider = "";
let seed: { projects: Project[]; stock: StockState };

/** Fecha de hace unos días (evita problemas de zona horaria con "hoy"). */
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const rows = async (userId: string, sql: string, params: unknown[] = []) =>
  asUser(db, userId, async (tx) => (await tx.query<Record<string, unknown>>(sql, params)).rows);

beforeAll(async () => {
  db = await createDb();
  laura = await signUp(db, "laura@demo.com", "Laura Gómez");
  org = (await db.query<{ organization_id: string }>("select organization_id from organization_members where user_id = $1", [laura])).rows[0]
    .organization_id;

  // Gestión carga la demo con la misma función que usa la app (reset_workspace).
  const s = buildSeed(new Date());
  seed = { projects: s.projects, stock: s.stock };
  const payload = workspacePayload(org, {
    projects: s.projects,
    operators: s.operators,
    stock: s.stock,
    requests: [],
    settings: { ...DEFAULT_SETTINGS },
    resolvedAlertIds: [],
  });
  await asUser(db, laura, (tx) => tx.query("select reset_workspace($1::jsonb)", [JSON.stringify(payload)]));

  // Gestión invita a Juan y a Diego por email: al registrarse quedan como operarios de la empresa.
  await db.query("update operators set email = 'juan@demo.com' where organization_id = $1 and id = 'op-juan'", [org]);
  await db.query("update operators set email = 'diego@demo.com' where organization_id = $1 and id = 'op-diego'", [org]);
  juan = await signUp(db, "juan@demo.com", "Juan");
  diego = await signUp(db, "diego@demo.com", "Diego");
  outsider = await signUp(db, "otra@empresa.com", "Otra Empresa");
}, 120_000);

describe("la demo se carga completa con reset_workspace", () => {
  it("todas las tablas quedan con los datos del seed", async () => {
    const [{ n }] = (await db.query<{ n: number }>("select count(*)::int as n from projects where organization_id = $1", [org])).rows;
    expect(n).toBe(seed.projects.length);
    const [{ m }] = (await db.query<{ m: number }>("select count(*)::int as m from stock_movements where organization_id = $1", [org])).rows;
    expect(m).toBe(seed.stock.movements.length);
  });
  it("un operario no puede resetear la empresa", async () => {
    expect(await errorAs(db, juan, (tx) => tx.query("select reset_workspace('{}'::jsonb)"))).toMatch(/Solo Gestión/);
  });
});

describe("Gestión (manager)", () => {
  it("ve lo económico: precios de venta y costo por hora", async () => {
    const projects = await rows(laura, "select id, sales_price from projects");
    expect(projects).toHaveLength(seed.projects.length);
    expect(projects.some((p) => Number(p.sales_price) > 0)).toBe(true);
    const operators = await rows(laura, "select id, hourly_cost from operators");
    expect(operators.every((o) => Number(o.hourly_cost) > 0)).toBe(true);
  });
  it("una empresa nueva (sin demo cargada) puede cargar su primera demo tabla por tabla", async () => {
    // Es lo que hace el primer ingreso con la versión anterior de la app: no debe chocar con las reglas.
    const [{ organization_id: other }] = await rows(outsider, "select organization_id from organization_members");
    const err = await errorAs(db, outsider, async (tx) => {
      await tx.query(
        "insert into projects (organization_id, id, code, name, status, start_date, due_date) values ($1, 'p-1', 'P-1', 'Nuevo', 'production', current_date, current_date)",
        [other],
      );
      await tx.query(
        "insert into budget_lines (organization_id, id, project_id, category, description, quantity, unit, unit_cost, total) values ($1, 'bl-1', 'p-1', 'materials', 'x', 1, 'u', 1, 1)",
        [other],
      );
    });
    expect(err).toBeNull();
  });
  it("otra empresa no ve nada de esta", async () => {
    expect(await rows(outsider, "select id from projects where organization_id = $1", [org])).toHaveLength(0);
  });
  it("las etapas se avanzan de a una (también en la base)", async () => {
    const p = seed.projects.find((x) => x.status === "purchasing")!;
    expect(
      await errorAs(db, laura, (tx) => tx.query("update projects set status = 'installation' where organization_id = $1 and id = $2", [org, p.id])),
    ).toMatch(/de a una/);
  });
  it("el presupuesto base congelado no se reemplaza", async () => {
    const p = seed.projects.find((x) => x.status === "production")!;
    expect(
      await errorAs(db, laura, (tx) =>
        tx.query("update projects set baseline = jsonb_set(baseline, '{budgetTotal}', '1') where organization_id = $1 and id = $2", [org, p.id]),
      ),
    ).toMatch(/congelado/);
  });
  it("el costo presupuestado está bloqueado en ejecución", async () => {
    expect(
      await errorAs(db, laura, (tx) =>
        tx.query(
          "insert into budget_lines (organization_id, id, project_id, category, description, quantity, unit, unit_cost, total) values ($1, 'bl-x', $2, 'materials', 'x', 1, 'u', 1, 1)",
          [org, MAIN_DEMO_PROJECT_ID],
        ),
      ),
    ).toMatch(/bloqueado/);
  });
  it("no se cargan horas con fecha futura ni más de 24 h por día", async () => {
    const future = new Date();
    future.setDate(future.getDate() + 5);
    const insert = (date: string, hours: number, id: string) =>
      errorAs(db, laura, (tx) =>
        tx.query(
          `insert into actual_entries (organization_id, id, project_id, date, type, category, description, amount, labor, operator_id, created_by)
           values ($1, $2, $3, $4, 'labor', 'labor', 'x', 1, jsonb_build_object('hours', $5::numeric), 'op-sofia', 'Laura')`,
          [org, id, MAIN_DEMO_PROJECT_ID, date, hours],
        ),
      );
    expect(await insert(future.toISOString().slice(0, 10), 2, "h-future")).toMatch(/futura/);
    expect(await insert(daysAgo(3), 25, "h-25")).toMatch(/24 h/);
  });
  it("no se elimina un operario con horas registradas", async () => {
    expect(await errorAs(db, laura, (tx) => tx.query("delete from operators where organization_id = $1 and id = 'op-juan'", [org]))).toMatch(
      /solo dar de baja/,
    );
  });
  it("el libro de stock no se edita", async () => {
    expect(
      await errorAs(db, laura, (tx) => tx.query("update stock_movements set quantity = quantity + 1 where organization_id = $1", [org])),
    ).toMatch(/solo crece/);
  });
});

describe("Operario activo (Juan)", () => {
  it("no tiene acceso directo a ninguna tabla con plata", async () => {
    for (const t of ["projects", "budget_lines", "purchase_entries", "material_usages", "actual_entries", "operators", "stock_lots", "activity_events"]) {
      expect(await rows(juan, `select * from ${t}`)).toHaveLength(0);
    }
    expect(await rows(juan, "select name from organizations")).toHaveLength(1);
    expect(await rows(juan, "select user_id from organization_members")).toEqual([{ user_id: juan }]);
  });
  it("no puede escribir directo en las tablas", async () => {
    const updated = await rows(juan, "update projects set sales_price = 1 where organization_id = $1 returning id", [org]);
    expect(updated).toHaveLength(0);
    expect(
      await errorAs(db, juan, (tx) =>
        tx.query(
          "insert into actual_entries (organization_id, id, project_id, date, type, category, description, amount, labor, created_by) values ($1, 'x', $2, $3, 'outsourcing', 'outsourcing', 'x', 1, null, 'Juan')",
          [org, MAIN_DEMO_PROJECT_ID, daysAgo(2)],
        ),
      ),
    ).toMatch(/row-level security/);
  });
  it("taller_workspace trae solo sus proyectos en Taller y sin costos, precios ni márgenes", async () => {
    const [{ ws }] = await rows(juan, "select taller_workspace() as ws");
    const json = ws as { status: string; projects: { id: string; status: string; sales_price: number; assigned_operator_ids: string[] }[]; actual_entries: { amount: number; labor: { hourlyCost: number } }[]; stock_lots: { unit_cost: number }[] };
    expect(json.status).toBe("active");
    const expected = seed.projects.filter((p) => !p.isClosed && ["purchasing", "production", "installation"].includes(p.status) && p.assignedOperatorIds.includes("op-juan"));
    expect(json.projects.map((p) => p.id).sort()).toEqual(expected.map((p) => p.id).sort());
    expect(json.projects.every((p) => p.sales_price === 0)).toBe(true);
    expect(json.actual_entries.every((e) => e.amount === 0 && e.labor.hourlyCost === 0)).toBe(true);
    expect(json.stock_lots.length).toBeGreaterThan(0);
    expect(json.stock_lots.every((l) => l.unit_cost === 0)).toBe(true);
    const text = JSON.stringify(ws);
    for (const p of expected) expect(text).not.toContain(`"sales_price":${p.salesPrice}`);
    expect(text).not.toContain("15000");
  });
  it("carga sus horas y el costo lo calcula el servidor", async () => {
    await asUser(db, juan, (tx) =>
      tx.query("select taller_log_hours($1::jsonb)", [
        JSON.stringify({ id: "h-juan-1", project_id: MAIN_DEMO_PROJECT_ID, date: daysAgo(2), hours: 3, work_type: "Armado" }),
      ]),
    );
    const [e] = (await db.query<{ amount: string; labor: { hourlyCost: number } }>("select amount, labor from actual_entries where id = 'h-juan-1'")).rows;
    expect(Number(e.amount)).toBe(45_000);
    expect(e.labor.hourlyCost).toBe(15_000);
  });
  it("no carga en proyectos donde no está asignado", async () => {
    const other = seed.projects.find((p) => p.status === "quotation")!;
    expect(
      await errorAs(db, juan, (tx) =>
        tx.query("select taller_log_hours($1::jsonb)", [JSON.stringify({ project_id: other.id, date: daysAgo(2), hours: 1, work_type: "Armado" })]),
      ),
    ).toMatch(/No estás asignado/);
  });
  it("registra consumo: el costo sale del lote, no del navegador", async () => {
    const project = seed.projects.find((p) => p.id === MAIN_DEMO_PROJECT_ID)!;
    const holding = projectHoldings(seed.stock, project.id)[0];
    const ctx: ops.Ctx = { actor: "Juan Pérez", now: new Date().toISOString(), role: "operator", operatorId: "op-juan" };
    const res = ops.registerUsage(
      project,
      seed.stock,
      { materialId: holding.lot.materialId, materialName: holding.lot.materialName, unit: holding.lot.unit, consumed: 0.5, waste: 0.1, date: daysAgo(1), leftover: { quantity: 0.2 } },
      DEFAULT_SETTINGS,
      ctx,
    );
    const calls = tallerCalls(
      { projects: seed.projects, stock: seed.stock, requests: [] },
      { projects: seed.projects.map((p) => (p.id === project.id ? res.project : p)), stock: res.stock, requests: [] },
      org,
    );
    expect(calls.map((c) => c.fn)).toEqual(["taller_register_usage"]);
    // Aunque el navegador mandara un costo, el servidor usa el del lote.
    await asUser(db, juan, (tx) => tx.query("select taller_register_usage($1::jsonb)", [JSON.stringify(calls[0].p)]));
    const usages = (await db.query<{ unit_cost: string; quantity_consumed: string }>(
      "select unit_cost, quantity_consumed from material_usages where organization_id = $1 and created_by = 'Juan Pérez'",
      [org],
    )).rows;
    expect(usages.length).toBeGreaterThan(0);
    expect(Number(usages[0].unit_cost)).toBe(holding.lot.unitCost);
    const [leftover] = (await db.query<{ unit_cost: string }>(
      "select unit_cost from stock_lots where organization_id = $1 and kind = 'leftover' and created_by = 'Juan Pérez'",
      [org],
    )).rows;
    expect(Number(leftover.unit_cost)).toBe(holding.lot.unitCost);
  });
  it("no puede usar más material del asignado", async () => {
    const holding = projectHoldings(seed.stock, MAIN_DEMO_PROJECT_ID)[0];
    const place = { type: "project", projectId: MAIN_DEMO_PROJECT_ID };
    const p = {
      project_id: MAIN_DEMO_PROJECT_ID,
      date: daysAgo(1),
      movements: [{ id: "mov-big", lot_id: holding.lot.id, kind: "consume", quantity: 9999, from_place: place, to_place: { type: "consumed", projectId: MAIN_DEMO_PROJECT_ID }, project_id: MAIN_DEMO_PROJECT_ID }],
      usages: [{ id: "use-big", lot_id: holding.lot.id, material_id: holding.lot.materialId, quantity_consumed: 9999, waste_quantity: 0 }],
    };
    expect(await errorAs(db, juan, (tx) => tx.query("select taller_register_usage($1::jsonb)", [JSON.stringify(p)]))).toMatch(/No alcanza/);
  });
  it("no puede sacar material de otro proyecto", async () => {
    const other = seed.projects.find((x) => x.id !== MAIN_DEMO_PROJECT_ID && projectHoldings(seed.stock, x.id).length > 0)!;
    const holding = projectHoldings(seed.stock, other.id)[0];
    const p = {
      project_id: MAIN_DEMO_PROJECT_ID,
      date: daysAgo(1),
      movements: [{ id: "mov-steal", lot_id: holding.lot.id, kind: "consume", quantity: 0.1, from_place: { type: "project", projectId: other.id }, to_place: { type: "consumed", projectId: MAIN_DEMO_PROJECT_ID } }],
      usages: [{ id: "use-steal", lot_id: holding.lot.id, material_id: holding.lot.materialId, quantity_consumed: 0.1, waste_quantity: 0 }],
    };
    expect(await errorAs(db, juan, (tx) => tx.query("select taller_register_usage($1::jsonb)", [JSON.stringify(p)]))).toMatch(/asignado a este proyecto/);
  });
  it("pide material y deja una nota; Gestión los ve", async () => {
    await asUser(db, juan, async (tx) => {
      await tx.query("select taller_request_material($1::jsonb)", [
        JSON.stringify({ id: "req-juan", project_id: MAIN_DEMO_PROJECT_ID, material_id: "bisagra", material_name: "Herraje bisagra", quantity: 10, unit: "u" }),
      ]);
      await tx.query("select taller_add_stage_log($1::jsonb)", [
        JSON.stringify({ id: "log-juan", project_id: MAIN_DEMO_PROJECT_ID, stage: "production", date: daysAgo(1), kind: "incident", text: "Se rompió una placa al cortar." }),
      ]);
    });
    expect(await rows(laura, "select id from material_requests where id = 'req-juan'")).toHaveLength(1);
    expect(await rows(laura, "select id from stage_logs where id = 'log-juan'")).toHaveLength(1);
  });
  it("ve los archivos de su empresa, no los de otra", async () => {
    await db.query("insert into storage.objects (bucket_id, name) values ('project-files', $1), ('project-files', $2)", [
      `${org}/${MAIN_DEMO_PROJECT_ID}/foto.jpg`,
      `00000000-0000-0000-0000-000000000000/p-ajeno/plano.pdf`,
    ]);
    const visible = await rows(juan, "select name from storage.objects");
    expect(visible.map((o) => o.name)).toEqual([`${org}/${MAIN_DEMO_PROJECT_ID}/foto.jpg`]);
  });
});

describe("Operario dado de baja (Diego)", () => {
  it("antes de la baja tiene acceso a Taller", async () => {
    const [{ ws }] = await rows(diego, "select taller_workspace() as ws");
    expect((ws as { status: string }).status).toBe("active");
  });
  it("la baja le corta el acceso real a la base", async () => {
    await asUser(db, laura, (tx) => tx.query("update operators set active = false, deactivated_at = now() where organization_id = $1 and id = 'op-diego'", [org]));
    const [{ ws }] = await rows(diego, "select taller_workspace() as ws");
    expect(ws).toEqual({ status: "inactive" });
    expect(await rows(diego, "select * from organizations")).toHaveLength(0);
    expect(await rows(diego, "select name from storage.objects")).toHaveLength(0);
    expect(
      await errorAs(db, diego, (tx) =>
        tx.query("select taller_log_hours($1::jsonb)", [JSON.stringify({ project_id: MAIN_DEMO_PROJECT_ID, date: daysAgo(1), hours: 1, work_type: "Armado" })]),
      ),
    ).toMatch(/dado de baja/);
  });
  it("con deactivated_at alcanza para cortar el acceso, aunque quede active = true", async () => {
    await db.query("update operators set active = true, deactivated_at = now() where organization_id = $1 and id = 'op-diego'", [org]);
    const [{ ws }] = await rows(diego, "select taller_workspace() as ws");
    expect(ws).toEqual({ status: "inactive" });
  });
  it("al reactivarlo vuelve a tener acceso", async () => {
    await asUser(db, laura, (tx) => tx.query("update operators set active = true, deactivated_at = null where organization_id = $1 and id = 'op-diego'", [org]));
    const [{ ws }] = await rows(diego, "select taller_workspace() as ws");
    expect((ws as { status: string }).status).toBe("active");
  });
});
