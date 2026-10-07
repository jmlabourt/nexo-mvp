"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ProjectView } from "@/store/selectors";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { HealthBadge, StatusBadge } from "@/components/shared/badges";
import { DeltaPp } from "@/components/shared/margin-shift";
import { ProgressBar } from "@/components/ui/progress";
import { projectSchedule } from "@/lib/project-rules";
import { formatCurrency, formatDate, formatPercent, todayISO } from "@/lib/formatting";

export function ProjectsTable({ views, showSchedule = true }: { views: ProjectView[]; showSchedule?: boolean }) {
  const router = useRouter();
  return (
    <Table>
      <THead>
        <TR>
          <TH>Proyecto</TH>
          <TH>Cliente</TH>
          <TH>Estado</TH>
          <TH>Entrega</TH>
          {showSchedule && <TH>Plazo transcurrido</TH>}
          <TH className="text-right">Venta</TH>
          <TH className="text-right">Margen esperado</TH>
          <TH className="text-right">Margen proyectado</TH>
          <TH className="text-right">Desvío</TH>
          <TH>Estado económico</TH>
        </TR>
      </THead>
      <TBody>
        {views.map(({ project: p, econ, health }) => (
          <TR
            key={p.id}
            className="cursor-pointer hover:bg-slate-50"
            onClick={() => router.push(`/projects/${p.id}`)}
          >
            <TD className="min-w-56">
              <Link href={`/projects/${p.id}`} className="font-medium text-slate-900 hover:text-blue-700" onClick={(e) => e.stopPropagation()}>
                {p.name}
              </Link>
              <div className="text-xs text-slate-500">{p.code}</div>
            </TD>
            <TD className="whitespace-nowrap">{p.client}</TD>
            <TD>
              <StatusBadge status={p.status} />
            </TD>
            <TD className="whitespace-nowrap tabular">{formatDate(p.dueDate)}</TD>
            {showSchedule && (
              <TD className="min-w-28">
                {(() => {
                  const sc = projectSchedule(p, p.isClosed && p.closedAt ? p.closedAt.slice(0, 10) : todayISO());
                  return (
                    <div className="flex items-center gap-2">
                      <ProgressBar value={sc.elapsedPct} className="w-16" label={`Plazo transcurrido ${p.code}`} />
                      <span className={`text-xs tabular ${sc.overdue && !p.isClosed ? "font-medium text-red-700" : "text-slate-500"}`}>{sc.elapsedPct}%</span>
                    </div>
                  );
                })()}
              </TD>
            )}
            <TD className="whitespace-nowrap text-right tabular">{formatCurrency(p.salesPrice)}</TD>
            <TD className="text-right tabular">{formatPercent(econ.expectedMargin)}</TD>
            <TD className="text-right font-medium tabular text-slate-900">{formatPercent(econ.currentMargin)}</TD>
            <TD className="text-right whitespace-nowrap">
              <DeltaPp value={econ.marginDeltaPp} />
            </TD>
            <TD>
              <HealthBadge health={health} />
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
