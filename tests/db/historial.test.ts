// Historial y dataset para estimación (migración 20261023120000) en un Postgres real (PGlite):
// clientes normalizados, cierre congelado e inmutable, curaduría, predicciones, vistas y seguridad por rol/empresa.
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { DEFAULT_SETTINGS } from "@/lib/constants";
import { buildClosureSnapshot } from "@/lib/closure-snapshot";
import { buildSeed } from "@/lib/seed-data";
import { workspacePayload } from "@/lib/supabase/workspace";
import type { Project } from "@/types";
import { asUser, createDb, errorAs, signUp } from "./harness";

let db: PGlite;
let org = "";
let laura = ""; // Administrativo (owner)
let carla = ""; // Jefe de planta
let juan = ""; // Operario
let otro = ""; // Otra empresa
let projects: Project[] = [];
let closed: Project[] = [];

const rows = async (userId: string, sql: string, params: unknown[] = []) =>
  asUser(db, userId, async (tx) => (await tx.query<Record<string, unknown>>(sql, params)).rows);
const one = async <T,>(userId: string, sql: string, params: unknown[] = []): Promise<T> => (await rows(userId, sql, params))[0]?.r as T;
const record = (userId: string, p: Project) => one<boolean>(userId, "select admin_record_closure($1::jsonb) as r", [JSON.stringify(buildClosureSnapshot(p))]);
const similar = (userId: string, type: string | null, includeDemo = false, limit = 10) =>
  one<{ sample_size: number; returned: number; includes_demo: boolean; items: { project_id: string; data_origin: string; client_name: string | null; summary_text: string }[] }>(
    userId, "select admin_similar_closures($1, $2, $3) as r", [type, limit, includeDemo]);

beforeAll(async () => {
  db = await createDb();
  laura = await signUp(db, "laura@demo.com", "Laura Gómez");
  org = (await db.query<{ organization_id: string }>("select organization_id from organization_members where user_id = $1", [laura])).rows[0].organization_id;
  const s = buildSeed(new Date());
  projects = s.projects;
  closed = projects.filter((p) => p.isClosed && p.status === "completed");
  const payload = workspacePayload(org, { projects, operators: s.operators, stock: s.stock, requests: [], assignments: [], orders: [], settings: { ...DEFAULT_SETTINGS }, resolvedAlertIds: [] });
  await asUser(db, laura, (tx) => tx.query("select reset_workspace($1::jsonb)", [JSON.stringify(payload)]));
  const inv = (p: Record<string, unknown>) => asUser(db, laura, (tx) => tx.query("select admin_invite_member($1::jsonb)", [JSON.stringify(p)]));
  await inv({ email: "carla@demo.com", display_name: "Carla Sosa", role: "jefe_planta" });
  await inv({ email: "juan@demo.com", display_name: "Juan Pérez", role: "operator", operator_id: "op-juan" });
  carla = await signUp(db, "carla@demo.com", "Carla");
  juan = await signUp(db, "juan@demo.com", "Juan");
  otro = await signUp(db, "otra@empresa.com", "Otra Persona");
}, 120_000);

describe("clientes como entidad", () => {
  it("cada proyecto con cliente queda vinculado a un cliente normalizado", async () => {
    const r = await db.query<{ n: number }>("select count(*)::int n from projects where organization_id = $1 and client <> '' and client_id is null", [org]);
    expect(r.rows[0].n).toBe(0);
    const c = await db.query<{ n: number; names: number }>("select count(*)::int n, count(distinct name_key)::int names from clients where organization_id = $1", [org]);
    expect(c.rows[0].n).toBeGreaterThan(0);
    expect(c.rows[0].n).toBe(c.rows[0].names);
  });

  it("“  retail   SUR ” y “Retail Sur” son el mismo cliente (sin acentos ni mayúsculas)", async () => {
    const before = (await db.query<{ n: number }>("select count(*)::int n from clients where organization_id = $1", [org])).rows[0].n;
    await db.query(
      `insert into projects (organization_id, id, code, name, client, project_type, status, start_date, due_date)
       values ($1, 'p-test-cli', 'P-T1', 'Prueba cliente', '  retail   SUR ', 'Local comercial', 'quotation', current_date, current_date + 10)`,
      [org],
    );
    const same = await db.query<{ a: string; b: string }>(
      "select (select client_id from projects where organization_id = $1 and id = 'p-test-cli') a, (select client_id from projects where organization_id = $1 and client = 'Retail Sur' limit 1) b", [org]);
    expect(same.rows[0].a).toBeTruthy();
    expect(same.rows[0].a).toBe(same.rows[0].b);
    const after = (await db.query<{ n: number }>("select count(*)::int n from clients where organization_id = $1", [org])).rows[0].n;
    expect(after).toBe(before); // no creó un cliente duplicado
    await db.query("select set_config('blerp.bulk', 'on', false)");
    await db.query("delete from projects where organization_id = $1 and id = 'p-test-cli'", [org]);
    await db.query("select set_config('blerp.bulk', 'off', false)");
  });

  it("solo Administrativo lee los clientes", async () => {
    expect((await rows(laura, "select id from clients")).length).toBeGreaterThan(0);
    expect(await rows(carla, "select id from clients")).toHaveLength(0);
    expect(await rows(juan, "select id from clients")).toHaveLength(0);
    expect(await rows(otro, "select id from clients")).toHaveLength(0);
  });
});

