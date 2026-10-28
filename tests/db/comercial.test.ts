// Rol Administración / Comercial / Diseño (migración 20261029120000) en un Postgres real (PGlite):
// qué lee, qué escribe, qué NO ve (costo real de mano de obra, facturas, cobros) y aislamiento entre empresas.
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { DEFAULT_SETTINGS } from "@/lib/constants";
import { buildSeed, STAR_PROJECT_ID } from "@/lib/seed-data";
import { childrenToRows, orderSeedRows, projectToRow } from "@/lib/supabase/mappers";
import { workspacePayload } from "@/lib/supabase/workspace";
import { asUser, createDb, errorAs, signUp } from "./harness";

let db: PGlite;
let org = "";
let laura = ""; // Gerencia (owner)
let ana = ""; // Administración (comercial)
let martin = ""; // Compras
let outsider = ""; // otra empresa
let outsiderOrg = "";

const seed = buildSeed(new Date());
const QUOTE = seed.projects.find((p) => p.status === "quotation")!;
const ACTIVE = seed.projects.find((p) => p.id === STAR_PROJECT_ID)!; // en producción
const CLOSED = seed.projects.find((p) => p.isClosed)!;
const today = new Date().toISOString().slice(0, 10);
const NEW_ID = "p-nuevo-adm";
const lineRows = (projectId: string, lines: typeof QUOTE.budgetLines) => childrenToRows("budgetLines", org, projectId, lines);

const rows = async (userId: string, sql: string, params: unknown[] = []) =>
  asUser(db, userId, async (tx) => (await tx.query<Record<string, unknown>>(sql, params)).rows);
const ws = async (userId: string) => (await rows(userId, "select comercial_workspace() as r"))[0].r as Record<string, Record<string, unknown>[] & Record<string, unknown>>;
const change = (userId: string, p: unknown) => asUser(db, userId, (tx) => tx.query("select comercial_commit_change($1::jsonb)", [JSON.stringify(p)]));
const changeError = (userId: string, p: unknown) => errorAs(db, userId, (tx) => tx.query("select comercial_commit_change($1::jsonb)", [JSON.stringify(p)]));
const ledgerError = (userId: string, p: unknown) => errorAs(db, userId, (tx) => tx.query("select ledger_commit($1::jsonb)", [JSON.stringify(p)]));
const stamp = async (id: string) => (await db.query<{ u: string }>("select updated_at::text as u from projects where organization_id = $1 and id = $2", [org, id])).rows[0]?.u ?? null;

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
  ana = await signUp(db, "ana@demo.com", "Ana");
  martin = await signUp(db, "martin@demo.com", "Martín");
  outsider = await signUp(db, "otra@empresa.com", "Otra Persona");
  outsiderOrg = (await db.query<{ organization_id: string }>("select organization_id from organization_members where user_id = $1", [outsider])).rows[0].organization_id;
}, 120_000);

describe("alta del rol", () => {
  it("una invitación como Administración deja a la persona con el rol comercial", async () => {
    const r = await db.query<{ role: string; display_name: string; deactivated_at: string | null }>("select role, display_name, deactivated_at from organization_members where user_id = $1", [ana]);
    expect(r.rows[0]).toMatchObject({ role: "comercial", display_name: "Ana Torres", deactivated_at: null });
  });
  it("un Administrativo puede pasar a alguien a Administración y volver (y nadie se cambia a sí mismo)", async () => {
    await asUser(db, laura, (tx) => tx.query("select admin_set_member_role($1, 'comercial')", [martin]));
    expect((await db.query<{ role: string }>("select role from organization_members where user_id = $1", [martin])).rows[0].role).toBe("comercial");
    await asUser(db, laura, (tx) => tx.query("select admin_set_member_role($1, 'compras')", [martin]));
    expect((await db.query<{ role: string }>("select role from organization_members where user_id = $1", [martin])).rows[0].role).toBe("compras");
    expect(await errorAs(db, laura, (tx) => tx.query("select admin_set_member_role($1, 'comercial')", [laura]))).toMatch(/propio rol/);
  });
  it("Administración no invita, no cambia roles y no ve la lista de usuarios", async () => {
    expect(await errorAs(db, ana, (tx) => tx.query("select admin_invite_member($1::jsonb)", [JSON.stringify({ email: "x@y.com", display_name: "Xx", role: "compras" })]))).toMatch(/Administrativo/);
    expect(await errorAs(db, ana, (tx) => tx.query("select admin_set_member_role($1, 'compras')", [martin]))).toMatch(/Administrativo/);
    expect(await errorAs(db, ana, (tx) => tx.query("select admin_members()"))).toMatch(/Administrativo/);
  });
  it("un rol inventado se rechaza", async () => {
    expect(await errorAs(db, laura, (tx) => tx.query("select admin_invite_member($1::jsonb)", [JSON.stringify({ email: "z@y.com", display_name: "Zz", role: "dueño" })]))).toMatch(/rol válido/);
  });
});

