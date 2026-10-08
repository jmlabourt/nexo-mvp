// ─────────────────────────────────────────────────────────────
// Operarios — base única para Taller y Gestión.
// Las horas se vinculan por id de operario y de proyecto, y el costo/hora se congela
// en cada registro, así que cambiar la tarifa no reescribe el pasado.
// ─────────────────────────────────────────────────────────────
import type { Operator, Project } from "@/types";
import { DomainError } from "./project-operations";
import { createId } from "./activity";

/** Datos que se editan del operario. El alta/baja NO va acá: se hace con deactivateOperator / reactivateOperator. */
export interface OperatorInput {
  name: string;
  role: string;
  hourlyCost: number;
  email?: string;
  userId?: string;
}

function validate(input: OperatorInput) {
  if (input.name.trim().length < 2) throw new DomainError("Ingresá el nombre del operario.");
  if (input.role.trim().length < 2) throw new DomainError("Ingresá el rol o especialidad.");
  if (!(input.hourlyCost > 0)) throw new DomainError("El costo por hora debe ser mayor a cero.");
}

export function createOperator(input: OperatorInput, now: string): Operator {
  validate(input);
  return {
    id: createId("op"),
    name: input.name.trim(),
    role: input.role.trim(),
    hourlyCost: input.hourlyCost,
    active: true,
    email: input.email?.trim().toLowerCase() || undefined,
    userId: input.userId,
    createdAt: now,
  };
}

export function updateOperator(operators: Operator[], id: string, input: OperatorInput): Operator[] {
  validate(input);
  if (!operators.some((o) => o.id === id)) throw new DomainError("Operario no encontrado.");
  return operators.map((o) =>
    o.id === id
      ? {
          ...o,
          name: input.name.trim(),
          role: input.role.trim(),
          hourlyCost: input.hourlyCost,
          email: input.email?.trim().toLowerCase() || undefined,
          userId: input.userId ?? o.userId,
        }
      : o,
  );
}

// ── Alta y baja ───────────────────────────────────────────────

/** Operarios en actividad: los únicos que aparecen en selectores, equipo y Taller. */
export function activeOperators(operators: Operator[]): Operator[] {
  return operators.filter((o) => o.active);
}

/** Lo que muestra la lista de Operarios: por defecto solo activos; con el filtro, también los dados de baja. */
export function visibleOperators(operators: Operator[], showDeactivated: boolean): Operator[] {
  return showDeactivated ? operators : activeOperators(operators);
}

/** Dar de baja (baja lógica): active = false + fecha de baja. El historial de horas y costos no se toca. */
export function deactivateOperator(operators: Operator[], id: string, now: string): Operator[] {
  const op = operators.find((o) => o.id === id);
  if (!op) throw new DomainError("Operario no encontrado.");
  if (!op.active) throw new DomainError(`${op.name} ya está dado de baja.`);
  return operators.map((o) => (o.id === id ? { ...o, active: false, deactivatedAt: now } : o));
}

export function reactivateOperator(operators: Operator[], id: string): Operator[] {
  const op = operators.find((o) => o.id === id);
  if (!op) throw new DomainError("Operario no encontrado.");
  if (op.active) throw new DomainError(`${op.name} ya está activo.`);
  return operators.map((o) => (o.id === id ? { ...o, active: true, deactivatedAt: undefined } : o));
}

/** ¿Tiene horas registradas en algún proyecto? Si tiene, no se puede eliminar: solo dar de baja. */
export function operatorHasRecords(projects: Pick<Project, "actualEntries">[], id: string): boolean {
  return projects.some((p) => p.actualEntries.some((e) => e.operatorId === id));
}

/**
 * Eliminar definitivamente. Solo si no tiene ningún registro de horas.
 * Devuelve los operarios sin él y los proyectos sin esa asignación.
 */
export function deleteOperator<P extends Pick<Project, "actualEntries" | "assignedOperatorIds">>(
  operators: Operator[],
  projects: P[],
  id: string,
): { operators: Operator[]; projects: P[] } {
  const op = operators.find((o) => o.id === id);
  if (!op) throw new DomainError("Operario no encontrado.");
  if (operatorHasRecords(projects, id)) {
    throw new DomainError(`${op.name} tiene horas registradas: no se puede eliminar, solo dar de baja.`);
  }
  return {
    operators: operators.filter((o) => o.id !== id),
    projects: projects.map((p) =>
      p.assignedOperatorIds.includes(id) ? { ...p, assignedOperatorIds: p.assignedOperatorIds.filter((x) => x !== id) } : p,
    ),
  };
}

// ── Baja con reasignación ─────────────────────────────────────

/** Proyectos que no están Finalizados y tienen asignado al operario: necesitan destino antes de la baja. */
export function openProjectsOf(projects: Project[], operatorId: string): Project[] {
  return projects.filter((p) => !p.isClosed && p.status !== "completed" && p.assignedOperatorIds.includes(operatorId));
}

/** Destino de cada proyecto al dar de baja: id de otro operario activo, o null = "Sin asignar". */
export type ReassignmentPlan = Record<string, string | null>;

/** Error del plan (o null si cada proyecto abierto tiene un destino válido). */
export function reassignmentPlanError(
  operators: Operator[],
  projects: Project[],
  operatorId: string,
  plan: ReassignmentPlan,
): string | null {
  for (const p of openProjectsOf(projects, operatorId)) {
    if (!(p.id in plan) || plan[p.id] === undefined) return `Elegí un destino para ${p.code}: otro operario o “Sin asignar”.`;
    const target = plan[p.id];
    if (target === null) continue;
    if (target === operatorId) return `${p.code}: elegí a otra persona, no a quien se da de baja.`;
    if (!operators.some((o) => o.id === target && o.active)) return `${p.code}: el operario elegido no está activo.`;
  }
  return null;
}

/** Cómo entra a Taller un usuario operario: vinculado y activo, dado de baja o sin vincular. */
export function operatorAccessForUser(
  operators: Operator[],
  userId: string | null,
  email: string,
): "active" | "deactivated" | "unlinked" {
  const mail = email.trim().toLowerCase();
  const matches = operators.filter((o) => (userId && o.userId === userId) || (mail && o.email === mail));
  if (matches.some((o) => o.active)) return "active";
  return matches.length > 0 ? "deactivated" : "unlinked";
}

/** Operario vinculado a la sesión: por usuario o, si todavía no entró, por email. */
export function operatorForUser(operators: Operator[], userId: string | null, email: string): Operator | undefined {
  const mail = email.trim().toLowerCase();
  return operators.find((o) => o.active && ((userId && o.userId === userId) || (mail && o.email === mail)));
}

/** Proyectos que un operario puede ver en Taller: asignados y en una etapa donde se trabaja. */
export function projectsForOperator(projects: Project[], operatorId: string, operators?: Operator[]): Project[] {
  // Un operario dado de baja no ve proyectos.
  if (operators && !operators.some((o) => o.id === operatorId && o.active)) return [];
  return projects.filter(
    (p) =>
      !p.isClosed &&
      p.assignedOperatorIds.includes(operatorId) &&
      (p.status === "purchasing" || p.status === "production" || p.status === "installation"),
  );
}

/** Horas del operario en un proyecto (para mostrar en Gestión sin recalcular a mano). */
export function hoursByOperator(project: Pick<Project, "actualEntries">): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of project.actualEntries) {
    if (e.type !== "labor" || !e.operatorId) continue;
    out.set(e.operatorId, (out.get(e.operatorId) ?? 0) + (e.labor?.hours ?? 0));
  }
  return out;
}
