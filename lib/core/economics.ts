// ─────────────────────────────────────────────────────────────
// Economía de una OT: costos reales, costo financiero actualizado, ganancia y rentabilidad. Puras.
//
// Costo de material imputable = Σ (consumido × costo del lote) + Σ (desperdiciado × costo del lote).
//   Comprar o recibir NO es costo; el sobrante devuelto sigue siendo stock.
// Mano de obra = Σ horas de obreros × costo vigente en la fecha (+ horas extra). Personal = ídem para no obreros.
// Otros costos = imprevistos reales cargados por Gerencia.
// Costo operativo = material + mano de obra + personal + otros.
// Costo financiero actualizado (a la fecha de corte), con hechos y supuestos declarados:
//   · material de OC: invertido(t) = min(valor de la línea, max(pagado atribuido a la línea hasta t, recibido hasta t))
//     (pago real si existe; si no, supuesto: invertido al recibir).
//   · material de stock asignado o transferido a la OT: invertido en la fecha de la asignación; lo que vuelve a stock o
//     sale a otra OT deja de estar invertido en esta.
//   · horas: invertidas en la fecha trabajada (supuesto: no se piden fechas de pago de sueldos).
//   · otros costos: en su fecha.  · cobros: ingresos efectivos en su fecha.
// Ganancia = contrato vigente − costo operativo − costo financiero actualizado.
// Rentabilidad = ganancia / contrato × 100. En una OT abierta es PARCIAL (hasta hoy), nunca final.
// ─────────────────────────────────────────────────────────────
import type { CoreWorld, ISODate, Movement, Project } from "./types";
import { contractAt, collectedOf, incomesOf, pendingAt } from "./contract";
import { financialTramos, tramosUntil, type CashEvent, type FinancialResult } from "./financial";
import { costEntry, entriesOfProject, splitByWorker, type CostedEntry } from "./hours";
import { materialName } from "./lookup";
import { lineReceived, lineValue, paymentByLine } from "./orders";
import { asg, cons, FREE, placeProject, waste } from "./stock";
import { byId, EPS, money, qty, r2, sumBy } from "./util";

const lotCost = (w: Pick<CoreWorld, "lots">, m: Movement) => w.lots.find((l) => l.id === m.lotId)?.unitCost ?? 0;

export interface MaterialCostRow {
  materialId: string;
  consumedQty: number;
  wasteQty: number;
  consumedCost: number;
  wasteCost: number;
}

export function materialCosts(w: CoreWorld, projectId: string, until?: ISODate, from?: ISODate): { rows: MaterialCostRow[]; consumed: number; waste: number; total: number } {
  const rows = new Map<string, MaterialCostRow>();
  for (const m of w.movements) {
    if (until && m.date > until) continue;
    if (from && m.date < from) continue;
    const isCons = m.to === cons(projectId);
    const isWaste = m.to === waste(projectId);
    if (!isCons && !isWaste) continue;
    const lot = w.lots.find((l) => l.id === m.lotId);
    if (!lot) continue;
    const r = rows.get(lot.materialId) ?? { materialId: lot.materialId, consumedQty: 0, wasteQty: 0, consumedCost: 0, wasteCost: 0 };
    if (isCons) {
      r.consumedQty = qty(r.consumedQty + m.quantity);
      r.consumedCost = money(r.consumedCost + m.quantity * lot.unitCost);
    } else {
      r.wasteQty = qty(r.wasteQty + m.quantity);
      r.wasteCost = money(r.wasteCost + m.quantity * lot.unitCost);
    }
    rows.set(lot.materialId, r);
  }
  const list = [...rows.values()].sort((a, b) => materialName(w, a.materialId).localeCompare(materialName(w, b.materialId)));
  const consumed = money(sumBy(list, (r) => r.consumedCost));
  const wasteTotal = money(sumBy(list, (r) => r.wasteCost));
  return { rows: list, consumed, waste: wasteTotal, total: money(consumed + wasteTotal) };
}

export interface LaborCost {
  entries: CostedEntry[];
  hours: number;
  cost: number;
  /** Registros sin costo por hora cargado (el total no los incluye: información incompleta). */
  missingRate: CostedEntry[];
}

