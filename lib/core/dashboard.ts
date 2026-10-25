// ─────────────────────────────────────────────────────────────
// Dashboard de Gerencia: un filtro Desde/Hasta para todo. Puras.
//
// Fecha de corte = min(Hasta, fecha de la demo). Cada indicador usa la semántica que le corresponde:
//   1 Dinero cobrado       = Σ ingresos con fecha en [Desde, Hasta]                  (movimiento del período)
//   2 Pendiente de cobrar  = Σ por OT aprobada a la fecha de corte de max(0, contrato vigente − cobrado acumulado)
//                                                                                       (saldo a la fecha de corte)
//   3 Rentabilidad total   = Σ ganancia / Σ contrato de las OTs CERRADAS en el período con datos completos
//   4 Ventas contratadas   = Σ contrato vigente de las OTs aprobadas en el período
// Gráficos: cobrado por OT en el período · rentabilidad cotizada vs real (parcial si sigue abierta) · cobros por
// semana (rango ≤ 92 días) o por mes.
// ─────────────────────────────────────────────────────────────
import type { CoreWorld, ISODate, Project } from "./types";
import { contractAt, pendingAt } from "./contract";
import { aggregateMargin, economics, materialCosts, otherCostsOf, updatedFinancial, type Economics } from "./economics";
import { tramosWithin } from "./financial";
import { budgetLinesOf, publishedBom } from "./needs";
import { addDays, daysBetween, EPS, minDate, money, qty, r2, sumBy, weekStart } from "./util";

export interface Period {
  from: ISODate;
  to: ISODate;
}

export const cutoffOf = (period: Period, today: ISODate) => minDate(period.to, today);

export type PeriodShortcut = "month" | "prev_month" | "quarter" | "year" | "last90";

export function periodFor(shortcut: PeriodShortcut, today: ISODate): Period {
  const [y, m] = today.split("-").map(Number);
  const iso = (yy: number, mm: number, dd: number) => new Date(Date.UTC(yy, mm - 1, dd)).toISOString().slice(0, 10);
  if (shortcut === "month") return { from: iso(y, m, 1), to: iso(y, m + 1, 0) };
  if (shortcut === "prev_month") return { from: iso(y, m - 1, 1), to: iso(y, m, 0) };
  if (shortcut === "quarter") {
    const q = Math.floor((m - 1) / 3) * 3 + 1;
    return { from: iso(y, q, 1), to: iso(y, q + 3, 0) };
  }
  if (shortcut === "year") return { from: iso(y, 1, 1), to: iso(y, 12, 31) };
  return { from: addDays(today, -89), to: today };
}

export const approvedBy = (p: Project, date: ISODate) => !!p.baseline && p.baseline.approvedAt <= date;
export const closureOf = (w: Pick<CoreWorld, "closures">, projectId: string) => w.closures.find((c) => c.projectId === projectId);

export interface DashboardCards {
  collected: number;
  pending: number;
  pendingRows: Array<{ projectId: string; contract: number; collected: number; pending: number }>;
  margin: { profit: number; contract: number; marginPct: number | null; projectIds: string[]; incompleteIds: string[] };
  sales: number;
  salesRows: Array<{ projectId: string; approvedAt: ISODate; contract: number }>;
  cutoff: ISODate;
}

export function dashboardCards(w: CoreWorld, period: Period, today: ISODate): DashboardCards {
  const cutoff = cutoffOf(period, today);
  const incomes = w.incomes.filter((i) => i.date >= period.from && i.date <= period.to);
  const pendingRows = w.projects
    .filter((p) => approvedBy(p, cutoff))
    .map((p) => {
      const contract = contractAt(w, p, cutoff) ?? 0;
      const pending = pendingAt(w, p, cutoff);
      return { projectId: p.id, contract, collected: money(contract - pending), pending };
    })
    .filter((r) => r.pending > EPS);
  const closed = w.projects.filter((p) => {
    const c = closureOf(w, p.id);
    return p.status === "closed" && c && c.date >= period.from && c.date <= period.to;
  });
  const ecos = closed.map((p) => economics(w, p, cutoff));
  const complete = ecos.filter((e) => e.incomplete.length === 0);
  const salesRows = w.projects
    .filter((p) => p.baseline && p.baseline.approvedAt >= period.from && p.baseline.approvedAt <= period.to)
    .map((p) => ({ projectId: p.id, approvedAt: (p.baseline as NonNullable<Project["baseline"]>).approvedAt, contract: contractAt(w, p, cutoff) ?? 0 }));
  return {
    collected: money(sumBy(incomes, (i) => i.amount)),
    pending: money(sumBy(pendingRows, (r) => r.pending)),
    pendingRows,
    margin: { ...aggregateMargin(complete), projectIds: complete.map((e) => e.projectId), incompleteIds: ecos.filter((e) => e.incomplete.length).map((e) => e.projectId) },
    sales: money(sumBy(salesRows, (r) => r.contract)),
    salesRows,
    cutoff,
  };
}

