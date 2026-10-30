// ─────────────────────────────────────────────────────────────
// Gerencia (demo integral): facturación por OT y por mes, rentabilidad presupuestada / hasta hoy / final y
// condiciones de cierre. Funciones puras sobre los proyectos y el ledger (lib/ledger.ts).
//
//   · Contratado vigente ≠ previsto ≠ facturado (fecha de emisión) ≠ cobrado (fecha de ingreso).
//   · Rentabilidad presupuestada = foto aprobada (presupuesto base), nunca se recalcula.
//   · Rentabilidad hasta hoy = contrato vigente − costo real cargado: es PARCIAL mientras falte costo.
//   · Rentabilidad final: solo con el proyecto cerrado y sin costos pendientes; si no, "No calculable".
//   · Margen agregado = Σ ganancias / Σ contratos (nunca el promedio de porcentajes).
//   · Un pago a proveedor no es ingreso ni costo nuevo; el gasto financiero estimado no es un costo pagado.
// ─────────────────────────────────────────────────────────────
import type { DayException, Operator, WorkAssignment, Ledger, MaterialDelivery, Opportunity, Project, PurchaseOrder, RubroCapacity } from "@/types";
import { dailyHoursReviews } from "./hours-review";
import type { Threshold } from "./plant";
import { dayCapacity } from "./schedule";
import { externalCost, pendingExternal } from "./frontend-work";
import { inProduction } from "./plant-materials";
import { actualCostToDate } from "./calculations";
import { financialCost } from "./financial";
import { accruedFinancialInput, billingStatus, currentContract, handoverOf, staffHoursCost, termsOf } from "./ledger";
import { capacityHours, generalState, inPeriod, loadByRubro, monthsBetween } from "./gerencia";
import { rubroLabel } from "./rubros";
import { unresolvedMaterial } from "./material-flow";
import type { StockState } from "./stock";

const round2 = (n: number) => Math.round(n * 100) / 100;
const sum = (xs: number[]) => round2(xs.reduce((s, x) => s + x, 0));
const pct = (profit: number, base: number) => (base > 0 ? round2((profit / base) * 100) : null);

// ── Facturación por OT, por mes y total ──

export interface BillingOtRow {
  project: Project;
  contracted: number;
  planned: number;
  invoiced: number;
  collected: number;
  pendingToInvoice: number;
  pendingToCollect: number;
  overInvoiced: number;
}

/** Facturación de cada OT (solo ventas: nunca una cotización). */
export function billingByOt(projects: Project[], ledger: Ledger): BillingOtRow[] {
  return projects
    .filter((p) => generalState(p) !== "quotation")
    .map((project) => {
      const b = billingStatus(project, ledger);
      return {
        project,
        contracted: b.contracted,
        planned: b.planned,
        invoiced: b.invoiced,
        collected: b.collected,
        pendingToInvoice: b.pendingToInvoice,
        pendingToCollect: round2(Math.max(0, b.contracted - b.collected)),
        overInvoiced: b.overInvoiced,
      };
    })
    .sort((a, b) => b.pendingToCollect - a.pendingToCollect || a.project.code.localeCompare(b.project.code));
}

export interface BillingMonthRow {
  key: string;
  label: string;
  /** Cobros previstos (condiciones de pago) con fecha en el mes. */
  planned: number;
  /** Facturas por fecha de emisión. */
  invoiced: number;
  /** Cobros por fecha de ingreso. */
  collected: number;
}

export function billingMonths(projects: Project[], ledger: Ledger, from: string, to: string): BillingMonthRow[] {
  const sales = new Set(projects.filter((p) => generalState(p) !== "quotation").map((p) => p.id));
  const schedule = ledger.paymentTerms.filter((t) => sales.has(t.projectId)).flatMap((t) => t.schedule);
  return monthsBetween(from, to).map((m) => ({
    key: m.key,
    label: m.label,
    planned: sum(schedule.filter((s) => inPeriod(s.date, m)).map((s) => s.amount)),
    invoiced: sum(ledger.salesInvoices.filter((i) => sales.has(i.projectId) && inPeriod(i.date, m)).map((i) => i.amount)),
    collected: sum(ledger.collections.filter((c) => sales.has(c.projectId) && inPeriod(c.date, m)).map((c) => c.amount)),
  }));
}

export interface BillingTotals {
  contracted: number;
  planned: number;
  invoiced: number;
  collected: number;
  pendingToInvoice: number;
  pendingToCollect: number;
}

export function billingTotals(rows: BillingOtRow[]): BillingTotals {
  return {
    contracted: sum(rows.map((r) => r.contracted)),
    planned: sum(rows.map((r) => r.planned)),
    invoiced: sum(rows.map((r) => r.invoiced)),
    collected: sum(rows.map((r) => r.collected)),
    pendingToInvoice: sum(rows.map((r) => r.pendingToInvoice)),
    pendingToCollect: sum(rows.map((r) => r.pendingToCollect)),
  };
}

// ── Costos pendientes y cierre ──

