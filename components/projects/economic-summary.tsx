"use client";
import { useAppStore } from "@/store/use-app-store";
import { profitView } from "@/lib/tablero";
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
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
        {label}
        {tooltip && <HelpTip label={label}>{tooltip}</HelpTip>}
      </div>
      <div className="mt-1 text-lg font-semibold tabular text-slate-900">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}


export function EconomicSummary({ project, econ: originalEcon }: { project: Project; econ: ProjectEconomics }) {
  const ledger = useAppStore((s) => s.ledger);
  const result = profitView(project,ledger,todayISO());
  const extra = result.toDate.cost - originalEcon.actualCostToDate;
  const ownHours = staffHoursCost(ledger, project.id);
  const external = externalCost(ledger, project.id);
  const financialCost = Math.max(0, result.toDate.cost - originalEcon.actualCostToDate - ownHours - external);
  const pending = pendingExternal(ledger,project.id);
  const econ = { ...originalEcon,
    salesPrice:result.toDate.contract,
    actualCostToDate: originalEcon.actualCostToDate + extra,
    projectedFinalCost: originalEcon.projectedFinalCost + extra,
    currentMargin: originalEcon.currentMargin === null ? null : result.toDate.contract > 0 ? (result.toDate.contract-originalEcon.projectedFinalCost-extra)/result.toDate.contract*100 : null,
    projectedProfit: originalEcon.projectedProfit === null ? null : result.toDate.contract - originalEcon.projectedFinalCost - extra,
    projectedMargin: originalEcon.projectedMargin === null ? null : result.toDate.contract > 0 ? (result.toDate.contract-originalEcon.projectedFinalCost-extra)/result.toDate.contract*100 : null,
    finalActualCost: originalEcon.finalActualCost === null ? null : originalEcon.finalActualCost + extra,
    finalProfit: originalEcon.finalProfit === null ? null : result.toDate.profit,
    finalMargin: originalEcon.finalMargin === null ? null : result.toDate.margin,
  };
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
        <div className="mb-3 text-xl font-semibold">{result.toDate.partial?`Ganancia parcial al ${todayISO()}`:"Ganancia final"}: {formatCurrency(result.toDate.profit)}<p className="text-xs font-normal">Contrato al corte menos costos atribuibles acumulados. No es caja.</p></div>
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
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Money label="Precio de venta" value={priceText} hint={noPriceHint} />
          <Money label="Costo presupuestado" value={formatCurrency(econ.budgetTotal)} hint={`Ganancia esperada ${formatCurrencyOrDash(econ.expectedProfit)}`} />
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
          <Money
            label="Costo económico total"
            value={formatCurrency(result.toDate.cost)}
            tooltip="Costo productivo + horas propias/distribuidas + terceros + costo financiero acumulado, sin duplicar compras ni consumos."
            hint={result.toDate.partial ? `Ganancia parcial ${formatCurrency(result.toDate.profit)}` : `Ganancia final ${formatCurrency(result.toDate.profit)}`}
          />
        </div>
        {remaining && <p className="mt-4 text-sm text-slate-600">{remaining}</p>}
      </CardContent>
    </Card>
  );
}
