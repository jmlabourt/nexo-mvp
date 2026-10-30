// ─────────────────────────────────────────────────────────────
// Gerencia — cálculos del Dashboard en funciones puras (sin React, sin base).
//
// Cada número sale de registros concretos y tiene su definición en lib/indicators.ts (Configuración → Indicadores y
// cálculos). Reglas que se cumplen acá:
//   · Facturación (facturada / prevista) ≠ precio de venta ≠ cobro. Una cotización nunca suma como venta.
//   · Ganancia = precio de venta − costo; rentabilidad = ganancia / precio × 100. Todo sin IVA.
//   · Margen esperado (al cotizar), proyectado (en ejecución) y real final (cerrado) nunca se mezclan.
//   · Compra ≠ consumo: el costo de materiales es consumo + desperdicio (el sobrante no es costo).
//   · Carga confirmada (aprobados), potencial (cotizaciones) y ponderada (con probabilidad informada) por separado.
//   · Inflación y atrasos son ESTIMACIONES, nunca gasto real.
// ─────────────────────────────────────────────────────────────
import type { ClientInvoice, Opportunity, Operator, Project, RubroCapacity } from "@/types";
import { budgetByCategory, materialActualCost, materialWasteCost, projectEconomics } from "./calculations";
import { rubroLabel } from "./rubros";

const round2 = (n: number) => Math.round(n * 100) / 100;
const sum = (xs: number[]) => round2(xs.reduce((s, x) => s + x, 0));

// ── Fechas y períodos ─────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export type PeriodKind = "month" | "quarter" | "year" | "custom";

export interface Period {
  kind: PeriodKind;
  from: string;
  to: string;
  label: string;
}

/** Período que contiene `ref` (mes, trimestre o año), o uno personalizado. */
export function periodOf(kind: PeriodKind, ref: string, custom?: { from: string; to: string }): Period {
  const [y, m] = ref.split("-").map(Number);
  if (kind === "custom" && custom && custom.from <= custom.to) return { kind, from: custom.from, to: custom.to, label: `${custom.from.split("-").reverse().join("/")} al ${custom.to.split("-").reverse().join("/")}` };
  if (kind === "quarter") {
    const q = Math.floor((m - 1) / 3);
    return { kind, from: iso(y, q * 3 + 1, 1), to: iso(y, q * 3 + 3, lastDay(y, q * 3 + 3)), label: `${q + 1}.º trimestre ${y}` };
  }
  if (kind === "year") return { kind, from: iso(y, 1, 1), to: iso(y, 12, 31), label: String(y) };
  return { kind: "month", from: iso(y, m, 1), to: iso(y, m, lastDay(y, m)), label: `${MONTHS[m - 1]} ${y}` };
}

export const inPeriod = (date: string | undefined, p: Pick<Period, "from" | "to">) => !!date && date.slice(0, 10) >= p.from && date.slice(0, 10) <= p.to;

