import type { Ledger, Project, Operator, PriceRecord } from "@/types";
import { registerInternalHours, type LedgerCtx } from "./ledger";
import { generalAllocations } from "./frontend-work";
import { employeeCost } from "./personnel";
import { DomainError } from "./project-operations";
export function correctInternalWork(ledger: Ledger, projects: Project[], id: string, input: { date: string; hours: number; reason: string }, ctx: LedgerCtx): Ledger {
  const previous = ledger.internalHours.find((h) => h.id === id);
  if (!ctx.employeeId || previous?.employeeId !== ctx.employeeId) throw new DomainError("Solo podés corregir tus propias horas internas.");
  if (!previous) throw new DomainError("Registro interno no encontrado.");
  if (input.reason.trim().length < 3) throw new DomainError("Indicá el motivo de la corrección.");
  if (input.date > ctx.now.slice(0,10)) throw new DomainError("Las horas reales no pueden tener fecha futura.");
  if (previous.hourlyCost === undefined) throw new DomainError("El registro histórico no tiene costo horario: requiere revisión de Gerencia antes de distribuirlo.");
  const productive = projects.flatMap((p) => p.actualEntries).filter((e) => e.operatorId === previous.employeeId && e.date === input.date).reduce((s,e) => s+(e.labor?.hours ?? 0),0);
  const other = ledger.internalHours.filter((h) => h.id !== id && h.employeeId === previous.employeeId && h.date === input.date).reduce((s,h) => s+h.hours,0);
  if (productive + other + input.hours > 24) throw new DomainError("La suma de horas reales de la persona supera las 24 h del día.");
  const checked = registerInternalHours({ ...ledger,internalHours:ledger.internalHours.filter((h) => h.id !== id) },{ ...previous,date:input.date,hours:input.hours },ctx).internalHours.at(-1)!;
  const allocations=previous.projectId ? undefined : generalAllocations(projects,checked.date,Math.round(checked.hours*previous.hourlyCost*100)/100);
  const next = { ...previous,date:checked.date,hours:checked.hours,allocations,corrections:[...(previous.corrections ?? []),{ previous:{ date:previous.date,hours:previous.hours,allocations:previous.allocations },next:{ date:checked.date,hours:checked.hours,allocations },by:ctx.actor,at:ctx.now,reason:input.reason.trim() }] };
  return { ...ledger,internalHours:ledger.internalHours.map((h) => h.id === id ? next : h) };
}

/** Valida identidad y evidencia también cuando se invoca recordLedger sin el formulario. */
export function validateInternalHoursChange(before:Ledger,after:Ledger,projects:Project[],employee:Operator|undefined,session:string,ctx:LedgerCtx,history:PriceRecord[]):void {
 if(JSON.stringify(before.internalHours)===JSON.stringify(after.internalHours))return;
 if(session==="gerencia"||!employee||ctx.employeeId!==employee.id)throw new DomainError("Las horas propias requieren una identidad de Personal vinculada a tu sesión.");
 const old=before.internalHours,next=after.internalHours;
 if(new Set(next.map(h=>h.id)).size!==next.length||old.some(h=>!next.some(n=>n.id===h.id)))throw new DomainError("No se borran ni duplican registros de horas internas.");
 for(const row of next){
  const previous=old.find(h=>h.id===row.id);if(JSON.stringify(previous)===JSON.stringify(row))continue;
  if(row.employeeId!==employee.id||previous&&previous.employeeId!==employee.id)throw new DomainError("Solo podés registrar o corregir tus propias horas internas.");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(row.date)||row.date>ctx.now.slice(0,10)||!Number.isFinite(row.hours)||row.hours<=0||row.hours>24)throw new DomainError("Fecha y horas reales inválidas.");
  const target=row.projectId?projects.find(p=>p.id===row.projectId):undefined;
  if(row.projectId&&(!target||target.isClosed||target.status==="completed"||target.status==="quotation"))throw new DomainError("Las horas nuevas o corregidas requieren un proyecto aprobado y abierto.");
  if(row.itemId&&(!target||!target.items.some(i=>i.id===row.itemId)))throw new DomainError("El mueble no pertenece al proyecto.");
  if(previous){
   if(JSON.stringify({...row,date:previous.date,hours:previous.hours,allocations:previous.allocations,corrections:previous.corrections})!==JSON.stringify(previous))throw new DomainError("La corrección conserva identidad, categoría y tarifa histórica.");
   const corrections=row.corrections??[],prior=previous.corrections??[],last=corrections.at(-1);
   if(corrections.length!==prior.length+1||JSON.stringify(corrections.slice(0,-1))!==JSON.stringify(prior)||!last||last.reason.trim().length<3||last.by!==ctx.actor||last.at!==ctx.now||JSON.stringify(last.previous)!==JSON.stringify({date:previous.date,hours:previous.hours,allocations:previous.allocations})||JSON.stringify(last.next)!==JSON.stringify({date:row.date,hours:row.hours,allocations:row.allocations}))throw new DomainError("La corrección requiere historial de antes/después, autor, fecha y motivo.");
  }else{
   const valued=employeeCost(after,employee,row.date,row.categoryId,history);
   const category=after.staffCategories?.find(c=>c.id===valued.categoryId);
   if(row.categoryName!==undefined&&row.categoryName!==category?.name||row.costCategory!==undefined&&row.costCategory!==category?.category)throw new DomainError("La clasificación y nombre deben provenir de la categoría laboral elegida.");
   if(category?.category==="labor"&&row.projectId)throw new DomainError("Las horas productivas se registran por rubro desde Operario, no como horas no operarias.");
   if(category&&category.category!=="labor"&&row.itemId)throw new DomainError("Las horas no operarias nuevas corresponden al proyecto completo, sin mueble.");
   const cost=valued.hourlyCost;
   if(row.hourlyCost!==Math.round(cost*100)/100)throw new DomainError("La tarifa debe provenir de Personal y su vigencia.");
  }
  if(row.hourlyCost===undefined||!Number.isFinite(row.hourlyCost)||row.hourlyCost<0)throw new DomainError("Falta tarifa histórica verificable.");
  const allocations=row.projectId?undefined:generalAllocations(projects,row.date,Math.round(row.hours*row.hourlyCost*100)/100);
  if(JSON.stringify(row.allocations)!==JSON.stringify(allocations))throw new DomainError("La distribución debe corresponder a los proyectos activos de la fecha real.");
  const productive=projects.flatMap(p=>p.actualEntries).filter(e=>e.operatorId===employee.id&&e.date===row.date).reduce((s,e)=>s+(e.labor?.hours??0),0);
  if(productive+next.filter(h=>h.employeeId===employee.id&&h.date===row.date).reduce((s,h)=>s+h.hours,0)>24)throw new DomainError("La suma de horas reales de la persona supera las 24 h del día.");
 }
}
