// ─────────────────────────────────────────────────────────────
// Traducción entre el modelo de dominio (types/) y las filas de Supabase.
// El dominio no conoce la base: todo el snake_case vive acá.
// ─────────────────────────────────────────────────────────────
import type {
  ActivityEvent,
  ActualEntry,
  BudgetLine,
  MaterialUsageEntry,
  Project,
  PurchaseEntry,
  ReusableMaterial,
} from "@/types";

type Row = Record<string, unknown>;

/** Postgres devuelve timestamptz como "…+00:00"; el dominio usa ISO con "Z". */
function iso(v: unknown): string {
  return new Date(String(v)).toISOString();
}
function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v);
}
function opt<T>(v: T | null | undefined): T | undefined {
  return v ?? undefined;
}

export const CHILD_TABLES = {
  budgetLines: "budget_lines",
  purchaseEntries: "purchase_entries",
  materialUsages: "material_usages",
  actualEntries: "actual_entries",
  activity: "activity_events",
} as const;

export type ChildKey = keyof typeof CHILD_TABLES;

// ── Proyecto ──────────────────────────────────────────────

export function projectToRow(org: string, p: Project): Row {
  return {
    organization_id: org,
    id: p.id,
    code: p.code,
    name: p.name,
    client: p.client,
    project_type: p.projectType,
    description: p.description,
    status: p.status,
    start_date: p.startDate,
    due_date: p.dueDate,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
    sales_price: p.salesPrice,
    progress_percent: p.progressPercent,
    owner: p.owner,
    is_closed: p.isClosed,
    closed_at: p.closedAt ?? null,
  };
}

// ── Hijos ─────────────────────────────────────────────────

const childToRow: { [K in ChildKey]: (org: string, projectId: string, item: Project[K][number], position: number) => Row } = {
  budgetLines: (org, projectId, l: BudgetLine, position) => ({
    organization_id: org,
    id: l.id,
    project_id: projectId,
    position,
    category: l.category,
    description: l.description,
    material_id: l.materialId ?? null,
    quantity: l.quantity,
    unit: l.unit,
    unit_cost: l.unitCost,
    total: l.total,
    notes: l.notes ?? null,
  }),
  purchaseEntries: (org, projectId, e: PurchaseEntry, position) => ({
    organization_id: org,
    id: e.id,
    project_id: projectId,
    position,
    material_id: e.materialId ?? null,
    material_name: e.materialName,
    quantity: e.quantity,
    unit: e.unit,
    unit_cost: e.unitCost,
    total: e.total,
    supplier: e.supplier ?? null,
    date: e.date,
    notes: e.notes ?? null,
    created_by: e.createdBy,
    created_at: e.createdAt,
  }),
  materialUsages: (org, projectId, u: MaterialUsageEntry, position) => ({
    organization_id: org,
    id: u.id,
    project_id: projectId,
    position,
    material_id: u.materialId,
    material_name: u.materialName,
    date: u.date,
    quantity_consumed: u.quantityConsumed,
    waste_quantity: u.wasteQuantity,
    reusable_leftover_quantity: u.reusableLeftoverQuantity,
    unit: u.unit,
    unit_cost: u.unitCost,
    unit_cost_origin: u.unitCostOrigin,
    source: u.source,
    reusable_material_id: u.reusableMaterialId ?? null,
    notes: u.notes ?? null,
    created_by: u.createdBy,
    created_at: u.createdAt,
  }),
  actualEntries: (org, projectId, a: ActualEntry, position) => ({
    organization_id: org,
    id: a.id,
    project_id: projectId,
    position,
    date: a.date,
    type: a.type,
    category: a.category,
    description: a.description,
    amount: a.amount,
    supplier: a.supplier ?? null,
    labor: a.labor ?? null,
    notes: a.notes ?? null,
    created_by: a.createdBy,
    created_at: a.createdAt,
  }),
  activity: (org, projectId, e: ActivityEvent, position) => ({
    organization_id: org,
    id: e.id,
    project_id: projectId,
    position,
    at: e.at,
    actor: e.actor,
    kind: e.kind,
    message: e.message,
  }),
};

export function childrenToRows<K extends ChildKey>(key: K, org: string, projectId: string, items: Project[K]): Row[] {
  const toRow = childToRow[key] as (org: string, projectId: string, item: unknown, position: number) => Row;
  return items.map((item, i) => toRow(org, projectId, item, i));
}

function budgetLineFromRow(r: Row): BudgetLine {
  return {
    id: String(r.id),
    category: r.category as BudgetLine["category"],
    description: String(r.description),
    materialId: opt(r.material_id as string | null),
    quantity: r.quantity === null ? null : num(r.quantity),
    unit: String(r.unit),
    unitCost: num(r.unit_cost),
    total: num(r.total),
    notes: opt(r.notes as string | null),
  };
}

