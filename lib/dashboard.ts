// ─────────────────────────────────────────────────────────────
// Dashboard del Administrativo (Lote 6) — agregados en funciones puras.
// Cuatro bloques: proyectos (semáforo), horas y operarios (semana), margen y pendientes.
// Cada número sale de una lista concreta (proyectos, operarios, rubros) que la pantalla muestra al abrirlo.
// Nunca se mezclan los tres márgenes: esperado y proyectado de los proyectos en curso; el real, solo de los cerrados.
// ─────────────────────────────────────────────────────────────
import type { Operator, Project, RubroId, WorkAssignment } from "@/types";
import { actualCostToDate, aggregateMargins, budgetTotal, isActiveProject, marginPercent, projectEconomics, projectedFinalCost, usageProjectCost, type ProjectEconomics } from "./calculations";
import { detectedDeviations, type DetectedDeviations } from "./deviations";
import { rubroLabel } from "./rubros";
import { CATEGORY_LABELS, MATERIAL_CATALOG } from "./constants";
import { materialKey } from "./material-reconciliation";
import { operatorVerdict, workWeek, type OperatorVerdict } from "./plant";
import { scheduleSignal, type ScheduleSignal, type ScheduleView } from "./production";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Proyectos que se siguen en el dashboard: abiertos y ya aprobados (no las cotizaciones). */
export const liveProjects = (projects: Project[]) => projects.filter(isActiveProject);

// ── 1. Proyectos: semáforo ────────────────────────────────────

export interface ProjectSignal {
  project: Project;
  schedule: ScheduleView;
}

export function projectSignals(projects: Project[], today: string, dueSoonDays: number): Record<ScheduleSignal, ProjectSignal[]> {
  const out: Record<ScheduleSignal, ProjectSignal[]> = { on_time: [], at_risk: [], late: [] };
  for (const project of liveProjects(projects)) {
    const schedule = scheduleSignal(project, today, dueSoonDays);
    out[schedule.signal].push({ project, schedule });
  }
  for (const k of Object.keys(out) as ScheduleSignal[]) out[k].sort((a, b) => a.project.dueDate.localeCompare(b.project.dueDate));
  return out;
}

// ── 2. Horas y operarios de la semana ─────────────────────────

export interface OperatorWeek {
  operatorId: string;
  name: string;
  /** Horas previstas en sus asignaciones de la semana hasta hoy (las de hoy, solo si ya cargó). */
  planned: number;
  actual: number;
  diff: number;
  verdict: OperatorVerdict;
}

export interface WeekHours {
  from: string;
  to: string;
  planned: number;
  actual: number;
  /** Horas cargadas / previstas, en % (null si no había nada previsto). */
  compliance: number | null;
  operators: OperatorWeek[];
}

/** Cumplimiento de la semana (lunes a hoy): por operario, previstas en sus asignaciones vs cargadas contra ellas. */
export function weekHours(projects: Project[], assignments: WorkAssignment[], operators: Operator[], today: string): WeekHours {
  const days = workWeek(today);
  const entries = projects.flatMap((p) => p.actualEntries).filter((e) => e.type === "labor" && e.assignmentId);
  const loggedOn = new Map<string, number>();
  for (const e of entries) loggedOn.set(e.assignmentId as string, (loggedOn.get(e.assignmentId as string) ?? 0) + (e.labor?.hours ?? 0));
  const week = assignments.filter((a) => a.date >= days[0] && a.date <= today && (a.date < today || loggedOn.has(a.id)));
  const rows = operators
    .map((o): OperatorWeek => {
      const mine = week.filter((a) => a.operatorId === o.id);
      const planned = round2(mine.reduce((s, a) => s + a.plannedHours, 0));
      const actual = round2(mine.reduce((s, a) => s + (loggedOn.get(a.id) ?? 0), 0));
      return { operatorId: o.id, name: o.name, planned, actual, diff: round2(actual - planned), verdict: operatorVerdict(planned, actual) };
    })
    .filter((r) => r.planned > 0 || r.actual > 0)
    .sort((a, b) => b.diff - a.diff);
  const planned = round2(rows.reduce((s, r) => s + r.planned, 0));
  const actual = round2(rows.reduce((s, r) => s + r.actual, 0));
  return { from: days[0], to: today, planned, actual, compliance: planned > 0 ? round2((actual / planned) * 100) : null, operators: rows };
}

// ── 3. Margen ─────────────────────────────────────────────────

export interface MarginRow {
  project: Project;
  expected: number | null;
  projected: number | null;
}

export interface RubroVariance {
  /** null = costos sin rubro (tercerizados, imprevistos sin línea). */
  rubro: RubroId | null;
  budget: number;
  actual: number;
  /** Lo gastado por encima de lo presupuestado en el rubro (0 si todavía no se pasó). */
  over: number;
}

