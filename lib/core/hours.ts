// ─────────────────────────────────────────────────────────────
// Horas trabajadas de toda la empresa y su costo. Puras.
//
// Costo de una hora = costo por hora de la persona VIGENTE EN LA FECHA trabajada (historial con vigencia).
// Horas extra: por persona y día, lo que supera sus horas laborables de ese día (jornada contractual o excepción) se
// paga con el multiplicador vigente. La parte extra se reparte entre los registros del día en proporción a sus horas:
//   extra del día = max(0, Σ horas del día − horas laborables del día)
//   extra de un registro = horas del registro × extra del día / Σ horas del día
//   costo = tarifa × (horas + extra del registro × (multiplicador − 1))
// El Trabajo interno (sin OT) cuenta para la jornada pero nunca se imputa a una OT.
// ─────────────────────────────────────────────────────────────
import type { CoreWorld, Employee, ISODate, TimeEntry } from "./types";
import { availableHours, employeeCostAt, isWorker, overtimeCostMultiplierAt } from "./lookup";
import { byId, money, r2, sumBy } from "./util";

export interface CostedEntry {
  entry: TimeEntry;
  rate: number | null;
  overtimeHours: number;
  multiplier: number;
  /** null = falta el costo por hora de la persona (información incompleta). */
  cost: number | null;
}

export function dayHours(w: Pick<CoreWorld, "timeEntries">, employeeId: string, date: ISODate): number {
  return r2(sumBy(w.timeEntries.filter((t) => t.employeeId === employeeId && t.date === date), (t) => t.hours));
}

export function costEntry(w: CoreWorld, entry: TimeEntry): CostedEntry {
  const e = byId(w.employees, entry.employeeId);
  const rate = employeeCostAt(w, entry.employeeId, entry.date);
  const total = dayHours(w, entry.employeeId, entry.date);
  const available = e ? availableHours(w, e, entry.date) : 0;
  const extraDay = Math.max(0, total - available);
  const overtimeHours = total > 0 ? r2((entry.hours * extraDay) / total) : 0;
  const multiplier = overtimeCostMultiplierAt(w, entry.date);
  const cost = rate === null ? null : money(rate * (entry.hours + overtimeHours * (multiplier - 1)));
  return { entry, rate, overtimeHours, multiplier, cost };
}

export const entriesOfProject = (w: Pick<CoreWorld, "timeEntries">, projectId: string) => w.timeEntries.filter((t) => t.projectId === projectId && t.hours > 0);

/** Separa las horas de obreros (mano de obra) de las del resto del personal (Diseño, Administración…). */
export function splitByWorker(w: CoreWorld, entries: TimeEntry[]): { labor: TimeEntry[]; staff: TimeEntry[] } {
  const labor: TimeEntry[] = [];
  const staff: TimeEntry[] = [];
  for (const t of entries) (isWorker(w, byId(w.employees, t.employeeId)) ? labor : staff).push(t);
  return { labor, staff };
}

export interface HoursValidationInput {
  employee: Employee;
  date: ISODate;
  rows: Array<{ projectId?: string; itemId?: string; rubroId?: string; hours: number }>;
}

/** Un día de horas: sin mínimo; máximo 24; sin duplicar la misma tarea; combinaciones válidas. Devuelve errores y avisos. */
export function hoursDayErrors(w: CoreWorld, input: HoursValidationInput, allowed: (row: HoursValidationInput["rows"][number]) => string | null): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const rows = input.rows.filter((r) => r.hours !== 0);
  if (rows.some((r) => !Number.isFinite(r.hours) || r.hours < 0)) errors.push("Las horas no pueden ser negativas.");
  const total = r2(sumBy(rows, (r) => r.hours));
  if (total > 24) errors.push("Un día no puede tener más de 24 horas.");
  const keys = rows.map((r) => `${r.projectId ?? "interno"}|${r.itemId ?? ""}|${r.rubroId ?? ""}`);
  if (new Set(keys).size !== keys.length) errors.push("Hay dos filas con la misma tarea: sumá las horas en una sola.");
  for (const r of rows) {
    const e = allowed(r);
    if (e) errors.push(e);
  }
  const available = availableHours(w, input.employee, input.date);
  if (total > Math.max(12, available + 4)) warnings.push(`Cargaste ${total} h en el día: revisá que esté bien.`);
  return { errors: [...new Set(errors)], warnings };
}

export interface DayReview {
  employeeId: string;
  date: ISODate;
  planned: number;
  declared: number;
  entries: TimeEntry[];
  reviewed: boolean;
}

/** Jornadas de obreros para revisar: horas asignadas por Planta vs horas declaradas. */
export function dayReviews(w: CoreWorld, plannedOf: (employeeId: string, date: ISODate) => number): DayReview[] {
  const keys = new Map<string, DayReview>();
  for (const t of w.timeEntries) {
    if (!isWorker(w, byId(w.employees, t.employeeId))) continue;
    const k = `${t.employeeId}|${t.date}`;
    const r = keys.get(k) ?? { employeeId: t.employeeId, date: t.date, planned: plannedOf(t.employeeId, t.date), declared: 0, entries: [], reviewed: true };
    r.entries.push(t);
    r.declared = r2(r.declared + t.hours);
    if (!t.review) r.reviewed = false;
    keys.set(k, r);
  }
  return [...keys.values()].sort((a, b) => b.date.localeCompare(a.date) || a.employeeId.localeCompare(b.employeeId));
}
