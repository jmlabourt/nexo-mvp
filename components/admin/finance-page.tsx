"use client";
import { useState } from "react";
import Link from "next/link";
import { useAppStore } from "@/store/use-app-store";
import { useIdentity,useToday } from "@/store/selectors";
import { customerInvoices } from "@/lib/finance-workspace";
import { financeReminders } from "@/lib/post-meeting";
import { formatCurrency } from "@/lib/formatting";
import { LedgerBillingTab } from "@/components/projects/ledger-billing";
import { SupplierPayments } from "@/components/projects/supplier-payments";
import { PageHeader } from "@/components/shared/page-header";
import { Select } from "@/components/ui/input";
import { Table,THead,TBody,TR,TH,TD } from "@/components/ui/table";
export function FinancePage(){
 const {session}=useIdentity();const today=useToday();const projects=useAppStore(s=>s.projects),ledger=useAppStore(s=>s.ledger),soon=useAppStore(s=>s.settings.dueSoonDays);
 const [filter,setFilter]=useState("pending"),[projectId,setProjectId]=useState("");
 const rows=customerInvoices(projects,ledger,today).filter(r=>r.invoice.date<=today&&(filter==="all"||filter==="pending"&&["pending","overdue"].includes(r.status)||r.status===filter));
 const project=projects.find(p=>p.id===projectId);const reminders=financeReminders(projects,ledger,today,soon);
 if(session!=="administracion")return <p>Este módulo corresponde a Administración. Gerencia consulta los mismos registros en la ficha de cada proyecto.</p>;
 return <div className="space-y-6"><PageHeader title="Facturación y pagos" subtitle="Facturas, cobros y solicitudes bancarias del ledger compartido. Fecha efectiva de corte: hoy."/><nav className="flex gap-4"><a href="#clientes" className="text-blue-700 underline">Facturación y cobros de clientes</a><a href="#proveedores" className="text-blue-700 underline">Pagos a proveedores</a></nav>
 <section id="clientes" className="scroll-mt-20 space-y-4"><h2 className="text-xl font-semibold">Facturación y cobros de clientes</h2><p>Un hito no es una factura y una factura no acredita un cobro. No se crean vencimientos ni emisiones automáticamente.</p><label>Estado de facturación<Select value={filter} onChange={e=>setFilter(e.target.value)}><option value="pending">Pendiente de cobro</option><option value="overdue">Vencido</option><option value="paid">Cobrado</option><option value="cancelled">Anulado</option><option value="all">Todos</option></Select></label>
 <Table><THead><TR>{["Proyecto / cliente","Hito comercial","Factura","Emisión","Importe","Vencimiento","Cobrado efectivo","Saldo","Estado"].map(label=><TH key={label}>{label}</TH>)}</TR></THead><TBody>{rows.map(r=><TR key={r.invoice.id}><TD>{r.project?.code??r.invoice.projectId} · {r.project?.client??"Cliente sin identificar"}</TD><TD>{r.milestone?.label??"Sin hito identificado"}</TD><TD>{r.invoice.number}</TD><TD>{r.invoice.date}</TD><TD>{formatCurrency(r.invoice.amount)}</TD><TD>{r.invoice.dueDate??"No registrado"}</TD><TD>{formatCurrency(r.collected)}</TD><TD>{formatCurrency(r.balance)}</TD><TD>{r.status==="paid"?"Cobrado":r.status==="overdue"?"Vencido":r.status==="cancelled"?"Anulado":"Pendiente"}</TD></TR>)}{!rows.length&&<TR><TD colSpan={9}>Sin facturas con este estado.</TD></TR>}</TBody></Table>
 <details><summary>Hitos de emisión pendientes y recordatorios de cobro</summary>{reminders.map(r=><p key={r.id}>{projects.find(p=>p.id===r.projectId)?.code} · {r.message} <Link className="text-blue-700 underline" href={`/projects/${r.projectId}?tab=billing`}>Abrir proyecto</Link></p>)}{!reminders.length&&<p>Sin recordatorios basados en condiciones registradas.</p>}</details>
 <label>Proyecto para emitir, registrar cobros o corregir<Select value={projectId} onChange={e=>setProjectId(e.target.value)}><option value="">Seleccioná un proyecto…</option>{projects.filter(p=>p.status!=="quotation").map(p=><option key={p.id} value={p.id}>{p.code} · {p.client}</option>)}</Select></label>{project&&<LedgerBillingTab key={project.id} project={project} includeSupplierPayments={false}/>}
 </section><section id="proveedores" className="scroll-mt-20"><h2 className="mb-4 text-xl font-semibold">Pagos a proveedores</h2><SupplierPayments/></section></div>;
}
