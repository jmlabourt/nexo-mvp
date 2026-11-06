"use client";
import { useAppStore } from "@/store/use-app-store";
import { economicView } from "@/lib/tablero";
import { todayISO } from "@/lib/formatting";
import { staffHoursCost } from "@/lib/ledger";
import { externalCost, pendingExternal } from "@/lib/frontend-work";
import type { Project } from "@/types";
import type { ProjectEconomics } from "@/lib/calculations";
import { remainingBudgetText } from "@/lib/insights";
import { MARGIN_TOOLTIP, CATEGORY_LABELS } from "@/lib/constants";
import { formatCurrency, formatCurrencyOrDash } from "@/lib/formatting";
import { Card, CardContent } from "@/components/ui/card";
import { HelpTip } from "@/components/ui/help-tip";
import { MarginShift } from "@/components/shared/margin-shift";

function Money({ label, value, hint, tooltip }: { label: string; value: string; hint?: string; tooltip?: string }) {
  return (
    <div role="group" aria-label={label} className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
        {label}
        {tooltip && <HelpTip label={label}>{tooltip}</HelpTip>}
      </div>
      <div className="mt-1 text-lg font-semibold tabular break-words text-slate-900">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}


export function EconomicSummary({ project, econ: originalEcon }: { project: Project; econ: ProjectEconomics }) {
  const ledger = useAppStore((s) => s.ledger);
  const {result,econ,extra,financialCost}=economicView(project,ledger,todayISO(),originalEcon);
  const pending = pendingExternal(ledger,project.id);
  const completed = !result.toDate.partial;
  const noData = !completed && !econ.hasExecutionData;
  const missingCosts = econ.categories.filter(c => c.category !== "financial" && c.budget > 0 && c.actual === 0);
  const remaining = remainingBudgetText(project);
  const priceText = econ.hasSalesPrice ? formatCurrency(econ.salesPrice) : "—";
  const noPriceHint = econ.hasSalesPrice ? undefined : "Sin precio de venta: no hay ganancia ni rentabilidad.";

  if (project.status === "quotation") return (
    <Card><CardContent className="pt-5">
      <p className="mb-3 text-sm text-slate-600">Cotización sin aprobar. Los importes son comerciales; todavía no existe una venta contratada ni ganancia real.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Money label="Precio ofertado" value={formatCurrencyOrDash(originalEcon.hasSalesPrice ? originalEcon.salesPrice : null)} />
        <Money label="Costo cotizado" value={formatCurrency(originalEcon.budgetTotal)} />
        <Money label="Ganancia cotizada" value={formatCurrencyOrDash(originalEcon.expectedProfit)} />
      </div>
    </CardContent></Card>
  );

  return (
    <Card>
      <CardContent className="pt-5">
        {noData && result.toDate.cost === 0 && <p role="status" className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 font-medium text-amber-900">Todavía no se registraron costos reales. La ganancia parcial no representa el resultado final.</p>}
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Money label="Precio de venta" value={priceText} hint={noPriceHint} />
          <Money label="Costo presupuestado" value={formatCurrency(econ.budgetTotal)} hint={`Ganancia esperada ${formatCurrencyOrDash(econ.expectedProfit)}`} />
          <Money label="Costo real acumulado" value={formatCurrency(result.toDate.cost)} hint={`Al ${todayISO()} · incluye todos los costos atribuibles.`} />
          {!noData && !(project.isClosed && result.toDate.partial) && <Money label="Costo final proyectado" value={formatCurrency(econ.projectedFinalCost)} hint="Estimación del costo al terminar; no es un pago ni consumo adicional." />}
        </div>
        <div className="mb-4 rounded-md bg-slate-50 p-3 text-sm font-medium">{result.toDate.partial?`Ganancia parcial al ${todayISO()}`:"Ganancia final"}: {formatCurrency(result.toDate.profit)}<p className="mt-1 font-normal text-slate-600">Contrato al corte menos costos atribuibles acumulados. No es caja.</p></div>
        <div className="mb-3 flex items-center gap-1.5 text-sm font-medium text-slate-600">
          {completed ? "Rentabilidad esperada vs. rentabilidad real final" : "¿Estoy ganando lo que pensé?"}
          {!completed && !noData && <HelpTip label="Rentabilidad proyectada">{MARGIN_TOOLTIP}</HelpTip>}
        </div>
        {noData ? (
          <>
            <MarginShift from={econ.expectedMargin} size="xl" />
            <p className="mt-2 text-sm text-slate-500">Sin datos todavía: la rentabilidad proyectada aparece cuando se registren consumos o costos.</p>
          </>
        ) : (
          <MarginShift from={econ.expectedMargin} to={econ.currentMargin} size="xl" toLabel={completed ? "Real final" : "Proyectada"} />
        )}
        {extra > 0 && <p className="mt-2 text-xs text-slate-600">Incluye costo de horas propias y distribuidas: {formatCurrency(staffHoursCost(ledger,project.id))}; externos y tercerizaciones: {formatCurrency(externalCost(ledger,project.id))}. Registrados una sola vez.</p>}
        {project.isClosed&&result.toDate.partial&&<p role="status" className="text-sm text-amber-800">{result.finalReason}</p>}
        {pending.length > 0 && <p role="status" className="mt-2 rounded bg-amber-50 p-3 text-sm text-amber-900">Rentabilidad parcial: {pending.length} trabajos externos con costo pendiente de confirmar por Gerencia.</p>}
        {missingCosts.length > 0 && <p className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900">Sin costos registrados en {missingCosts.map(c=>CATEGORY_LABELS[c.category]).join(", ")}. Esto no confirma un costo cero. Revisá las cargas antes de interpretar la rentabilidad{completed ? " final" : ""}.</p>}
        <h3 className="mt-5 mb-3 text-sm font-semibold">Composición del costo real acumulado</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Money
            label="Costo productivo real"
            value={formatCurrency(originalEcon.actualCostToDate)}
            tooltip="Consumido + desperdicio de materiales + costos registrados del proyecto. Lo comprado NO suma hasta que se registra su consumo."
            hint={`Comprado: ${formatCurrency(originalEcon.purchasesTotal)}`}
          />
          <Money
            label="Costo financiero acumulado"
            value={formatCurrency(financialCost)}
            tooltip="Costo de financiar el saldo pendiente hasta la fecha de corte; se mantiene separado del costo productivo y no se duplica en la tabla de categorías."
            hint={financialCost > 0 ? "Sobre saldo pendiente y cobros reales." : "Sin costo financiero acumulado al corte."}
          />
        </div>
        {remaining && <p className="mt-4 text-sm text-slate-600">{remaining}</p>}
      </CardContent>
    </Card>
  );
}
