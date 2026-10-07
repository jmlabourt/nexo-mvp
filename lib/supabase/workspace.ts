// ─────────────────────────────────────────────────────────────
// Lectura y escritura de la empresa (workspace) del usuario en Supabase.
// El store sigue aplicando operaciones puras en memoria; acá se persisten
// solo las partes que cambiaron (las operaciones son inmutables, así que
// alcanza con comparar referencias).
// ─────────────────────────────────────────────────────────────
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AlertSettings, AppRole, MaterialRequest, Operator, Project } from "@/types";
import { DEFAULT_SETTINGS } from "@/lib/constants";
import type { StockState } from "@/lib/stock";
import { deriveLedgerFromLegacy } from "@/lib/stock-legacy";
import {
  CHILD_TABLES,
  childrenToRows,
  lotFromRow,
  lotToRow,
  movementFromRow,
  movementToRow,
  operatorFromRow,
  operatorToRow,
  projectToRow,
  projectsFromRows,
  requestFromRow,
  requestToRow,
  reusableFromRow,
  type ChildKey,
} from "./mappers";

export interface WorkspaceData {
  projects: Project[];
  operators: Operator[];
  stock: StockState;
  requests: MaterialRequest[];
  settings: AlertSettings;
  resolvedAlertIds: string[];
}

export interface Workspace extends WorkspaceData {
  organizationId: string;
  organizationName: string;
  userId: string;
  userName: string;
  userEmail: string;
  role: AppRole;
  demoSeeded: boolean;
  /**
   * true si la empresa tenía datos del modelo anterior (compras, usos, sobrantes) y todavía no tenía
   * stock: el ledger se derivó en memoria y hay que guardarlo.
   */
  stockMigrated: boolean;
}

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

async function selectAll(db: SupabaseClient, table: string, org: string) {
  return check(await db.from(table).select("*").eq("organization_id", org).order("position")) as Record<string, unknown>[];
}

export async function loadWorkspace(db: SupabaseClient): Promise<Workspace> {
  const { data: auth, error: authError } = await db.auth.getUser();
  if (authError || !auth.user) throw new Error("Tu sesión expiró. Volvé a iniciar sesión.");
  const user = auth.user;

  const membership = check(
    await db
      .from("organization_members")
      .select("organization_id, display_name, role, organizations(name, demo_seeded, alert_settings)")
      .eq("user_id", user.id)
      .order("created_at")
      .limit(1)
      .maybeSingle(),
  ) as {
    organization_id: string;
    display_name: string;
    role: AppRole;
    organizations: { name: string; demo_seeded: boolean; alert_settings: AlertSettings | null } | null;
  } | null;
  if (!membership || !membership.organizations) throw new Error("Tu usuario no tiene una empresa asociada.");

  const org = membership.organization_id;
  const [
    projects,
    budgetLines,
    purchaseEntries,
    materialUsages,
    actualEntries,
    activity,
    items,
    stageLogs,
    attachments,
    pool,
    operators,
    lots,
    movements,
    requests,
    resolved,
  ] = await Promise.all([
    check(await db.from("projects").select("*").eq("organization_id", org).order("created_at", { ascending: false })) as Record<
      string,
      unknown
    >[],
    selectAll(db, CHILD_TABLES.budgetLines, org),
    selectAll(db, CHILD_TABLES.purchaseEntries, org),
    selectAll(db, CHILD_TABLES.materialUsages, org),
    selectAll(db, CHILD_TABLES.actualEntries, org),
    selectAll(db, CHILD_TABLES.activity, org),
    selectAll(db, CHILD_TABLES.items, org),
    selectAll(db, CHILD_TABLES.stageLogs, org),
    selectAll(db, CHILD_TABLES.attachments, org),
    selectAll(db, "reusable_materials", org),
    selectAll(db, "operators", org),
    check(await db.from("stock_lots").select("*").eq("organization_id", org).order("created_at").order("id")) as Record<string, unknown>[],
    selectAll(db, "stock_movements", org),
    selectAll(db, "material_requests", org),
    check(await db.from("resolved_alerts").select("alert_id").eq("organization_id", org)) as { alert_id: string }[],
  ]);

  const domainProjects = projectsFromRows({ projects, budgetLines, purchaseEntries, materialUsages, actualEntries, activity, items, stageLogs, attachments });
  let stock: StockState = { lots: lots.map(lotFromRow), movements: movements.map(movementFromRow) };
  let stockMigrated = false;
  const hasLegacy = pool.length > 0 || domainProjects.some((p) => p.purchaseEntries.length > 0 || p.materialUsages.length > 0);
  if (stock.lots.length === 0 && stock.movements.length === 0 && hasLegacy) {
    // Empresa con datos del modelo anterior: se traducen a lotes y movimientos (sin tocar lo original).
    stock = deriveLedgerFromLegacy(domainProjects, pool.map(reusableFromRow));
    stockMigrated = true;
  }

  return {
    organizationId: org,
    organizationName: membership.organizations.name,
    userId: user.id,
    userName: membership.display_name || user.email?.split("@")[0] || "Usuario",
    userEmail: user.email ?? "",
    role: membership.role,
    demoSeeded: membership.organizations.demo_seeded,
    projects: domainProjects,
    operators: operators.map(operatorFromRow),
    stock,
    requests: requests.map(requestFromRow),
    stockMigrated,
    settings: { ...DEFAULT_SETTINGS, ...(membership.organizations.alert_settings ?? {}) },
    resolvedAlertIds: resolved.map((r) => r.alert_id),
  };
}

