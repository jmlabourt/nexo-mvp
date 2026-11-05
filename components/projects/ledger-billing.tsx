"use client";
// Administración registra; Gerencia consulta → proyecto → Facturación (modo demostración): facturas de venta, cobros y anticipos, pagos a proveedores y
// costo financiero estimado. Todo se registra de verdad en la demo (lib/ledger.ts) y sobrevive a la recarga.
// Cotizado ≠ contratado ≠ facturado ≠ cobrado; un pago a proveedor no es ingreso ni un costo nuevo.
import { SupplierPayments } from "./supplier-payments";
import { FinancialCorrections } from "./financial-corrections";
import { useIdentity } from "@/store/selectors";
import { useState } from "react";
import type { Project } from "@/types";
import {
  applyAdvance,
  billingStatus,
  BILLING_STATUS_LABELS,
  handoverOf,
  invoiceBalance,
  updatedFinancialInput,
  registerCollection,
  registerSalesInvoice,

} from "@/lib/ledger";
import { accruedFinancialInput } from "@/lib/ledger";
import { financialCost } from "@/lib/financial";
import { formatCurrency, formatDate, formatNumber } from "@/lib/formatting";
import { useAppStore } from "@/store/use-app-store";
import { useToday } from "@/store/selectors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { IndicatorTip } from "@/components/shared/data-origin";

const num = (s: string) => Number(s.replace(",", "."));

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-xs font-medium text-slate-600">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