export interface MarginSummary {
  /** Proyectos en curso: margen esperado (presupuesto) vs proyectado, ponderados por precio de venta. */
  expected: number | null;
  projected: number | null;
  rows: MarginRow[];
  /** Rubros donde el gasto real ya superó lo presupuestado, de mayor a menor (en curso). */
  rubros: RubroVariance[];
  /** Costos reales sin rubro (tercerizados, instalación…): no tienen contra qué compararse, se muestran aparte. */
  withoutRubro: number;
  /** Solo proyectos cerrados: margen real. Nunca se mezcla con los de arriba. */
  closed: Array<{ project: Project; real: number | null }>;
}

const catalogRubro = new Map(MATERIAL_CATALOG.map((m) => [m.id, m.rubro]));

/** Presupuestado vs real por rubro: materiales consumidos (consumo + desperdicio), horas cargadas y costos con rubro. */
export function rubroVariance(project: Project): RubroVariance[] {
  const map = new Map<RubroId | null, { budget: number; actual: number }>();
  const add = (rubro: RubroId | null, key: "budget" | "actual", v: number) => {
    const cur = map.get(rubro) ?? { budget: 0, actual: 0 };
    map.set(rubro, { ...cur, [key]: cur[key] + v });
  };
  const byMaterial = new Map<string, RubroId>();
  for (const l of project.budgetLines) {
    add(l.rubro ?? null, "budget", l.total);
    if (l.category === "materials" && l.rubro) byMaterial.set(materialKey(l.materialId, l.description), l.rubro);
  }
  for (const u of project.materialUsages) {
    const key = materialKey(u.materialId, u.materialName);
    add(byMaterial.get(key) ?? catalogRubro.get(key) ?? null, "actual", usageProjectCost(u));
  }
  for (const e of project.actualEntries) {
    const rubro = e.rubro ?? (e.category === "transport" ? "transporte" : e.category === "contingency" ? "imprevistos" : null);
    add(rubro, "actual", e.amount);
  }
  return [...map.entries()].map(([rubro, v]) => ({ rubro, budget: round2(v.budget), actual: round2(v.actual), over: round2(Math.max(0, v.actual - v.budget)) }));
}

export function marginSummary(projects: Project[]): MarginSummary {
  const live = liveProjects(projects).filter((p) => p.salesPrice > 0);
  const rows = live.map((project): MarginRow => {
    const budget = budgetTotal(project.budgetLines);
    return {
      project,
      expected: marginPercent(project.salesPrice - budget, project.salesPrice),
      projected: marginPercent(project.salesPrice - projectedFinalCost(project), project.salesPrice),
    };
  });
  const agg = aggregateMargins(live);
  const totals = new Map<RubroId | null, RubroVariance>();
  for (const p of live) {
    for (const r of rubroVariance(p)) {
      const cur = totals.get(r.rubro) ?? { rubro: r.rubro, budget: 0, actual: 0, over: 0 };
      totals.set(r.rubro, { rubro: r.rubro, budget: round2(cur.budget + r.budget), actual: round2(cur.actual + r.actual), over: round2(cur.over + r.over) });
    }
  }
  const closed = projects
    .filter((p) => p.isClosed && p.salesPrice > 0)
    .map((project) => ({ project, real: marginPercent(project.salesPrice - actualCostToDate(project), project.salesPrice) }))
    .sort((a, b) => (b.project.closedAt ?? "").localeCompare(a.project.closedAt ?? ""));
  return {
    expected: agg.expectedAggregateMargin,
    projected: agg.projectedAggregateMargin,
    rows: rows.sort((a, b) => (a.projected ?? 0) - (b.projected ?? 0)),
    rubros: [...totals.values()].filter((r) => r.rubro !== null && r.over > 0).sort((a, b) => b.over - a.over),
    withoutRubro: totals.get(null)?.actual ?? 0,
    closed,
  };
}

// ── Resumen económico (Auditoría UX · P0-5) ───────────────────
// Responde primero "¿qué proyectos se desvían y por qué?": proyectos ordenados por impacto en pesos, Margen esperado →
// Margen proyectado en puntos de margen, causa principal con su monto y plazo en una columna aparte.
// Los desvíos detectados aún no proyectados (P0-1 b) van aparte y nunca se mezclan con los márgenes.

export interface OverviewCause {
  /** Categoría de costo, o "invoices" / "hours" para lo detectado. */
  key: string;
  label: string;
  amount: number;
  /** "projected" = ya está en el Margen proyectado · "detected" = detectado, aún no proyectado. */
  kind: "projected" | "detected";
  detail?: string;
}

export interface OverviewRow {
  project: Project;
  expectedMargin: number | null;
  projectedMargin: number | null;
  /** Margen proyectado − Margen esperado, en puntos de margen. */
  deltaPoints: number | null;
  /** Costo final proyectado − costo presupuestado (ya incluido en el Margen proyectado). */
  overrun: number;
  detected: DetectedDeviations;
  /** Para ordenar: lo proyectado de más + lo detectado aún no proyectado. */
  impact: number;
  mainCause: OverviewCause | null;
  schedule: ScheduleView;
}

