// ─────────────────────────────────────────────────────────────
// NEXO — Modelo de dominio
// Estas entidades son independientes de la UI y de la persistencia.
// Hoy se guardan en localStorage (Zustand persist); el mismo modelo
// puede servirse luego desde una API/base de datos.
// ─────────────────────────────────────────────────────────────

export type ProjectStatus =
  | "quotation"
  | "approved"
  | "purchasing"
  | "production"
  | "installation"
  | "completed";

export type BudgetCategory =
  | "materials"
  | "labor"
  | "outsourcing"
  | "finishing"
  | "logistics"
  | "installation"
  | "contingency"
  | "other";

export type ActualEntryType =
  | "labor"
  | "outsourcing"
  | "finishing"
  | "logistics"
  | "installation"
  | "unexpected"
  | "other";

export type MaterialSource = "purchased_for_project" | "existing_stock" | "reused_leftover";

/** Cómo se determinó el costo unitario de un consumo (trazabilidad, evita caja negra). */
export type UnitCostOrigin = "manual" | "purchase" | "budget" | "catalog" | "reusable_pool";

export type AppMode = "management" | "workshop";

export type AlertLevel = "info" | "warning" | "critical";

export type EconomicHealth = "healthy" | "attention" | "risk";

export interface BudgetLine {
  id: string;
  category: BudgetCategory;
  description: string;
  /** Solo para líneas de materiales: vincula con el catálogo para reconciliar. */
  materialId?: string;
  /** null = monto directo (no aplica cantidad). */
  quantity: number | null;
  unit: string;
  /** Si quantity es null, unitCost representa el monto directo. */
  unitCost: number;
  total: number;
  notes?: string;
}

export interface PurchaseEntry {
  id: string;
  projectId: string;
  materialId?: string;
  materialName: string;
  quantity: number;
  unit: string;
  unitCost: number;
  total: number;
  supplier?: string;
  date: string; // ISO yyyy-mm-dd
  notes?: string;
  createdBy: string;
  createdAt: string; // ISO datetime
}

export interface MaterialUsageEntry {
  id: string;
  projectId: string;
  materialId: string;
  materialName: string;
  date: string;
  quantityConsumed: number;
  wasteQuantity: number;
  reusableLeftoverQuantity: number;
  unit: string;
  unitCost: number;
  unitCostOrigin: UnitCostOrigin;
  source: MaterialSource;
  /** Si source = reused_leftover, qué ítem del pool se usó. */
  reusableMaterialId?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
}

export interface LaborDetail {
  role: string;
  workerName?: string;
  hours: number;
  hourlyCost: number;
}

export interface ActualEntry {
  id: string;
  projectId: string;
  date: string;
  type: ActualEntryType;
  category: BudgetCategory;
  description: string;
  amount: number;
  supplier?: string;
  labor?: LaborDetail;
  notes?: string;
  createdBy: string;
  createdAt: string;
}

export type ActivityKind =
  | "created"
  | "status"
  | "budget"
  | "purchase"
  | "usage"
  | "cost"
  | "leftover"
  | "deviation"
  | "progress"
  | "closed";

export interface ActivityEvent {
  id: string;
  at: string;
  actor: string;
  kind: ActivityKind;
  message: string;
}

export interface Project {
  id: string;
  code: string;
  name: string;
  client: string;
  projectType: string;
  description: string;
  status: ProjectStatus;
  startDate: string;
  dueDate: string;
  createdAt: string;
  updatedAt: string;
  salesPrice: number;
  progressPercent: number;
  owner: string;
  budgetLines: BudgetLine[];
  actualEntries: ActualEntry[];
  materialUsages: MaterialUsageEntry[];
  purchaseEntries: PurchaseEntry[];
  activity: ActivityEvent[];
  isClosed: boolean;
  closedAt?: string;
}

export interface ReusableMaterial {
  id: string;
  materialId: string;
  materialName: string;
  quantity: number;
  unit: string;
  unitCost: number;
  originProjectId: string;
  originProjectName: string;
  createdAt: string;
}

export interface CatalogMaterial {
  id: string;
  name: string;
  unit: string;
  /** Costo de referencia (último conocido). Solo se usa si no hay compra ni presupuesto. */
  referenceCost: number;
}

export interface AlertSettings {
  categoryWarningPct: number;
  categoryCriticalPct: number;
  marginWarningPp: number;
  marginCriticalPp: number;
  daysWithoutRecords: number;
  dueSoonDays: number;
  dueSoonProgressPct: number;
}

export type AlertKind = "category" | "margin" | "stale" | "due" | "reconciliation";

export interface Alert {
  /** Determinístico: permite marcarla como resuelta. Incluye el nivel para que un agravamiento reaparezca. */
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  kind: AlertKind;
  level: AlertLevel;
  title: string;
  message: string;
  impactAmount?: number;
  expectedMargin?: number;
  projectedMargin?: number;
}

export interface DemoUser {
  name: string;
  role: string;
}
