import type {
  ActualEntryType,
  AlertLevel,
  AlertSettings,
  BudgetCategory,
  CatalogMaterial,
  EconomicHealth,
  MaterialSource,
  ProjectStatus,
  UnitCostOrigin,
} from "@/types";

export const APP_NAME = "NEXO";
export const APP_SUBTITLE = "Rentabilidad por proyecto";
export const COMPANY_NAME = "Madera Sur S.R.L.";

export const LOCALE = "es-AR";
export const CURRENCY = "ARS";

export const STATUS_ORDER: ProjectStatus[] = [
  "quotation",
  "approved",
  "purchasing",
  "production",
  "installation",
  "completed",
];

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  quotation: "Cotización",
  approved: "Aprobado",
  purchasing: "Compras",
  production: "Producción",
  installation: "Instalación",
  completed: "Finalizado",
};

/** Estados en los que el proyecto está vendido y en ejecución. */
export const ACTIVE_STATUSES: ProjectStatus[] = ["approved", "purchasing", "production", "installation"];

/** El presupuesto base solo se edita antes de ejecutar. Luego es la línea base contra la que se mide. */
export const BUDGET_EDITABLE_STATUSES: ProjectStatus[] = ["quotation", "approved"];

export const CATEGORY_ORDER: BudgetCategory[] = [
  "materials",
  "labor",
  "outsourcing",
  "finishing",
  "logistics",
  "installation",
  "contingency",
  "other",
];

export const CATEGORY_LABELS: Record<BudgetCategory, string> = {
  materials: "Materiales",
  labor: "Mano de obra",
  outsourcing: "Tercerizaciones",
  finishing: "Terminaciones",
  logistics: "Logística",
  installation: "Instalación",
  contingency: "Imprevistos",
  other: "Otros",
};

/** Concordancia gramatical: "Materiales superaron" vs. "Mano de obra superó". */
export const CATEGORY_IS_PLURAL: Record<BudgetCategory, boolean> = {
  materials: true,
  labor: false,
  outsourcing: true,
  finishing: true,
  logistics: false,
  installation: false,
  contingency: true,
  other: true,
};

export const ACTUAL_TYPE_LABELS: Record<ActualEntryType, string> = {
  labor: "Horas trabajadas",
  outsourcing: "Tercerización",
  finishing: "Terminaciones",
  logistics: "Logística",
  installation: "Instalación",
  unexpected: "Imprevisto",
  other: "Otro",
};

export const ACTUAL_TYPE_TO_CATEGORY: Record<ActualEntryType, BudgetCategory> = {
  labor: "labor",
  outsourcing: "outsourcing",
  finishing: "finishing",
  logistics: "logistics",
  installation: "installation",
  unexpected: "contingency",
  other: "other",
};

export const SOURCE_LABELS: Record<MaterialSource, string> = {
  purchased_for_project: "Comprado para el proyecto",
  existing_stock: "Stock existente",
  reused_leftover: "Sobrante reutilizado",
};

export const UNIT_COST_ORIGIN_LABELS: Record<UnitCostOrigin, string> = {
  manual: "Ingresado manualmente",
  purchase: "Última compra del proyecto",
  budget: "Costo presupuestado",
  catalog: "Costo de referencia del catálogo",
  reusable_pool: "Valor del sobrante en el pool",
};

export const MATERIAL_CATALOG: CatalogMaterial[] = [
  { id: "mel-blanca-18", name: "Melamina blanca 18 mm", unit: "placa", referenceCost: 50000 },
  { id: "mel-grafito-18", name: "Melamina grafito 18 mm", unit: "placa", referenceCost: 62500 },
  { id: "mdf-18", name: "MDF 18 mm", unit: "placa", referenceCost: 80000 },
  { id: "perfil-alu", name: "Perfil aluminio", unit: "m", referenceCost: 15000 },
  { id: "bisagra", name: "Herraje bisagra", unit: "u", referenceCost: 2500 },
  { id: "corredera", name: "Corredera", unit: "par", referenceCost: 12500 },
  { id: "tapacanto", name: "Tapacanto", unit: "m", referenceCost: 1000 },
  { id: "fenolico", name: "Fenólico", unit: "placa", referenceCost: 70000 },
];

export const OTHER_MATERIAL_ID = "__other__";

export const DEFAULT_SETTINGS: AlertSettings = {
  categoryWarningPct: 10,
  categoryCriticalPct: 20,
  marginWarningPp: 5,
  marginCriticalPp: 10,
  daysWithoutRecords: 7,
  dueSoonDays: 5,
  dueSoonProgressPct: 80,
};

export const DEMO_USERS = {
  management: { name: "Laura Gómez", role: "Gerencia" },
  workshop: { name: "María Ruiz", role: "Jefa de planta" },
} as const;

export const PROJECT_TYPES = [
  "Local comercial",
  "Oficinas corporativas",
  "Exhibidores",
  "Stand",
  "Mobiliario residencial",
  "Recepción",
  "Otro",
];

// ── Semántica visual centralizada ──────────────────────────────
export const HEALTH_LABELS: Record<EconomicHealth, string> = {
  healthy: "Saludable",
  attention: "Atención",
  risk: "En riesgo",
};

export const ALERT_LEVEL_LABELS: Record<AlertLevel, string> = {
  info: "Info",
  warning: "Atención",
  critical: "Crítica",
};

export type Tone = "green" | "yellow" | "red" | "blue" | "gray";

export const HEALTH_TONE: Record<EconomicHealth, Tone> = {
  healthy: "green",
  attention: "yellow",
  risk: "red",
};

export const ALERT_TONE: Record<AlertLevel, Tone> = {
  info: "blue",
  warning: "yellow",
  critical: "red",
};

export const TONE_CLASSES: Record<Tone, { badge: string; text: string; bg: string; border: string; bar: string }> = {
  green: {
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    text: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    bar: "#059669",
  },
  yellow: {
    badge: "bg-amber-50 text-amber-800 ring-amber-600/20",
    text: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200",
    bar: "#d97706",
  },
  red: {
    badge: "bg-red-50 text-red-700 ring-red-600/20",
    text: "text-red-700",
    bg: "bg-red-50",
    border: "border-red-200",
    bar: "#dc2626",
  },
  blue: {
    badge: "bg-blue-50 text-blue-700 ring-blue-600/20",
    text: "text-blue-700",
    bg: "bg-blue-50",
    border: "border-blue-200",
    bar: "#2563eb",
  },
  gray: {
    badge: "bg-slate-100 text-slate-700 ring-slate-500/20",
    text: "text-slate-600",
    bg: "bg-slate-50",
    border: "border-slate-200",
    bar: "#94a3b8",
  },
};

export const MARGIN_TOOLTIP =
  "Estimación del margen final considerando los costos registrados hasta hoy y el presupuesto que todavía queda por ejecutar.";
