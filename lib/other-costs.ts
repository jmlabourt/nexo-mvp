/** Otros costos compartidos: el original es inmutable; los ajustes son asientos vinculados y acotados. */
import type {ActualEntry,OtherCostValue,Project} from "@/types";
import type {SessionKey} from "./permissions";
import {createId} from "./activity";
import {actualInputCategory,type ActualInput,DomainError} from "./project-operations";
const round=(n:number)=>Math.round(n*100)/100;
export function isOtherCost(e:ActualEntry){return e.type!=="labor"&&!e.labor&&!e.operatorId&&!e.costAdjustment;}
export function otherCostValue(e:ActualEntry):OtherCostValue {if(!isOtherCost(e))throw new DomainError("Elegí otro costo, no horas ni un ajuste independiente.");return {date:e.date,amount:e.amount,type:e.type as OtherCostValue["type"],category:e.category,description:e.description,supplier:e.supplier,itemId:e.itemId,notes:e.notes};}
export function otherCostGroup(p:Pick<Project,"actualEntries">,id:string){
 const origin=p.actualEntries.find(e=>e.id===id);if(!origin||!isOtherCost(origin))throw new DomainError("Costo de origen no encontrado.");
 const adjustments=p.actualEntries.filter(e=>e.costAdjustment?.originId===id);
 const history=adjustments.filter((e,i,all)=>all.findIndex(x=>x.costAdjustment!.eventId===e.costAdjustment!.eventId)===i);
 const value={...(history.at(-1)?.costAdjustment?.next??otherCostValue(origin)),amount:round(origin.amount+adjustments.reduce((s,e)=>s+e.amount,0))};
 return {origin,adjustments,history,value,cancelled:history.at(-1)?.costAdjustment?.kind==="cancellation"};
}
export interface OtherCostChange {
 requestId:string;kind:"correction"|"reduction"|"cancellation";reason:string;reference?:string;
 date:string;amount?:number;patch?:ActualInput;
}
function validDate(date:string){return /^\d{4}-\d{2}-\d{2}$/.test(date)&&!Number.isNaN(Date.parse(date+"T12:00:00Z"))&&new Date(date+"T12:00:00Z").toISOString().slice(0,10)===date;}
export function adjustOtherCost(p:Project,id:string,input:OtherCostChange,ctx:{session:SessionKey;actor:string;now:string}):Project {
 if(!["administracion","gerencia"].includes(ctx.session)||(p.isClosed&&ctx.session!=="gerencia"))throw new DomainError("Otros costos: abiertos Administración/Gerencia; cerrados solo Gerencia.");
 if(!input.requestId)throw new DomainError("Falta identidad de la operación.");
 const retry=p.actualEntries.find(e=>e.costAdjustment?.eventId===input.requestId);if(retry){if(retry.costAdjustment!.originId!==id)throw new DomainError("Identidad de operación ya utilizada por otro costo.");return p;}
 if(!["correction","reduction","cancellation"].includes(input.kind))throw new DomainError("Operación de costo inválida.");
 if(input.reason.trim().length<3||!validDate(input.date)||input.date>ctx.now.slice(0,10))throw new DomainError("Indicá motivo y fecha efectiva válida, no futura.");
 const group=otherCostGroup(p,id);if(group.cancelled)throw new DomainError("El costo ya está anulado; conservamos su historial.");
 const previous=group.value;let next={...previous};
 if(input.kind==="correction"){
  if(!input.patch||!Number.isFinite(input.patch.amount)||input.patch.amount<=0||!validDate(input.patch.date)||input.patch.date>ctx.now.slice(0,10)||input.patch.description.trim().length<2)throw new DomainError("Revisá descripción, fecha e importe corregidos.");
  if(!["outsourcing","finishing","logistics","installation","unexpected","other"].includes(input.patch.type)||input.patch.type==="other"&&input.patch.category!==undefined&&!["design","admin","financial"].includes(input.patch.category))throw new DomainError("Tipo o categoría de otro costo inválidos.");
  next={date:input.patch.date,amount:round(input.patch.amount),type:input.patch.type,category:actualInputCategory(input.patch),description:input.patch.description.trim(),supplier:input.patch.supplier,itemId:input.patch.itemId,notes:input.patch.notes};
 }else if(input.kind==="reduction"){
  if(!input.reference?.trim()||!Number.isFinite(input.amount)||input.amount!<=0||round(input.amount!)>previous.amount)throw new DomainError("La reducción requiere referencia y un importe positivo no mayor al costo neto.");
  if(input.date<previous.date)throw new DomainError("La reducción no puede ser anterior al gasto de origen.");
  if(group.history.some(e=>e.costAdjustment?.kind==="reduction"&&e.costAdjustment.reference?.trim().toLowerCase()===input.reference!.trim().toLowerCase()))throw new DomainError("Esa bonificación o devolución ya fue aplicada al costo.");
  next.amount=round(previous.amount-round(input.amount!));
 }else {next.amount=0;if(previous.amount<=0)throw new DomainError("No queda importe para anular.");}
 if(next.itemId&&!p.items.some(i=>i.id===next.itemId))throw new DomainError("Mueble inexistente.");
 const adjustment={originId:id,eventId:input.requestId,kind:input.kind,reason:input.reason.trim(),reference:input.reference?.trim(),effectiveDate:input.date,previous,next};
 const row=(value:OtherCostValue,amount:number,date:string,side:"reversal"|"replacement"|"net"):ActualEntry=>({ ...value,id:createId("cost-adjust"),projectId:p.id,amount:round(amount),date,description:`${input.kind==="reduction"?"Reducción documentada":input.kind==="cancellation"?"Anulación":"Corrección"}: ${value.description}`,createdBy:ctx.actor,createdAt:ctx.now,costAdjustment:{...adjustment,side} });
 // Una corrección rectifica la fecha/categoría del hecho: revierte el neto anterior y registra el correcto.
 // Una bonificación real tiene fecha propia; no reescribe el período del gasto original ni mueve caja.
 // Se compensa cada saldo por fecha/categoría: rectificar luego de una bonificación
 // no deja restos en el período ni categoría originales. Agrupar evita duplicar asientos ya neteados.
 const balances=new Map<string,{value:OtherCostValue;amount:number}>();
 for(const e of [group.origin,...group.adjustments]){
  const value={...previous,date:e.date,type:e.type as OtherCostValue["type"],category:e.category,itemId:e.itemId,supplier:e.supplier};
  const key=JSON.stringify([e.date,e.type,e.category,e.itemId,e.supplier]);const old=balances.get(key);
  balances.set(key,{value,amount:round((old?.amount??0)+e.amount)});
 }
 const reversals=()=>[...balances.values()].filter(b=>b.amount!==0).map(b=>row(b.value,-b.amount,b.value.date,input.kind==="correction"?"reversal":"net"));
 const entries=input.kind==="correction"?[...reversals(),row(next,next.amount,next.date,"replacement")]:input.kind==="cancellation"?reversals():[row(previous,next.amount-previous.amount,input.date,"net")];
 return {...p,actualEntries:[...p.actualEntries,...entries],updatedAt:ctx.now,activity:[...p.activity,{id:createId("cost-history"),kind:"cost",at:ctx.now,actor:ctx.actor,message:`Otros costos ${id}: ${previous.amount} → ${next.amount}. ${input.reason.trim()}${input.reference?` · ${input.reference.trim()}`:""}`} ]};
}