function laborOf(w: CoreWorld, list: ReturnType<typeof entriesOfProject>): LaborCost {
  const entries = list.map((t) => costEntry(w, t));
  return {
    entries,
    hours: r2(sumBy(entries, (c) => c.entry.hours)),
    cost: money(sumBy(entries, (c) => c.cost ?? 0)),
    missingRate: entries.filter((c) => c.cost === null),
  };
}

export function laborCosts(w: CoreWorld, projectId: string, until?: ISODate, from?: ISODate): { labor: LaborCost; staff: LaborCost } {
  const list = entriesOfProject(w, projectId).filter((t) => (!until || t.date <= until) && (!from || t.date >= from));
  const split = splitByWorker(w, list);
  return { labor: laborOf(w, split.labor), staff: laborOf(w, split.staff) };
}

export const otherCostsOf = (w: CoreWorld, projectId: string, until?: ISODate, from?: ISODate) =>
  w.otherCosts.filter((c) => c.projectId === projectId && (!until || c.date <= until) && (!from || c.date >= from));

/** Eventos de inversión y recupero de la OT hasta la fecha de corte (hechos y supuestos). */
export function financialEvents(w: CoreWorld, p: Project, cutoff: ISODate): CashEvent[] {
  const events: CashEvent[] = [];
  // Material de OC con OT: max(pagado, recibido) acotado al valor de la línea, por fecha de cambio.
  for (const o of w.orders) {
    const payParts = w.supplierPayments.filter((x) => x.orderId === o.id).map((pay) => ({ pay, byLine: paymentByLine(o, pay) }));
    for (const l of o.lines.filter((x) => x.projectId === p.id)) {
      const value = lineValue(l);
      const dates = new Set<string>();
      for (const r of w.receipts.filter((x) => x.lineId === l.id)) {
        dates.add(r.date);
        if (r.reversal) dates.add(r.reversal.date);
      }
      for (const { pay, byLine } of payParts) if (byLine.has(l.id)) dates.add(pay.date);
      let prev = 0;
      for (const d of [...dates].filter((x) => x <= cutoff).sort()) {
        const paid = sumBy(payParts.filter(({ pay }) => pay.date <= d), ({ byLine }) => byLine.get(l.id) ?? 0);
        const received = lineReceived(w, l.id, d) * l.unitPrice;
        const invested = money(Math.min(value, Math.max(paid, received)));
        if (Math.abs(invested - prev) > 0.005) {
          const fact = paid >= received - 0.005;
          events.push({
            date: d,
            invest: money(invested - prev),
            recover: 0,
            label: `${o.number} · ${materialName(w, l.materialId)}: ${fact ? "pago al proveedor" : "recibido sin pago cargado (supuesto: invertido al recibir)"}`,
            ref: l.id,
            basis: fact ? "fact" : "assumption",
          });
          prev = invested;
        }
      }
    }
  }
  // Material de stock que entra o sale de la OT (asignación, transferencia, devolución a stock).
  for (const m of w.movements) {
    if (m.date > cutoff) continue;
    if (m.kind === "receipt" || m.kind === "receipt_reversal") continue;
    const fromP = placeProject(w, m.from);
    const toP = placeProject(w, m.to);
    if (fromP === toP) continue;
    const v = money(m.quantity * lotCost(w, m));
    const lot = byId(w.lots, m.lotId);
    const label = `${materialName(w, lot?.materialId)} ${qty(m.quantity)}`;
    if (toP === p.id && (m.from === FREE || m.from.startsWith("asg:"))) events.push({ date: m.date, invest: v, recover: 0, label: `${label}: entra a la OT desde stock`, ref: m.id, basis: "fact" });
    if (fromP === p.id && (m.to === FREE || m.to.startsWith("asg:"))) events.push({ date: m.date, invest: -v, recover: 0, label: `${label}: sale de la OT (vuelve a stock u otra OT)`, ref: m.id, basis: "fact" });
  }
  // Horas (supuesto: invertidas en la fecha trabajada).
  for (const t of entriesOfProject(w, p.id).filter((x) => x.date <= cutoff)) {
    const c = costEntry(w, t).cost;
    if (c) events.push({ date: t.date, invest: c, recover: 0, label: `Horas ${t.hours} h (supuesto: pagadas el día trabajado)`, ref: t.id, basis: "assumption" });
  }
  for (const c of otherCostsOf(w, p.id, cutoff)) events.push({ date: c.date, invest: c.amount, recover: 0, label: `Otro costo: ${c.description}`, ref: c.id, basis: "fact" });
  for (const i of incomesOf(w, p.id, cutoff)) events.push({ date: i.date, invest: 0, recover: i.amount, label: `Ingreso${i.reference ? ` (${i.reference})` : ""}`, ref: i.id, basis: "fact" });
  return events.sort((a, b) => a.date.localeCompare(b.date));
}

