// ─────────────────────────────────────────────────────────────
// Operaciones de dominio sobre proyectos — funciones puras.
// El store solo orquesta: llama a estas funciones y guarda el resultado.
// Esto permite testear los escenarios de la demo sin UI.
// ─────────────────────────────────────────────────────────────
import type {
  ActivityEvent,
  ActualEntry,
  ActualEntryType,
  AlertSettings,
  BudgetLine,
  MaterialSource,
  MaterialUsageEntry,
  Project,
  ProjectStatus,
  PurchaseEntry,
  ReusableMaterial,
  UnitCostOrigin,
} from "@/types";
import {
  ACTUAL_TYPE_LABELS,
  ACTUAL_TYPE_TO_CATEGORY,
  BUDGET_EDITABLE_STATUSES,
  CATEGORY_IS_PLURAL,
  CATEGORY_LABELS,
  MATERIAL_CATALOG,
  STATUS_LABELS,
} from "./constants";
import { budgetLineTotal } from "./calculations";
import { actualMessage, activity, createId, leftoverMessage, purchaseMessage, usageMessage } from "./activity";
import { applyUsageToPool } from "./reusable-pool";
import { categoryAlertLevel, LEVEL_RANK } from "./alerts";
import { actualByCategory, budgetByCategory } from "./calculations";
import { formatPercent } from "./formatting";
import { materialKey } from "./material-reconciliation";

export class DomainError extends Error {}

export interface Ctx {
  actor: string;
  now: string; // ISO datetime
}

function touch(project: Project, now: string, events: ActivityEvent[]): Project {
  return { ...project, updatedAt: now, activity: [...events, ...project.activity] };
}

// ── Costo unitario (físico → económico) ───────────────────────

/**
 * Resuelve el costo unitario cuando el taller registra sin precio.
 * Orden: sobrante del pool → última compra del proyecto → presupuesto → catálogo.
 * Se guarda el origen para que gestión pueda ver cómo se valorizó.
 */
export function resolveUnitCost(
  project: Pick<Project, "purchaseEntries" | "budgetLines">,
  materialId: string,
  materialName: string,
  source: MaterialSource,
  poolItem?: ReusableMaterial,
): { unitCost: number; origin: UnitCostOrigin } {
  if (source === "reused_leftover" && poolItem) return { unitCost: poolItem.unitCost, origin: "reusable_pool" };
  const key = materialKey(materialId, materialName);
  const purchases = project.purchaseEntries
    .filter((p) => materialKey(p.materialId, p.materialName) === key)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  const last = purchases.at(-1);
  if (source === "purchased_for_project" && last) return { unitCost: last.unitCost, origin: "purchase" };
  const line = project.budgetLines.find(
    (l) => l.category === "materials" && materialKey(l.materialId, l.description) === key,
  );
  if (line && line.quantity !== null) return { unitCost: line.unitCost, origin: "budget" };
  if (last) return { unitCost: last.unitCost, origin: "purchase" };
  const cat = MATERIAL_CATALOG.find((m) => m.id === materialId);
  if (cat) return { unitCost: cat.referenceCost, origin: "catalog" };
  return { unitCost: 0, origin: "manual" };
}

/** Costo/hora para registros de taller (sin precio): tarifa del presupuesto o valor por defecto. */
export const DEFAULT_HOURLY_COST = 14_000;
export function resolveHourlyCost(project: Pick<Project, "budgetLines">): number {
  const line = project.budgetLines.find((l) => l.category === "labor" && l.unit === "h" && l.quantity !== null);
  return line ? line.unitCost : DEFAULT_HOURLY_COST;
}

// ── Creación ──────────────────────────────────────────────────

export interface BudgetLineInput {
  category: BudgetLine["category"];
  description: string;
  materialId?: string;
  quantity: number | null;
  unit: string;
  unitCost: number;
  notes?: string;
}

export function makeBudgetLine(input: BudgetLineInput): BudgetLine {
  return { id: createId("bl"), ...input, total: budgetLineTotal(input) };
}

export interface NewProjectInput {
  code: string;
  name: string;
  client: string;
  projectType: string;
  description: string;
  startDate: string;
  dueDate: string;
  owner: string;
  salesPrice: number;
  budgetLines: BudgetLineInput[];
}

export function nextProjectCode(projects: Pick<Project, "code">[]): string {
  const max = projects.reduce((m, p) => {
    const n = Number(/^P-(\d+)$/.exec(p.code)?.[1] ?? 0);
    return Math.max(m, n);
  }, 1000);
  return `P-${max + 1}`;
}

export function createProject(input: NewProjectInput, ctx: Ctx): Project {
  return {
    id: createId("p"),
    code: input.code,
    name: input.name,
    client: input.client,
    projectType: input.projectType,
    description: input.description,
    status: "quotation",
    startDate: input.startDate,
    dueDate: input.dueDate,
    createdAt: ctx.now,
    updatedAt: ctx.now,
    salesPrice: input.salesPrice,
    progressPercent: 0,
    owner: input.owner,
    budgetLines: input.budgetLines.map(makeBudgetLine),
    actualEntries: [],
    materialUsages: [],
    purchaseEntries: [],
    activity: [activity("created", ctx.actor, "Proyecto creado.", ctx.now)],
    isClosed: false,
  };
}

