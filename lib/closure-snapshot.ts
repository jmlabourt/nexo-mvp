// ─────────────────────────────────────────────────────────────
// Cierre congelado de un proyecto (historial para estimar y para un LLM).
// Función PURA: no calcula cifras propias, reutiliza lib/calculations.ts para que cada número tenga una sola fuente.
// El resultado se guarda con la función admin_record_closure (tabla project_closures) y no se edita más.
// Sin IA: el resumen en texto lo arman reglas determinísticas.
// ─────────────────────────────────────────────────────────────
import type { Project } from "@/types";
import {
  actualByCategory,
  actualCostToDate,
  budgetByCategory,
  budgetTotal,
  categoryBreakdown,
  expectedMargin,
  finalMargin,
  mainDeviation,
  marginDeltaPoints,
  usageProjectCost,
} from "./calculations";
import { CATEGORY_LABELS } from "./constants";
import {
  daysBetween,
  formatCurrency,
  formatDate,
  formatMarginPoints,
  formatNumber,
  formatPercent,
  formatSignedCurrency,
  formatSignedPercent,
} from "./formatting";
import { isRubroId } from "./rubros";

/** Sube cuando cambia la forma del snapshot (para poder leer cierres viejos y nuevos). */
export const CLOSURE_SCHEMA_VERSION = 1;

export interface ClosureHours {
  planned_hours: number;
  actual_hours: number;
  actual_cost: number;
}

export interface ClosureMaterial {
  /** null cuando la línea del presupuesto no estaba vinculada al catálogo. */
  material_id: string | null;
  material_name: string;
  unit: string;
  budgeted_qty: number;
  budgeted_cost: number;
  purchased_qty: number;
  consumed_qty: number;
  waste_qty: number;
  leftover_qty: number;
  /** Costo imputado: consumo + desperdicio (la compra y el sobrante no cuentan). */
  imputed_cost: number;
}

export interface ClosureItem {
  name: string;
  quantity: number;
  completed_units: number;
  rubros: { rubro: string; hours: number; workers: number }[];
}

