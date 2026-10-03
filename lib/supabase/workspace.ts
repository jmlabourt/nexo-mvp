// ─────────────────────────────────────────────────────────────
// Lectura y escritura de la empresa (workspace) del usuario en Supabase.
// El store sigue aplicando operaciones puras en memoria; acá se persisten
// solo las partes que cambiaron (las operaciones son inmutables, así que
// alcanza con comparar referencias).
// ─────────────────────────────────────────────────────────────
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AlertSettings, Project, ReusableMaterial } from "@/types";
import { DEFAULT_SETTINGS } from "@/lib/constants";
import {
  CHILD_TABLES,
  childrenToRows,
  projectToRow,
  projectsFromRows,
  reusableFromRow,
  reusableToRow,
  type ChildKey,
} from "./mappers";

export interface Workspace {
  organizationId: string;
  organizationName: string;
  userName: string;
  userEmail: string;
  demoSeeded: boolean;
  projects: Project[];
  reusableMaterials: ReusableMaterial[];
  settings: AlertSettings;
  resolvedAlertIds: string[];
}

export interface WorkspaceData {
  projects: Project[];
  reusableMaterials: ReusableMaterial[];
  settings: AlertSettings;
  resolvedAlertIds: string[];
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
      .select("organization_id, display_name, organizations(name, demo_seeded, alert_settings)")
      .eq("user_id", user.id)
      .order("created_at")
      .limit(1)
      .maybeSingle(),
  ) as {
    organization_id: string;
    display_name: string;
    organizations: { name: string; demo_seeded: boolean; alert_settings: AlertSettings | null } | null;
  } | null;
  if (!membership || !membership.organizations) throw new Error("Tu usuario no tiene una empresa asociada.");

  const org = membership.organization_id;
  const [projects, budgetLines, purchaseEntries, materialUsages, actualEntries, activity, pool, resolved] = await Promise.all([
    check(await db.from("projects").select("*").eq("organization_id", org).order("created_at", { ascending: false })) as Record<
      string,
      unknown
    >[],
    selectAll(db, CHILD_TABLES.budgetLines, org),
    selectAll(db, CHILD_TABLES.purchaseEntries, org),
    selectAll(db, CHILD_TABLES.materialUsages, org),
    selectAll(db, CHILD_TABLES.actualEntries, org),
    selectAll(db, CHILD_TABLES.activity, org),
    selectAll(db, "reusable_materials", org),
    check(await db.from("resolved_alerts").select("alert_id").eq("organization_id", org)) as { alert_id: string }[],
  ]);

  return {
    organizationId: org,
    organizationName: membership.organizations.name,
    userName: membership.display_name || user.email?.split("@")[0] || "Usuario",
    userEmail: user.email ?? "",
    demoSeeded: membership.organizations.demo_seeded,
    projects: projectsFromRows({ projects, budgetLines, purchaseEntries, materialUsages, actualEntries, activity }),
    reusableMaterials: pool.map(reusableFromRow),
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

export async function syncPool(db: SupabaseClient, org: string, prev: ReusableMaterial[], next: ReusableMaterial[]) {
  if (prev === next) return;
  await replaceList(db, "reusable_materials", next.map((m, i) => reusableToRow(org, m, i)), removed(prev, next), org);
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
  check(await db.from("reusable_materials").delete().eq("organization_id", org));
  check(await db.from("resolved_alerts").delete().eq("organization_id", org));

  if (data) {
    if (data.projects.length) {
      check(await db.from("projects").insert(data.projects.map((p) => projectToRow(org, p))));
      for (const key of CHILD_KEYS) {
        const rows = data.projects.flatMap((p) => childrenToRows(key, org, p.id, p[key]));
        if (rows.length) check(await db.from(CHILD_TABLES[key]).insert(rows));
      }
    }
    if (data.reusableMaterials.length) {
      check(await db.from("reusable_materials").insert(data.reusableMaterials.map((m, i) => reusableToRow(org, m, i))));
    }
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
