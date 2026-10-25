// ─────────────────────────────────────────────────────────────
// Cotización: costos cotizados, precio sugerido por rentabilidad objetivo y costo financiero previsto normal.
//
//   Rentabilidad = margen sobre el precio de venta (no markup):  precio de una categoría = costo / (1 − m)
//   Precio sugerido P = Materiales/(1 − mM) + (Mano de obra + Personal)/(1 − mMO) + Costos generales + CF(P)
//   CF(P) = costo financiero previsto en el escenario normal: todo el costo directo se invierte en la fecha de inicio
//           y se recupera con los cobros previstos (porcentaje × P en su fecha). Se resuelve por punto fijo; la base
//           del CF nunca incluye al CF.
//   Rentabilidad cotizada = (precio acordado − costo total cotizado) / precio acordado × 100
// ─────────────────────────────────────────────────────────────
import type { Baseline, CoreWorld, ISODate, Project, Quote, ScheduledPayment } from "./types";
import { financialTramos, type CashEvent, type FinancialResult } from "./financial";
import { CoreError, money, r2, sumBy } from "./util";

export interface QuoteTotals {
  materials: number;
  labor: number;
  staff: number;
  /** Costo directo financiable = materiales + mano de obra + personal. */
  direct: number;
  generalLines: Array<{ id: string; name: string; amount: number }>;
  general: number;
  materialsPrice: number;
  laborPrice: number;
  suggestedPrice: number;
  listPrice: number;
  discount: number;
  agreedPrice: number;
  financial: FinancialResult;
  totalCost: number;
  quotedMarginPct: number | null;
  plan: ScheduledPayment[];
  planPct: number;
  hours: number;
}

export function marginError(pct: number): string | null {
  return Number.isFinite(pct) && pct >= 0 && pct < 100 ? null : "La rentabilidad objetivo va de 0 a menos de 100 %.";
}

/** Importes de los cobros previstos para un precio. El último absorbe el redondeo. */
export function planAmounts(plan: Quote["plan"], price: number): ScheduledPayment[] {
  const out = plan.map((c) => ({ id: c.id, label: c.label, date: c.date, amount: money((price * c.pct) / 100) }));
  const totalPct = plan.reduce((s, c) => s + c.pct, 0);
  if (out.length && Math.abs(totalPct - 100) < 1e-9) {
    const diff = money(price - out.reduce((s, c) => s + c.amount, 0));
    out[out.length - 1].amount = money(out[out.length - 1].amount + diff);
  }
  return out;
}

/** Costo financiero previsto normal: inversión del costo directo en el inicio, cobros previstos en su fecha. */
export function budgetFinancial(direct: number, startDate: ISODate, dueDate: ISODate, schedule: ScheduledPayment[], ratePct: number): FinancialResult {
  const events: CashEvent[] = [
    { date: startDate, invest: direct, recover: 0, label: "Costo directo cotizado (supuesto: invertido al inicio)", basis: "budget" },
    ...schedule.map((s) => ({ date: s.date, invest: 0, recover: s.amount, label: `Cobro previsto: ${s.label}`, ref: s.id, basis: "budget" as const })),
  ];
  const end = [dueDate, ...schedule.map((s) => s.date)].sort().at(-1) ?? dueDate;
  return financialTramos(events, ratePct, end);
}