// ── Escrituras ────────────────────────────────────────────

/** Upsert de una lista completa + borrado de los ids que ya no están. */
async function replaceList(db: SupabaseClient, table: string, rows: Record<string, unknown>[], removedIds: string[], org: string) {
  if (rows.length) check(await db.from(table).upsert(rows, { onConflict: "organization_id,id" }));
  if (removedIds.length) check(await db.from(table).delete().eq("organization_id", org).in("id", removedIds));
}

function removed<T extends { id: string }>(prev: T[] | undefined, next: T[]): string[] {
  if (!prev) return [];
  const keep = new Set(next.map((x) => x.id));
  return prev.filter((x) => !keep.has(x.id)).map((x) => x.id);
}

const CHILD_KEYS = Object.keys(CHILD_TABLES) as ChildKey[];

export async function syncProject(db: SupabaseClient, org: string, prev: Project | undefined, next: Project) {
  check(await db.from("projects").upsert(projectToRow(org, next), { onConflict: "organization_id,id" }));
  for (const key of CHILD_KEYS) {
    if (prev && prev[key] === next[key]) continue;
    const items = next[key] as { id: string }[];
    await replaceList(db, CHILD_TABLES[key], childrenToRows(key, org, next.id, next[key]), removed(prev?.[key] as { id: string }[], items), org);
  }
}

/** El ledger de stock sólo crece: se insertan los lotes y movimientos nuevos. */
export async function syncStock(db: SupabaseClient, org: string, prev: StockState, next: StockState) {
  if (prev === next) return;
  const knownLots = new Set(prev.lots.map((l) => l.id));
  const knownMovs = new Set(prev.movements.map((m) => m.id));
  const lots = next.lots.filter((l) => !knownLots.has(l.id));
  const movs = next.movements.map((m, i) => ({ m, i })).filter(({ m }) => !knownMovs.has(m.id));
  if (lots.length) check(await db.from("stock_lots").upsert(lots.map((l) => lotToRow(org, l)), { onConflict: "organization_id,id" }));
  if (movs.length) {
    check(
      await db
        .from("stock_movements")
        .upsert(movs.map(({ m, i }) => movementToRow(org, m, i)), { onConflict: "organization_id,id" }),
    );
  }
}

