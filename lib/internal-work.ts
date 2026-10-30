import type { Ledger, Project } from "@/types";
import { registerInternalHours } from "./ledger";
import { generalAllocations } from "./frontend-work";
import { DomainError } from "./project-operations";
export function correctInternalWork(ledger: Ledger, projects: Project[], id: string, input: { date: string; hours: number; reason: string }, ctx: { actor: string; now: string }): Ledger {
  const previous = ledger.internalHours.find((h) => h.id === id);
  if (!previous) throw new DomainError("Registro interno no encontrado.");
  if (input.reason.trim().length < 3) throw new DomainError("Indicá el motivo de la corrección.");
  if (input.date > ctx.now.slice(0,10)) throw new DomainError("Las horas reales no pueden tener fecha futura.");
  if (previous.hourlyCost === undefined) throw new DomainError("El registro histórico no tiene costo horario: requiere revisión de Gerencia antes de distribuirlo.");
  const productive = projects.flatMap((p) => p.actualEntries).filter((e) => e.operatorId === previous.employeeId && e.date === input.date).reduce((s,e) => s+(e.labor?.hours ?? 0),0);
  const other = ledger.internalHours.filter((h) => h.id !== id && h.employeeId === previous.employeeId && h.date === input.date).reduce((s,h) => s+h.hours,0);
  if (productive + other + input.hours > 24) throw new DomainError("La suma de horas reales de la persona supera las 24 h del día.");
  const checked = registerInternalHours({ ...ledger,internalHours:ledger.internalHours.filter((h) => h.id !== id) },{ ...previous,date:input.date,hours:input.hours },ctx).internalHours.at(-1)!;
  const next = { ...previous,date:checked.date,hours:checked.hours,allocations:previous.projectId ? undefined : generalAllocations(projects,checked.date,Math.round(checked.hours*previous.hourlyCost*100)/100),corrections:[...(previous.corrections ?? []),{ previous:{ date:previous.date,hours:previous.hours,allocations:previous.allocations },next:{ date:checked.date,hours:checked.hours },by:ctx.actor,at:ctx.now,reason:input.reason.trim() }] };
  return { ...ledger,internalHours:ledger.internalHours.map((h) => h.id === id ? next : h) };
}
