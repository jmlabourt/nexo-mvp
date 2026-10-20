"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ProjectView } from "@/store/selectors";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress";
import { GENERAL_STATE_LABELS, generalState, type GeneralState } from "@/lib/gerencia";
import { projectProduction } from "@/lib/production";
import { formatCurrency, formatCurrencyOrDash, formatDate, formatPercent } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import { CircuitBadge } from "./circuit-actions";

const STATE_TONE: Record<GeneralState, "gray" | "blue" | "yellow" | "green"> = { quotation: "gray", approved: "blue", in_progress: "yellow", closed: "green" };

export function GeneralStateBadge({ state }: { state: GeneralState }) {
  return <Badge tone={STATE_TONE[state]}>{GENERAL_STATE_LABELS[state]}</Badge>;
}

/**
 * Tabla de proyectos. `economic` (Gerencia): precio, costos, ganancia y rentabilidad proyectadas (real final en los
 * cerrados). Sin `economic` (Administración): muebles y avance, ningún importe gerencial.
 */
export function ProjectsTable({ views, economic }: { views: ProjectView[]; economic: boolean }) {
  const router = useRouter();
  return (
    <Table>
      <THead>
        <TR>
          <TH>Código</TH>
          <TH>Cliente</TH>
          <TH>Proyecto</TH>
          <TH>Estado</TH>
          <TH>Entrega</TH>
          {economic ? (
            <>
              <TH className="text-right">Precio de venta</TH>
              <TH className="text-right">Costo presupuestado</TH>
              <TH className="text-right">Costo proyectado</TH>
              <TH className="text-right">Ganancia proyectada</TH>
              <TH className="text-right">Rentabilidad proyectada</TH>
            </>
          ) : (
            <>
              <TH>Etapa</TH>
              <TH>Muebles</TH>
              <TH>Avance</TH>
            </>
          )}
        </TR>
      </THead>
      <TBody>
        {views.map(({ project: p, econ }) => {
          const state = generalState(p);
          const closed = state === "closed";
          const profit = closed ? econ.finalProfit : econ.projectedProfit;
          const margin = closed ? econ.finalMargin : econ.projectedMargin;
          const production = projectProduction(p);
          return (
            <TR key={p.id} className="cursor-pointer hover:bg-slate-50" onClick={() => router.push(`/projects/${p.id}`)}>
              <TD className="whitespace-nowrap">
                <Link href={`/projects/${p.id}`} className="font-medium text-blue-700 hover:underline" onClick={(e) => e.stopPropagation()}>
                  {p.code}
                </Link>
              </TD>
              <TD className="whitespace-nowrap">{p.client}</TD>
              <TD className="min-w-48 text-slate-900">{p.name}</TD>
              <TD><GeneralStateBadge state={state} /></TD>
              <TD className="whitespace-nowrap tabular">{formatDate(p.dueDate)}</TD>
              {economic ? (
                <>
                  <TD className="text-right tabular">{formatCurrencyOrDash(p.salesPrice > 0 ? p.salesPrice : null)}</TD>
                  <TD className="text-right tabular">{formatCurrency(econ.budgetTotal)}</TD>
                  <TD className={cn("text-right tabular", econ.costOverrun > 0 && "text-red-700")}>{formatCurrency(econ.projectedFinalCost)}</TD>
                  <TD className={cn("text-right tabular", (profit ?? 0) < 0 ? "text-red-700" : "text-slate-900")}>{formatCurrencyOrDash(profit)}</TD>
                  <TD className="text-right tabular">
                    {formatPercent(margin)}
                    {closed && <span className="block text-xs text-slate-500">real final</span>}
                  </TD>
                </>
              ) : (
                <>
                  <TD><CircuitBadge project={p} /></TD>
                  <TD className="max-w-56 text-xs text-slate-600">{p.items.length ? p.items.map((i) => `${i.name} × ${i.quantity}`).join(" · ") : "—"}</TD>
                  <TD className="min-w-32">
                    <div className="flex items-center gap-2">
                      <ProgressBar value={Math.round(production.progress * 100)} className="w-16" label={`Avance ${p.code}`} />
                      <span className="text-xs tabular text-slate-500">{Math.round(production.progress * 100)}%</span>
                    </div>
                  </TD>
                </>
              )}
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}