describe("cierre congelado", () => {
  it("la demo tiene proyectos finalizados para probar", () => {
    expect(closed.length).toBeGreaterThanOrEqual(4);
  });

  it("un proyecto abierto no se puede congelar", async () => {
    const open = projects.find((p) => !p.isClosed)!;
    const err = await errorAs(db, laura, (tx) => tx.query("select admin_record_closure($1::jsonb)", [JSON.stringify({ ...buildClosureSnapshot(closed[0]), project_id: open.id })]));
    expect(err).toMatch(/todavía no está cerrado/);
  });

  it("se guarda una vez y es idempotente; la identidad sale de projects, no del cliente", async () => {
    const p = closed[0];
    const forged = { ...buildClosureSnapshot(p), project_type: "FALSO", sales_price: 1, data_origin: "app" };
    expect(await one<boolean>(laura, "select admin_record_closure($1::jsonb) as r", [JSON.stringify(forged)])).toBe(true);
    expect(await record(laura, p)).toBe(false);
    const r = (await rows(laura, "select * from project_closures where project_id = $1", [p.id]))[0];
    expect(r.project_type).toBe(p.projectType);
    expect(Number(r.sales_price)).toBe(p.salesPrice);
    expect(r.project_code).toBe(p.code);
    expect(r.client_id).toBeTruthy();
    expect(Number(r.final_cost)).toBeCloseTo(buildClosureSnapshot(p).final_cost, 2);
  });

  it("acepta un payload parcial (p. ej. un importador): los campos opcionales quedan vacíos, no en error", async () => {
    const p = closed[3];
    const partial = { project_id: p.id, budget_total: 1000, final_cost: 1100, budget_by_category: { materials: 1000 }, actual_by_category: { materials: 1100 }, summary_text: "parcial", hours_by_rubro: null, materials: null };
    expect(await one<boolean>(laura, "select admin_record_closure($1::jsonb) as r", [JSON.stringify(partial)])).toBe(true);
    const r = (await rows(laura, "select schema_version, hours_by_rubro, materials, items from project_closures where project_id = $1", [p.id]))[0];
    expect(r.schema_version).toBe(1);
    expect(r.hours_by_rubro).toEqual({});
    expect(r.materials).toEqual([]);
    expect(r.items).toEqual([]);
    // Se borra con acceso directo (como superusuario, con la carga masiva activa) para no alterar los demás tests.
    await db.query("select set_config('blerp.bulk', 'on', false)");
    await db.query("delete from project_closures where project_id = $1", [p.id]);
    await db.query("select set_config('blerp.bulk', 'off', false)");
  });

  it("es historial: no se edita ni se borra (ni siquiera con acceso directo)", async () => {
    const id = closed[0].id;
    await expect(db.query("update project_closures set final_cost = 0 where project_id = $1", [id])).rejects.toThrow(/registro histórico/);
    await expect(db.query("delete from project_closures where project_id = $1", [id])).rejects.toThrow(/registro histórico/);
    // Por la API con RLS no hay política de edición ni de borrado: no cambia nada.
    await rows(laura, "update project_closures set final_cost = 0 where project_id = $1", [id]);
    await rows(laura, "delete from project_closures where project_id = $1", [id]);
    const still = (await rows(laura, "select final_cost from project_closures where project_id = $1", [id]))[0];
    expect(Number(still.final_cost)).toBeGreaterThan(0);
  });

  it("no se puede insertar a mano el cierre de un proyecto abierto (RLS)", async () => {
    const open = projects.find((p) => !p.isClosed)!;
    const snap = buildClosureSnapshot(closed[1]);
    const err = await errorAs(db, laura, (tx) =>
      tx.query(
        `insert into project_closures (organization_id, project_id, closed_at, data_origin, project_code, project_name, project_type, start_date, due_date, sales_price,
           budget_total, final_cost, budget_by_category, actual_by_category, summary_text)
         values ($1, $2, now(), 'app', 'X', 'X', 'X', current_date, current_date, 1, 1, 1, $3::jsonb, $3::jsonb, 'x')`,
        [org, open.id, JSON.stringify(snap.budget_by_category)],
      ),
    );
    expect(err).toMatch(/row-level security/i);
  });

  it("Jefe de planta, Operario y otras empresas no leen ni guardan cierres", async () => {
    expect(await rows(carla, "select 1 from project_closures")).toHaveLength(0);
    expect(await rows(juan, "select 1 from project_closures")).toHaveLength(0);
    expect(await rows(otro, "select 1 from project_closures")).toHaveLength(0);
    const attempt = (who: string) => errorAs(db, who, (tx) => tx.query("select admin_record_closure($1::jsonb)", [JSON.stringify(buildClosureSnapshot(closed[2]))]));
    expect(await attempt(carla)).toMatch(/Administrativo/);
    expect(await attempt(juan)).toMatch(/Administrativo/);
    // Otra empresa SÍ es Administrativa de lo suyo, pero no puede cerrar ni ver proyectos ajenos.
    expect(await attempt(otro)).toMatch(/Proyecto no encontrado/);
  });

  it("si la empresa es demo, el cierre queda marcado demo (se ignora lo que diga el cliente)", async () => {
    await db.query("update organizations set is_demo = true where id = $1", [org]);
    expect(await one<boolean>(laura, "select admin_record_closure($1::jsonb) as r", [JSON.stringify({ ...buildClosureSnapshot(closed[1]), data_origin: "imported" })])).toBe(true);
    const r = (await rows(laura, "select data_origin from project_closures where project_id = $1", [closed[1].id]))[0];
    expect(r.data_origin).toBe("demo");
  });
});

