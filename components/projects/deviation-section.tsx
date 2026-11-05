"use client";
import { useAppStore } from "@/store/use-app-store";
import { ledgerAtDate } from "@/lib/tablero";
import { todayISO } from "@/lib/formatting";
import { laborCostDetails } from "@/lib/calculations";
import type { ProjectEconomics } from "@/lib/calculations";
import type { AlertSettings } from "@/types";
import { CATEGORY_LABELS } from "@/lib/constants";
import { categoryAlertLevel } from "@/lib/alerts";
import { formatCurrency, formatSignedCurrency, formatSignedPercent } from "@/lib/formatting";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type {Project} from "@/types";
import {isOtherCost,otherCostGroup} from "@/lib/other-costs";

function statusFor(budget: number, actual: number, s: AlertSettings, completed: boolean) {
  if (actual === 0 && budget === 0) return { tone: "gray" as const, label: "Sin costos" };
  if (actual <= budget) return actual === 0 ? { tone: "gray" as const, label: completed ? "Sin costos registrados" : "Sin registros todavía" } : { tone: "green" as const, label: "Dentro de lo presupuestado" };
  if (budget === 0) return { tone: "yellow" as const, label: "No presupuestado" };
  const lvl = categoryAlertLevel(((actual - budget) / budget) * 100, s);
  return lvl === "critical" ? { tone: "red" as const, label: "En riesgo" } : lvl === "warning" ? { tone: "yellow" as const, label: "Atención" } : { tone: "blue" as const, label: "Levemente arriba" };
}

export function DeviationSection({ econ, settings, completed, project }: { econ: ProjectEconomics; settings: AlertSettings; completed: boolean;project?:Project }) {
  const ledger=useAppStore(s=>s.ledger);
  const details=project?laborCostDetails({...project,actualEntries:project.actualEntries.filter(e=>e.date<=todayISO())},ledgerAtDate(ledger,todayISO())):[];
  const pendingClosed=!!project?.isClosed&&!completed;
  const visibleCategories = econ.categories.filter((c) => c.category !== "financial");
  const realLabel = completed ? "Costo real final" : "Costo real hasta hoy";
  const hasFinancialCost = econ.categories.some((c) => c.category === "financial" && c.actual > 0);
  const subtotal=visibleCategories.reduce((s,c)=>({budget:s.budget+c.budget,actual:s.actual+c.actual,projected:s.projected+c.projected}),{budget:0,actual:0,projected:0});
  return (
    <Card>
      <CardHeader>
        <CardTitle>{completed ? "¿Dónde se desvió?" : "¿Dónde se está desviando?"}</CardTitle>
        <CardDescription>
          {completed
            ? "Costo presupuestado vs. costo real final, en las categorías de reporte."
            : "Costo presupuestado vs. costo real hasta hoy, en las categorías de reporte. El proyectado considera cantidades pendientes identificables y nunca baja del presupuesto ni del costo real."}
        </CardDescription>
      </CardHeader>
      {pendingClosed&&<p className="px-4 pb-2 text-xs text-amber-800">Cerrado con costos pendientes de validar. Los importes registrados son parciales; no hay proyección final validada.</p>}
      {hasFinancialCost && (
        <div className="px-4 pb-2 text-xs text-slate-600">
          El costo financiero se muestra por separado en el resumen económico y no se duplica en la tabla de costos productivos.
        </div>
      )}
      <Table>
        <THead>
          <TR>
            <TH>Concepto</TH>
            <TH className="text-right">Presupuestado</TH>
            <TH className="text-right">{realLabel}</TH>
            {!completed && <TH className="text-right">Proyección final</TH>}
            <TH className="text-right">{completed ? "Diferencia final" : "Desvío previsto"}</TH>
            <TH>Estado</TH>
          </TR>
        </THead>
        <TBody>
          {visibleCategories.map((c) => {
            const st = pendingClosed ? {tone:"gray" as const,label:"Pendiente de validar"} : c.actual===0&&c.projected<=c.budget ? {tone:"gray" as const,label:"Sin registros todavía"} : statusFor(c.budget, completed?c.actual:c.projected, settings, completed);
            const over = pendingClosed?c.actualVariance.amount:c.projectedVariance.amount;
            return (
              <TR key={c.category}>
                <TD className="font-medium text-slate-900">{CATEGORY_LABELS[c.category]}
                 {details.some(d=>d.category===c.category)&&<details className="text-xs font-normal"><summary>Detalle por categoría y origen</summary>{details.filter(d=>d.category===c.category).map(d=><div key={d.key} className="py-1"><strong>{d.name}</strong> · Cotizado {formatCurrency(d.budget)} · Real {formatCurrency(d.actual)} · Pendiente identificable {formatCurrency(d.remaining)} · Proyectado {formatCurrency(d.projected)}{d.sources.map((source,i)=><p key={`${source.id}-${i}`}>{source.date} · {source.description} · {source.hours===null?"Distribución monetaria / importe":`${source.hours} h`} · {formatCurrency(source.amount)} · Origen {source.id}</p>)}</div>)}</details>}
                 {project&&project.actualEntries.some(e=>isOtherCost(e)&&otherCostGroup(project,e.id).value.category===c.category)&&<details className="text-xs font-normal"><summary>Origen en Otros costos</summary>{project.actualEntries.filter(isOtherCost).filter(e=>otherCostGroup(project,e.id).value.category===c.category).map(e=>{const v=otherCostGroup(project,e.id).value;return <p key={e.id}>{v.date} · {v.description} · {formatCurrency(v.amount)} · {e.createdBy} · {e.id}</p>;})}<a className="text-blue-700 underline" href={`/projects/${project.id}?tab=costs`}>Abrir Otros costos</a></details>}</TD>
                <TD className="text-right tabular">{formatCurrency(c.budget)}</TD>
                <TD className="text-right tabular">{formatCurrency(c.actual)}</TD>
                {!completed && <TD className="text-right tabular">{pendingClosed?"Pendiente de validar":formatCurrency(c.projected)}</TD>}
                <TD className={`text-right tabular whitespace-nowrap ${over > 0 ? "font-medium text-red-700" : over < 0 ? "text-emerald-700" : "text-slate-500"}`}>
                  {over !== 0 ? (
                    <>
                      {formatSignedCurrency(over)}
                      {c.projectedVariance.percent !== null && <span className="ml-1 text-xs">({formatSignedPercent(c.projectedVariance.percent, 0)})</span>}
                    </>
                  ) : (
                    "—"
                  )}
                </TD>
                <TD>
                  <Badge tone={st.tone}>{st.label}</Badge>
                </TD>
              </TR>
            );
          })}
          <TR className="bg-slate-50 font-semibold">
            <TD>Total sin costo financiero</TD>
            <TD className="text-right tabular">{formatCurrency(subtotal.budget)}</TD>
            <TD className="text-right tabular">{formatCurrency(subtotal.actual)}</TD>
            {!completed && <TD className="text-right tabular">{pendingClosed?"Pendiente de validar":formatCurrency(subtotal.projected)}</TD>}
            <TD className={`text-right tabular ${subtotal.projected>subtotal.budget ? "text-red-700" : "text-slate-500"}`}>{subtotal.projected!==subtotal.budget ? formatSignedCurrency(subtotal.projected-subtotal.budget) : "—"}</TD>
            <TD />
          </TR>
        </TBody>
      </Table>

    </Card>
  );
}