/** Gráfico 1: dinero cobrado por OT en el período, de mayor a menor. */
export function collectedByProject(w: CoreWorld, period: Period): Array<{ projectId: string; amount: number }> {
  const m = new Map<string, number>();
  for (const i of w.incomes.filter((x) => x.date >= period.from && x.date <= period.to)) m.set(i.projectId, money((m.get(i.projectId) ?? 0) + i.amount));
  return [...m.entries()].map(([projectId, amount]) => ({ projectId, amount })).sort((a, b) => b.amount - a.amount || a.projectId.localeCompare(b.projectId));
}

/** OTs que estuvieron en ejecución durante el período (aprobadas antes del fin y no cerradas antes del inicio). */
export function activeInPeriod(w: CoreWorld, period: Period, today: ISODate): Project[] {
  const cutoff = cutoffOf(period, today);
  return w.projects.filter((p) => {
    if (!approvedBy(p, cutoff)) return false;
    const c = closureOf(w, p.id);
    return !(c && c.date < period.from);
  });
}

/** Gráfico 2: rentabilidad cotizada vs real por OT (real parcial si la OT sigue abierta a la fecha de corte). */
export function marginComparison(w: CoreWorld, period: Period, today: ISODate): Array<{ projectId: string; quoted: number | null; real: number | null; stage: Economics["stage"] }> {
  const cutoff = cutoffOf(period, today);
  return activeInPeriod(w, period, today).map((p) => {
    const e = economics(w, p, cutoff);
    const closedByCutoff = !!closureOf(w, p.id) && (closureOf(w, p.id) as { date: string }).date <= cutoff;
    return { projectId: p.id, quoted: e.quotedMarginPct, real: e.marginPct, stage: closedByCutoff ? "final" : "partial" };
  });
}

export interface CollectionBucket {
  key: string;
  from: ISODate;
  to: ISODate;
  amount: number;
}

/** Gráfico 3: cobros por semana (lunes a domingo) si el rango es de hasta 92 días; si no, por mes. */
export function collectionSeries(w: CoreWorld, period: Period): { unit: "week" | "month"; buckets: CollectionBucket[] } {
  const unit = daysBetween(period.from, period.to) <= 92 ? "week" : "month";
  const buckets: CollectionBucket[] = [];
  if (unit === "week") {
    for (let d = weekStart(period.from); d <= period.to; d = addDays(d, 7)) {
      const from = d < period.from ? period.from : d;
      const end = addDays(d, 6);
      buckets.push({ key: d, from, to: end > period.to ? period.to : end, amount: 0 });
    }
  } else {
    let [y, m] = period.from.split("-").map(Number);
    for (;;) {
      const first = new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10);
      if (first > period.to) break;
      const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
      buckets.push({ key: first.slice(0, 7), from: first < period.from ? period.from : first, to: last > period.to ? period.to : last, amount: 0 });
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
  }
  for (const i of w.incomes) {
    const b = buckets.find((x) => i.date >= x.from && i.date <= x.to);
    if (b) b.amount = money(b.amount + i.amount);
  }
  return { unit, buckets };
}

export interface HoursDeviation {
  projectId: string;
  itemId: string;
  rubroId: string;
  budget: number;
  real: number;
  diff: number;
  pct: number | null;
}

export interface MaterialDeviation {
  projectId: string;
  itemId: string;
  materialId: string;
  quoted: number;
  bom: number | null;
  real: number;
  consumed: number;
  waste: number;
  diff: number;
  pct: number | null;
}

