// ─────────────────────────────────────────────────────────────
// Gasto financiero: el costo de financiar la obra hasta que el cliente paga.
//
//   gasto = precio sin IVA × tasa mensual / 100 × días financiados / 30
//   días financiados = días de producción (inicio → entrega) + días que tarda el cliente en pagar después de la entrega
//
// Con seña o cuotas se calcula por tramos sobre el saldo pendiente: cada tramo es (saldo sin cobrar) × tasa × días / 30,
// desde el inicio hasta el último cobro. La base es el precio de venta sin IVA y el resultado NO vuelve a entrar en la
// base (no hay circularidad). Es una estimación: nunca se muestra como un costo real pagado.
// ─────────────────────────────────────────────────────────────

export interface FinancialInput {
  /** Precio de venta sin IVA. */
  price: number;
  /** Tasa mensual en %. */
  monthlyRatePct: number;
  /** Inicio de producción (YYYY-MM-DD). */
  startDate: string;
  /** Entrega al cliente (YYYY-MM-DD). */
  deliveryDate: string;
  /** "¿A cuántos días de la entrega paga el cliente?" (para el saldo que no tiene cuota con fecha). */
  daysAfterDelivery: number;
  /** Cobros previstos (seña, cuotas). Lo que no cubren se cobra a `deliveryDate + daysAfterDelivery`. */
  schedule?: { amount: number; date: string }[];
}

export interface FinancialTranche {
  from: string;
  to: string;
  days: number;
  balance: number;
  amount: number;
}

export type FinancialResult =
  | { ok: true; amount: number; financedDays: number; productionDays: number; tranches: FinancialTranche[] }
  | { ok: false; reason: string };

const round2 = (v: number) => Math.round(v * 100) / 100;
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const dayNumber = (iso: string) => Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000);
const fromDayNumber = (n: number) => new Date(n * 86_400_000).toISOString().slice(0, 10);

export function addDaysIso(iso: string, days: number): string {
  return fromDayNumber(dayNumber(iso) + days);
}

export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

export function financialCost(i: FinancialInput): FinancialResult {
  if (!(i.price > 0)) return { ok: false, reason: "Falta el precio de venta." };
  if (!(i.monthlyRatePct >= 0)) return { ok: false, reason: "Falta la tasa mensual." };
  if (!isDate(i.startDate) || !isDate(i.deliveryDate)) return { ok: false, reason: "Faltan las fechas de inicio y de entrega." };
  const productionDays = daysBetween(i.startDate, i.deliveryDate);
  if (productionDays < 0) return { ok: false, reason: "La entrega es anterior al inicio." };
  if (!Number.isInteger(i.daysAfterDelivery) || i.daysAfterDelivery < 0) return { ok: false, reason: "Faltan los días de pago después de la entrega." };

  const start = dayNumber(i.startDate);
  const finalPay = dayNumber(i.deliveryDate) + i.daysAfterDelivery;
  // Cobros: los previstos (un cobro anterior al inicio cuenta desde el inicio) y el saldo restante al pago final.
  const payments: { day: number; amount: number }[] = [];
  let scheduled = 0;
  for (const s of i.schedule ?? []) {
    if (!(s.amount > 0) || !isDate(s.date)) return { ok: false, reason: "Hay una cuota sin importe o sin fecha." };
    payments.push({ day: Math.max(start, dayNumber(s.date)), amount: s.amount });
    scheduled += s.amount;
  }
  if (scheduled - i.price > 0.005) return { ok: false, reason: "Las cuotas suman más que el precio." };
  if (i.price - scheduled > 0.005) payments.push({ day: finalPay, amount: i.price - scheduled });
  payments.sort((a, b) => a.day - b.day);

  const tranches: FinancialTranche[] = [];
  let balance = i.price;
  let cursor = start;
  for (const p of payments) {
    const days = p.day - cursor;
    if (days > 0 && balance > 0.005) {
      tranches.push({ from: fromDayNumber(cursor), to: fromDayNumber(p.day), days, balance: round2(balance), amount: round2((balance * i.monthlyRatePct * days) / 100 / 30) });
    }
    cursor = Math.max(cursor, p.day);
    balance -= p.amount;
  }
  const amount = round2(tranches.reduce((s, t) => s + t.amount, 0));
  return { ok: true, amount, financedDays: Math.max(0, (payments.at(-1)?.day ?? start) - start), productionDays, tranches };
}

/** Condiciones que pregunta el Cotizador: fechas, días de pago después de la entrega, seña y cuotas del saldo. */
export interface QuoteFinanceTerms {
  startDate: string;
  deliveryDate: string;
  /** "¿A cuántos días de la entrega paga el cliente?" (primer pago del saldo). */
  daysAfterDelivery: number;
  /** Seña al inicio, en % del precio. */
  seniaPct: number;
  /** El saldo (precio − seña) en N cuotas iguales, cada 30 días desde el primer pago. */
  installments: number;
}

/** Cobros previstos de una cotización para un precio dado (seña al inicio + saldo en cuotas). */
export function quoteSchedule(price: number, t: QuoteFinanceTerms): Array<{ label: string; amount: number; date: string }> {
  const out: Array<{ label: string; amount: number; date: string }> = [];
  const senia = round2((price * Math.max(0, t.seniaPct)) / 100);
  if (senia > 0) out.push({ label: `Seña ${t.seniaPct} %`, amount: senia, date: t.startDate });
  const n = Math.max(1, Math.floor(t.installments));
  const rest = round2(price - senia);
  const first = addDaysIso(t.deliveryDate, t.daysAfterDelivery);
  let assigned = 0;
  for (let i = 0; i < n; i++) {
    const amount = i === n - 1 ? round2(rest - assigned) : round2(rest / n);
    assigned = round2(assigned + amount);
    if (amount > 0) out.push({ label: n === 1 ? "Saldo" : `Cuota ${i + 1} de ${n}`, amount, date: addDaysIso(first, i * 30) });
  }
  return out;
}

/**
 * Gasto financiero de una cotización como % del precio (sale igual para cualquier precio porque seña y cuotas son
 * proporcionales). Así el precio sugerido lo incluye sin circularidad: precio = costo / (1 − %).
 */
export function quoteFinancialPct(t: QuoteFinanceTerms, monthlyRatePct: number): FinancialResult {
  if (!(t.seniaPct >= 0 && t.seniaPct <= 100)) return { ok: false, reason: "La seña va de 0 a 100 %." };
  if (!(t.installments >= 1)) return { ok: false, reason: "Las cuotas van de 1 en adelante." };
  const price = 100;
  return financialCost({ price, monthlyRatePct, startDate: t.startDate, deliveryDate: t.deliveryDate, daysAfterDelivery: t.daysAfterDelivery, schedule: quoteSchedule(price, t) });
}
