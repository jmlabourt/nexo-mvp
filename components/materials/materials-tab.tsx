"use client";
import { useMemo } from "react";
import { CheckCircle2, Package, TriangleAlert } from "lucide-react";
import type { Project } from "@/types";
import { SOURCE_LABELS, UNIT_COST_ORIGIN_LABELS } from "@/lib/constants";
import { materialRows, type MaterialRow } from "@/lib/material-reconciliation";
import { materialInsights } from "@/lib/insights";
import { usageLeftoverValue, usageProjectCost } from "@/lib/calculations";
import { formatCurrency, formatDate, formatNumber, formatQty, formatSignedCurrency } from "@/lib/formatting";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { InsightList } from "@/components/shared/insight-list";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";

const q = (n: number) => (n === 0 ? <span className="text-slate-300">0</span> : formatNumber(n));

export function MaterialsTable({ rows }: { rows: MaterialRow[] }) {
  return (
    <Table>
      <THead>
        <TR>
          <TH>Material</TH>
          <TH className="text-right">Presupuestado</TH>
          <TH className="text-right">Comprado / asignado</TH>
          <TH className="text-right">Consumido</TH>
          <TH className="text-right">Desperdicio</TH>
          <TH className="text-right">Sobrante reutilizable</TH>
          <TH className="text-right">Costo presupuestado</TH>
          <TH className="text-right">Costo imputado real</TH>
          <TH className="text-right">Desvío</TH>
        </TR>
      </THead>
      <TBody>
        {rows.map((r) => (
          <TR key={r.key}>
            <TD className="min-w-48">
              <div className="font-medium text-slate-900">{r.name}</div>
              <div className="text-xs text-slate-500">
                {r.unit}
                {r.fromStockQty > 0 && ` · ${formatNumber(r.fromStockQty)} de stock existente`}
                {r.fromReusedQty > 0 && ` · ${formatNumber(r.fromReusedQty)} de sobrantes`}
              </div>
            </TD>
            <TD className="text-right tabular">{q(r.budgetQty)}</TD>
            <TD className="text-right tabular">{q(r.purchasedQty)}</TD>
            <TD className="text-right tabular">{q(r.consumedQty)}</TD>
            <TD className="text-right tabular">{q(r.wasteQty)}</TD>
            <TD className="text-right tabular">{q(r.leftoverQty)}</TD>
            <TD className="text-right tabular">{formatCurrency(r.budgetCost)}</TD>
            <TD className="text-right font-medium tabular text-slate-900">{formatCurrency(r.imputedCost)}</TD>
            <TD className={`text-right tabular whitespace-nowrap ${r.variance > 0 ? "font-medium text-red-700" : r.variance < 0 ? "text-slate-500" : "text-slate-400"}`}>
              {r.variance === 0 ? "—" : formatSignedCurrency(r.variance)}
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

export function ReconciliationTable({ rows }: { rows: MaterialRow[] }) {
  const relevant = rows.filter((r) => r.purchasedQty > 0 || r.purchaseAccountedQty > 0);
  if (relevant.length === 0) return <p className="text-sm text-slate-500">No hay compras para reconciliar.</p>;
  return (
    <Table>
      <THead>
        <TR>
          <TH>Material</TH>
          <TH className="text-right">Presupuestado</TH>
          <TH className="text-right">Comprado</TH>
          <TH className="text-right">Consumido</TH>
          <TH className="text-right">Desperdicio</TH>
          <TH className="text-right">Sobrante</TH>
          <TH className="text-right">Diferencia no explicada</TH>
          <TH>Estado</TH>
        </TR>
      </THead>
      <TBody>
        {relevant.map((r) => {
          // Solo lo que proviene de la compra del proyecto (stock y sobrantes no requieren compra).
          const fromPurchase = r.purchaseAccountedQty;
          return (
            <TR key={r.key}>
              <TD className="font-medium text-slate-900">
                {r.name}
                {(r.fromStockQty > 0 || r.fromReusedQty > 0) && (
                  <div className="text-xs font-normal text-slate-500">Parte del uso vino de stock/sobrantes y no se descuenta de la compra.</div>
                )}
              </TD>
              <TD className="text-right tabular">{formatNumber(r.budgetQty)}</TD>
              <TD className="text-right tabular">{formatNumber(r.purchasedQty)}</TD>
              <TD className="text-right tabular">{formatNumber(r.consumedQty)}</TD>
              <TD className="text-right tabular">{formatNumber(r.wasteQty)}</TD>
              <TD className="text-right tabular">{formatNumber(r.leftoverQty)}</TD>
              <TD className={`text-right font-medium tabular ${r.reconciled ? "text-slate-400" : "text-amber-700"}`}>
                {r.reconciled ? "0" : formatNumber(r.unexplainedQty)}
              </TD>
              <TD>
                {r.reconciled ? (
                  <Badge tone="green"><CheckCircle2 className="size-3" /> Reconciliado</Badge>
                ) : r.unexplainedQty > 0 ? (
                  <Badge tone="yellow">
                    <TriangleAlert className="size-3" /> Falta reconciliar {formatQty(r.unexplainedQty, r.unit)}
                  </Badge>
                ) : (
                  <Badge tone="yellow">
                    <TriangleAlert className="size-3" /> Uso supera compra en {formatQty(-r.unexplainedQty, r.unit)}
                  </Badge>
                )}
                <span className="sr-only">Explicado desde compra: {fromPurchase}</span>
              </TD>
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}

export function MaterialsTab({ project, showCosts = true }: { project: Project; showCosts?: boolean }) {
  const rows = useMemo(() => materialRows(project), [project]);
  const insights = useMemo(() => materialInsights(project), [project]);
  const usages = [...project.materialUsages].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const purchases = [...project.purchaseEntries].sort((a, b) => b.date.localeCompare(a.date));

  if (rows.length === 0) {
    return <EmptyState icon={Package} title="Todavía no hay materiales" description="Agregá materiales al presupuesto o registrá una compra o un consumo." />;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Materiales: presupuestado, comprado y utilizado</CardTitle>
          <CardDescription>
            El costo imputado = consumo + desperdicio. Lo comprado y el sobrante reutilizable <strong>no</strong> se imputan al proyecto.
          </CardDescription>
        </CardHeader>
        <MaterialsTable rows={rows} />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Qué dicen los materiales</CardTitle>
        </CardHeader>
        <CardContent className="md:columns-2 md:gap-8 [&_li]:break-inside-avoid">
          <InsightList insights={insights} />
        </CardContent>
      </Card>

      <Card id="reconciliacion">
        <CardHeader>
          <CardTitle>Reconciliación de materiales</CardTitle>
          <CardDescription>Comprado para el proyecto = consumido + desperdicio + sobrante. La diferencia no explicada no bloquea el cierre, pero conviene revisarla.</CardDescription>
        </CardHeader>
        <ReconciliationTable rows={rows} />
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Registros de uso</CardTitle>
            <CardDescription>Cada registro muestra cómo se valorizó (trazabilidad del costo).</CardDescription>
          </CardHeader>
          {usages.length === 0 ? (
            <CardContent><p className="text-sm text-slate-500">Sin consumos registrados.</p></CardContent>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Fecha</TH>
                  <TH>Material</TH>
                  <TH>Registro</TH>
                  {showCosts && <TH className="text-right">Imputado</TH>}
                </TR>
              </THead>
              <TBody>
                {usages.map((u) => (
                  <TR key={u.id}>
                    <TD className="whitespace-nowrap tabular">{formatDate(u.date)}</TD>
                    <TD>
                      <div className="font-medium text-slate-900">{u.materialName}</div>
                      <div className="text-xs text-slate-500">{SOURCE_LABELS[u.source]} · {u.createdBy}</div>
                    </TD>
                    <TD className="text-xs text-slate-600">
                      {formatQty(u.quantityConsumed, u.unit)} consumido
                      {u.wasteQuantity > 0 && ` · ${formatNumber(u.wasteQuantity)} desperdicio`}
                      {u.reusableLeftoverQuantity > 0 && ` · ${formatNumber(u.reusableLeftoverQuantity)} reutilizable (${formatCurrency(usageLeftoverValue(u))} al pool)`}
                      {showCosts && (
                        <div className="text-slate-400">
                          {formatCurrency(u.unitCost)}/{u.unit} · {UNIT_COST_ORIGIN_LABELS[u.unitCostOrigin]}
                        </div>
                      )}
                    </TD>
                    {showCosts && <TD className="whitespace-nowrap text-right font-medium tabular">{formatCurrency(usageProjectCost(u))}</TD>}
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Compras registradas</CardTitle>
            <CardDescription>Registrar una compra no imputa costo: se imputa lo que se consume o desperdicia.</CardDescription>
          </CardHeader>
          {purchases.length === 0 ? (
            <CardContent><p className="text-sm text-slate-500">Sin compras registradas.</p></CardContent>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Fecha</TH>
                  <TH>Material</TH>
                  <TH className="text-right">Cantidad</TH>
                  <TH className="text-right">Total compra</TH>
                </TR>
              </THead>
              <TBody>
                {purchases.map((p) => (
                  <TR key={p.id}>
                    <TD className="whitespace-nowrap tabular">{formatDate(p.date)}</TD>
                    <TD>
                      <div className="font-medium text-slate-900">{p.materialName}</div>
                      <div className="text-xs text-slate-500">{p.supplier ?? "Sin proveedor"} · {p.createdBy}</div>
                    </TD>
                    <TD className="text-right tabular whitespace-nowrap">{formatQty(p.quantity, p.unit)}</TD>
                    <TD className="whitespace-nowrap text-right tabular">{formatCurrency(p.total)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}