describe("lectura: comercial_workspace", () => {
  it("ve proyectos con precio de venta y el costo presupuestado", async () => {
    const w = await ws(ana);
    expect((w as unknown as { status: string }).status).toBe("active");
    const projects = w.projects as unknown as Record<string, unknown>[];
    expect(projects.length).toBe(seed.projects.length);
    expect(Number(projects.find((p) => p.id === ACTIVE.id)!.sales_price)).toBe(ACTIVE.salesPrice);
    expect((w.budget_lines as unknown as unknown[]).length).toBeGreaterThan(0);
    expect(Array.isArray(w.hour_rates)).toBe(true);
  });
  it("las horas reales llegan sin importe ni costo por hora; los costos que no son de mano de obra, completos", async () => {
    const w = await ws(ana);
    const entries = w.actual_entries as unknown as { type: string; amount: number | string; labor: Record<string, unknown> | null }[];
    const labor = entries.filter((e) => e.type === "labor");
    expect(labor.length).toBeGreaterThan(0);
    for (const e of labor) {
      expect(Number(e.amount)).toBe(0);
      expect(e.labor).not.toHaveProperty("hourlyCost");
    }
    const others = entries.filter((e) => e.type !== "labor");
    if (others.length) expect(others.some((e) => Number(e.amount) > 0)).toBe(true);
  });
  it("los operarios llegan sin costo por hora ni PIN, y no llegan precios de costo de personas", async () => {
    const w = await ws(ana);
    for (const o of w.operators as unknown as Record<string, unknown>[]) {
      expect(o).not.toHaveProperty("hourly_cost");
      expect(o).not.toHaveProperty("pin_hash");
    }
    const kinds = new Set((w.price_history as unknown as { kind: string }[]).map((h) => h.kind));
    expect(kinds.has("operator_cost")).toBe(false);
    expect(kinds.has("overtime_multiplier")).toBe(false);
  });
  it("solo la entiende quien tiene el rol (ni Gerencia, ni Compras, ni otra empresa)", async () => {
    expect(await errorAs(db, laura, (tx) => tx.query("select comercial_workspace()"))).toMatch(/no es de Administración/);
    expect(await errorAs(db, martin, (tx) => tx.query("select comercial_workspace()"))).toMatch(/no es de Administración/);
    expect(await errorAs(db, outsider, (tx) => tx.query("select comercial_workspace()"))).toMatch(/no es de Administración/);
  });
  it("una cuenta dada de baja no lee nada", async () => {
    await db.query("update organization_members set deactivated_at = now() where user_id = $1", [ana]);
    const r = await rows(ana, "select comercial_workspace() as r");
    await db.query("update organization_members set deactivated_at = null where user_id = $1", [ana]);
    expect((r[0].r as { status: string }).status).toBe("inactive");
  });
  it("directo a las tablas no lee ni escribe nada (las funciones son la única vía)", async () => {
    for (const t of ["projects", "budget_lines", "actual_entries", "operators", "hour_rates", "cost_settings", "sales_invoices", "collections", "rate_records", "general_costs"]) {
      expect((await rows(ana, `select count(*)::int as c from ${t}`))[0].c, t).toBe(0);
    }
    expect(await errorAs(db, ana, (tx) => tx.query("update projects set name = 'hack' where organization_id = $1", [org]))).toBeNull();
    expect((await db.query<{ c: number }>("select count(*)::int as c from projects where name = 'hack'")).rows[0].c).toBe(0);
    expect(await errorAs(db, ana, (tx) => tx.query("insert into budget_lines (organization_id, id, project_id, position, category, description, unit, unit_cost, total) values ($1,'x',$2,0,'materials','x','u',1,1)", [org, QUOTE.id]))).toMatch(/row-level security/);
  });
});