export interface ProfitOverview {
  rows: OverviewRow[];
  /** Suma de los sobrecostos proyectados de los proyectos en curso. */
  atRisk: number;
  expected: number | null;
  projected: number | null;
  /** Suma de los desvíos detectados aún no proyectados. */
  detected: number;
  /** Margen real final de los proyectos cerrados (ponderado por precio de venta). Nunca se mezcla con los de arriba. */
  closedMargin: number | null;
  closed: Array<{ project: Project; real: number | null }>;
  /** Causas sumadas de todos los proyectos en curso, de mayor a menor. */
  causes: Array<OverviewCause & { projects: string[] }>;
}

const CAUSE_LABEL: Record<string, string> = {
  materials: "Materiales por encima de lo presupuestado",
  labor: "Mano de obra por encima de lo presupuestado",
  design: "Diseño por encima de lo presupuestado",
  admin: "Administración por encima de lo presupuestado",
  transport: "Transporte y fletes por encima de lo presupuestado",
  financial: "Gasto financiero por encima de lo presupuestado",
  unexpected: "Imprevistos por encima de lo presupuestado",
  invoices: "Facturas más caras que lo estimado (aún no proyectado)",
  hours: "Horas de más (aún no proyectado)",
};

function projectCauses(project: Project, econ: ProjectEconomics, d: DetectedDeviations): OverviewCause[] {
  const causes: OverviewCause[] = econ.categories
    .filter((c) => c.projectedVariance.amount > 0)
    .map((c) => ({ key: c.category as string, label: CATEGORY_LABELS[c.category], amount: round2(c.projectedVariance.amount), kind: "projected" as const }));
  if (d.notProjected.materials > 0) {
    const top = [...d.invoices].sort((a, b) => b.overBy - a.overBy)[0];
    causes.push({ key: "invoices", label: "Facturas más caras", amount: d.notProjected.materials, kind: "detected", detail: top ? `${top.materialName} +${top.pct.toLocaleString("es-AR", { maximumFractionDigits: 1 })} %` : undefined });
  }
  if (d.notProjected.labor > 0) {
    const top = [...d.hours].sort((a, b) => b.cost - a.cost)[0];
    causes.push({ key: "hours", label: "Horas de más", amount: d.notProjected.labor, kind: "detected", detail: top ? `${top.itemName} · ${rubroLabel(top.rubro)} +${top.over} h` : undefined });
  }
  return causes.sort((a, b) => b.amount - a.amount);
}

export function profitOverview(projects: Project[], assignments: WorkAssignment[], today: string, dueSoonDays: number): ProfitOverview {
  const live = liveProjects(projects);
  const rows = live.map((project): OverviewRow => {
    const econ = projectEconomics(project);
    const detected = detectedDeviations(project, assignments, today);
    const causes = projectCauses(project, econ, detected);
    const overrun = round2(Math.max(0, econ.costOverrun));
    return {
      project,
      expectedMargin: econ.expectedMargin,
      projectedMargin: econ.projectedMargin,
      deltaPoints: econ.marginDeltaPp,
      overrun,
      detected,
      impact: round2(overrun + detected.notProjected.total),
      mainCause: causes[0] ?? null,
      schedule: scheduleSignal(project, today, dueSoonDays),
    };
  });
  rows.sort((a, b) => b.impact - a.impact || (a.deltaPoints ?? 0) - (b.deltaPoints ?? 0) || a.project.dueDate.localeCompare(b.project.dueDate));

  const totals = new Map<string, OverviewCause & { projects: string[] }>();
  for (const r of rows) {
    const econ = projectEconomics(r.project);
    for (const c of projectCauses(r.project, econ, r.detected)) {
      const label = CAUSE_LABEL[c.key] ?? c.label;
      const cur = totals.get(c.key) ?? { key: c.key, label, amount: 0, kind: c.kind, projects: [] };
      totals.set(c.key, { ...cur, amount: round2(cur.amount + c.amount), projects: [...cur.projects, r.project.code] });
    }
  }

  const agg = aggregateMargins(live.filter((p) => p.salesPrice > 0));
  const closedList = projects.filter((p) => p.isClosed && p.salesPrice > 0);
  const closedSales = closedList.reduce((s, p) => s + p.salesPrice, 0);
  const closedProfit = closedList.reduce((s, p) => s + (p.salesPrice - actualCostToDate(p)), 0);
  return {
    rows,
    atRisk: round2(rows.reduce((s, r) => s + r.overrun, 0)),
    expected: agg.expectedAggregateMargin,
    projected: agg.projectedAggregateMargin,
    detected: round2(rows.reduce((s, r) => s + r.detected.notProjected.total, 0)),
    closedMargin: closedSales > 0 ? (closedProfit / closedSales) * 100 : null,
    closed: closedList
      .map((project) => ({ project, real: marginPercent(project.salesPrice - actualCostToDate(project), project.salesPrice) }))
      .sort((a, b) => (b.project.closedAt ?? "").localeCompare(a.project.closedAt ?? "")),
    causes: [...totals.values()].sort((a, b) => b.amount - a.amount),
  };
}