// ── Presupuesto (línea base) ──────────────────────────────────

export function assertBudgetEditable(project: Project) {
  if (!BUDGET_EDITABLE_STATUSES.includes(project.status)) {
    throw new DomainError("El presupuesto base está bloqueado: el proyecto ya está en ejecución.");
  }
}

export function addBudgetLine(project: Project, input: BudgetLineInput, ctx: Ctx): Project {
  assertBudgetEditable(project);
  const line = makeBudgetLine(input);
  return touch({ ...project, budgetLines: [...project.budgetLines, line] }, ctx.now, [
    activity("budget", ctx.actor, `Se agregó al presupuesto: ${line.description}.`, ctx.now),
  ]);
}

export function updateBudgetLine(project: Project, lineId: string, input: BudgetLineInput, ctx: Ctx): Project {
  assertBudgetEditable(project);
  return touch(
    {
      ...project,
      budgetLines: project.budgetLines.map((l) =>
        l.id === lineId ? { ...l, ...input, total: budgetLineTotal(input) } : l,
      ),
    },
    ctx.now,
    [activity("budget", ctx.actor, `Se modificó el presupuesto: ${input.description}.`, ctx.now)],
  );
}

export function removeBudgetLine(project: Project, lineId: string, ctx: Ctx): Project {
  assertBudgetEditable(project);
  const line = project.budgetLines.find((l) => l.id === lineId);
  return touch({ ...project, budgetLines: project.budgetLines.filter((l) => l.id !== lineId) }, ctx.now, [
    activity("budget", ctx.actor, `Se quitó del presupuesto: ${line?.description ?? "concepto"}.`, ctx.now),
  ]);
}

// ── Estado / avance ───────────────────────────────────────────

export function changeStatus(project: Project, status: ProjectStatus, ctx: Ctx): Project {
  if (project.isClosed) throw new DomainError("El proyecto está cerrado.");
  if (status === "completed") throw new DomainError("Para finalizar usá “Cerrar proyecto”.");
  if (status === project.status) return project;
  const msg =
    status === "approved" ? "Presupuesto aprobado. Proyecto pasó a Aprobado." : `Proyecto pasó a ${STATUS_LABELS[status]}.`;
  return touch({ ...project, status }, ctx.now, [activity("status", ctx.actor, msg, ctx.now)]);
}

export function setProgress(project: Project, progress: number, ctx: Ctx): Project {
  const p = Math.max(0, Math.min(100, Math.round(progress)));
  if (p === project.progressPercent) return project;
  return touch({ ...project, progressPercent: p }, ctx.now, [
    activity("progress", ctx.actor, `Avance actualizado a ${p}%.`, ctx.now),
  ]);
}

// ── Compras (NO afectan costo imputable) ──────────────────────

export interface PurchaseInput {
  materialId?: string;
  materialName: string;
  quantity: number;
  unit: string;
  unitCost: number;
  supplier?: string;
  date: string;
  notes?: string;
}

export function addPurchase(project: Project, input: PurchaseInput, ctx: Ctx): Project {
  assertOpen(project);
  const entry: PurchaseEntry = {
    id: createId("pur"),
    projectId: project.id,
    ...input,
    total: Math.round(input.quantity * input.unitCost * 100) / 100,
    createdBy: ctx.actor,
    createdAt: ctx.now,
  };
  return touch({ ...project, purchaseEntries: [...project.purchaseEntries, entry] }, ctx.now, [
    activity("purchase", ctx.actor, purchaseMessage(entry), ctx.now),
  ]);
}

// ── Desvíos: evento de actividad cuando una categoría empeora de nivel ──

function deviationEvents(before: Project, after: Project, settings: AlertSettings, ctx: Ctx): ActivityEvent[] {
  const b = budgetByCategory(after.budgetLines);
  const a0 = actualByCategory(before);
  const a1 = actualByCategory(after);
  const out: ActivityEvent[] = [];
  for (const cat of Object.keys(b) as Array<keyof typeof b>) {
    if (b[cat] <= 0) continue;
    const p0 = ((a0[cat] - b[cat]) / b[cat]) * 100;
    const p1 = ((a1[cat] - b[cat]) / b[cat]) * 100;
    if (p1 <= 0) continue;
    const l0 = p0 > 0 ? LEVEL_RANK[categoryAlertLevel(p0, settings)] : -1;
    const l1 = LEVEL_RANK[categoryAlertLevel(p1, settings)];
    if (l1 > l0) {
      out.push(
        activity(
          "deviation",
          "Sistema",
          `${CATEGORY_LABELS[cat]} ${CATEGORY_IS_PLURAL[cat] ? "superaron" : "superó"} el presupuesto en ${formatPercent(p1, 0)}.`,
          ctx.now,
        ),
      );
    }
  }
  return out;
}

function assertOpen(project: Project) {
  if (project.isClosed) throw new DomainError("El proyecto está cerrado: no admite nuevos registros.");
}

// ── Uso de material (SÍ afecta costo imputable) ───────────────

