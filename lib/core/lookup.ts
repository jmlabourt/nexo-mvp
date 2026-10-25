// Búsquedas en los catálogos únicos y valores con vigencia. Puras.
import type { CoreWorld, Employee, ISODate, Material, Project, RateKind, RateRecord } from "./types";
import { byId, weekday } from "./util";

export const projectOf = (w: CoreWorld, id: string) => byId(w.projects, id);
export const clientName = (w: CoreWorld, id: string | undefined) => byId(w.clients, id)?.name ?? "Cliente sin datos";
export const supplierName = (w: CoreWorld, id: string | undefined) => byId(w.suppliers, id)?.name ?? "Proveedor sin datos";
export const rubroName = (w: CoreWorld, id: string | undefined) => byId(w.rubros, id)?.name ?? "Rubro sin datos";
export const materialOf = (w: CoreWorld, id: string | undefined): Material | undefined => byId(w.materials, id);
export const materialName = (w: CoreWorld, id: string | undefined) => byId(w.materials, id)?.name ?? "Material sin datos";
export const materialUnit = (w: CoreWorld, id: string | undefined) => byId(w.materials, id)?.unit ?? "";
export const employeeName = (w: CoreWorld, id: string | undefined) => byId(w.employees, id)?.name ?? "Persona sin datos";
export const categoryName = (w: CoreWorld, id: string | undefined) => w.config.categories.find((c) => c.id === id)?.name ?? "Categoría sin datos";
export const itemOf = (p: Project | undefined, itemId: string | undefined) => p?.items.find((i) => i.id === itemId);
export const itemName = (p: Project | undefined, itemId: string | undefined) => itemOf(p, itemId)?.name ?? "Mueble sin datos";
export const otOf = (w: CoreWorld, projectId: string | undefined) => byId(w.projects, projectId)?.ot ?? "OT sin datos";

export function isWorker(w: CoreWorld, e: Employee | undefined): boolean {
  return !!e && !!w.config.categories.find((c) => c.id === e.categoryId)?.isWorker;
}

export const workers = (w: CoreWorld) => w.employees.filter((e) => e.active && isWorker(w, e));

/** Registro vigente a una fecha: el último con validFrom ≤ fecha (empate: el cargado después). */
export function recordAt(rates: readonly RateRecord[], kind: RateKind, subjectId: string, date: ISODate): RateRecord | undefined {
  return rates
    .filter((r) => r.kind === kind && r.subjectId === subjectId && r.validFrom <= date)
    .sort((a, b) => a.validFrom.localeCompare(b.validFrom) || a.createdAt.localeCompare(b.createdAt))
    .at(-1);
}

export function rateAt(w: Pick<CoreWorld, "rates">, kind: RateKind, subjectId: string, date: ISODate): number | null {
  return recordAt(w.rates, kind, subjectId, date)?.value ?? null;
}

/** Costo por hora de una persona a una fecha: el suyo con vigencia; si no tiene, el de su categoría. null = sin dato. */
export function employeeCostAt(w: CoreWorld, employeeId: string, date: ISODate): number | null {
  const own = rateAt(w, "employee_cost", employeeId, date);
  if (own !== null) return own;
  const e = byId(w.employees, employeeId);
  return e ? rateAt(w, "category_cost", e.categoryId, date) : null;
}

export const overtimeCostMultiplierAt = (w: CoreWorld, date: ISODate) => rateAt(w, "overtime_cost", "all", date) ?? 1;

/** Horas laborables de una persona un día: la excepción si hay; si no, su jornada en sus días laborables. */
export function availableHours(w: Pick<CoreWorld, "exceptions">, e: Employee, date: ISODate): number {
  const ex = w.exceptions.filter((x) => x.employeeId === e.id && x.date === date).at(-1);
  if (ex) return ex.availableHours;
  return e.active && e.workDays.includes(weekday(date)) ? e.dailyHours : 0;
}

/** Persona con la que se trabaja en una sesión de la demo (Usuarios y permisos). */
export function sessionPerson(w: CoreWorld, session: string, operatorId?: string | null): Employee | undefined {
  if (session === "operario") return w.employees.find((e) => e.id === operatorId && e.active && isWorker(w, e)) ?? workers(w)[0];
  return w.employees.find((e) => e.active && e.sessions.includes(session as Employee["sessions"][number]));
}