describe("proyectos parecidos (contexto para estimar / LLM)", () => {
  beforeAll(async () => {
    await db.query("update organizations set is_demo = false where id = $1", [org]);
    for (const p of closed) await record(laura, p);
    // closed[1] quedó como demo; el resto es “app” (real).
  });

  it("por defecto no mezcla datos demo; con p_include_demo los incluye y cada fila trae su origen", async () => {
    const real = await similar(laura, null);
    const withDemo = await similar(laura, null, true);
    expect(withDemo.sample_size).toBe(closed.length);
    expect(real.sample_size).toBe(closed.length - 1);
    expect(real.items.every((i) => i.data_origin !== "demo")).toBe(true);
    expect(withDemo.items.some((i) => i.data_origin === "demo")).toBe(true);
    expect(withDemo.includes_demo).toBe(true);
  });

  it("filtra por tipo y trae el resumen en texto y el cliente", async () => {
    const type = closed[0].projectType;
    const res = await similar(laura, type, true);
    expect(res.sample_size).toBe(closed.filter((p) => p.projectType === type).length);
    expect(res.items[0].summary_text).toContain(closed.find((p) => p.id === res.items[0].project_id)!.code);
    expect(res.items[0].client_name).toBeTruthy();
  });

  it("sample_size cuenta todos los comparables aunque se devuelvan menos", async () => {
    const res = await similar(laura, null, true, 1);
    expect(res.returned).toBe(1);
    expect(res.sample_size).toBe(closed.length);
  });

  it("solo Administrativo la usa, y cada empresa ve únicamente lo suyo", async () => {
    expect(await errorAs(db, carla, (tx) => tx.query("select admin_similar_closures()"))).toMatch(/Administrativo/);
    expect(await errorAs(db, juan, (tx) => tx.query("select admin_similar_closures()"))).toMatch(/Administrativo/);
    expect((await similar(otro, null, true)).sample_size).toBe(0);
  });

  it("un proyecto excluido por atípico sale del aprendizaje, y para excluir hace falta un motivo", async () => {
    const target = closed[2];
    const noReason = await errorAs(db, laura, (tx) => tx.query("insert into closure_reviews (organization_id, project_id, excluded) values ($1, $2, true)", [org, target.id]));
    expect(noReason).toMatch(/check constraint|violates/i);
    await rows(laura, "insert into closure_reviews (organization_id, project_id, excluded, reason) values ($1, $2, true, 'Hubo un rediseño pedido por el cliente')", [org, target.id]);
    const res = await similar(laura, null, true);
    expect(res.sample_size).toBe(closed.length - 1);
    expect(res.items.some((i) => i.project_id === target.id)).toBe(false);
    // Se puede volver a incluir (la curaduría sí se edita, con auditoría de quién y cuándo).
    await rows(laura, "update closure_reviews set excluded = false, reason = null where project_id = $1", [target.id]);
    expect((await similar(laura, null, true)).sample_size).toBe(closed.length);
  });
});

