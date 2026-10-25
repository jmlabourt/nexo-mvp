// Contrato vigente, ingresos efectivos, saldo pendiente y cuotas vencidas. Puras.
import type { CoreWorld, ISODate, Project, ScheduledPayment } from "./types";
import { EPS, money, sumBy } from "./util";

/** Contrato vigente a una fecha: la última revisión con fecha ≤ fecha, o el precio aprobado. null = sin aprobar. */
export function contractAt(w: Pick<CoreWorld, "contractRevisions">, p: Project, date: ISODate): number | null {
  if (!p.baseline) return null;
  const rev = w.contractRevisions
    .filter((r) => r.projectId === p.id && r.date <= date)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
    .at(-1);
  return rev ? rev.next : p.baseline.agreedPrice;
}

export const incomesOf = (w: Pick<CoreWorld, "incomes">, projectId: string, until?: ISODate) =>
  w.incomes.filter((i) => i.projectId === projectId && (!until || i.date <= until)).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

export const collectedOf = (w: Pick<CoreWorld, "incomes">, projectId: string, until?: ISODate) => money(sumBy(incomesOf(w, projectId, until), (i) => i.amount));

/** Pendiente de cobrar a una fecha de corte: max(0, contrato vigente − ingresos acumulados). */
export function pendingAt(w: CoreWorld, p: Project, date: ISODate): number {
  const c = contractAt(w, p, date);
  return c === null ? 0 : money(Math.max(0, c - collectedOf(w, p.id, date)));
}

export interface ScheduleStatus {
  payment: ScheduledPayment;
  covered: number;
  pending: number;
  overdue: boolean;
  daysToDue: number;
}

/**
 * Cuotas previstas cubiertas por los ingresos en orden de fecha (un ingreso cubre la cuota más vieja pendiente).
 * Vencida = fecha pasada y saldo > 0.
 */
export function scheduleStatus(w: CoreWorld, p: Project, today: ISODate): ScheduleStatus[] {
  let left = collectedOf(w, p.id, today);
  return [...p.schedule]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((payment) => {
      const covered = money(Math.min(left, payment.amount));
      left = money(left - covered);
      const pending = money(payment.amount - covered);
      const daysToDue = Math.round((Date.parse(`${payment.date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
      return { payment, covered, pending, overdue: pending > EPS && payment.date < today, daysToDue };
    });
}

/** Validación de un ingreso: positivo, con fecha, y sin superar el contrato vigente. */
export function incomeError(w: CoreWorld, p: Project, input: { date: string; amount: number }, today: ISODate): string | null {
  if (!p.baseline) return "Una cotización no tiene ingresos: primero se aprueba.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return "Indicá la fecha en que ingresó la plata.";
  if (input.date > today) return "El ingreso es plata que ya entró: la fecha no puede ser futura.";
  if (!(input.amount > 0)) return "Indicá el importe que ingresó.";
  const contract = contractAt(w, p, today) ?? 0;
  const collected = collectedOf(w, p.id);
  if (collected + input.amount - contract > 0.005) return `Supera el contrato vigente: falta cobrar ${money(contract - collected)}.`;
  return null;
}