function purchaseFromRow(r: Row): PurchaseEntry {
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    materialId: opt(r.material_id as string | null),
    materialName: String(r.material_name),
    quantity: num(r.quantity),
    unit: String(r.unit),
    unitCost: num(r.unit_cost),
    total: num(r.total),
    supplier: opt(r.supplier as string | null),
    date: String(r.date),
    notes: opt(r.notes as string | null),
    createdBy: String(r.created_by),
    createdAt: iso(r.created_at),
  };
}

function usageFromRow(r: Row): MaterialUsageEntry {
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    materialId: String(r.material_id),
    materialName: String(r.material_name),
    date: String(r.date),
    quantityConsumed: num(r.quantity_consumed),
    wasteQuantity: num(r.waste_quantity),
    reusableLeftoverQuantity: num(r.reusable_leftover_quantity),
    unit: String(r.unit),
    unitCost: num(r.unit_cost),
    unitCostOrigin: r.unit_cost_origin as MaterialUsageEntry["unitCostOrigin"],
    source: r.source as MaterialUsageEntry["source"],
    reusableMaterialId: opt(r.reusable_material_id as string | null),
    notes: opt(r.notes as string | null),
    createdBy: String(r.created_by),
    createdAt: iso(r.created_at),
  };
}

function actualFromRow(r: Row): ActualEntry {
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    date: String(r.date),
    type: r.type as ActualEntry["type"],
    category: r.category as ActualEntry["category"],
    description: String(r.description),
    amount: num(r.amount),
    supplier: opt(r.supplier as string | null),
    labor: opt(r.labor as ActualEntry["labor"] | null),
    notes: opt(r.notes as string | null),
    createdBy: String(r.created_by),
    createdAt: iso(r.created_at),
  };
}

function activityFromRow(r: Row): ActivityEvent {
  return {
    id: String(r.id),
    at: iso(r.at),
    actor: String(r.actor),
    kind: r.kind as ActivityEvent["kind"],
    message: String(r.message),
  };
}

export interface ProjectRows {
  projects: Row[];
  budgetLines: Row[];
  purchaseEntries: Row[];
  materialUsages: Row[];
  actualEntries: Row[];
  activity: Row[];
}

/** Arma los proyectos completos a partir de las filas (ya ordenadas por position). */
export function projectsFromRows(rows: ProjectRows): Project[] {
  const byProject = <T>(list: Row[], map: (r: Row) => T) => {
    const out = new Map<string, T[]>();
    for (const r of list) {
      const key = String(r.project_id);
      const arr = out.get(key) ?? [];
      arr.push(map(r));
      out.set(key, arr);
    }
    return out;
  };
  const lines = byProject(rows.budgetLines, budgetLineFromRow);
  const purchases = byProject(rows.purchaseEntries, purchaseFromRow);
  const usages = byProject(rows.materialUsages, usageFromRow);
  const actuals = byProject(rows.actualEntries, actualFromRow);
  const activity = byProject(rows.activity, activityFromRow);

  return rows.projects.map((r) => {
    const id = String(r.id);
    return {
      id,
      code: String(r.code),
      name: String(r.name),
      client: String(r.client),
      projectType: String(r.project_type),
      description: String(r.description),
      status: r.status as Project["status"],
      startDate: String(r.start_date),
      dueDate: String(r.due_date),
      createdAt: iso(r.created_at),
      updatedAt: iso(r.updated_at),
      salesPrice: num(r.sales_price),
      progressPercent: num(r.progress_percent),
      owner: String(r.owner),
      budgetLines: lines.get(id) ?? [],
      purchaseEntries: purchases.get(id) ?? [],
      materialUsages: usages.get(id) ?? [],
      actualEntries: actuals.get(id) ?? [],
      activity: activity.get(id) ?? [],
      isClosed: Boolean(r.is_closed),
      closedAt: r.closed_at ? iso(r.closed_at) : undefined,
    };
  });
}

// ── Pool de sobrantes ─────────────────────────────────────

export function reusableToRow(org: string, m: ReusableMaterial, position: number): Row {
  return {
    organization_id: org,
    id: m.id,
    position,
    material_id: m.materialId,
    material_name: m.materialName,
    quantity: m.quantity,
    unit: m.unit,
    unit_cost: m.unitCost,
    origin_project_id: m.originProjectId,
    origin_project_name: m.originProjectName,
    created_at: m.createdAt,
  };
}

export function reusableFromRow(r: Row): ReusableMaterial {
  return {
    id: String(r.id),
    materialId: String(r.material_id),
    materialName: String(r.material_name),
    quantity: num(r.quantity),
    unit: String(r.unit),
    unitCost: num(r.unit_cost),
    originProjectId: String(r.origin_project_id),
    originProjectName: String(r.origin_project_name),
    createdAt: iso(r.created_at),
  };
}
