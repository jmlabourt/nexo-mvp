// ─────────────────────────────────────────────────────────────
// Planta: planificación, asignaciones a operarios, disponibilidad, entregas a producción y su rendición. Puras.
//
// La planificación (fecha + OT + mueble + rubro + horas) es la única fuente de horas previstas. Las asignaciones las
// distribuyen entre operarios: pendiente de asignar (por día) = max(0, planificado − asignado).
// Rendición de una entrega: liberado = consumido + desperdiciado + devuelto + sigue en producción.
// ─────────────────────────────────────────────────────────────
import type { Assignment, CoreWorld, Employee, ISODate, PlanEntry, Project, Release } from "./types";
import { availableHours, workers } from "./lookup";
import { enabledRubros } from "./needs";
import { movementsOf, prod, qtyAt } from "./stock";
import { addDays, byId, eachDay, EPS, qty, r2, sumBy } from "./util";

/** OTs donde Planta puede planificar y registrar trabajo. */
export const isPlantProject = (p: Pick<Project, "status">) => p.status === "production";

export type ItemState = "in_process" | "done";
export const itemState = (i: { quantity: number; completedUnits: number }): ItemState => (i.completedUnits >= i.quantity ? "done" : "in_process");
export const ITEM_STATE_LABELS: Record<ItemState, string> = { in_process: "En proceso", done: "Finalizado" };
export const allItemsDone = (p: Pick<Project, "items">) => p.items.length > 0 && p.items.every((i) => itemState(i) === "done");

/** Días en que corre una asignación: los laborables del operario entre `from` y `to` (con horas disponibles). */
export function assignmentDays(w: Pick<CoreWorld, "exceptions">, a: Assignment, e: Employee | undefined): ISODate[] {
  if (!e) return [];
  return eachDay(a.from, a.to).filter((d) => availableHours(w, e, d) > 0);
}

/** Horas asignadas por día: [fecha, horas]. */
export function assignmentHoursByDay(w: CoreWorld, a: Assignment): Array<[ISODate, number]> {
  const e = byId(w.employees, a.employeeId);
  return assignmentDays(w, a, e).map((d) => [d, a.hoursPerDay]);
}

export function assignedHours(w: CoreWorld, filter: (a: Assignment) => boolean, date?: ISODate): number {
  return r2(sumBy(w.assignments.filter(filter), (a) => sumBy(assignmentHoursByDay(w, a).filter(([d]) => !date || d === date), ([, h]) => h)));
}

/** Horas asignadas a una persona un día (todas las OTs). */
export const assignedToEmployeeOn = (w: CoreWorld, employeeId: string, date: ISODate) => assignedHours(w, (a) => a.employeeId === employeeId, date);

export interface PendingToAssign {
  projectId: string;
  itemId: string;
  rubroId: string;
  date: ISODate;
  planned: number;
  assigned: number;
  pending: number;
}

/** Pendientes de asignar: por día, planificado − asignado (desde `from`). */
export function pendingToAssign(w: CoreWorld, from?: ISODate): PendingToAssign[] {
  const out: PendingToAssign[] = [];
  const groups = new Map<string, PlanEntry[]>();
  for (const pl of w.plans) {
    if (from && pl.date < from) continue;
    const k = `${pl.projectId}|${pl.itemId}|${pl.rubroId}|${pl.date}`;
    groups.set(k, [...(groups.get(k) ?? []), pl]);
  }
  for (const [k, list] of groups) {
    const [projectId, itemId, rubroId, date] = k.split("|");
    const planned = r2(sumBy(list, (x) => x.hours));
    const assigned = assignedHours(w, (a) => a.projectId === projectId && a.itemId === itemId && a.rubroId === rubroId, date);
    const pending = r2(Math.max(0, planned - assigned));
    if (pending > EPS) out.push({ projectId, itemId, rubroId, date, planned, assigned, pending });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.projectId.localeCompare(b.projectId));
}

/** Validación de una entrada de planificación (cascada OT → mueble → rubro permitido). */
export function planError(w: CoreWorld, input: Pick<PlanEntry, "projectId" | "itemId" | "rubroId" | "date" | "hours">): string | null {
  const p = byId(w.projects, input.projectId);
  if (!p) return "Elegí una OT.";
  if (!isPlantProject(p)) return "La OT todavía no está en Producción.";
  if (!p.items.some((i) => i.id === input.itemId)) return "Ese mueble no es de esta OT.";
  if (!enabledRubros(w, p, input.itemId).includes(input.rubroId)) return "Ese rubro no está cotizado para este mueble. Si hace falta, pedilo a Administración como adicional.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return "Indicá la fecha.";
  if (!(input.hours > 0) || input.hours > 200) return "Las horas planificadas van de más de 0 a 200.";
  return null;
}

