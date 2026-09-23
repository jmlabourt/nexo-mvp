"use client";
import type { Project } from "@/types";
import type { ProjectEconomics } from "@/lib/calculations";
import { CATEGORY_LABELS, MARGIN_TOOLTIP } from "@/lib/constants";
import { formatCompactCurrency, formatCurrency, formatSignedCompactCurrency } from "@/lib/formatting";
import { Card, CardContent } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/tooltip";
import { MarginShift } from "@/components/shared/margin-shift";
import { cn } from "@/lib/utils";

function Money({ label, value, hint, tooltip }: { label: string; value: number; hint?: string; tooltip?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
        {label}
        {tooltip && <InfoTooltip content={tooltip} />}
      </div>
      <div className="mt-1 text-lg font-semibold tabular text-slate-900">{formatCurrency(value)}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export function EconomicSummary({ project, econ }: { project: Project; econ: ProjectEconomics }) {
  const completed = project.status === "completed";
  const reasons = econ.categories.filter((c) => c.projectedVariance.amount > 0).sort((a, b) => b.projectedVariance.amount - a.projectedVariance.amount);
  return (
    <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
      <Card>
        <CardContent className="pt-5">
          <div className="mb-3 flex items-center gap-1.5 text-sm font-medium text-slate-600">
            {completed ? "Margen esperado vs. margen real" : "¿Estoy ganando lo que pensé?"}
            {!completed && <InfoTooltip content={MARGIN_TOOLTIP} label="Qué es el margen proyectado" />}
          </div>
          <MarginShift from={econ.expectedMargin} to={econ.currentMargin} size="xl" toLabel={completed ? "Real" : "Proyectado"} />
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Money label="Precio de venta" value={econ.salesPrice} />
            <Money label="Costo presupuestado" value={econ.budgetTotal} hint={`Ganancia esperada ${formatCompactCurrency(econ.expectedProfit)}`} />
            <Money
              label="Costo real hasta hoy"
              value={econ.actualCostToDate}
              tooltip="Consumo + desperdicio de materiales + costos registrados. Las compras NO suman hasta que se registra su uso."
              hint={`Compras registradas: ${formatCompactCurrency(econ.purchasesTotal)}`}
            />
            {completed ? (
              <Money label="Costo real final" value={econ.finalActualCost ?? 0} hint={`Ganancia real ${formatCompactCurrency(econ.finalProfit ?? 0)}`} />
            ) : (
              <Money
                label="Costo final proyectado"
                value={econ.projectedFinalCost}
                tooltip="Por categoría: el mayor entre lo presupuestado y lo registrado."
                hint={`Ganancia proyectada ${formatCompactCurrency(econ.projectedProfit)}`}
              />
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md bg-slate-50 p-3">
              <div className="text-xs text-slate-500">Presupuesté</div>
              <div className="mt-1 text-xl font-semibold tabular">{formatCompactCurrency(econ.budgetTotal)}</div>
            </div>
            <div className="rounded-md bg-slate-50 p-3">
              <div className="text-xs text-slate-500">{completed ? "Costó" : "Proyectado ahora"}</div>
              <div className="mt-1 text-xl font-semibold tabular">{formatCompactCurrency(econ.projectedFinalCost)}</div>
            </div>
            <div className={cn("rounded-md p-3", econ.costOverrun > 0 ? "bg-red-50" : "bg-emerald-50")}>
              <div className="text-xs text-slate-500">Diferencia</div>
              <div className={cn("mt-1 text-xl font-semibold tabular", econ.costOverrun > 0 ? "text-red-700" : "text-emerald-700")}>
                {formatSignedCompactCurrency(econ.costOverrun)}
              </div>
            </div>
          </div>
          <div className="mt-5">
            <div className="mb-2 text-sm font-semibold text-slate-900">¿Por qué?</div>
            {reasons.length === 0 ? (
              <p className="text-sm text-emerald-700">Ninguna categoría supera su presupuesto. Dentro de presupuesto.</p>
            ) : (
              <ul className="space-y-1.5">
                {reasons.map((r) => (
                  <li key={r.category} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700">{CATEGORY_LABELS[r.category]}</span>
                    <span className="font-medium tabular text-red-700">{formatSignedCompactCurrency(r.projectedVariance.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