export function updatedFinancial(w: CoreWorld, p: Project, cutoff: ISODate): FinancialResult {
  return financialTramos(financialEvents(w, p, cutoff), w.config.financialMonthlyRatePct, cutoff);
}

export interface Economics {
  projectId: string;
  contract: number | null;
  collected: number;
  pending: number;
  materials: number;
  materialsWaste: number;
  labor: number;
  laborHours: number;
  staff: number;
  staffHours: number;
  other: number;
  operatingCost: number;
  financialUpdated: number;
  /** Costo financiero previsto (escenario normal) acumulado a la misma fecha. */
  financialBudgetToDate: number;
  financialAdditional: number;
  realCost: number;
  profit: number | null;
  marginPct: number | null;
  operatingMarginPct: number | null;
  quotedMarginPct: number | null;
  /** final = OT cerrada; partial = en curso (hasta hoy). */
  stage: "quote" | "partial" | "final";
  incomplete: string[];
  cutoff: ISODate;
}

export function economics(w: CoreWorld, p: Project, cutoff: ISODate): Economics {
  const mat = materialCosts(w, p.id, cutoff);
  const { labor, staff } = laborCosts(w, p.id, cutoff);
  const other = money(sumBy(otherCostsOf(w, p.id, cutoff), (c) => c.amount));
  const operatingCost = money(mat.total + labor.cost + staff.cost + other);
  const contract = contractAt(w, p, cutoff);
  const fin = p.baseline ? updatedFinancial(w, p, cutoff) : null;
  const financialUpdated = fin?.total ?? 0;
  const financialBudgetToDate = p.baseline ? tramosUntil(p.baseline.financialTramos, p.baseline.financialRatePct, cutoff) : 0;
  const realCost = money(operatingCost + financialUpdated);
  const profit = contract === null ? null : money(contract - realCost);
  const incomplete: string[] = [];
  for (const c of [...labor.missingRate, ...staff.missingRate]) incomplete.push(`Falta el costo por hora de una persona el ${c.entry.date}.`);
  return {
    projectId: p.id,
    contract,
    collected: collectedOf(w, p.id, cutoff),
    pending: pendingAt(w, p, cutoff),
    materials: mat.total,
    materialsWaste: mat.waste,
    labor: labor.cost,
    laborHours: labor.hours,
    staff: staff.cost,
    staffHours: staff.hours,
    other,
    operatingCost,
    financialUpdated,
    financialBudgetToDate,
    financialAdditional: money(Math.max(0, financialUpdated - financialBudgetToDate)),
    realCost,
    profit,
    marginPct: contract && contract > EPS && profit !== null ? r2((profit / contract) * 100) : null,
    operatingMarginPct: contract && contract > EPS ? r2(((contract - operatingCost) / contract) * 100) : null,
    quotedMarginPct: p.baseline?.quotedMarginPct ?? null,
    stage: !p.baseline ? "quote" : p.status === "closed" ? "final" : "partial",
    incomplete: [...new Set(incomplete)],
    cutoff,
  };
}

export const STAGE_LABEL: Record<Economics["stage"], string> = { quote: "Cotización", partial: "Parcial · hasta hoy", final: "Final" };

/** Rentabilidad agregada: Σ ganancia / Σ contrato × 100 (nunca promedio de porcentajes). */
export function aggregateMargin(rows: Array<Pick<Economics, "profit" | "contract">>): { profit: number; contract: number; marginPct: number | null } {
  const valid = rows.filter((r) => r.profit !== null && r.contract !== null);
  const profit = money(sumBy(valid, (r) => r.profit as number));
  const contract = money(sumBy(valid, (r) => r.contract as number));
  return { profit, contract, marginPct: contract > EPS ? r2((profit / contract) * 100) : null };
}

/** Lugares de una OT para los movimientos de material (para trazabilidad). */
export const projectPlaces = (projectId: string) => [asg(projectId), cons(projectId), waste(projectId)];