describe("vistas de dataset", () => {
  it("usable_for_training es falso para demo y para excluidos", async () => {
    const r = await rows(laura, "select project_id, data_origin, usable_for_training from dataset_closed_projects");
    expect(r.length).toBe(closed.length);
    for (const row of r) expect(row.usable_for_training).toBe(row.data_origin !== "demo");
  });

  it("dataset_category_deviation: siete categorías por proyecto y el desvío es real − presupuesto", async () => {
    const r = await rows(laura, "select * from dataset_category_deviation where project_id = $1", [closed[0].id]);
    expect(r).toHaveLength(7);
    for (const row of r) {
      expect(Number(row.deviation_amount)).toBeCloseTo(Number(row.actual) - Number(row.budget), 2);
      if (Number(row.budget) > 0) expect(Number(row.deviation_pct)).toBeCloseTo((Number(row.deviation_amount) / Number(row.budget)) * 100, 4);
      else expect(row.deviation_pct).toBeNull();
    }
    const total = r.reduce((n, row) => n + Number(row.actual), 0);
    expect(total).toBeCloseTo(buildClosureSnapshot(closed[0]).final_cost, 2);
  });

  it("dataset_material_deviation separa presupuestado, comprado, consumido, desperdicio y sobrante", async () => {
    const r = await rows(laura, "select * from dataset_material_deviation where project_id = $1", [closed[0].id]);
    const snap = buildClosureSnapshot(closed[0]).materials;
    expect(r).toHaveLength(snap.length);
    const imputed = r.reduce((n, row) => n + Number(row.imputed_cost), 0);
    expect(imputed).toBeCloseTo(snap.reduce((n, m) => n + m.imputed_cost, 0), 2);
  });

  it("las vistas respetan la seguridad de quien consulta", async () => {
    for (const v of ["dataset_closed_projects", "dataset_category_deviation", "dataset_material_deviation", "dataset_hours_deviation"]) {
      expect(await rows(carla, `select 1 from ${v}`)).toHaveLength(0);
      expect(await rows(juan, `select 1 from ${v}`)).toHaveLength(0);
      expect(await rows(otro, `select 1 from ${v}`)).toHaveLength(0);
    }
  });
});

describe("predicciones guardadas", () => {
  const prediction = (id: string, by: string) =>
    [org, id, by, JSON.stringify({ project_type: "Local comercial", items: [{ name: "Mesa", quantity: 6 }] }), JSON.stringify({ margin_low: 22, margin_median: 27, margin_high: 31 })];
  const insert = `insert into model_predictions (organization_id, id, kind, model_name, model_version, input, output, comparable_project_ids, sample_size, based_on_demo, created_by)
                  values ($1, $2, 'statistics', 'mediana-por-tipo', '1.0.0', $4::jsonb, $5::jsonb, array['p-a','p-b'], 2, true, $3)`;

  it("Administrativo guarda una estimación con su versión, entradas y comparables", async () => {
    await rows(laura, insert, prediction("pred-1", laura));
    const r = (await rows(laura, "select * from model_predictions where id = 'pred-1'"))[0];
    expect(r.model_version).toBe("1.0.0");
    expect(r.based_on_demo).toBe(true);
    expect((r.output as { margin_median: number }).margin_median).toBe(27);
  });

  it("no se puede firmar una estimación como otro usuario", async () => {
    expect(await errorAs(db, laura, (tx) => tx.query(insert, prediction("pred-2", carla)))).toMatch(/row-level security/i);
  });

  it("es historial: no se edita ni se borra", async () => {
    await expect(db.query("update model_predictions set output = '{}' where id = 'pred-1'")).rejects.toThrow(/historial/i);
    await expect(db.query("delete from model_predictions where id = 'pred-1'")).rejects.toThrow(/historial/i);
  });

  it("otros roles y otras empresas no las ven ni las crean", async () => {
    expect(await rows(carla, "select 1 from model_predictions")).toHaveLength(0);
    expect(await rows(otro, "select 1 from model_predictions")).toHaveLength(0);
    expect(await errorAs(db, carla, (tx) => tx.query(insert, prediction("pred-3", carla)))).toMatch(/row-level security/i);
  });
});

describe("restaurar la demo", () => {
  it("al vaciar los proyectos, los cierres se van con ellos (sin huérfanos)", async () => {
    await asUser(db, laura, (tx) => tx.query("select reset_workspace(null)"));
    const n = (await db.query<{ n: number }>("select count(*)::int n from project_closures where organization_id = $1", [org])).rows[0].n;
    expect(n).toBe(0);
  });
});
