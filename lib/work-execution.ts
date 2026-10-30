import type { ActualEntry, Operator, Project, RubroId, WorkAssignment } from "@/types";
import { createId } from "./activity";
import { checkHours } from "./project-rules";
import { DomainError } from "./project-operations";
import { assignmentError } from "./plant";
import { rubroLabel } from "./rubros";
export interface ExecutionInput {
  requestId: string;
  operatorId: string;
  projectId: string;
  itemId?: string;
  rubro: RubroId;
  date: string;
  hours: number;
  assignmentId?: string;
}
/** Actual execution can differ from the plan. Never modify or create a planned assignment. */
export function executeWork(projects: Project[], operators: Operator[], assignments: WorkAssignment[], input: ExecutionInput, ctx: { actor: string; now: string; today: string; cost: number; hoursPerDay: number }): Project[] {
  if (projects.some((p) => p.actualEntries.some((e) => e.id === input.requestId))) return projects;
  const error = assignmentError({ ...input, plannedHours: input.hours }, { projects, operators });
  if (error) throw new DomainError(error);
  const asg = assignments.find((a) => a.id === input.assignmentId);
  if (input.assignmentId && (!asg || asg.operatorId !== input.operatorId || asg.date !== input.date)) throw new DomainError("La asignación original no corresponde a la persona y fecha.");
  const check = checkHours(projects.flatMap((p) => p.actualEntries),input.operatorId,input.date,input.hours,ctx.today,ctx.hoursPerDay);
  if (check.level === "block") throw new DomainError(check.message);
  if (!Number.isFinite(ctx.cost) || ctx.cost < 0) throw new DomainError("Costo horario inválido.");
  const op = operators.find((o) => o.id === input.operatorId)!;
  const entry: ActualEntry = { id: input.requestId, projectId: input.projectId, itemId: input.itemId || undefined, rubro: input.rubro, operatorId: op.id, assignmentId: input.assignmentId, date: input.date, type: "labor", category: "labor", description: `${rubroLabel(input.rubro)} — ${op.name}`, labor: { role: rubroLabel(input.rubro), hours: input.hours, hourlyCost: ctx.cost, workerName: op.name }, amount: Math.round(input.hours*ctx.cost*100)/100, stage: "production", createdBy: ctx.actor, createdAt: ctx.now };
  return projects.map((p) => p.id === input.projectId ? { ...p, actualEntries: [...p.actualEntries,entry], updatedAt: ctx.now } : p);
}
export interface ExecutionCorrection extends Omit<ExecutionInput, "requestId" | "operatorId" | "assignmentId"> { entryId: string; reason: string }
export function correctExecution(projects: Project[], operators: Operator[], input: ExecutionCorrection, ctx: { actor: string; now: string; today: string; hoursPerDay: number }): Project[] {
  const source = projects.find((p) => p.actualEntries.some((e) => e.id === input.entryId));
  const old = source?.actualEntries.find((e) => e.id === input.entryId);
  if (!source || !old?.labor || !old.operatorId || source.isClosed) throw new DomainError("Elegí un registro interno de un proyecto abierto.");
  if (input.reason.trim().length < 3) throw new DomainError("Indicá el motivo de la corrección.");
  const without = projects.map((p) => ({ ...p, actualEntries: p.actualEntries.filter((e) => e.id !== old.id) }));
  const next = executeWork(without,operators,[],{ ...input, operatorId: old.operatorId, requestId: old.id }, { ...ctx, cost: old.labor.hourlyCost });
  return next.map((p) => {
    if (p.id !== source.id && p.id !== input.projectId) return p;
    return { ...p, actualEntries: p.actualEntries.map((e) => e.id === old.id ? { ...e, assignmentId: old.assignmentId, corrections: [...(old.corrections ?? []), { previous: { date: old.date, projectId: old.projectId, itemId: old.itemId, rubro: old.rubro, hours: old.labor!.hours, amount: old.amount }, next: { date: e.date, projectId: e.projectId, itemId: e.itemId, rubro: e.rubro, hours: e.labor!.hours, amount: e.amount }, reason: input.reason.trim(), by: ctx.actor, at: ctx.now }] } : e), activity: [...p.activity, { id: createId("hc"), kind: "cost" as const, at: ctx.now, actor: ctx.actor, message: `Corrección de ${old.id}: ${input.reason.trim()} (${old.labor!.hours} h → ${input.hours} h; ${old.date} → ${input.date})` }] };
  });
}