describe("escritura: comercial_commit_change", () => {
  const newProject = () => ({ ...QUOTE, id: NEW_ID, code: "P-9001", name: "Cocina Pérez", client: "Familia Pérez", items: [], budgetLines: [], updatedAt: today });

  it("crea una cotización con su presupuesto", async () => {
    const line = { ...QUOTE.budgetLines[0], id: "bl-adm-1", total: 5000, unitCost: 5000, quantity: 1 };
    await change(ana, {
      expected_projects: [{ id: NEW_ID, updated_at: null }],
      tables: {
        projects: { rows: [projectToRow(org, newProject())], removed: [] },
        budget_lines: { rows: lineRows(NEW_ID, [line]), removed: [] },
      },
    });
    const r = await db.query<{ n: number }>("select count(*)::int as n from budget_lines where organization_id = $1 and project_id = $2", [org, NEW_ID]);
    expect(r.rows[0].n).toBe(1);
    // El cliente se dio de alta solo (disparador existente) y Gerencia lo ve.
    expect((await db.query<{ c: number }>("select count(*)::int as c from clients where organization_id = $1 and name = 'Familia Pérez'", [org])).rows[0].c).toBe(1);
  });
  it("edita la cotización y la aprueba (cotización → aprobado)", async () => {
    const before = await stamp(NEW_ID);
    await change(ana, {
      expected_projects: [{ id: NEW_ID, updated_at: before }],
      tables: { projects: { rows: [projectToRow(org, { ...newProject(), name: "Cocina Pérez (v2)", salesPrice: 9000 })], removed: [] } },
    });
    const after = await stamp(NEW_ID);
    await change(ana, {
      expected_projects: [{ id: NEW_ID, updated_at: after }],
      tables: { projects: { rows: [projectToRow(org, { ...newProject(), name: "Cocina Pérez (v2)", salesPrice: 9000, status: "approved" })], removed: [] } },
    });
    expect((await db.query<{ status: string; name: string }>("select status, name from projects where organization_id = $1 and id = $2", [org, NEW_ID])).rows[0]).toMatchObject({ status: "approved", name: "Cocina Pérez (v2)" });
  });
  it("detecta una sesión desactualizada", async () => {
    expect(await changeError(ana, {
      expected_projects: [{ id: NEW_ID, updated_at: "2020-01-01T00:00:00Z" }],
      tables: { projects: { rows: [projectToRow(org, { ...newProject(), status: "approved", name: "Pisada" })], removed: [] } },
    })).toMatch(/cambió en otra sesión/);
  });
  it("no avanza la producción ni cierra proyectos", async () => {
    const before = await stamp(NEW_ID);
    expect(await changeError(ana, {
      expected_projects: [{ id: NEW_ID, updated_at: before }],
      tables: { projects: { rows: [projectToRow(org, { ...newProject(), status: "production" })], removed: [] } },
    })).toMatch(/avanza Gerencia/);
  });
  it("un proyecto ya en marcha o cerrado lo cambia solo Gerencia", async () => {
    const act = await stamp(ACTIVE.id);
    expect(await changeError(ana, {
      expected_projects: [{ id: ACTIVE.id, updated_at: act }],
      tables: { projects: { rows: [projectToRow(org, { ...ACTIVE, name: "Otro nombre", status: "approved" })], removed: [] } },
    })).toMatch(/en marcha/);
    const closed = await stamp(CLOSED.id);
    expect(await changeError(ana, {
      expected_projects: [{ id: CLOSED.id, updated_at: closed }],
      tables: { projects: { rows: [projectToRow(org, { ...CLOSED, name: "Reabierto" })], removed: [] } },
    })).toMatch(/cerrado|avanza Gerencia/);
    // Presupuesto y muebles de un proyecto en marcha: tampoco.
    expect(await changeError(ana, { tables: { budget_lines: { rows: lineRows(ACTIVE.id, [{ ...ACTIVE.budgetLines[0], id: "bl-hack" }]), removed: [] } } })).toMatch(/en marcha/);
  });
  it("no toca costos reales, operarios ni stock", async () => {
    for (const t of ["actual_entries", "operators", "stock_lots", "purchase_entries", "material_usages", "stock_movements", "material_requests"]) {
      expect(await changeError(ana, { tables: { [t]: { rows: [{ organization_id: org, id: "x" }], removed: [] } } }), t).toMatch(/Gerencia/);
    }
  });
  it("las líneas de una cotización se pueden quitar; las de un proyecto aprobado, no", async () => {
    // Cotización existente: se quita una línea.
    const line = QUOTE.budgetLines[0];
    await change(ana, { tables: { budget_lines: { rows: [], removed: [line.id] } } });
    expect((await db.query<{ c: number }>("select count(*)::int as c from budget_lines where organization_id = $1 and id = $2", [org, line.id])).rows[0].c).toBe(0);
    // Proyecto aprobado: el presupuesto está congelado.
    expect(await changeError(ana, { tables: { budget_lines: { rows: [], removed: ["bl-adm-1"] } } })).toMatch(/aprobado|en marcha|queda en el historial/);
    expect((await db.query<{ c: number }>("select count(*)::int as c from budget_lines where organization_id = $1 and id = 'bl-adm-1'", [org])).rows[0].c).toBe(1);
  });
  it("Gerencia y Compras no usan esta función; solo Administración", async () => {
    expect(await changeError(laura, { tables: {} })).toMatch(/registra Administración/);
    expect(await changeError(martin, { tables: {} })).toMatch(/registra Administración/);
  });
  it("otra empresa: ni escribe en la suya ni toca proyectos ajenos", async () => {
    expect(await changeError(ana, { tables: { projects: { rows: [{ ...projectToRow(outsiderOrg, newProject()), id: "p-x" }], removed: [] } } })).toMatch(/Empresa inválida/);
    expect(await changeError(ana, { tables: { activity_events: { rows: [{ organization_id: org, id: "ev-x", project_id: "no-existe", position: 0, at: today, actor: "Ana", kind: "note", message: "x" }], removed: [] } } })).toMatch(/no existe/);
  });
  it("deja constancia en la actividad y adjuntos de un proyecto abierto", async () => {
    await change(ana, { tables: { activity_events: { rows: [{ organization_id: org, id: "ev-adm-1", project_id: NEW_ID, position: 99, at: new Date().toISOString(), actor: "Ana Torres", kind: "note", message: "Se envió la cotización" }], removed: [] } } });
    expect((await db.query<{ c: number }>("select count(*)::int as c from activity_events where organization_id = $1 and id = 'ev-adm-1'", [org])).rows[0].c).toBe(1);
  });
});