export interface MaterialUsageInput {
  materialId: string;
  materialName: string;
  unit: string;
  source: MaterialSource;
  reusableMaterialId?: string;
  quantityConsumed: number;
  wasteQuantity: number;
  reusableLeftoverQuantity: number;
  /** Solo en modo gestión. Si falta, se resuelve automáticamente (modo taller). */
  unitCost?: number;
  date: string;
  notes?: string;
}

export interface UsageResult {
  project: Project;
  pool: ReusableMaterial[];
  usage: MaterialUsageEntry;
}

export function addMaterialUsage(
  project: Project,
  pool: ReusableMaterial[],
  input: MaterialUsageInput,
  settings: AlertSettings,
  ctx: Ctx,
): UsageResult {
  assertOpen(project);
  if (input.quantityConsumed < 0 || input.wasteQuantity < 0 || input.reusableLeftoverQuantity < 0) {
    throw new DomainError("Las cantidades no pueden ser negativas.");
  }
  if (input.quantityConsumed + input.wasteQuantity <= 0) {
    throw new DomainError("Indicá cuánto material se utilizó.");
  }
  const poolItem =
    input.source === "reused_leftover" ? pool.find((p) => p.id === input.reusableMaterialId) : undefined;
  if (input.source === "reused_leftover" && !poolItem) throw new DomainError("Elegí qué sobrante se reutilizó.");

  let unitCost: number;
  let origin: UnitCostOrigin;
  if (input.unitCost !== undefined && input.source !== "reused_leftover") {
    unitCost = input.unitCost;
    origin = "manual";
  } else {
    ({ unitCost, origin } = resolveUnitCost(project, input.materialId, input.materialName, input.source, poolItem));
  }

  const usage: MaterialUsageEntry = {
    id: createId("use"),
    projectId: project.id,
    materialId: input.materialId,
    materialName: input.materialName,
    date: input.date,
    quantityConsumed: input.quantityConsumed,
    wasteQuantity: input.wasteQuantity,
    reusableLeftoverQuantity: input.reusableLeftoverQuantity,
    unit: input.unit,
    unitCost,
    unitCostOrigin: origin,
    source: input.source,
    reusableMaterialId: poolItem?.id,
    notes: input.notes,
    createdBy: ctx.actor,
    createdAt: ctx.now,
  };

  // Puede lanzar PoolError si no alcanza el sobrante.
  const nextPool = applyUsageToPool(pool, usage, project, createId("reu"));

  const updated: Project = { ...project, materialUsages: [...project.materialUsages, usage] };
  const events = [activity("usage", ctx.actor, usageMessage(usage), ctx.now)];
  if (usage.reusableLeftoverQuantity > 0) events.unshift(activity("leftover", "Sistema", leftoverMessage(usage), ctx.now));
  events.unshift(...deviationEvents(project, updated, settings, ctx));
  return { project: touch(updated, ctx.now, events), pool: nextPool, usage };
}

// ── Costos no materiales ──────────────────────────────────────

export interface ActualInput {
  type: ActualEntryType;
  description: string;
  date: string;
  supplier?: string;
  notes?: string;
  /** Para labor se calcula como horas × costo/hora. */
  amount?: number;
  labor?: { role: string; workerName?: string; hours: number; hourlyCost: number };
}

export function addActual(project: Project, input: ActualInput, settings: AlertSettings, ctx: Ctx): Project {
  assertOpen(project);
  let amount: number;
  if (input.type === "labor") {
    if (!input.labor || input.labor.hours <= 0) throw new DomainError("Indicá las horas trabajadas.");
    amount = Math.round(input.labor.hours * input.labor.hourlyCost * 100) / 100;
  } else {
    if (input.amount === undefined || input.amount <= 0) throw new DomainError("Indicá un monto mayor a cero.");
    amount = input.amount;
  }
  const entry: ActualEntry = {
    id: createId("act"),
    projectId: project.id,
    date: input.date,
    type: input.type,
    category: ACTUAL_TYPE_TO_CATEGORY[input.type],
    description:
      input.description ||
      (input.labor ? `${input.labor.role}${input.labor.workerName ? ` — ${input.labor.workerName}` : ""}` : ACTUAL_TYPE_LABELS[input.type]),
    amount,
    supplier: input.supplier,
    labor: input.type === "labor" ? input.labor : undefined,
    notes: input.notes,
    createdBy: ctx.actor,
    createdAt: ctx.now,
  };
  const updated: Project = { ...project, actualEntries: [...project.actualEntries, entry] };
  const events = [...deviationEvents(project, updated, settings, ctx), activity("cost", ctx.actor, actualMessage(entry), ctx.now)];
  return touch(updated, ctx.now, events);
}

// ── Cierre ────────────────────────────────────────────────────

export function closeProject(project: Project, ctx: Ctx): Project {
  if (project.isClosed) return project;
  return touch({ ...project, status: "completed", isClosed: true, closedAt: ctx.now, progressPercent: 100 }, ctx.now, [
    activity("closed", ctx.actor, "Proyecto cerrado. Margen real calculado.", ctx.now),
  ]);
}
