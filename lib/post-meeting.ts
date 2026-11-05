/** Demo local: hechos financieros compartidos y correcciones auditadas. Sin integración bancaria. */
import type { Collection,Ledger,PaymentRequest,Project,PurchaseOrder,SalesInvoice,SupplierPayment } from "@/types";
import { createId } from "./activity";
import { DomainError } from "./project-operations";
import { confirmSupplierPayment,currentContract,invoiceBalance,paidOf,registerCollection,termsOf,type LedgerCtx,type CollectionInput } from "./ledger";
import { orderTotal } from "./purchasing";
const round=(n:number)=>Math.round(n*100)/100;
const validDate=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+"T12:00:00Z"));
function reasonRequired(reason:string){if(reason.trim().length<3)throw new DomainError("Indicá un motivo de al menos tres caracteres.");}
function history(l:Ledger,entity:NonNullable<Ledger["financialCorrections"]>[number]["entity"],id:string,before:unknown,after:unknown,reason:string,ctx:LedgerCtx):Ledger {
 reasonRequired(reason);return {...l,financialCorrections:[...(l.financialCorrections??[]),{id:createId("fc"),entity,targetId:id,before,after,reason:reason.trim(),by:ctx.actor,at:ctx.now}]};
}
export function correctInvoice(l:Ledger,id:string,patch:Pick<SalesInvoice,"amount"|"dueDate"|"condition"|"cancelled">,reason:string,ctx:LedgerCtx):Ledger {
 const old=l.salesInvoices.find(i=>i.id===id);if(!old)throw new DomainError("Factura no encontrada.");
 const applied=l.collections.filter(c=>c.invoiceId===id).reduce((s,c)=>s+c.amount,0);
 if(!Number.isFinite(patch.amount)||patch.amount<=0||patch.amount+0.005<applied || (patch.cancelled && applied>0))throw new DomainError("La factura tiene cobros aplicados o importe inválido; corregí primero la aplicación del cobro.");
 if(patch.dueDate && (!validDate(patch.dueDate)||patch.dueDate<old.date))throw new DomainError("Vencimiento inválido.");
 const next={...old,...patch};return history({...l,salesInvoices:l.salesInvoices.map(i=>i.id===id?next:i)},"invoice",id,old,next,reason,ctx);
}
export function correctCollection(l:Ledger,p:Project,id:string,input:CollectionInput,reason:string,ctx:LedgerCtx):Ledger {
 const old=l.collections.find(c=>c.id===id&&c.projectId===p.id);if(!old)throw new DomainError("Cobro no encontrado.");
 const checked=registerCollection({...l,collections:l.collections.filter(c=>c.id!==id)},p,input,ctx).collections.at(-1)!;
 const next:Collection={...checked,id:old.id,createdAt:old.createdAt,createdBy:old.createdBy};
 return history({...l,collections:l.collections.map(c=>c.id===id?next:c)},"collection",id,old,next,reason,ctx);
}
export function requestSupplierPayment(l:Ledger,o:PurchaseOrder,input:{amount:number;date:string;reason:string},ctx:LedgerCtx):Ledger {
 reasonRequired(input.reason);if(!["sent","invoiced"].includes(o.status))throw new DomainError("Primero enviá la orden de compra.");
 const outstanding=(l.paymentRequests??[]).filter(r=>r.orderId===o.id&&!r.cancelled).reduce((s,r)=>s+Math.max(0,r.amount-l.supplierPayments.filter(p=>p.paymentRequestId===r.id).reduce((s,p)=>s+p.amount,0)),0);
 if(!validDate(input.date)||!Number.isFinite(input.amount)||input.amount<=0||paidOf(l,o.id)+outstanding+input.amount>(o.invoiceAmount??orderTotal(o))+0.005)throw new DomainError("Revisá fecha e importe: no puede superar el saldo sin solicitar.");
 const row:PaymentRequest={...input,id:createId("reqpay"),orderId:o.id,reason:input.reason.trim(),by:ctx.actor,at:ctx.now};return {...l,paymentRequests:[...(l.paymentRequests??[]),row]};
}
export function manageBanking(l:Ledger,id:string,banking:NonNullable<PaymentRequest["banking"]>,reason:string,ctx:LedgerCtx):Ledger {
 const row=l.paymentRequests?.find(r=>r.id===id);if(!row)throw new DomainError("Solicitud no encontrada.");
 if(row.cancelled)throw new DomainError("La solicitud está cancelada.");
 if(!validDate(banking.issuedOn)||!banking.reference.trim()||(banking.dueOn&&(!validDate(banking.dueOn)||banking.dueOn<banking.issuedOn)))throw new DomainError("Indicá emisión, referencia y vencimiento válidos.");
 const next={...row,banking};return history({...l,paymentRequests:l.paymentRequests!.map(r=>r.id===id?next:r)},"banking",id,row,next,reason,ctx);
}
export function settleRequest(l:Ledger,o:PurchaseOrder,id:string,input:{date:string;amount:number;reference:string},ctx:LedgerCtx):Ledger {
 const row=l.paymentRequests?.find(r=>r.id===id&&r.orderId===o.id);if(!row)throw new DomainError("Solicitud no encontrada.");
 if(row.cancelled)throw new DomainError("La solicitud está cancelada.");
 if(input.date>ctx.now.slice(0,10))throw new DomainError("El pago efectivo no puede tener fecha futura; registrá la gestión bancaria por separado.");
 const paid=l.supplierPayments.filter(p=>p.paymentRequestId===id).reduce((s,p)=>s+p.amount,0);
 if(paid+input.amount>row.amount+0.005)throw new DomainError("El pago supera el saldo solicitado.");
 if(l.supplierPayments.some(p=>p.orderId===o.id&&p.reference===input.reference.trim()&&p.date===input.date&&p.amount===input.amount))throw new DomainError("Ese pago ya está registrado.");
 const next=confirmSupplierPayment(l,o,input,ctx,{allowSentOrder:true});return {...next,supplierPayments:next.supplierPayments.map(p=>l.supplierPayments.some(old=>old.id===p.id)?p:{...p,paymentRequestId:id})};
}
export function correctSupplierPayment(l:Ledger,o:PurchaseOrder,id:string,input:{date:string;amount:number;reference:string},reason:string,ctx:LedgerCtx):Ledger {
 if(input.date>ctx.now.slice(0,10))throw new DomainError("El pago efectivo no puede tener fecha futura.");
 const old=l.supplierPayments.find(p=>p.id===id&&p.orderId===o.id);if(!old)throw new DomainError("Pago no encontrado.");
 const without={...l,supplierPayments:l.supplierPayments.filter(p=>p.id!==id)};
 const linked=l.paymentRequests?.find(r=>r.id===old.paymentRequestId);
 if(linked&&without.supplierPayments.filter(p=>p.paymentRequestId===linked.id).reduce((s,p)=>s+p.amount,0)+input.amount>linked.amount+0.005)throw new DomainError("El débito corregido supera el importe de la solicitud.");
 const checked=old.paymentRequestId&&!linked?.cancelled?settleRequest(without,o,old.paymentRequestId,input,ctx):confirmSupplierPayment(without,o,input,ctx,{allowSentOrder:true});
 const added=checked.supplierPayments.at(-1)!;const next:SupplierPayment={...added,paymentRequestId:old.paymentRequestId,id:old.id,by:old.by,at:old.at};return history({...l,supplierPayments:l.supplierPayments.map(p=>p.id===id?next:p)},"payment",id,old,next,reason,ctx);
}
export function financeReminders(projects:Project[],l:Ledger,today:string,dueSoonDays=0){
 const out:Array<{id:string;projectId:string;kind:"invoice"|"collection";message:string}>=[];
 for(const p of projects.filter(p=>p.status!=="quotation")){
  const invoices=l.salesInvoices.filter(i=>i.projectId===p.id&&!i.cancelled&&i.date<=today);
  // Historical invoices without milestone retain aggregate coverage; do not fabricate links.
  let legacy=invoices.filter(i=>!i.milestoneId).reduce((s,i)=>s+i.amount,0);
  for(const s of termsOf(l,p.id).schedule.filter(s=>s.date<=today).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id))){
   const matched=invoices.filter(i=>i.milestoneId===s.id).reduce((sum,i)=>sum+i.amount,0);const covered=Math.min(Math.max(0,s.amount-matched),legacy);legacy-=covered;
   const pending=round(s.amount-matched-covered);if(pending>0.005)out.push({id:`invoice-${p.id}-${s.id}`,projectId:p.id,kind:"invoice",message:`${s.label}: falta emitir ${pending}; hito ${s.date}.`});
  }
  for(const i of invoices){const balance=invoiceBalance(l,i.id);if(balance<=0||!i.dueDate)continue;const days=Math.ceil((Date.parse(i.dueDate)-Date.parse(today))/86400000);if(days<=dueSoonDays)out.push({id:`collection-${i.id}`,projectId:p.id,kind:"collection",message:`Factura ${i.number}: ${balance} pendientes; ${days<0?"vencida":"próxima a vencer"} ${i.dueDate}.`});}
 }
 return out;
}
export function cashInPeriod(l:Ledger,from:string,to:string){const between=(date:string)=>date>=from&&date<=to;const collected=round(l.collections.filter(c=>between(c.date)).reduce((s,c)=>s+c.amount,0));const paid=round(l.supplierPayments.filter(p=>between(p.date)).reduce((s,p)=>s+p.amount,0));return {collected,paid,result:round(collected-paid)};}
export function requestBalance(l:Ledger,r:PaymentRequest){return r.cancelled?0:round(Math.max(0,r.amount-l.supplierPayments.filter(p=>p.paymentRequestId===r.id).reduce((s,p)=>s+p.amount,0)));}
export function projectCollectable(p:Project,l:Ledger){return round(currentContract(p,l)-l.collections.filter(c=>c.projectId===p.id).reduce((s,c)=>s+c.amount,0));}

export function cancelPaymentRequest(l:Ledger,id:string,reason:string,ctx:LedgerCtx):Ledger {
 const row=l.paymentRequests?.find(r=>r.id===id);if(!row)throw new DomainError("Solicitud no encontrada.");if(row.cancelled)return l;reasonRequired(reason);const remaining=requestBalance(l,row);if(remaining<=0)throw new DomainError("La solicitud ya está saldada.");
 const next={...row,cancelled:{at:ctx.now,by:ctx.actor,reason:reason.trim(),remaining}};return history({...l,paymentRequests:l.paymentRequests!.map(r=>r.id===id?next:r)},"banking",id,row,next,reason,ctx);
}