/** Validación de una asignación a un operario. */
export function assignmentError(w: CoreWorld, a: Omit<Assignment, "id" | "createdBy" | "createdAt">, ignoreId?: string): string | null {
  const p = byId(w.projects, a.projectId);
  if (!p || !isPlantProject(p)) return "La OT no está en Producción.";
  if (!p.items.some((i) => i.id === a.itemId)) return "Ese mueble no es de esta OT.";
  if (!enabledRubros(w, p, a.itemId).includes(a.rubroId)) return "Ese rubro no está habilitado para el mueble.";
  const e = byId(w.employees, a.employeeId);
  if (!e || !workers(w).some((x) => x.id === e.id)) return "Elegí un operario activo.";
  if (!e.rubroIds.includes(a.rubroId)) return `${e.name} no está habilitado para ese rubro.`;
  if (!(a.hoursPerDay > 0) || a.hoursPerDay > 24) return "Las horas por día van de más de 0 a 24.";
  if (!a.from || !a.to || a.to < a.from) return "Revisá las fechas: el fin no puede ser antes del inicio.";
  const days = assignmentDays(w, { ...a, id: "tmp", createdBy: "", createdAt: "" }, e);
  if (days.length === 0) return `${e.name} no trabaja en esas fechas.`;
  for (const d of days) {
    const other = assignedHours(w, (x) => x.employeeId === e.id && x.id !== ignoreId, d);
    const avail = availableHours(w, e, d);
    if (other + a.hoursPerDay - avail > EPS) return `${e.name} ya tiene ${other} h asignadas el ${d} y trabaja ${avail} h: se superpone.`;
  }
  return null;
}

export interface AvailabilityRow {
  employee: Employee;
  assignedToday: number;
  availableToday: number;
  exceptions: CoreWorld["exceptions"];
}

export function availabilityRows(w: CoreWorld, today: ISODate): AvailabilityRow[] {
  return workers(w).map((e) => ({
    employee: e,
    assignedToday: assignedToEmployeeOn(w, e.id, today),
    availableToday: availableHours(w, e, today),
    exceptions: w.exceptions.filter((x) => x.employeeId === e.id && x.date >= today).sort((a, b) => a.date.localeCompare(b.date)),
  }));
}

/** Saldo de una entrega: liberado, rendido y lo que sigue en producción. */
export function releaseBalance(w: CoreWorld, r: Release): { released: number; consumed: number; waste: number; returned: number; inProduction: number } {
  const rends = w.renditions.filter((x) => x.releaseId === r.id);
  return {
    released: r.quantity,
    consumed: qty(sumBy(rends, (x) => x.consumed)),
    waste: qty(sumBy(rends, (x) => x.waste)),
    returned: qty(sumBy(rends, (x) => x.returned)),
    inProduction: qtyAt(w, prod(r.id)),
  };
}

export const openReleases = (w: CoreWorld, projectId?: string) =>
  w.releases.filter((r) => (!projectId || r.projectId === projectId) && qtyAt(w, prod(r.id)) > EPS);

/** Última novedad de una entrega: su fecha o la de su última rendición (también "sigue en producción"). */
export function releaseLastActivity(w: Pick<CoreWorld, "renditions">, r: Release): ISODate {
  return w.renditions.filter((x) => x.releaseId === r.id).reduce((d, x) => (x.date > d ? x.date : d), r.date);
}

/** Entregas abiertas sin novedades hace más de `days` días (Planta tiene que registrar qué pasó). */
export const staleReleases = (w: CoreWorld, today: ISODate, days: number, projectId?: string) =>
  openReleases(w, projectId).filter((r) => releaseLastActivity(w, r) < addDays(today, -days));

/** Valor del material de una rendición (para costos), con el costo de cada lote. */
export const renditionMovements = (w: CoreWorld, renditionId: string) => movementsOf(w, renditionId);

export interface TodayRow {
  projectId: string;
  itemId: string;
  rubroId: string;
  planned: number;
  real: number;
}

/** Trabajos previstos para una fecha (de la planificación) con horas reales de ese día (de los registros). */
export function todayRows(w: CoreWorld, date: ISODate): TodayRow[] {
  const keys = new Map<string, TodayRow>();
  for (const pl of w.plans.filter((x) => x.date === date)) {
    const k = `${pl.projectId}|${pl.itemId}|${pl.rubroId}`;
    const row = keys.get(k) ?? { projectId: pl.projectId, itemId: pl.itemId, rubroId: pl.rubroId, planned: 0, real: 0 };
    row.planned = r2(row.planned + pl.hours);
    keys.set(k, row);
  }
  for (const row of keys.values()) {
    row.real = r2(sumBy(w.timeEntries.filter((t) => t.date === date && t.projectId === row.projectId && t.itemId === row.itemId && t.rubroId === row.rubroId), (t) => t.hours));
  }
  return [...keys.values()];
}

/** Tareas del día de un operario (Mi día): de sus asignaciones vigentes ese día. */
export function myDayTasks(w: CoreWorld, employeeId: string, date: ISODate): Array<Pick<Assignment, "projectId" | "itemId" | "rubroId"> & { assignmentId: string }> {
  return w.assignments
    .filter((a) => a.employeeId === employeeId && assignmentHoursByDay(w, a).some(([d]) => d === date))
    .map((a) => ({ projectId: a.projectId, itemId: a.itemId, rubroId: a.rubroId, assignmentId: a.id }));
}
