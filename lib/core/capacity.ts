// ─────────────────────────────────────────────────────────────
// Capacidad futura por rubro operativo. Pura.
//
// Ventana: [inicio, fin] con inicio ≥ fecha de la demo (es capacidad FUTURA).
// Capacidad laborable de un rubro = Σ por obrero habilitado de (horas laborables del día / cantidad de rubros que
//   tiene): una persona con dos rubros reparte su jornada en partes iguales (nunca se cuenta dos veces).
// Comprometidas (OTs aprobadas, en Compras o Producción), por OT + mueble + rubro:
//   · si hay planificación desde hoy → las horas planificadas dentro de la ventana (solo eso);
//   · si no → horas restantes = max(0, presupuestadas − reales) repartidas en partes iguales entre los días hábiles
//     (lunes a viernes) desde max(hoy, inicio) hasta la entrega; se toma lo que cae en la ventana.
// Potenciales (cotizaciones enviadas o en negociación): horas cotizadas repartidas igual entre inicio y entrega.
// Saldo = capacidad − comprometidas. Saldo con potenciales = saldo − potenciales.
// ─────────────────────────────────────────────────────────────
import type { CoreWorld, ISODate, Project } from "./types";
import { availableHours, workers } from "./lookup";
import { budgetLinesOf } from "./needs";
import { eachDay, maxDate, r2, sumBy, weekday } from "./util";

export interface CapacityRow {
  rubroId: string;
  capacity: number;
  committed: number;
  potential: number;
  balance: number;
  balanceWithPotential: number;
  /** De dónde salen las comprometidas: planificación o estimación. */
  sources: Array<{ projectId: string; itemId: string; hours: number; basis: "plan" | "estimate" | "quote" }>;
}

const businessDays = (from: ISODate, to: ISODate) => (from > to ? [] : eachDay(from, to).filter((d) => weekday(d) >= 1 && weekday(d) <= 5));

function spread(hours: number, from: ISODate, to: ISODate, wFrom: ISODate, wTo: ISODate): number {
  const days = businessDays(from, to);
  if (hours <= 0 || days.length === 0) return 0;
  const per = hours / days.length;
  return per * days.filter((d) => d >= wFrom && d <= wTo).length;
}

const COMMITTED: Project["status"][] = ["approved", "purchasing", "production"];

export function capacityRows(w: CoreWorld, from: ISODate, to: ISODate, today: ISODate): CapacityRow[] {
  const wFrom = maxDate(from, today);
  if (wFrom > to) return [];
  const days = eachDay(wFrom, to);
  const rows = new Map<string, CapacityRow>();
  const row = (rubroId: string) => {
    const r = rows.get(rubroId) ?? { rubroId, capacity: 0, committed: 0, potential: 0, balance: 0, balanceWithPotential: 0, sources: [] };
    rows.set(rubroId, r);
    return r;
  };
  for (const r of w.rubros.filter((x) => x.active)) row(r.id);
  for (const e of workers(w)) {
    if (e.rubroIds.length === 0) continue;
    const share = sumBy(days, (d) => availableHours(w, e, d)) / e.rubroIds.length;
    for (const rb of e.rubroIds) row(rb).capacity += share;
  }
  for (const p of w.projects) {
    if (COMMITTED.includes(p.status)) {
      const lines = budgetLinesOf(w, p).filter((l) => l.kind === "labor");
      const keys = [...new Set(lines.map((l) => `${l.itemId}|${l.rubroId}`))];
      for (const k of keys) {
        const [itemId, rubroId] = k.split("|");
        const futurePlans = w.plans.filter((x) => x.projectId === p.id && x.itemId === itemId && x.rubroId === rubroId && x.date >= today);
        let hours: number;
        let basis: "plan" | "estimate";
        if (futurePlans.length) {
          hours = sumBy(futurePlans.filter((x) => x.date >= wFrom && x.date <= to), (x) => x.hours);
          basis = "plan";
        } else {
          const budget = sumBy(lines.filter((l) => l.itemId === itemId && l.rubroId === rubroId), (l) => l.quantity);
          const real = sumBy(w.timeEntries.filter((t) => t.projectId === p.id && t.itemId === itemId && t.rubroId === rubroId && t.date < today), (t) => t.hours);
          hours = spread(Math.max(0, budget - real), maxDate(today, p.startDate), p.dueDate, wFrom, to);
          basis = "estimate";
        }
        if (hours > 0) {
          const r = row(rubroId);
          r.committed += hours;
          r.sources.push({ projectId: p.id, itemId, hours: r2(hours), basis });
        }
      }
    } else if (p.status === "quotation" && (p.quote.state === "sent" || p.quote.state === "negotiating")) {
      for (const l of p.quote.lines.filter((x) => x.kind === "labor")) {
        const hours = spread(l.quantity, maxDate(today, p.startDate), p.dueDate, wFrom, to);
        if (hours > 0) {
          const r = row(l.rubroId);
          r.potential += hours;
          r.sources.push({ projectId: p.id, itemId: l.itemId, hours: r2(hours), basis: "quote" });
        }
      }
    }
  }
  return [...rows.values()].map((r) => {
    const capacity = r2(r.capacity);
    const committed = r2(r.committed);
    const potential = r2(r.potential);
    return { ...r, capacity, committed, potential, balance: r2(capacity - committed), balanceWithPotential: r2(capacity - committed - potential) };
  });
}
