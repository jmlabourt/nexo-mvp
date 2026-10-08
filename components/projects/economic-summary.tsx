"use client";
import type { Project } from "@/types";
import { deviationReasons, type ProjectEconomics } from "@/lib/calculations";
import { CATEGORY_LABELS, MARGIN_TOOLTIP } from "@/lib/constants";
import { formatCurrency, formatCurrencyOrDash, formatSignedCurrency } from "@/lib/formatting";
import { Card, CardContent } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/tooltip";
import { MarginShift } from "@/components/shared/margin-shift";
import { cn } from "@/lib/utils";

function Money({ label, value, hint, tooltip }: { label: string; value: string; hint?: string; tooltip?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
        {label}
        {tooltip && <InfoTooltip content={tooltip} />}
      </div>
      <div className="mt-1 text-lg font-semibold tabular text-slate-900">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

const tone = (amount: number) => (amount > 0 ? "text-red-700" : amount < 0 ? "text-emerald-700" : "text-slate-700");

export function EconomicSummary({ project, econ }: { project: Project; econ: ProjectEconomics }) {
  const completed = project.status === "completed";
  const noData = !completed && !econ.hasExecutionData;
  const reasons = deviationReasons(econ);
  const priceText = econ.hasSalesPrice ? formatCurrency(econ.salesPrice) : "—";
  const noPriceHint = econ.hasSalesPrice ? undefined : "Sin precio de venta: no hay ganancia ni margen.";

  return (
    <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
      <Card>
        <CardContent className="pt-5">
          <div className="mb-3 flex items-center gap-1.5 text-sm font-medium text-slate-600">
            {completed ? "Margen esperado vs. margen real final" : "¿Estoy ganando lo que pensé?"}
            {!completed && !noData && <InfoTooltip content={MARGIN_TOOLTIP} label="Qué es el margen proyectado" />}
          </div>
          {noData ? (
            <>
              <MarginShift from={econ.expectedMargin} size="xl" />
              <p className="mt-2 text-sm text-slate-500">Sin datos todavía: el margen proyectado aparece cuando se registren consumos o costos.</p>
            </>
          ) : (
            <MarginShift from={econ.expectedMargin} to={econ.currentMargin} size="xl" toLabel={completed ? "Real final" : "Proyectado"} />
          )}
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Money label="Precio de venta" value={priceText} hint={noPriceHint} />
            <Money label="Costo presupuestado" value={formatCurrency(econ.budgetTotal)} hint={`Ganancia esperada ${formatCurrencyOrDash(econ.expectedProfit)}`} />
            {completed ? (
              <Money label="Costo real final" value={formatCurrency(econ.finalActualCost ?? 0)} hint={`Ganancia real final ${formatCurrencyOrDash(econ.finalProfit)}`} />
            ) : (
              <>
                <Money
                  label="Costo real hasta hoy"
                  value={formatCurrency(econ.actualCostToDate)}
                  tooltip="Consumido + desperdicio de materiales + costos registrados. Lo comprado NO suma hasta que se registra su consumo."
                  hint={`Comprado: ${formatCurrency(econ.purchasesTotal)}`}
                />
                <Money
                  label="Costo final proyectado"
                  value={formatCurrency(econ.projectedFinalCost)}
                  tooltip="Costo real hasta hoy + lo que falta del costo presupuestado. Por categoría: el mayor entre lo presupuestado y lo registrado."
                  hint={`Ganancia proyectada ${formatCurrencyOrDash(econ.projectedProfit)}`}
                />
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <div className="grid grid-cols-1 gap-2 text-center sm:grid-cols-3">
            <div className="rounded-md bg-slate-50 p-3">
              <div className="text-xs text-slate-500">Costo presupuestado</div>
              <div className="mt-1 text-lg font-semibold tabular">{formatCurrency(econ.budgetTotal)}</div>
            </div>
            <div className="rounded-md bg-slate-50 p-3">
              <div className="text-xs text-slate-500">{completed ? "Costo real final" : "Costo final proyectado"}</div>
              <div className="mt-1 text-lg font-semibold tabular">{formatCurrency(econ.projectedFinalCost)}</div>
            </div>
            <div className={cn("rounded-md p-3", econ.costOverrun > 0 ? "bg-red-50" : econ.costOverrun < 0 ? "bg-emerald-50" : "bg-slate-50")}>
              <div className="text-xs text-slate-500">Diferencia</div>
              <div className={cn("mt-1 text-lg font-semibold tabular", tone(econ.costOverrun))}>{formatSignedCurrency(econ.costOverrun)}</div>
            </div>
          </div>
          <div className="mt-5">
            <div className="mb-2 text-sm font-semibold text-slate-900">¿Por qué?</div>
            {reasons.rows.length === 0 ? (
              <p className="text-sm text-slate-600">
                {noData ? "Sin datos todavía: no hay desvíos para explicar." : "Ninguna categoría se desvía de su costo presupuestado."}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {reasons.rows.map((r) => (
                  <li key={r.category} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-slate-700">{CATEGORY_LABELS[r.category]}</span>
                    <span className={cn("font-medium tabular", tone(r.amount))}>{formatSignedCurrency(r.amount)}</span>
                  </li>
                ))}
                <li className="flex items-center justify-between gap-2 border-t border-slate-200 pt-1.5 text-sm font-semibold">
                  <span className="text-slate-900">Total (= Diferencia)</span>
                  <span className={cn("tabular", tone(reasons.total))}>{formatSignedCurrency(reasons.total)}</span>
                </li>
              </ul>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