/** Costos que todavía pueden llegar: OC con material de este proyecto sin la factura del proveedor. */
export function pendingCosts(project: Project, orders: PurchaseOrder[]): string[] {
  const open = orders.filter((o) => o.status !== "invoiced" && o.lines.some((l) => l.projectId === project.id));
  return open.map((o) => `${o.number} (${o.supplier}) sin factura del proveedor`);
}

export interface CloseCheck {
  /** Condiciones que bloquean el cierre. */
  blockers: string[];
  /** Avisos: no bloquean, pero el cierre queda "con costos pendientes". */
  warnings: string[];
}

/** Gerencia cierra solo con todo terminado, la entrega real confirmada por el Jefe y sin materiales sin rendir. */
export function closeCheck(project: Project, ledger: Ledger, stock: StockState, orders: PurchaseOrder[], deliveries: MaterialDelivery[] = [], work?: { assignments: WorkAssignment[]; operators: Operator[]; today: string; threshold: Threshold; reviewed: string[] }): CloseCheck {
  const blockers: string[] = [];
  if (project.isClosed) blockers.push("El proyecto ya está cerrado.");
  if (generalState(project) === "quotation") blockers.push("Una cotización no se cierra: se aprueba o se rechaza.");
  const missing = project.items.filter((i) => i.completedUnits < i.quantity);
  if (project.items.length === 0) blockers.push("El proyecto no tiene muebles.");
  if (missing.length) blockers.push(`Faltan unidades terminadas: ${missing.map((i) => `${i.name} ${i.completedUnits}/${i.quantity}`).join(", ")}.`);
  if (!handoverOf(ledger, project.id)) blockers.push("El Jefe de planta todavía no confirmó la entrega real al cliente.");
  const producing = deliveries.filter((d) => d.projectId === project.id && !d.closedAt && inProduction(d) > 1e-9);
  if (producing.length) blockers.push(`Hay material en producción sin rendir: ${producing.map((d) => d.materialName).join(", ")}. El Jefe lo rinde en el cierre del día.`);
  const open = unresolvedMaterial(stock, project.id);
  if (open.length) blockers.push(`Hay materiales sin rendir: ${open.map((h) => h.lot.materialName).join(", ")}.`);
  if (work) blockers.push(...dailyHoursReviews([project],work.assignments,work.operators,work.today,work.threshold).filter((r) => !work.reviewed.includes(r.key)).map((r) => `Horas pendientes de revisión: ${r.worker} · ${r.date}.`));
  blockers.push(...pendingExternal(ledger, project.id).map((e) => `Costo externo pendiente de confirmar por Gerencia: ${e.date} · ${e.description}.`));
  return { blockers, warnings: pendingCosts(project, orders) };
}

export function closureOf(ledger: Pick<Ledger, "closures">, projectId: string) {
  return ledger.closures.find((c) => c.projectId === projectId) ?? null;
}

// ── Rentabilidad ──

export interface ProfitView {
  /** Foto aprobada (presupuesto base). null si nunca se aprobó. */
  budgeted: { price: number; cost: number; profit: number; margin: number | null } | null;
  /** Contrato vigente − costo real cargado hasta hoy. Es PARCIAL mientras el proyecto no esté cerrado sin pendientes. */
  toDate: { contract: number; cost: number; profit: number; margin: number | null; partial: boolean };
  /** Solo con el proyecto cerrado y sin costos pendientes. */
  final: { contract: number; cost: number; profit: number; margin: number | null } | null;
  /** Por qué no hay final (null si hay). */
  finalReason: string | null;
}

export function profitView(project: Project, ledger: Ledger, asOf?: string): ProfitView {
  const b = project.baseline;
  const budgeted = b ? { price: b.salesPrice, cost: b.budgetTotal, profit: round2(b.salesPrice - b.budgetTotal), margin: pct(b.salesPrice - b.budgetTotal, b.salesPrice) } : null;
  const contract = currentContract(project, ledger);
  // Costo cargado: el del proyecto más las horas propias de Administración, Compras y el Jefe imputadas a la OT.
  const finance = asOf ? financialCost(accruedFinancialInput(project,ledger,asOf)) : null;
  const recordedFinance = project.actualEntries.filter((e) => e.category === "financial").reduce((s,e) => s+e.amount,0);
  const additionalFinance = finance?.ok ? Math.max(0,finance.amount-recordedFinance) : 0;
  const cost = round2(actualCostToDate(project) + staffHoursCost(ledger, project.id) + externalCost(ledger, project.id) + additionalFinance);
  const closure = closureOf(ledger, project.id);
  const complete = project.isClosed && (!closure || closure.pendingCosts.length === 0) && pendingExternal(ledger, project.id).length === 0;
  const toDate = { contract, cost, profit: round2(contract - cost), margin: pct(contract - cost, contract), partial: !complete };
  const finalReason = !project.isClosed
    ? "No calculable: el proyecto sigue abierto."
    : !complete
      ? "No calculable: se cerró con costos pendientes."
      : contract > 0
        ? null
        : "No calculable: falta el monto contratado.";
  return { budgeted, toDate, final: finalReason ? null : { contract, cost, profit: toDate.profit, margin: toDate.margin }, finalReason };
}

