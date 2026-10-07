// ─────────────────────────────────────────────────────────────
// Operarios — base única para Taller y Gestión.
// Las horas se vinculan por id de operario y de proyecto, y el costo/hora se congela
// en cada registro, así que cambiar la tarifa no reescribe el pasado.
// ─────────────────────────────────────────────────────────────
import type { Operator, Project } from "@/types";
import { DomainError } from "./project-operations";
import { createId } from "./activity";

export interface OperatorInput {
  name: string;
  role: string;
  hourlyCost: number;
  active?: boolean;
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
    active: input.active ?? true,
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
          active: input.active ?? o.active,
          email: input.email?.trim().toLowerCase() || undefined,
          userId: input.userId ?? o.userId,
        }
      : o,
  );
}

/** Operario vinculado a la sesión: por usuario o, si todavía no entró, por email. */
export function operatorForUser(operators: Operator[], userId: string | null, email: string): Operator | undefined {
  const mail = email.trim().toLowerCase();
  return operators.find((o) => o.active && ((userId && o.userId === userId) || (mail && o.email === mail)));
}

/** Proyectos que un operario puede ver en Taller: asignados y en una etapa donde se trabaja. */
export function projectsForOperator(projects: Project[], operatorId: string): Project[] {
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
