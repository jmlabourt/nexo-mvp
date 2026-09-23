"use client";
import Link from "next/link";
import { useMemo } from "react";
import { Archive, Lightbulb } from "lucide-react";
import { historyLearnings, mainCauseLabel } from "@/lib/insights";
import { formatCurrency, formatDate, formatPercent } from "@/lib/formatting";
import { useProjectViews } from "@/store/selectors";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { DeltaPp } from "@/components/shared/margin-shift";
import { InsightList } from "@/components/shared/insight-list";
import { EmptyState } from "@/components/shared/empty-state";
import { HealthBadge } from "@/components/shared/badges";

export function HistoryPage() {
  const views = useProjectViews();
  const completed = useMemo(
    () => views.filter((v) => v.project.status === "completed").sort((a, b) => (b.project.closedAt ?? "").localeCompare(a.project.closedAt ?? "")),
    [views],
  );
  const learnings = useMemo(() => historyLearnings(completed.map((v) => v.project)), [completed]);

  return (
    <div>
      <PageHeader title="Historial" subtitle="Usá proyectos anteriores para presupuestar mejor los próximos." />
      {completed.length === 0 ? (
        <EmptyState icon={Archive} title="Todavía no hay proyectos cerrados" />
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="size-4 text-amber-500" aria-hidden /> Aprendizajes
              </CardTitle>
              <CardDescription>
                Reglas simples sobre {completed.length} proyectos finalizados. Con pocos proyectos son indicios, no conclusiones.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <InsightList insights={learnings} />
            </CardContent>
          </Card>
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>Proyecto</TH>
                  <TH>Tipo</TH>
                  <TH>Cierre</TH>
                  <TH className="text-right">Venta</TH>
                  <TH className="text-right">Margen esperado</TH>
                  <TH className="text-right">Margen real</TH>
                  <TH className="text-right">Desvío</TH>
                  <TH>Principal causa</TH>
                  <TH>Resultado</TH>
                </TR>
              </THead>
              <TBody>
                {completed.map(({ project: p, econ, health }) => (
                  <TR key={p.id} className="hover:bg-slate-50">
                    <TD className="min-w-56">
                      <Link href={`/projects/${p.id}`} className="font-medium text-slate-900 hover:text-blue-700">{p.name}</Link>
                      <div className="text-xs text-slate-500">{p.code} · {p.client}</div>
                    </TD>
                    <TD className="whitespace-nowrap">{p.projectType}</TD>
                    <TD className="tabular">{formatDate(p.closedAt)}</TD>
                    <TD className="text-right tabular whitespace-nowrap">{formatCurrency(p.salesPrice)}</TD>
                    <TD className="text-right tabular">{formatPercent(econ.expectedMargin)}</TD>
                    <TD className="text-right font-medium tabular">{formatPercent(econ.finalMargin)}</TD>
                    <TD className="text-right whitespace-nowrap"><DeltaPp value={econ.marginDeltaPp} /></TD>
                    <TD>{mainCauseLabel(p)}</TD>
                    <TD><HealthBadge health={health} /></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        </div>
      )}
    </div>
  );
}
