// ─────────────────────────────────────────────────────────────
// Costo financiero = costo de tener plata de la empresa inmovilizada en una OT hasta recuperarla con cobros.
//
//   capital(t) = max(0, Σ invertido hasta t − Σ cobrado hasta t)
//   tramo      = capital × (tasa mensual / 100) × (días del tramo / 30)        (interés simple, sin capitalizar)
//   total      = Σ tramos (cada tramo redondeado a centavos)
//
// La base nunca incluye el costo financiero (sin circularidad) y el capital nunca es negativo: un anticipo que supera
// lo invertido queda a cuenta de lo que se invierta después.
// ─────────────────────────────────────────────────────────────
import type { FinancialTramo, ISODate } from "./types";
import { daysBetween, money, sum } from "./util";

export interface CashEvent {
  date: ISODate;
  /** Plata de la empresa que entra a la OT (costo financiable). */
  invest: number;
  /** Plata que vuelve (cobros del cliente). */
  recover: number;
  label: string;
  ref?: string;
  /** "hecho" (registro real) o "supuesto" (convención documentada). */
  basis: "fact" | "assumption" | "budget";
}

export interface FinancialResult {
  tramos: FinancialTramo[];
  total: number;
  events: CashEvent[];
  ratePct: number;
  /** Capital todavía inmovilizado en la fecha final. */
  openCapital: number;
}

/**
 * Tramos entre fechas de eventos, desde el primero hasta `end` (inclusive como límite). Los eventos posteriores a
 * `end` no se consideran.
 */
export function financialTramos(events: CashEvent[], ratePct: number, end: ISODate): FinancialResult {
  const used = events.filter((e) => e.date <= end).sort((a, b) => a.date.localeCompare(b.date));
  const dates = [...new Set(used.map((e) => e.date))];
  const tramos: FinancialTramo[] = [];
  let invested = 0;
  let recovered = 0;
  let capital = 0;
  dates.forEach((d, i) => {
    for (const e of used.filter((x) => x.date === d)) {
      invested += e.invest;
      recovered += e.recover;
    }
    capital = money(Math.max(0, invested - recovered));
    const next = dates[i + 1] ?? end;
    const days = daysBetween(d, next);
    if (capital > 0 && days > 0) tramos.push({ from: d, to: next, days, capital, amount: money((capital * ratePct) / 100 * (days / 30)) });
  });
  return { tramos, total: money(sum(tramos.map((t) => t.amount))), events: used, ratePct, openCapital: capital };
}

/** Parte de los tramos que cae dentro de [from, to] (para indicadores de un período). */
export function tramosWithin(tramos: FinancialTramo[], ratePct: number, from: ISODate, to: ISODate): number {
  return money(
    sum(
      tramos.map((t) => {
        const a = t.from > from ? t.from : from;
        const b = t.to < to ? t.to : to;
        const days = daysBetween(a, b);
        return days > 0 ? money((t.capital * ratePct) / 100 * (days / 30)) : 0;
      }),
    ),
  );
}

/** Costo financiero acumulado hasta una fecha con los mismos tramos (para comparar previsto vs actualizado). */
export function tramosUntil(tramos: FinancialTramo[], ratePct: number, until: ISODate): number {
  return tramos.length ? tramosWithin(tramos, ratePct, tramos[0].from, until) : 0;
}