export async function syncOperators(db: SupabaseClient, org: string, prev: Operator[], next: Operator[]) {
  if (prev === next) return;
  const before = new Map(prev.map((o) => [o.id, o]));
  const changed = next.map((o, i) => ({ o, i })).filter(({ o }) => before.get(o.id) !== o);
  if (changed.length) {
    check(await db.from("operators").upsert(changed.map(({ o, i }) => operatorToRow(org, o, i)), { onConflict: "organization_id,id" }));
  }
}

export async function syncRequests(db: SupabaseClient, org: string, prev: MaterialRequest[], next: MaterialRequest[]) {
  if (prev === next) return;
  const before = new Map(prev.map((q) => [q.id, q]));
  const changed = next.map((q, i) => ({ q, i })).filter(({ q }) => before.get(q.id) !== q);
  if (changed.length) {
    check(await db.from("material_requests").upsert(changed.map(({ q, i }) => requestToRow(org, q, i)), { onConflict: "organization_id,id" }));
  }
}

export async function saveSettings(db: SupabaseClient, org: string, settings: AlertSettings) {
  check(await db.from("organizations").update({ alert_settings: settings }).eq("id", org));
}

export async function setAlertResolved(db: SupabaseClient, org: string, alertId: string, resolved: boolean) {
  if (resolved) {
    check(await db.from("resolved_alerts").upsert({ organization_id: org, alert_id: alertId }, { onConflict: "organization_id,alert_id" }));
  } else {
    check(await db.from("resolved_alerts").delete().eq("organization_id", org).eq("alert_id", alertId));
  }
}

/** Borra todos los datos de la empresa y, si se pasa `data`, carga ese contenido (seed demo). */
export async function replaceWorkspace(db: SupabaseClient, org: string, data: WorkspaceData | null) {
  // Los hijos de proyectos se borran en cascada.
  check(await db.from("projects").delete().eq("organization_id", org));
  check(await db.from("stock_movements").delete().eq("organization_id", org));
  check(await db.from("stock_lots").delete().eq("organization_id", org));
  check(await db.from("material_requests").delete().eq("organization_id", org));
  check(await db.from("reusable_materials").delete().eq("organization_id", org));
  check(await db.from("resolved_alerts").delete().eq("organization_id", org));
  // Los operarios vinculados a un usuario (con login) se conservan; el resto se reemplaza.
  check(await db.from("operators").delete().eq("organization_id", org).is("user_id", null));

  if (data) {
    if (data.operators.length) {
      check(
        await db
          .from("operators")
          .upsert(data.operators.map((o, i) => operatorToRow(org, o, i)), { onConflict: "organization_id,id" }),
      );
    }
    if (data.projects.length) {
      check(await db.from("projects").insert(data.projects.map((p) => projectToRow(org, p))));
      for (const key of CHILD_KEYS) {
        const rows = data.projects.flatMap((p) => childrenToRows(key, org, p.id, p[key]));
        if (rows.length) check(await db.from(CHILD_TABLES[key]).insert(rows));
      }
    }
    if (data.stock.lots.length) check(await db.from("stock_lots").insert(data.stock.lots.map((l) => lotToRow(org, l))));
    if (data.stock.movements.length) {
      check(await db.from("stock_movements").insert(data.stock.movements.map((m, i) => movementToRow(org, m, i))));
    }
    if (data.requests.length) check(await db.from("material_requests").insert(data.requests.map((q, i) => requestToRow(org, q, i))));
    if (data.resolvedAlertIds.length) {
      check(await db.from("resolved_alerts").insert(data.resolvedAlertIds.map((alert_id) => ({ organization_id: org, alert_id }))));
    }
  }

  check(
    await db
      .from("organizations")
      .update({ demo_seeded: true, alert_settings: data?.settings ?? DEFAULT_SETTINGS })
      .eq("id", org),
  );
}
