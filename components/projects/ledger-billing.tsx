"use client";
// Gerencia → proyecto → Facturación (modo demostración): facturas de venta, cobros y anticipos, pagos a proveedores y
// gasto financiero estimado. Todo se registra de verdad en la demo (lib/ledger.ts) y sobrevive a la recarga.
// Cotizado ≠ contratado ≠ facturado ≠ cobrado; un pago a proveedor no es ingreso ni un costo nuevo.
import { useState } from "react";
import type { Project } from "@/types";
import {
  applyAdvance,
  billingStatus,
  BILLING_STATUS_LABELS,
  confirmSupplierPayment,
  handoverOf,
  invoiceBalance,
  updatedFinancialInput,
  paidOf,
  registerCollection,
  registerSalesInvoice,

} from "@/lib/ledger";
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

export function LedgerBillingTab({ project }: { project: Project }) {
  const today = useToday();
  const ledger = useAppStore((s) => s.ledger);
  const orders = useAppStore((s) => s.orders);
  const record = useAppStore((s) => s.recordLedger);
  const [error, setError] = useState("");
  const [inv, setInv] = useState({ number: "", date: today, amount: "" });
  const [col, setCol] = useState({ invoiceId: "", date: today, amount: "" });
  const [pay, setPay] = useState<Record<string, { date: string; amount: string; reference: string }>>({});

  if (project.status === "quotation") return <p className="text-sm text-slate-500">Una cotización no tiene facturación: es una venta potencial.</p>;

  const b = billingStatus(project, ledger);
  const invoices = ledger.salesInvoices.filter((i) => i.projectId === project.id).sort((a, c) => a.date.localeCompare(c.date));
  const collections = ledger.collections.filter((c) => c.projectId === project.id).sort((a, c) => a.date.localeCompare(c.date));
  const projectOrders = orders.filter((o) => o.lines.some((l) => l.projectId === project.id));
  const done = (r: { ok: boolean; error?: string }) => {
    setError(r.ok ? "" : (r.error ?? ""));
    return r.ok;
  };

  // Gasto financiero: el del presupuesto aprobado (foto) y la estimación actualizada con la tasa y las fechas de hoy.
  const approvedFinancial = (project.baseline?.lines ?? project.budgetLines).filter((l) => l.category === "financial").reduce((s, l) => s + l.total, 0);
  const updatedInput = updatedFinancialInput(project, ledger, today);
  const updated = financialCost(updatedInput);

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
              ["Contrato vigente", b.contracted],
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
                  <TD>{i.number} {i.notes && <span className="text-xs text-slate-500">· {i.notes}</span>}</TD>
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
                    ) : (
                      <Select
                        aria-label="Aplicar anticipo a una factura"
                        className="w-44"
                        value=""
                        onChange={(e) => e.target.value && done(record(["gerencia"], (l) => applyAdvance(l, c.id, e.target.value)))}
                      >
                        <option value="">Aplicar a factura…</option>
                        {invoices.filter((i) => invoiceBalance(ledger, i.id) >= c.amount).map((i) => (
                          <option key={i.id} value={i.id}>{i.number}</option>
                        ))}
                      </Select>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>

          {!project.isClosed && (
            <div className="grid gap-4 lg:grid-cols-2">
              <form
                className="space-y-2 rounded-md border border-slate-200 p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (done(record(["gerencia"], (l, ctx) => registerSalesInvoice(l, project, { number: inv.number, date: inv.date, amount: num(inv.amount) }, ctx)))) setInv({ number: "", date: today, amount: "" });
                }}
              >
                <h3 className="text-sm font-semibold">Registrar factura de venta</h3>
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Número"><Input value={inv.number} onChange={(e) => setInv({ ...inv, number: e.target.value })} placeholder="A-0001-…" /></Field>
                  <Field label="Emisión"><Input type="date" value={inv.date} onChange={(e) => setInv({ ...inv, date: e.target.value })} /></Field>
                  <Field label="Importe sin IVA"><Input inputMode="decimal" value={inv.amount} onChange={(e) => setInv({ ...inv, amount: e.target.value })} /></Field>
                </div>
                <Button type="submit" size="sm">Registrar factura</Button>
              </form>
              <form
                className="space-y-2 rounded-md border border-slate-200 p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (done(record(["gerencia"], (l, ctx) => registerCollection(l, project, { invoiceId: col.invoiceId || undefined, date: col.date, amount: num(col.amount) }, ctx)))) setCol({ invoiceId: "", date: today, amount: "" });
                }}
              >
                <h3 className="text-sm font-semibold">Registrar cobro</h3>
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Factura">
                    <Select value={col.invoiceId} onChange={(e) => setCol({ ...col, invoiceId: e.target.value })}>
                      <option value="">Anticipo (sin factura)</option>
                      {invoices.filter((i) => invoiceBalance(ledger, i.id) > 0).map((i) => (
                        <option key={i.id} value={i.id}>{i.number} · falta {formatCurrency(invoiceBalance(ledger, i.id))}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Ingreso"><Input type="date" value={col.date} onChange={(e) => setCol({ ...col, date: e.target.value })} /></Field>
                  <Field label="Monto"><Input inputMode="decimal" value={col.amount} onChange={(e) => setCol({ ...col, amount: e.target.value })} /></Field>
                </div>
                <Button type="submit" size="sm">Registrar cobro</Button>
              </form>
            </div>
          )}
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pagos a proveedores</CardTitle>
          <p className="text-sm text-slate-500">Compras carga la factura del proveedor; Gerencia confirma el pago. Un pago no es ingreso ni un costo nuevo: el costo ya está en el proyecto.</p>
        </CardHeader>
        <CardContent>
          {projectOrders.length === 0 ? (
            <p className="text-sm text-slate-500">Sin órdenes de compra para este proyecto.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Orden</TH>
                  <TH>Factura del proveedor</TH>
                  <TH className="text-right">Pagado</TH>
                  <TH>Confirmar pago</TH>
                </TR>
              </THead>
              <TBody>
                {projectOrders.map((o) => {
                  const paid = paidOf(ledger, o.id);
                  const left = Math.max(0, (o.invoiceAmount ?? 0) - paid);
                  const f = pay[o.id] ?? { date: today, amount: String(left || ""), reference: "" };
                  return (
                    <TR key={o.id}>
                      <TD>{o.number} <span className="block text-xs text-slate-500">{o.supplier}</span></TD>
                      <TD>{o.status === "invoiced" ? `${o.invoiceNumber ?? "—"} · ${formatCurrency(o.invoiceAmount ?? 0)}` : <span className="text-xs text-slate-500">Sin factura todavía</span>}</TD>
                      <TD className="text-right tabular">{formatCurrency(paid)}</TD>
                      <TD>
                        {o.status === "invoiced" && left > 0 ? (
                          <form
                            className="flex flex-wrap items-end gap-1"
                            onSubmit={(e) => {
                              e.preventDefault();
                              if (done(record(["gerencia"], (l, ctx) => confirmSupplierPayment(l, o, { date: f.date, amount: num(f.amount), reference: f.reference }, ctx)))) setPay({ ...pay, [o.id]: { date: today, amount: "", reference: "" } });
                            }}
                          >
                            <Input aria-label="Fecha del pago" type="date" className="w-36" value={f.date} onChange={(e) => setPay({ ...pay, [o.id]: { ...f, date: e.target.value } })} />
                            <Input aria-label="Monto pagado" inputMode="decimal" className="w-28" value={f.amount} onChange={(e) => setPay({ ...pay, [o.id]: { ...f, amount: e.target.value } })} />
                            <Input aria-label="Referencia del pago" placeholder="Transferencia…" className="w-36" value={f.reference} onChange={(e) => setPay({ ...pay, [o.id]: { ...f, reference: e.target.value } })} />
                            <Button type="submit" size="sm" variant="outline">Confirmar</Button>
                          </form>
                        ) : o.status === "invoiced" ? (
                          <Badge tone="green">Pagada</Badge>
                        ) : (
                          "—"
                        )}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">Gasto financiero estimado <IndicatorTip id="financial_cost" /></CardTitle>
          <p className="text-sm text-slate-500">Es una estimación del costo de financiar la obra hasta el cobro, nunca un costo pagado.</p>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-md border border-slate-200 p-3">
              <dt className="text-xs text-slate-500">En el presupuesto aprobado (foto)</dt>
              <dd className="mt-1 text-base font-semibold tabular">{formatCurrency(approvedFinancial)}</dd>
            </div>
            <div className="rounded-md border border-slate-200 p-3">
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