export function LedgerBillingTab({ project,includeSupplierPayments=true }: { project: Project;includeSupplierPayments?:boolean }) {
  const today = useToday();
  const ledger = useAppStore((s) => s.ledger);
  const {session}=useIdentity();
  const writable=useAppStore(s=>s.demoLocal)&&session==="administracion";
  const record = useAppStore((s) => s.recordLedger);
  const [error, setError] = useState("");
  const [inv, setInv] = useState({ number: "", date: today, amount: "", dueDate:"",condition:"",milestoneId:"",notes:"" });
  const [col, setCol] = useState({ invoiceId: "", date: today, amount: "", notes:"" });

  if (project.status === "quotation") return <p className="text-sm text-slate-500">Una cotización no tiene facturación: es una venta potencial.</p>;

  const b = billingStatus(project, ledger);
  const invoices = ledger.salesInvoices.filter((i) => i.projectId === project.id).sort((a, c) => a.date.localeCompare(c.date));
  const collections = ledger.collections.filter((c) => c.projectId === project.id).sort((a, c) => a.date.localeCompare(c.date));
  const done = (r: { ok: boolean; error?: string }) => {
    setError(r.ok ? "" : (r.error ?? ""));
    return r.ok;
  };

  // Costo financiero: el del presupuesto aprobado (foto) y la estimación actualizada con la tasa y las fechas de hoy.
  const approvedFinancial = (project.baseline?.lines ?? project.budgetLines).filter((l) => l.category === "financial").reduce((s, l) => s + l.total, 0);
  const updatedInput = updatedFinancialInput(project, ledger, today);
  const updated = financialCost(updatedInput);
  const accrued = financialCost(accruedFinancialInput(project,ledger,today));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Facturación y cobros <IndicatorTip id="billing_project" /> <Badge tone="gray">{BILLING_STATUS_LABELS[b.status]}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["Total acordado con el cliente", b.contracted],
              ["Previsto", b.planned],
              ["Facturado", b.invoiced],
              ["Cobrado", b.collected],
              ["Pendiente de facturar", b.pendingToInvoice],
              ["Facturado sin cobrar", b.invoicedUncollected],
            ].map(([label, v]) => (
              <div key={label as string} className="rounded-md border border-slate-200 p-3">
                <dt className="text-xs text-slate-500">{label}</dt>
                <dd className="mt-1 text-base font-semibold tabular text-slate-900">{formatCurrency(v as number)}</dd>
              </div>
            ))}
          </dl>
          {b.overInvoiced > 0 && <p className="text-sm text-amber-800">Se facturaron {formatCurrency(b.overInvoiced)} por encima del contrato vigente. Revisá si corresponde un cambio de contrato (lo registra Administración).</p>}
          {b.advances > 0 && <p className="text-sm text-slate-600">Anticipos sin factura: {formatCurrency(b.advances)}. Al emitir la factura, aplicalos para no contarlos dos veces.</p>}

          <Table>
            <THead>
              <TR>
                <TH>Factura</TH>
                <TH>Emisión</TH>
                <TH className="text-right">Importe</TH>
                <TH className="text-right">Falta cobrar</TH>
              </TR>
            </THead>
            <TBody>
              {invoices.length === 0 && (
                <TR>
                  <TD colSpan={4} className="text-slate-500">Sin facturas.</TD>
                </TR>
              )}
              {invoices.map((i) => (
                <TR key={i.id}>
                  <TD>{i.number}{i.cancelled&&" · Anulada"}{i.dueDate&&` · vence ${i.dueDate}`} {i.notes && <span className="text-xs text-slate-500">· {i.notes}</span>}</TD>
                  <TD className="tabular">{formatDate(i.date)}</TD>
                  <TD className="text-right tabular">{formatCurrency(i.amount)}</TD>
                  <TD className="text-right tabular">{formatCurrency(invoiceBalance(ledger, i.id))}</TD>
                </TR>
              ))}
            </TBody>
          </Table>

          <Table>
            <THead>
              <TR>
                <TH>Cobro</TH>
                <TH>Ingreso</TH>
                <TH className="text-right">Monto</TH>
                <TH>Aplicado a</TH>
              </TR>
            </THead>
            <TBody>
              {collections.length === 0 && (
                <TR>
                  <TD colSpan={4} className="text-slate-500">Sin cobros.</TD>
                </TR>
              )}
              {collections.map((c) => (
                <TR key={c.id}>
                  <TD>{c.notes ?? (c.invoiceId ? "Cobro" : "Anticipo")}</TD>
                  <TD className="tabular">{formatDate(c.date)}</TD>
                  <TD className="text-right tabular">{formatCurrency(c.amount)}</TD>
                  <TD>
                    {c.invoiceId ? (
                      invoices.find((i) => i.id === c.invoiceId)?.number
                    ) : !writable ? "Anticipo sin aplicar" : (
                      <Select
                        aria-label="Aplicar anticipo a una factura"
                        className="w-44"
                        value=""
                        onChange={(e) => e.target.value && done(record(["administracion"], (l,ctx) => applyAdvance(l, c.id, e.target.value,ctx)))}
                      >
                        <option value="">Aplicar a factura…</option>
                        {invoices.filter((i) => !i.cancelled && invoiceBalance(ledger, i.id) >= c.amount).map((i) => (
                          <option key={i.id} value={i.id}>{i.number}</option>
                        ))}
                      </Select>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>

          {writable && (
            <div className="grid gap-4 lg:grid-cols-2">
              <form
                className="space-y-2 rounded-md border border-slate-200 p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (done(record(["administracion"], (l, ctx) => registerSalesInvoice(l, project, { number: inv.number, date: inv.date, amount: num(inv.amount),dueDate:inv.dueDate||undefined,condition:inv.condition||undefined,milestoneId:inv.milestoneId||undefined,notes:inv.notes||undefined }, ctx)))) setInv({ number: "", date: today, amount: "",dueDate:"",condition:"",milestoneId:"",notes:"" });
                }}
              >
                <h3 className="text-sm font-semibold">Registrar factura de venta</h3>
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Número"><Input value={inv.number} onChange={(e) => setInv({ ...inv, number: e.target.value })} placeholder="A-0001-…" /></Field>
                  <Field label="Emisión"><Input type="date" value={inv.date} onChange={(e) => setInv({ ...inv, date: e.target.value })} /></Field>
                  <Field label="Importe sin IVA"><Input inputMode="decimal" value={inv.amount} onChange={(e) => setInv({ ...inv, amount: e.target.value })} /></Field>
                </div>
                <div className="grid gap-2 sm:grid-cols-3"><Field label="Vencimiento"><Input type="date" value={inv.dueDate} onChange={e=>setInv({...inv,dueDate:e.target.value})}/></Field><Field label="Condición acordada"><Input value={inv.condition} onChange={e=>setInv({...inv,condition:e.target.value})}/></Field><Field label="Hito facturado"><Select value={inv.milestoneId} onChange={e=>setInv({...inv,milestoneId:e.target.value})}><option value="">Sin hito identificado</option>{ledger.paymentTerms.find(t=>t.projectId===project.id)?.schedule.map(h=><option key={h.id} value={h.id}>{h.label} · {h.date}</option>)}</Select></Field></div>
                <Field label="Soporte / referencia de factura (opcional)"><Input value={inv.notes} onChange={e=>setInv({...inv,notes:e.target.value})}/></Field>
                <Button type="submit" size="sm">Registrar factura</Button>
              </form>
              <form
                className="space-y-2 rounded-md border border-slate-200 p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (done(record(["administracion"], (l, ctx) => registerCollection(l, project, { invoiceId: col.invoiceId || undefined, date: col.date, amount: num(col.amount),notes:col.notes||undefined }, ctx)))) setCol({ invoiceId: "", date: today, amount: "",notes:"" });
                }}
              >
                <h3 className="text-sm font-semibold">Registrar cobro</h3>
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Factura">
                    <Select value={col.invoiceId} onChange={(e) => setCol({ ...col, invoiceId: e.target.value })}>
                      <option value="">Anticipo (sin factura)</option>
                      {invoices.filter((i) => !i.cancelled && invoiceBalance(ledger, i.id) > 0).map((i) => (
                        <option key={i.id} value={i.id}>{i.number} · falta {formatCurrency(invoiceBalance(ledger, i.id))}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Ingreso"><Input type="date" value={col.date} onChange={(e) => setCol({ ...col, date: e.target.value })} /></Field>
                  <Field label="Monto"><Input inputMode="decimal" value={col.amount} onChange={(e) => setCol({ ...col, amount: e.target.value })} /></Field>
                </div>
                <Field label="Referencia / comprobante de cobro (opcional)"><Input value={col.notes} onChange={e=>setCol({...col,notes:e.target.value})}/></Field>
                <Button type="submit" size="sm">Registrar cobro</Button>
              </form>
            </div>
          )}
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        </CardContent>
      </Card>

      {writable && <FinancialCorrections project={project}/>}
      {includeSupplierPayments&&<SupplierPayments projectId={project.id}/>}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">Costo financiero <IndicatorTip id="financial_cost" /></CardTitle>
          <p className="text-sm text-slate-500">Es una estimación del costo de financiar la obra hasta el cobro, nunca un costo pagado.</p>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-md border border-slate-200 p-3">
              <dt className="text-xs text-slate-500">Costo financiero estimado al aprobar</dt>
              <dd className="mt-1 text-base font-semibold tabular">{formatCurrency(approvedFinancial)}</dd>
            </div>
            <div className="rounded-md border border-slate-200 p-3">
              <dt className="text-xs text-slate-500">Acumulado hasta hoy, con cobros reales</dt><dd className="font-medium">{accrued.ok ? formatCurrency(accrued.amount) : "No calculable"}</dd>
              <dt className="text-xs text-slate-500">Estimación actualizada ({formatNumber(ledger.financialMonthlyRatePct, 2)} % mensual)</dt>
              <dd className="mt-1 text-base font-semibold tabular">{updated.ok ? formatCurrency(updated.amount) : "No calculable"}</dd>
              <dd className="mt-1 text-xs text-slate-500">
                {updated.ok
                  ? `Inicio ${formatDate(project.startDate)} · entrega ${handoverOf(ledger, project.id) ? "real" : "prevista"} ${formatDate(updatedInput.deliveryDate)} · ${updated.tranches.length} ${updated.tranches.length === 1 ? "tramo" : "tramos"} sobre el saldo, con los cobros reales y lo que falta cobrar (lo vencido, a hoy).`
                  : updated.reason}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
