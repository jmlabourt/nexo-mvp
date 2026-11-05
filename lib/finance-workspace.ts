import type {Ledger,Project,PurchaseOrder} from "@/types";
import { invoiceBalance,termsOf } from "./ledger";
import { requestBalance } from "./post-meeting";
export const FINANCE_HREF="/administracion/facturacion";
export function paymentTasks(ledger:Ledger,orders:PurchaseOrder[],projects:Project[]){
 return (ledger.paymentRequests??[]).map(request=>{
  const order=orders.find(o=>o.id===request.orderId);
  const paid=ledger.supplierPayments.filter(p=>p.paymentRequestId===request.id).reduce((s,p)=>s+p.amount,0);
  const balance=requestBalance(ledger,request);
  const projectIds=[...new Set(order?.lines.map(l=>l.projectId)??[])];
  return {request,order,paid,balance,projects:projectIds.map(id=>projects.find(p=>p.id===id)).filter((p):p is Project=>!!p),status:request.cancelled?"cancelled" as const:balance===0?"paid" as const:paid>0?"partial" as const:request.banking?"banking" as const:"pending" as const};
 });
}
export function pendingPaymentCount(ledger:Ledger){return (ledger.paymentRequests??[]).filter(r=>!r.cancelled&&requestBalance(ledger,r)>0.005).length;}
export function customerInvoices(projects:Project[],ledger:Ledger,today:string){
 return ledger.salesInvoices.map(invoice=>{
  const project=projects.find(p=>p.id===invoice.projectId);
  const milestone=invoice.milestoneId?termsOf(ledger,invoice.projectId).schedule.find(s=>s.id===invoice.milestoneId):undefined;
  const collected=ledger.collections.filter(c=>c.invoiceId===invoice.id&&c.date<=today).reduce((s,c)=>s+c.amount,0);
  const balance=invoiceBalance({...ledger,collections:ledger.collections.filter(c=>c.date<=today)},invoice.id);
  return {invoice,project,milestone,collected,balance,status:invoice.cancelled?"cancelled" as const:balance<=0.005?"paid" as const:invoice.dueDate&&invoice.dueDate<today?"overdue" as const:"pending" as const};
 });
}