/** Margen agregado = Σ ganancias / Σ contratos (null si no hay contratos). */
export function aggregateMargin(rows: Array<{ profit: number; contract: number }>): { profit: number; contract: number; margin: number | null } {
  const profit = sum(rows.map((r) => r.profit));
  const contract = sum(rows.map((r) => r.contract));
  return { profit, contract, margin: pct(profit, contract) };
}

// ── Cobros previstos vencidos ──

/** Cuotas con fecha pasada y el proyecto con menos cobrado que lo previsto hasta esa fecha. */
export function overdueSchedule(projects: Project[], ledger: Ledger, today: string): Array<{ project: Project; amount: number }> {
  return projects
    .filter((p) => generalState(p) !== "quotation")
    .map((project) => {
      const due = sum(termsOf(ledger, project.id).schedule.filter((s) => s.date < today).map((s) => s.amount));
      const collected = sum(ledger.collections.filter((c) => c.projectId === project.id).map((c) => c.amount));
      return { project, amount: round2(due - collected) };
    })
    .filter((x) => x.amount > 0.5);
}

// ── Capacidad por semana o por mes (confirmado vs potencial, sin probabilidades) ──

export interface CapacityBucket {
  label: string;
  from: string;
  to: string;
  capacity: number;
  confirmed: number;
  potential: number;
  planned?: number;
}

const addDaysIso = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/**
 * Carga y capacidad de las próximas semanas (8) o meses (4), para un rubro o para todos. Cada persona cuenta una sola
 * vez (capacityFromOperators); la carga se reparte entre hoy y la entrega (distribución estimada).
 */
export function capacityTimeline(
  capacities: RubroCapacity[],
  projects: Project[],
  opps: Opportunity[],
  today: string,
  granularity: "week" | "month",
  rubro?: string,
  live?: { operators: Operator[]; exceptions: DayException[]; hoursPerDay: number; roleToRubro: Record<string,string>; assignments: WorkAssignment[]; ledger: Ledger },
): CapacityBucket[] {
  const buckets: Array<{ label: string; from: string; to: string }> =
    granularity === "week"
      ? Array.from({ length: 8 }, (_, i) => {
          const from = addDaysIso(today, i * 7);
          const to = addDaysIso(from, 6);
          return { label: `Semana del ${from.slice(8, 10)}/${from.slice(5, 7)}`, from, to };
        })
      : monthsBetween(today, addDaysIso(today, 92)).slice(0, 4).map((m) => ({ label: m.label, from: m.from < today ? today : m.from, to: m.to }));
  const pick = (rec: Record<string, number>) => (rubro ? (rec[rubro] ?? 0) : Object.values(rec).reduce((s, x) => s + x, 0));
  return buckets.map((b) => {
    const days = live ? [...new Set(live.operators.filter((o) => o.active && o.productive !== false).flatMap((o) => o.workDays ?? [1,2,3,4,5]))] : undefined;
    const load = loadByRubro(projects, opps, b.from, b.to, today,days?.length ? days : undefined);
    return {
      ...b,
      capacity: live ? (() => {
        let hours = 0;
        for (let date = b.from; date <= b.to; date = addDaysIso(date,1)) {
          for (const op of live.operators.filter((o) => o.active && o.productive !== false && (!rubro || (live.roleToRubro[o.role] ?? o.role) === rubro))) hours += dayCapacity(op,date,live.exceptions,live.hoursPerDay).hours;
        }
        hours += (live.ledger.capacityAdjustments ?? []).filter((a) => a.date >= b.from && a.date <= b.to && (!rubro || (a.rubro && rubroLabel(a.rubro) === rubro))).reduce((s,a) => s+a.hours,0);
        return round2(Math.max(0,hours));
      })() : round2(capacities.filter((c) => !rubro || c.rubro === rubro).reduce((s, c) => s + capacityHours(c, b.from, b.to), 0)),
      planned: live ? round2(live.assignments.filter((a) => a.date >= b.from && a.date <= b.to && (!rubro || rubroLabel(a.rubro) === rubro)).reduce((s,a) => s+a.plannedHours,0)) : undefined,
      confirmed: round2(pick(load.confirmed)),
      potential: round2(pick(load.potential)),
    };
  });
}

/** Cost of financing in the selected period, including real arrears; never add the recorded amount twice. */
export function financialCostInPeriod(projects: Project[], ledger: Ledger, from: string, to: string): number {
  if (to < from) return 0;
  const before = addDaysIso(from,-1);
  return sum(projects.map((p) => {
    const end = financialCost(accruedFinancialInput(p,ledger,to));
    const start = financialCost(accruedFinancialInput(p,ledger,before));
    const accrued = Math.max(0,(end.ok ? end.amount : 0)-(start.ok ? start.amount : 0));
    const registered = sum(p.actualEntries.filter((e) => e.category === "financial" && inPeriod(e.date,{ from,to })).map((e) => e.amount));
    return Math.max(accrued,registered);
  }));
}