export function quoteTotals(q: Quote, dates: { startDate: ISODate; dueDate: ISODate }, ratePct: number): QuoteTotals {
  const materials = money(sumBy(q.lines.filter((l) => l.kind === "material"), (l) => l.quantity * l.unitCost));
  const labor = money(sumBy(q.lines.filter((l) => l.kind === "labor"), (l) => l.quantity * l.unitCost));
  const staff = money(sumBy(q.staffLines, (l) => l.hours * l.hourlyCost));
  const direct = money(materials + labor + staff);
  const generalLines = q.generalCosts.map((g) => ({ id: g.id, name: g.name, amount: money(g.mode === "pct" ? (direct * g.value) / 100 : g.value) }));
  const general = money(sumBy(generalLines, (g) => g.amount));
  const mM = q.marginMaterialsPct / 100;
  const mL = q.marginLaborPct / 100;
  const materialsPrice = money(mM < 1 ? materials / (1 - mM) : materials);
  const laborPrice = money(mL < 1 ? (labor + staff) / (1 - mL) : labor + staff);
  const base = materialsPrice + laborPrice + general;
  const cfFor = (price: number) => budgetFinancial(direct, dates.startDate, dates.dueDate, planAmounts(q.plan, price), ratePct).total;
  // Punto fijo: P = base + CF(P). CF decrece con P (más cobro previsto), converge en pocas vueltas.
  let p = base;
  for (let i = 0; i < 60; i++) {
    const next = base + cfFor(p);
    if (Math.abs(next - p) < 0.005) {
      p = next;
      break;
    }
    p = next;
  }
  const suggestedPrice = Math.ceil(p - 1e-6);
  const listPrice = q.listPriceOverride && q.listPriceOverride > 0 ? money(q.listPriceOverride) : suggestedPrice;
  const discount = money(Math.max(0, q.discount || 0));
  const agreedPrice = money(listPrice - discount);
  const plan = planAmounts(q.plan, agreedPrice);
  const financial = budgetFinancial(direct, dates.startDate, dates.dueDate, plan, ratePct);
  const totalCost = money(direct + general + financial.total);
  return {
    materials,
    labor,
    staff,
    direct,
    generalLines,
    general,
    materialsPrice,
    laborPrice,
    suggestedPrice,
    listPrice,
    discount,
    agreedPrice,
    financial,
    totalCost,
    quotedMarginPct: agreedPrice > 0 ? r2(((agreedPrice - totalCost) / agreedPrice) * 100) : null,
    plan,
    planPct: q.plan.reduce((s, c) => s + c.pct, 0),
    hours: r2(sumBy(q.lines.filter((l) => l.kind === "labor"), (l) => l.quantity) + sumBy(q.staffLines, (l) => l.hours)),
  };
}

/** Lo que falta para poder aprobar una cotización. */
export function approvalErrors(p: Project): string[] {
  const out: string[] = [];
  const q = p.quote;
  if (!p.clientId) out.push("Elegí el cliente.");
  if (!p.startDate || !p.dueDate) out.push("Indicá las fechas de inicio y entrega.");
  else if (p.dueDate < p.startDate) out.push("La entrega no puede ser antes del inicio.");
  if (p.items.length === 0) out.push("Agregá al menos un mueble.");
  for (const it of p.items) if (!q.lines.some((l) => l.itemId === it.id)) out.push(`${it.name}: falta cotizar al menos un rubro.`);
  if (q.lines.some((l) => !(l.quantity > 0) || !(l.unitCost >= 0))) out.push("Hay líneas sin cantidad o sin costo.");
  const m1 = marginError(q.marginMaterialsPct) ?? marginError(q.marginLaborPct);
  if (m1) out.push(m1);
  if (q.plan.length === 0) out.push("Cargá la seña y las cuotas previstas.");
  else if (Math.abs(q.plan.reduce((s, c) => s + c.pct, 0) - 100) > 1e-6) out.push("Los cobros previstos tienen que sumar 100 % del precio.");
  return out;
}

/** Foto inmutable al aprobar. */
export function makeBaseline(w: CoreWorld, p: Project, by: string, date: ISODate): Baseline {
  const errs = approvalErrors(p);
  if (errs.length) throw new CoreError(errs.join(" "));
  const t = quoteTotals(p.quote, p, w.config.financialMonthlyRatePct);
  if (!(t.agreedPrice > 0)) throw new CoreError("El precio acordado tiene que ser mayor a cero.");
  return {
    approvedAt: date,
    approvedBy: by,
    items: p.items.map((i) => ({ id: i.id, name: i.name, quantity: i.quantity })),
    lines: p.quote.lines.map((l) => ({ ...l })),
    staffLines: p.quote.staffLines.map((l) => ({ ...l })),
    generalCosts: p.quote.generalCosts.map((g) => ({ ...g, amount: t.generalLines.find((x) => x.id === g.id)?.amount ?? 0 })),
    marginMaterialsPct: p.quote.marginMaterialsPct,
    marginLaborPct: p.quote.marginLaborPct,
    startDate: p.startDate,
    dueDate: p.dueDate,
    costs: { materials: t.materials, labor: t.labor, staff: t.staff, general: t.general, financial: t.financial.total, total: t.totalCost },
    suggestedPrice: t.suggestedPrice,
    listPrice: t.listPrice,
    discount: t.discount,
    agreedPrice: t.agreedPrice,
    quotedMarginPct: t.quotedMarginPct ?? 0,
    plan: t.plan,
    financialRatePct: w.config.financialMonthlyRatePct,
    financialTramos: t.financial.tramos,
  };
}