/** Meses (aaaa-mm) entre dos fechas, inclusive. */
export function monthsBetween(from: string, to: string): Array<{ key: string; label: string; from: string; to: string }> {
  const out: Array<{ key: string; label: string; from: string; to: string }> = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push({ key: `${y}-${pad(m)}`, label: `${SHORT[m - 1]} ${String(y).slice(2)}`, from: iso(y, m, 1), to: iso(y, m, lastDay(y, m)) });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

const utc = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
const DAY = 86_400_000;
const addDaysIso = (d: string, n: number) => new Date(utc(d) + n * DAY).toISOString().slice(0, 10);
const daysDiff = (a: string, b: string) => Math.round((utc(b) - utc(a)) / DAY);

/** Días laborables (según los días de la semana que se trabaja) entre dos fechas, inclusive. */
export function workingDaysIn(from: string, to: string, workDays: number[] = [1, 2, 3, 4, 5]): number {
  if (to < from) return 0;
  let n = 0;
  for (let d = from; d <= to; d = addDaysIso(d, 1)) if (workDays.includes(new Date(utc(d)).getUTCDay())) n += 1;
  return n;
}

// ── Estado general del proyecto (4 estados) ───────────────────

export type GeneralState = "quotation" | "approved" | "in_progress" | "closed";

export const GENERAL_STATE_LABELS: Record<GeneralState, string> = {
  quotation: "En cotización",
  approved: "Aprobado",
  in_progress: "En proceso",
  closed: "Cerrado",
};

/** Las etapas de la base (Compras, Producción, Instalación) son "En proceso"; Finalizado es "Cerrado". */
export function generalState(p: Pick<Project, "status" | "isClosed">): GeneralState {
  if (p.isClosed || p.status === "completed") return "closed";
  if (p.status === "quotation") return "quotation";
  if (p.status === "approved") return "approved";
  return "in_progress";
}

/** Venta confirmada: aprobada, en proceso o cerrada (nunca una cotización). */
export const isConfirmedSale = (p: Pick<Project, "status" | "isClosed">) => generalState(p) !== "quotation";

// ── Facturación ───────────────────────────────────────────────

export interface BillingRow {
  project: Project;
  state: GeneralState;
  /** Monto de venta acordado (precio de venta). */
  salesPrice: number;
  /** Facturado (todas las fechas). */
  invoiced: number;
  /** Precio de venta − facturado. */
  pendingToInvoice: number;
  /** Lo previsto y todavía no facturado. */
  planned: number;
  nextPlannedDate: string | null;
}

/** Facturación por proyecto: solo ventas confirmadas. */
export function billingRows(projects: Project[], invoices: ClientInvoice[]): BillingRow[] {
  return projects
    .filter(isConfirmedSale)
    .map((project) => {
      const mine = invoices.filter((i) => i.projectId === project.id);
      const invoiced = sum(mine.filter((i) => i.status === "issued").map((i) => i.amount));
      const plannedList = mine.filter((i) => i.status === "planned").sort((a, b) => a.date.localeCompare(b.date));
      return {
        project,
        state: generalState(project),
        salesPrice: project.salesPrice,
        invoiced,
        pendingToInvoice: round2(Math.max(0, project.salesPrice - invoiced)),
        planned: sum(plannedList.map((i) => i.amount)),
        nextPlannedDate: plannedList[0]?.date ?? null,
      };
    })
    .sort((a, b) => b.pendingToInvoice - a.pendingToInvoice || a.project.code.localeCompare(b.project.code));
}

export interface BillingSummary {
  /** Mes de referencia del período (el actual si está adentro; si no, el último del período). */
  month: { from: string; to: string; label: string };
  monthInvoiced: number;
  monthPlanned: number;
  periodInvoiced: number;
  periodPlanned: number;
  totalInvoiced: number;
  /** Ventas confirmadas todavía sin facturar (todas las fechas). */
  pendingToInvoice: number;
}

export function billingSummary(projects: Project[], invoices: ClientInvoice[], period: Period, today: string): BillingSummary {
  const confirmed = new Set(projects.filter(isConfirmedSale).map((p) => p.id));
  const list = invoices.filter((i) => confirmed.has(i.projectId));
  const ref = inPeriod(today, period) ? today : period.to;
  const m = periodOf("month", ref);
  const amount = (status: ClientInvoice["status"], p: Pick<Period, "from" | "to">) => sum(list.filter((i) => i.status === status && inPeriod(i.date, p)).map((i) => i.amount));
  return {
    month: { from: m.from, to: m.to, label: m.label },
    monthInvoiced: amount("issued", m),
    monthPlanned: amount("planned", m),
    periodInvoiced: amount("issued", period),
    periodPlanned: amount("planned", period),
    totalInvoiced: sum(list.filter((i) => i.status === "issued").map((i) => i.amount)),
    pendingToInvoice: sum(billingRows(projects, invoices).map((r) => r.pendingToInvoice)),
  };
}

/** Facturación real y prevista por mes (solo ventas confirmadas). */
export function billingByMonth(projects: Project[], invoices: ClientInvoice[], from: string, to: string) {
  const confirmed = new Set(projects.filter(isConfirmedSale).map((p) => p.id));
  return monthsBetween(from, to).map((m) => {
    const of = (status: ClientInvoice["status"]) => sum(invoices.filter((i) => confirmed.has(i.projectId) && i.status === status && inPeriod(i.date, m)).map((i) => i.amount));
    return { ...m, issued: of("issued"), planned: of("planned") };
  });
}

/** Facturas emitidas, vencidas y sin cobrar. */
export function overdueCollections(invoices: ClientInvoice[], today: string): ClientInvoice[] {
  return invoices.filter((i) => i.status === "issued" && !i.collectedAt && !!i.dueDate && i.dueDate < today);
}

// ── Rentabilidad por proyecto ─────────────────────────────────

export interface ProfitRow {
  project: Project;
  state: GeneralState;
  salesPrice: number;
  budgetCost: number;
  actualCost: number;
  /** Costo estimado que falta (proyectado − real). 0 en los cerrados. */
  pendingCost: number;
  projectedCost: number;
  expectedProfit: number | null;
  projectedProfit: number | null;
  expectedMargin: number | null;
  projectedMargin: number | null;
  /** Solo en proyectos cerrados. */
  finalMargin: number | null;
  /** Costo proyectado − presupuestado. */
  deviation: number;
  deviationPct: number | null;
}

/** Rentabilidad de las ventas confirmadas (aprobadas, en proceso y cerradas). */
export function profitRows(projects: Project[]): ProfitRow[] {
  return projects.filter(isConfirmedSale).map((project) => {
    const e = projectEconomics(project);
    return {
      project,
      state: generalState(project),
      salesPrice: e.salesPrice,
      budgetCost: e.budgetTotal,
      actualCost: e.actualCostToDate,
      pendingCost: round2(Math.max(0, e.projectedFinalCost - e.actualCostToDate)),
      projectedCost: e.projectedFinalCost,
      expectedProfit: e.expectedProfit,
      projectedProfit: e.projectedProfit,
      expectedMargin: e.expectedMargin,
      projectedMargin: e.projectedMargin,
      finalMargin: e.finalMargin,
      deviation: e.costOverrun,
      deviationPct: e.costOverrunPercent,
    };
  });
}

export type ProfitFilter = "all" | "best" | "worst" | "loss" | "deviation";

export const PROFIT_FILTER_LABELS: Record<ProfitFilter, string> = {
  all: "Todos",
  best: "Mayor rentabilidad",
  worst: "Menor rentabilidad",
  loss: "Con pérdida",
  deviation: "Desvío importante",
};

/** Filtros de la tabla. "Desvío importante": costo proyectado por encima del presupuesto en `deviationPct` % o más. */
export function filterProfit(rows: ProfitRow[], filter: ProfitFilter, deviationPct: number): ProfitRow[] {
  const margin = (r: ProfitRow) => r.projectedMargin ?? -Infinity;
  if (filter === "best") return [...rows].sort((a, b) => margin(b) - margin(a)).slice(0, 5);
  if (filter === "worst") return [...rows].sort((a, b) => margin(a) - margin(b)).slice(0, 5);
  if (filter === "loss") return rows.filter((r) => (r.projectedProfit ?? 0) < 0);
  if (filter === "deviation") return rows.filter((r) => (r.deviationPct ?? 0) >= deviationPct);
  return rows;
}

export interface ProfitTotals {
  salesPrice: number;
  projectedProfit: number;
  /** Ganancia proyectada / precio de venta (proyectos con precio). */
  projectedMargin: number | null;
  activeCount: number;
}

/** Ganancia y rentabilidad proyectadas de los proyectos aprobados o en proceso (no los cerrados). */
export function projectedTotals(rows: ProfitRow[]): ProfitTotals {
  const live = rows.filter((r) => r.state === "approved" || r.state === "in_progress");
  const priced = live.filter((r) => r.salesPrice > 0);
  const price = sum(priced.map((r) => r.salesPrice));
  const profit = sum(priced.map((r) => r.projectedProfit ?? 0));
  return { salesPrice: price, projectedProfit: profit, projectedMargin: price > 0 ? (profit / price) * 100 : null, activeCount: live.length };
}

// ── Costos reales por tipo ────────────────────────────────────

export interface CostRow {
  key: string;
  label: string;
  budget: number;
  actual: number;
}

/**
 * Costo presupuestado vs real por tipo, sumando los proyectos dados. Mano de obra separada en producción (por rubro),
 * Diseño y Administración; materiales = consumo; desperdicio aparte (los dos son costo); lo comprado sin consumir no.
 */
export function costRows(projects: Project[]): CostRow[] {
  const budget = projects.reduce(
    (acc, p) => {
      const b = budgetByCategory(p.budgetLines);
      for (const k of Object.keys(b) as Array<keyof typeof b>) acc[k] = round2((acc[k] ?? 0) + b[k]);
      return acc;
    },
    {} as Record<string, number>,
  );
  const entries = projects.flatMap((p) => p.actualEntries);
  const usages = projects.flatMap((p) => p.materialUsages);
  const byRubro = new Map<string, number>();
  for (const e of entries.filter((x) => x.category === "labor" && x.labor)) {
    const key = e.rubro ? rubroLabel(e.rubro) : "Sin rubro";
    byRubro.set(key, round2((byRubro.get(key) ?? 0) + e.amount));
  }
  const of = (category: string) => sum(entries.filter((e) => e.category === category).map((e) => e.amount));
  const productionActual = sum([...byRubro.values()]);
  const laborOther = round2(of("labor") - productionActual); // horas sin detalle de operario (montajes por importe)
  const rows: CostRow[] = [
    { key: "labor", label: "Mano de obra de producción", budget: budget.labor ?? 0, actual: round2(productionActual + laborOther) },
    ...[...byRubro.entries()].sort((a, b) => b[1] - a[1]).map(([label, actual]) => ({ key: `labor:${label}`, label: `· ${label}`, budget: 0, actual })),
    { key: "design", label: "Mano de obra de Diseño", budget: budget.design ?? 0, actual: of("design") },
    { key: "admin", label: "Mano de obra de Administración", budget: budget.admin ?? 0, actual: of("admin") },
    { key: "materials", label: "Materiales consumidos", budget: budget.materials ?? 0, actual: round2(materialActualCost(usages) - materialWasteCost(usages) + of("materials")) },
    { key: "waste", label: "Desperdicios", budget: 0, actual: materialWasteCost(usages) },
    { key: "other", label: "Otros gastos (fletes, imprevistos)", budget: round2((budget.transport ?? 0) + (budget.contingency ?? 0)), actual: round2(of("transport") + of("contingency")) },
    { key: "financial", label: "Costo financiero", budget: budget.financial ?? 0, actual: of("financial") },
  ];
  return rows;
}

// ── Horas presupuestadas vs reales ────────────────────────────

export interface HoursRow {
  key: string;
  label: string;
  budget: number;
  actual: number;
  deviation: number;
  pct: number | null;
}

const hoursRow = (key: string, label: string, budget: number, actual: number): HoursRow => ({
  key,
  label,
  budget: round2(budget),
  actual: round2(actual),
  deviation: round2(actual - budget),
  pct: budget > 0 ? round2(((actual - budget) / budget) * 100) : null,
});

/** Horas cargadas (operarios y personal) dentro del período, si se indica. */
const laborHours = (p: Project, period?: Pick<Period, "from" | "to">) =>
  p.actualEntries.filter((e) => e.labor && (!period || inPeriod(e.date, period)));

/** Horas presupuestadas de producción: las de los muebles; de Diseño/Administración: sus líneas en horas. */
const budgetHours = (p: Project, category: "labor" | "design" | "admin") =>
  category === "labor"
    ? sum(p.items.flatMap((i) => i.rubros.map((r) => r.hours)))
    : sum(p.budgetLines.filter((l) => l.category === category && l.unit === "h").map((l) => l.quantity ?? 0));

export type HoursGroup = "project" | "furniture" | "rubro";

/**
 * Horas presupuestadas vs reales. Lo presupuestado es el total del proyecto; lo real, lo cargado en el período (si hay).
 * Las correcciones del Jefe de planta ya están aplicadas en los registros: no se duplican.
 */
export function hoursRows(projects: Project[], group: HoursGroup, period?: Pick<Period, "from" | "to">): HoursRow[] {
  if (group === "project") {
    return projects.map((p) => {
      const budget = budgetHours(p, "labor") + budgetHours(p, "design") + budgetHours(p, "admin");
      return hoursRow(p.id, `${p.code} ${p.name}`, budget, sum(laborHours(p, period).map((e) => e.labor?.hours ?? 0)));
    });
  }
  if (group === "furniture") {
    return projects.flatMap((p) =>
      [...p.items.map((i) =>
        hoursRow(`${p.id}:${i.id}`, `${p.code} · ${i.name}`, sum(i.rubros.map((r) => r.hours)), sum(laborHours(p, period).filter((e) => e.itemId === i.id).map((e) => e.labor?.hours ?? 0))),
      ), hoursRow(`${p.id}:unattributed`, `${p.code} · Sin atribuir a mueble`, 0, sum(laborHours(p, period).filter((e) => !e.itemId).map((e) => e.labor?.hours ?? 0)))].filter((r) => !r.key.endsWith(":unattributed") || r.actual > 0),
    );
  }
  const map = new Map<string, { budget: number; actual: number }>();
  const add = (label: string, b: number, a: number) => {
    const cur = map.get(label) ?? { budget: 0, actual: 0 };
    map.set(label, { budget: cur.budget + b, actual: cur.actual + a });
  };
  for (const p of projects) {
    for (const i of p.items) for (const r of i.rubros) add(rubroLabel(r.rubro), r.hours, 0);
    for (const e of laborHours(p, period)) {
      const label = e.category === "design" ? "Diseño" : e.category === "admin" ? "Administración" : e.rubro ? rubroLabel(e.rubro) : "Sin rubro";
      add(label, 0, e.labor?.hours ?? 0);
    }
    add("Diseño", budgetHours(p, "design"), 0);
    add("Administración", budgetHours(p, "admin"), 0);
  }
  return [...map.entries()].filter(([, v]) => v.budget > 0 || v.actual > 0).map(([label, v]) => hoursRow(label, label, v.budget, v.actual));
}

// ── Oportunidades, carga futura y capacidad ───────────────────

/** Cotizaciones de la base como oportunidades (las horas salen de sus muebles), más las informadas aparte. */
export function opportunities(projects: Project[], info: Opportunity[]): Opportunity[] {
  const byProject = new Map(info.filter((o) => o.projectId).map((o) => [o.projectId as string, o]));
  const fromProjects = projects
    .filter((p) => generalState(p) === "quotation")
    .map((p): Opportunity => {
      const extra = byProject.get(p.id);
      const hoursByRubro: Record<string, number> = {};
      for (const i of p.items) for (const r of i.rubros) hoursByRubro[rubroLabel(r.rubro)] = round2((hoursByRubro[rubroLabel(r.rubro)] ?? 0) + r.hours);
      const design = budgetHours(p, "design");
      if (design > 0) hoursByRubro["Diseño"] = round2((hoursByRubro["Diseño"] ?? 0) + design);
      return {
        id: `opp-${p.id}`,
        projectId: p.id,
        ref: p.code,
        client: p.client,
        name: p.name,
        amount: p.salesPrice,
        startDate: p.startDate,
        dueDate: p.dueDate,
        expectedApprovalDate: extra?.expectedApprovalDate,
        probability: extra?.probability ?? null,
        negotiation: extra?.negotiation ?? "sent",
        hoursByRubro: Object.keys(hoursByRubro).length ? hoursByRubro : (extra?.hoursByRubro ?? {}),
      };
    });
  return [...fromProjects, ...info.filter((o) => !o.projectId)];
}

/** Reparte horas parejo entre los días hábiles de [from, to] y devuelve lo que cae en el tramo [bucketFrom, bucketTo]. */
function spread(hours: number, from: string, to: string, bucketFrom: string, bucketTo: string, workDays?: number[]): number {
  if (hours <= 0) return 0;
  const start = from;
  const end = to < from ? from : to;
  const total = workingDaysIn(start, end,workDays);
  if (total === 0) return bucketFrom <= start && start <= bucketTo ? hours : 0;
  const a = start > bucketFrom ? start : bucketFrom;
  const b = end < bucketTo ? end : bucketTo;
  return b < a ? 0 : (hours * workingDaysIn(a, b,workDays)) / total;
}

export interface LoadByRubro {
  /** Horas que faltan de proyectos aprobados o en proceso. */
  confirmed: Record<string, number>;
  /** Horas de cotizaciones (si se aprueban todas). */
  potential: Record<string, number>;
  /** Horas de cotizaciones × probabilidad informada (las "sin estimar" no suman). */
  weighted: Record<string, number>;
}

/**
 * Carga de trabajo de un tramo [from, to], por rubro. Confirmada: lo que falta de cada mueble + rubro (estimado −
 * cargado) repartido entre hoy (o el inicio) y la entrega; si ya venció, cae en el tramo de hoy.
 * Potencial: horas de cada cotización entre su inicio y entrega tentativos.
 */
export function loadByRubro(projects: Project[], opps: Opportunity[], from: string, to: string, today: string, workDays?: number[]): LoadByRubro {
  const out: LoadByRubro = { confirmed: {}, potential: {}, weighted: {} };
  const add = (rec: Record<string, number>, k: string, v: number) => {
    if (v > 0) rec[k] = round2((rec[k] ?? 0) + v);
  };
  for (const p of projects) {
    const st = generalState(p);
    if (st !== "approved" && st !== "in_progress") continue;
    const begin = p.startDate > today ? p.startDate : today;
    const end = p.dueDate >= begin ? p.dueDate : begin;
    const rubros = [...new Set(p.items.flatMap((i) => i.rubros.map((r) => r.rubro)))];
    for (const rubro of rubros) {
      const quoted = sum(p.items.flatMap((i) => i.rubros.filter((r) => r.rubro === rubro).map((r) => r.hours)));
      const done = sum(p.actualEntries.filter((e) => e.category === "labor" && e.rubro === rubro && e.date <= today).map((e) => e.labor?.hours ?? 0));
      add(out.confirmed, rubroLabel(rubro), spread(Math.max(0, quoted - done), begin, end, from, to,workDays));
    }
    const designLeft = budgetHours(p, "design") - sum(p.actualEntries.filter((e) => e.category === "design").map((e) => e.labor?.hours ?? 0));
    add(out.confirmed, "Diseño", spread(Math.max(0, designLeft), begin, end, from, to,workDays));
  }
  for (const o of opps) {
    if (!o.startDate) continue;
    const end = o.dueDate && o.dueDate >= o.startDate ? o.dueDate : o.startDate;
    for (const [rubro, h] of Object.entries(o.hoursByRubro)) {
      const part = spread(h, o.startDate, end, from, to,workDays);
      add(out.potential, rubro, part);
      if (o.probability !== null) add(out.weighted, rubro, (part * o.probability) / 100);
    }
  }
  return out;
}

/**
 * Capacidad por rubro desde el personal: cada operario activo cuenta UNA vez, en su rubro principal (su puesto mapeado),
 * con sus días de trabajo y la jornada. Así quien trabaja en varios rubros no suma dos veces.
 */
export function capacityFromOperators(operators: Operator[], roleToRubro: Record<string, string>, hoursPerDay: number): RubroCapacity[] {
  const groups = new Map<string, RubroCapacity>();
  for (const o of operators.filter((x) => x.active && x.productive !== false)) {
    const rubro = roleToRubro[o.role] ?? o.role;
    const days = o.workDays ?? [1, 2, 3, 4, 5];
    const hours = o.hoursPerDay ?? hoursPerDay;
    const cur = groups.get(rubro) ?? { rubro, employees: 0, hoursPerDay: hours, workDays: days, members: [] };
    groups.set(rubro, { ...cur, employees: cur.employees + 1, members: [...(cur.members ?? []), { hoursPerDay: hours, workDays: days }] });
  }
  return [...groups.values()];
}

/** Horas disponibles de un rubro, respetando las jornadas y días individuales. */
export const capacityHours = (c: RubroCapacity, from: string, to: string) => round2(c.members
  ? c.members.reduce((s,m) => s + m.hoursPerDay * workingDaysIn(from,to,m.workDays),0)
  : c.employees * c.hoursPerDay * workingDaysIn(from,to,c.workDays));

export type CapacityStatus = "ok" | "risk" | "over";

export interface CapacityRow {
  rubro: string;
  capacity: number;
  confirmed: number;
  potential: number;
  weighted: number;
  /** Confirmada − capacidad (positivo = falta gente). */
  gapConfirmed: number;
  /** Confirmada + potencial − capacidad. */
  gapPotential: number;
  /** ok = entra aun si se aprueba todo · risk = entra lo confirmado pero no todo lo potencial · over = no entra lo confirmado. */
  status: CapacityStatus;
  /** Equivalente aproximado en personas para cubrir la brecha potencial (estimación, no decisión). */
  extraPeople: number;
}

export function capacityRows(capacities: RubroCapacity[], load: LoadByRubro, from: string, to: string): CapacityRow[] {
  const rubros = [...new Set([...capacities.map((c) => c.rubro), ...Object.keys(load.confirmed), ...Object.keys(load.potential)])];
  return rubros
    .map((rubro) => {
      const cap = capacities.find((c) => c.rubro === rubro);
      const capacity = cap ? capacityHours(cap, from, to) : 0;
      const confirmed = round2(load.confirmed[rubro] ?? 0);
      const potential = round2(load.potential[rubro] ?? 0);
      const gapConfirmed = round2(confirmed - capacity);
      const gapPotential = round2(confirmed + potential - capacity);
      const perPerson = cap ? cap.hoursPerDay * workingDaysIn(from, to, cap.workDays) : 0;
      return {
        rubro,
        capacity,
        confirmed,
        potential,
        weighted: round2(load.weighted[rubro] ?? 0),
        gapConfirmed,
        gapPotential,
        status: (gapConfirmed > 0 ? "over" : gapPotential > 0 ? "risk" : "ok") as CapacityStatus,
        extraPeople: gapPotential > 0 && perPerson > 0 ? Math.ceil(gapPotential / perPerson) : 0,
      };
    })
    .sort((a, b) => b.gapPotential - a.gapPotential);
}

// ── Estimaciones financieras ──────────────────────────────────

export interface InflationLoss {
  originalMonths: number;
  delayMonths: number;
  /** Pérdida de poder adquisitivo por esperar hasta la fecha original. */
  originalLoss: number;
  /** Lo que agrega el atraso (después de la fecha original). Nunca cuenta dos veces el mismo período. */
  delayLoss: number;
  total: number;
}

/**
 * Pérdida de poder adquisitivo estimada de un monto pendiente que se cobra más adelante: monto × (1 − 1/(1+i)^meses).
 * El plazo original va de `from` a `originalDate`; el atraso, de `originalDate` a `updatedDate`. Es una ESTIMACIÓN.
 */
export function inflationLoss(amount: number, monthlyPct: number, from: string, originalDate: string, updatedDate?: string): InflationLoss {
  const i = monthlyPct / 100;
  const months = (a: string, b: string) => Math.max(0, daysDiff(a, b)) / 30;
  const m1 = months(from, originalDate);
  const m2 = updatedDate && updatedDate > originalDate ? months(originalDate > from ? originalDate : from, updatedDate) : 0;
  const loss = (m: number) => (i > 0 && amount > 0 ? amount * (1 - 1 / Math.pow(1 + i, m)) : 0);
  const original = round2(loss(m1));
  const total = round2(loss(m1 + m2));
  return { originalMonths: round2(m1), delayMonths: round2(m2), originalLoss: original, delayLoss: round2(total - original), total };
}

/**
 * Impacto económico ESTIMADO de un atraso: días hábiles vencidos × equipo previsto × jornada × tarifa de mano de obra.
 * Es lo que cuesta sostener el equipo esos días, no un gasto registrado.
 */
export function delayImpact(project: Project, today: string, laborRate: number, hoursPerDay: number): { lateDays: number; crew: number; amount: number } {
  if (generalState(project) === "closed" || generalState(project) === "quotation" || project.dueDate >= today) return { lateDays: 0, crew: 0, amount: 0 };
  const lateDays = workingDaysIn(addDaysIso(project.dueDate, 1), today);
  const crew = Math.max(0, ...project.items.flatMap((i) => i.rubros.map((r) => r.workers)));
  return { lateDays, crew, amount: round2(lateDays * crew * hoursPerDay * laborRate) };
}

// ── Nomenclatura de proyectos ─────────────────────────────────

/** "Alto Palermo" → "AltoPalermo": sin acentos ni espacios ni símbolos. */
export function codeSlug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join("");
}

/** Código según el formato: {prefijo}{numero}_{cliente}_{nombre} → "OT4300_Samsung_AltoPalermo". */
export function formatProjectCode(pattern: string, v: { prefix: string; number: number; client: string; name: string }): string {
  return pattern
    .replace(/\{prefijo\}/g, v.prefix)
    .replace(/\{numero\}/g, String(v.number))
    .replace(/\{cliente\}/g, codeSlug(v.client))
    .replace(/\{nombre\}/g, codeSlug(v.name))
    .replace(/_{2,}/g, "_")
    .replace(/^_|_$/g, "");
}

/** Problema con un formato o un código (null = bien). Los códigos no se repiten. */
export function projectCodeError(pattern: string, code: string, existing: string[]): string | null {
  if (!pattern.includes("{numero}")) return "El formato tiene que incluir {numero} para que no se repitan los códigos.";
  if (existing.some((c) => c.toLowerCase() === code.toLowerCase())) return `El código ${code} ya existe.`;
  return null;
}