/** Lo que se guarda al cerrar. La identidad (tipo, fechas, precio, cliente) la completa la base desde projects. */
export interface ClosureSnapshot {
  project_id: string;
  schema_version: number;
  planned_days: number | null;
  actual_days: number | null;
  first_cost_date: string | null;
  last_cost_date: string | null;
  budget_total: number;
  final_cost: number;
  expected_margin: number | null;
  final_margin: number | null;
  margin_delta_points: number | null;
  budget_by_category: Record<string, number>;
  actual_by_category: Record<string, number>;
  hours_by_rubro: Record<string, ClosureHours>;
  materials: ClosureMaterial[];
  items: ClosureItem[];
  main_deviation_category: string | null;
  main_deviation_amount: number | null;
  summary_text: string;
  /** Quién cerró y con qué avisos ("Cerrado con costos pendientes"). Solo cuando el cierre los trae. */
  closed_by?: string;
  pending_costs?: string[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const NO_RUBRO = "sin_rubro";

function hoursByRubro(project: Project): Record<string, ClosureHours> {
  const out: Record<string, ClosureHours> = {};
  const slot = (key: string) => (out[key] ??= { planned_hours: 0, actual_hours: 0, actual_cost: 0 });
  for (const item of project.items) for (const r of item.rubros) slot(r.rubro).planned_hours += r.hours;
  for (const e of project.actualEntries) {
    if (!e.labor) continue;
    const s = slot(e.rubro ?? NO_RUBRO);
    s.actual_hours += e.labor.hours;
    s.actual_cost += e.amount;
  }
  for (const s of Object.values(out)) {
    s.planned_hours = r2(s.planned_hours);
    s.actual_hours = r2(s.actual_hours);
    s.actual_cost = r2(s.actual_cost);
  }
  return out;
}

function materialsOf(project: Project): ClosureMaterial[] {
  const rows = new Map<string, ClosureMaterial>();
  const slot = (key: string, id: string | null, name: string, unit: string) => {
    let row = rows.get(key);
    if (!row) {
      row = { material_id: id, material_name: name, unit, budgeted_qty: 0, budgeted_cost: 0, purchased_qty: 0, consumed_qty: 0, waste_qty: 0, leftover_qty: 0, imputed_cost: 0 };
      rows.set(key, row);
    }
    return row;
  };
  for (const l of project.budgetLines) {
    if (l.category !== "materials") continue;
    const row = slot(l.materialId ?? `desc:${l.description}`, l.materialId ?? null, l.description, l.unit);
    row.budgeted_qty += l.quantity ?? 0;
    row.budgeted_cost += l.total;
  }
  for (const p of project.purchaseEntries) {
    slot(p.materialId ?? `desc:${p.materialName}`, p.materialId ?? null, p.materialName, p.unit).purchased_qty += p.quantity;
  }
  for (const u of project.materialUsages) {
    const row = slot(u.materialId, u.materialId, u.materialName, u.unit);
    row.consumed_qty += u.quantityConsumed;
    row.waste_qty += u.wasteQuantity;
    row.leftover_qty += u.reusableLeftoverQuantity;
    row.imputed_cost += usageProjectCost(u);
  }
  return [...rows.values()].map((m) => ({
    ...m,
    budgeted_qty: r2(m.budgeted_qty),
    budgeted_cost: r2(m.budgeted_cost),
    purchased_qty: r2(m.purchased_qty),
    consumed_qty: r2(m.consumed_qty),
    waste_qty: r2(m.waste_qty),
    leftover_qty: r2(m.leftover_qty),
    imputed_cost: r2(m.imputed_cost),
  }));
}

function costDates(project: Project): string[] {
  return [...project.actualEntries.map((e) => e.date), ...project.materialUsages.map((u) => u.date)].sort();
}

/** Líneas de materiales con diferencias relevantes (≥ 10% de la cantidad presupuestada), las 3 mayores. */
function materialHighlights(materials: ClosureMaterial[]): string[] {
  return materials
    .filter((m) => m.budgeted_qty > 0 && m.consumed_qty + m.waste_qty > 0)
    .map((m) => ({ m, pct: ((m.consumed_qty + m.waste_qty - m.budgeted_qty) / m.budgeted_qty) * 100 }))
    .filter(({ pct }) => Math.abs(pct) >= 10)
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
    .slice(0, 3)
    .map(({ m, pct }) => {
      const used = m.consumed_qty + m.waste_qty;
      const extra = [
        m.waste_qty > 0 ? `${formatNumber(m.waste_qty)} de desperdicio` : "",
        m.leftover_qty > 0 ? `${formatNumber(m.leftover_qty)} quedaron reutilizables` : "",
      ].filter(Boolean);
      return `${m.material_name}: se usaron ${formatNumber(used)} ${m.unit} contra ${formatNumber(m.budgeted_qty)} presupuestadas (${formatSignedPercent(pct, 0)})${extra.length ? `, ${extra.join(", ")}` : ""}`;
    });
}

function summaryText(
  project: Project,
  s: Omit<ClosureSnapshot, "summary_text">,
  mainLabel: string | null,
  mainPct: number | null,
  highlights: string[],
): string {
  const parts: string[] = [];
  const who = [project.projectType, project.client ? `cliente ${project.client}` : ""].filter(Boolean).join(", ");
  parts.push(`${project.code} · ${project.name}${who ? ` (${who})` : ""}.`);
  if (s.actual_days !== null) {
    parts.push(`Duró ${s.actual_days} días${s.planned_days !== null ? ` (previstos ${s.planned_days})` : ""}, del ${formatDate(project.startDate)} al ${formatDate(project.closedAt)}.`);
  }
  if (s.expected_margin !== null && s.final_margin !== null) {
    parts.push(
      `Se vendió por ${formatCurrency(project.salesPrice)}. Costo presupuestado ${formatCurrency(s.budget_total)} (rentabilidad esperada ${formatPercent(s.expected_margin)}); costo real final ${formatCurrency(s.final_cost)} (rentabilidad real ${formatPercent(s.final_margin)}, ${formatMarginPoints(s.margin_delta_points, { signed: true })}).`,
    );
  } else {
    parts.push(`Costo presupuestado ${formatCurrency(s.budget_total)}; costo real final ${formatCurrency(s.final_cost)}. No tenía precio de venta cargado.`);
  }
  if (s.main_deviation_category && s.main_deviation_amount !== null) {
    parts.push(`Principal desvío: ${mainLabel} ${formatSignedCurrency(s.main_deviation_amount)}${mainPct !== null ? ` (${formatSignedPercent(mainPct)})` : ""}.`);
  } else {
    parts.push("Ninguna categoría superó lo presupuestado.");
  }
  const planned = Object.values(s.hours_by_rubro).reduce((n, h) => n + h.planned_hours, 0);
  const actual = Object.values(s.hours_by_rubro).reduce((n, h) => n + h.actual_hours, 0);
  if (actual > 0) parts.push(`Horas: ${formatNumber(actual)} reales${planned > 0 ? ` contra ${formatNumber(planned)} previstas` : ""}.`);
  if (highlights.length) parts.push(`Materiales: ${highlights.join("; ")}.`);
  return parts.join(" ");
}

/**
 * Arma el cierre congelado de un proyecto ya cerrado. Lanza si el proyecto sigue abierto:
 * el margen real final solo existe al finalizar (nunca se mezcla con el proyectado).
 */
export function buildClosureSnapshot(project: Project, extra: { closedBy?: string; pendingCosts?: string[] } = {}): ClosureSnapshot {
  if (!project.isClosed || project.status !== "completed") {
    throw new Error("Solo se puede congelar el cierre de un proyecto finalizado.");
  }
  const breakdown = categoryBreakdown(project);
  const main = mainDeviation(breakdown);
  const expected = expectedMargin(project.salesPrice, project.budgetLines);
  const final = finalMargin(project);
  const dates = costDates(project);
  const closedOn = project.closedAt ? project.closedAt.slice(0, 10) : null;
  const materials = materialsOf(project);

  const base: Omit<ClosureSnapshot, "summary_text"> = {
    project_id: project.id,
    schema_version: CLOSURE_SCHEMA_VERSION,
    planned_days: project.startDate && project.dueDate ? daysBetween(project.startDate, project.dueDate) : null,
    actual_days: project.startDate && closedOn ? daysBetween(project.startDate, closedOn) : null,
    first_cost_date: dates[0] ?? null,
    last_cost_date: dates[dates.length - 1] ?? null,
    budget_total: r2(budgetTotal(project.budgetLines)),
    final_cost: r2(actualCostToDate(project)),
    expected_margin: expected,
    final_margin: final,
    margin_delta_points: marginDeltaPoints(expected, final),
    budget_by_category: Object.fromEntries(Object.entries(budgetByCategory(project.budgetLines)).map(([k, v]) => [k, r2(v)])),
    actual_by_category: Object.fromEntries(Object.entries(actualByCategory(project)).map(([k, v]) => [k, r2(v)])),
    hours_by_rubro: hoursByRubro(project),
    materials,
    items: project.items.map((i) => ({
      name: i.name,
      quantity: i.quantity,
      completed_units: i.completedUnits,
      rubros: i.rubros.map((r) => ({ rubro: isRubroId(r.rubro) ? r.rubro : NO_RUBRO, hours: r.hours, workers: r.workers })),
    })),
    main_deviation_category: main?.category ?? null,
    main_deviation_amount: main ? r2(main.projectedVariance.amount) : null,
  };
  return {
    ...base,
    summary_text: summaryText(project, base, main ? CATEGORY_LABELS[main.category] : null, main?.projectedVariance.percent ?? null, materialHighlights(materials)),
    ...(extra.closedBy !== undefined ? { closed_by: extra.closedBy } : {}),
    ...(extra.pendingCosts !== undefined ? { pending_costs: extra.pendingCosts } : {}),
  };
}