describe("el ledger desde Administración", () => {
  it("lee contrato, condiciones de pago, BOM, clientes y proveedores, pero no facturas ni cobros", async () => {
    await asUser(db, laura, (tx) => tx.query("select ledger_commit($1::jsonb)", [JSON.stringify({ salesInvoices: { upsert: [{ id: "fv-1", projectId: ACTIVE.id, number: "A-1", date: today, amount: 1000 }] }, generalCosts: { upsert: [{ id: "gc-1", name: "Alquiler", monthlyAmount: 5 }] } })]));
    const [r] = await rows(ana, "select ledger_workspace() as r");
    const l = r.r as Record<string, unknown>;
    expect(l.salesInvoices).toEqual([]);
    expect(l.collections).toEqual([]);
    expect(l.generalCosts).toEqual([]);
    expect(l.rates).toEqual([]);
    expect(l.clients).not.toBeUndefined();
    expect(typeof l.financialMonthlyRatePct).toBe("number");
  });
  it("carga condiciones de pago y clientes; no factura, no cobra, no confirma entregas", async () => {
    await asUser(db, ana, (tx) => tx.query("select ledger_commit($1::jsonb)", [JSON.stringify({ paymentTerms: { upsert: [{ projectId: NEW_ID, daysAfterDelivery: 30, schedule: [{ id: "c1", label: "Seña", amount: 100, date: today }] }] }, clients: { upsert: [{ id: "cli-ana-1", name: "Estudio Ríos", active: true }] } })]));
    expect(await ledgerError(ana, { salesInvoices: { upsert: [{ id: "fv-9", projectId: ACTIVE.id, number: "Z-1", date: today, amount: 5 }] } })).toMatch(/Gerencia/);
    expect(await ledgerError(ana, { collections: { upsert: [{ id: "cb-9", projectId: ACTIVE.id, date: today, amount: 5 }] } })).toMatch(/Gerencia/);
    expect(await ledgerError(ana, { rates: { upsert: [] } })).toMatch(/Gerencia/);
    expect(await ledgerError(ana, { handovers: { upsert: [] } })).toMatch(/Jefe de planta/);
  });
  it("sus horas propias: guarda con el costo congelado y Gerencia las ve con costo; ella no", async () => {
    await asUser(db, ana, (tx) => tx.query("select ledger_commit($1::jsonb)", [JSON.stringify({ internalHours: { upsert: [{ id: "sh-ana", projectId: NEW_ID, date: today, hours: 2, task: "Diseño de cocina" }] } })]));
    const mine = ((await rows(ana, "select ledger_workspace() as r"))[0].r as { internalHours: { id: string; hourlyCost?: number }[] }).internalHours;
    expect(mine.map((h) => h.id)).toEqual(["sh-ana"]);
    expect(mine[0].hourlyCost).toBeUndefined();
    const all = ((await rows(laura, "select ledger_workspace() as r"))[0].r as { internalHours: { id: string; hourlyCost?: number }[] }).internalHours;
    expect(all.find((h) => h.id === "sh-ana")?.hourlyCost).toBeGreaterThan(0);
  });
});