/** Desvíos de horas por OT / mueble / rubro (cotizadas + adicionales vs reales). */
export function hoursDeviations(w: CoreWorld, projects: Project[]): HoursDeviation[] {
  const out: HoursDeviation[] = [];
  for (const p of projects) {
    const lines = budgetLinesOf(w, p).filter((l) => l.kind === "labor");
    const keys = new Set([...lines.map((l) => `${l.itemId}|${l.rubroId}`), ...w.timeEntries.filter((t) => t.projectId === p.id && t.rubroId && t.itemId).map((t) => `${t.itemId}|${t.rubroId}`)]);
    for (const k of keys) {
      const [itemId, rubroId] = k.split("|");
      const budget = r2(sumBy(lines.filter((l) => l.itemId === itemId && l.rubroId === rubroId), (l) => l.quantity));
      const real = r2(sumBy(w.timeEntries.filter((t) => t.projectId === p.id && t.itemId === itemId && t.rubroId === rubroId), (t) => t.hours));
      out.push({ projectId: p.id, itemId, rubroId, budget, real, diff: r2(real - budget), pct: budget > EPS ? r2(((real - budget) / budget) * 100) : null });
    }
  }
  return out;
}

/** Material usado (consumido + desperdiciado) por OT + mueble + material, desde las rendiciones. */
export function usedByItem(w: CoreWorld, projectId: string): Map<string, { consumed: number; waste: number }> {
  const out = new Map<string, { consumed: number; waste: number }>();
  for (const rel of w.releases.filter((r) => r.projectId === projectId)) {
    const k = `${rel.itemId}|${rel.materialId}`;
    const cur = out.get(k) ?? { consumed: 0, waste: 0 };
    for (const rd of w.renditions.filter((x) => x.releaseId === rel.id)) {
      cur.consumed = qty(cur.consumed + rd.consumed);
      cur.waste = qty(cur.waste + rd.waste);
    }
    out.set(k, cur);
  }
  return out;
}

/** Desvíos de materiales por OT / mueble / material, en la unidad del material (nunca se suman unidades distintas). */
export function materialDeviations(w: CoreWorld, projects: Project[]): MaterialDeviation[] {
  const out: MaterialDeviation[] = [];
  for (const p of projects) {
    const lines = budgetLinesOf(w, p).filter((l) => l.kind === "material" && l.materialId);
    const bom = publishedBom(w, p.id);
    const used = usedByItem(w, p.id);
    const keys = new Set([...lines.map((l) => `${l.itemId}|${l.materialId}`), ...used.keys(), ...(bom?.lines.map((l) => `${l.itemId}|${l.materialId}`) ?? [])]);
    for (const k of keys) {
      const [itemId, materialId] = k.split("|");
      const quoted = qty(sumBy(lines.filter((l) => l.itemId === itemId && l.materialId === materialId), (l) => l.quantity));
      const bomQty = bom ? qty(sumBy(bom.lines.filter((l) => l.itemId === itemId && l.materialId === materialId), (l) => l.quantity)) : null;
      const u = used.get(k) ?? { consumed: 0, waste: 0 };
      const real = qty(u.consumed + u.waste);
      out.push({ projectId: p.id, itemId, materialId, quoted, bom: bomQty, real, consumed: u.consumed, waste: u.waste, diff: qty(real - quoted), pct: quoted > EPS ? r2(((real - quoted) / quoted) * 100) : null });
    }
  }
  return out;
}

export interface CostIndicators {
  waste: number;
  other: number;
  financial: number;
  byProject: Array<{ projectId: string; waste: number; other: number; financial: number }>;
}

/** Indicadores de costos del período: desperdicio, otros costos y costo financiero devengado en el rango. */
export function costIndicators(w: CoreWorld, period: Period, today: ISODate): CostIndicators {
  const cutoff = cutoffOf(period, today);
  const byProject = w.projects
    .filter((p) => p.baseline)
    .map((p) => {
      const waste = materialCosts(w, p.id, period.to, period.from).waste;
      const other = money(sumBy(otherCostsOf(w, p.id, period.to, period.from), (c) => c.amount));
      const fin = updatedFinancial(w, p, cutoff);
      const financial = tramosWithin(fin.tramos, fin.ratePct, period.from, cutoff);
      return { projectId: p.id, waste, other, financial };
    })
    .filter((r) => r.waste > EPS || r.other > EPS || r.financial > EPS);
  return {
    waste: money(sumBy(byProject, (r) => r.waste)),
    other: money(sumBy(byProject, (r) => r.other)),
    financial: money(sumBy(byProject, (r) => r.financial)),
    byProject,
  };
}
