"use client";
// Gerencia → proyecto → Facturación: facturado, pendiente y previsto (nunca se confunde con el precio de venta), y el
// costo financiero ESTIMADO por inflación de lo que falta cobrar (no es un gasto real). Las facturas al cliente todavía
// no se guardan en la base: en la demo son datos de ejemplo.
import { useState } from "react";
import type { Project } from "@/types";
import { billingRows, inflationLoss } from "@/lib/gerencia";
import { formatCurrency, formatDate, formatNumber } from "@/lib/formatting";
import { useInvoices, useManagementParams } from "@/store/session-data";
import { useToday } from "@/store/selectors";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { IndicatorTip, OriginTag, PendingAction } from "@/components/shared/data-origin";

export function BillingTab({ project }: { project: Project }) {
  const today = useToday();
  const invoices = useInvoices();
  const params = useManagementParams();
  const mine = invoices.data.filter((i) => i.projectId === project.id).sort((a, b) => a.date.localeCompare(b.date));
  const row = billingRows([project], invoices.data)[0];
  // Simulación local (no se guarda): fecha de cobro actualizada por un atraso.
  const [updated, setUpdated] = useState<Record<string, string>>({});

  if (project.status === "quotation") return <p className="text-sm text-slate-500">Una cotización no tiene facturación: es una venta potencial.</p>;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">Facturación <IndicatorTip id="billing_project" /> <OriginTag origin={invoices.origin} /></CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-3 text-sm sm:grid-cols-4">
            {[
              ["Monto de venta acordado", row?.salesPrice ?? project.salesPrice],
              ["Facturado", row?.invoiced ?? 0],
              ["Pendiente de facturar", row?.pendingToInvoice ?? project.salesPrice],
              ["Previsto", row?.planned ?? 0],
            ].map(([label, v]) => (
              <div key={label as string} className="rounded-md border border-slate-200 p-3">
                <dt className="text-xs text-slate-500">{label}</dt>
                <dd className="mt-1 text-lg font-semibold tabular text-slate-900">{formatCurrency(v as number)}</dd>
              </div>
            ))}
          </dl>
          {mine.length === 0 ? (
            <p className="text-sm text-slate-500">{invoices.origin === "pending" ? "Todavía no hay facturas registradas en la base." : "Sin facturas."}</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Fecha</TH>
                  <TH>Concepto</TH>
                  <TH>Estado</TH>
                  <TH className="text-right">Importe</TH>
                  <TH>Cobro</TH>
                </TR>
              </THead>
              <TBody>
                {mine.map((i) => (
                  <TR key={i.id}>
                    <TD className="tabular">{formatDate(i.date)}</TD>
                    <TD>{i.concept ?? "—"} {i.number && <span className="text-xs text-slate-500">· {i.number}</span>}</TD>
                    <TD>{i.status === "issued" ? "Facturada" : "Prevista"}</TD>
                    <TD className="text-right tabular">{formatCurrency(i.amount)}</TD>
                    <TD className="text-xs">
                      {i.status === "planned" ? "—" : i.collectedAt ? `Cobrada el ${formatDate(i.collectedAt)}` : i.dueDate && i.dueDate < today ? <span className="text-red-700">Vencida el {formatDate(i.dueDate)}</span> : `Vence el ${formatDate(i.dueDate)}`}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
          <PendingAction label="Registrar factura" reason="Las facturas al cliente se guardan cuando el backend lo habilite." />
        </CardContent>
      </Card>

      {mine.some((i) => i.status === "planned") && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">Costo financiero estimado por inflación <IndicatorTip id="inflation" /></CardTitle>
            <p className="text-sm text-slate-500">
              Inflación mensual estimada: {formatNumber(params.inflationMonthlyPct, 1)} % (Configuración). Es una estimación de poder adquisitivo, nunca un gasto real. Probá una fecha actualizada si el cobro se atrasa (no se guarda).
            </p>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>Cuota</TH>
                  <TH className="text-right">Monto</TH>
                  <TH>Fecha original</TH>
                  <TH>Fecha actualizada</TH>
                  <TH className="text-right">Plazo original</TH>
                  <TH className="text-right">Por el atraso</TH>
                </TR>
              </THead>
              <TBody>
                {mine.filter((i) => i.status === "planned").map((i) => {
                  const loss = inflationLoss(i.amount, params.inflationMonthlyPct, today, i.date, updated[i.id]);
                  return (
                    <TR key={i.id}>
                      <TD>{i.concept}</TD>
                      <TD className="text-right tabular">{formatCurrency(i.amount)}</TD>
                      <TD className="tabular">{formatDate(i.date)}</TD>
                      <TD>
                        <Input type="date" aria-label={`Fecha actualizada de ${i.concept}`} className="w-40" value={updated[i.id] ?? i.date} min={i.date} onChange={(e) => setUpdated({ ...updated, [i.id]: e.target.value })} />
                      </TD>
                      <TD className="text-right tabular">{formatCurrency(loss.originalLoss)}</TD>
                      <TD className="text-right tabular">{loss.delayLoss > 0 ? formatCurrency(loss.delayLoss) : "—"}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
