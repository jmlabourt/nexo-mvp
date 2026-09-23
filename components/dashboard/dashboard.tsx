"use client";
import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { aggregateMargins, isActiveProject } from "@/lib/calculations";
import { CATEGORY_LABELS, MARGIN_TOOLTIP } from "@/lib/constants";
import { formatCompactCurrency, formatPercent, formatPp, formatSignedCurrency } from "@/lib/formatting";
import { useProjectViews, type ProjectView } from "@/store/selectors";
import { PageHeader } from "@/components/shared/page-header";
import { Stat } from "@/components/shared/stat";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HealthBadge, StatusBadge } from "@/components/shared/badges";
import { MarginShift } from "@/components/shared/margin-shift";
import { Button } from "@/components/ui/button";
import { ProjectsTable } from "@/components/projects/projects-table";
import { MarginComparisonChart } from "@/components/charts/margin-comparison-chart";
import { EmptyState } from "@/components/shared/empty-state";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 13) return "Buen día";
  if (h < 20) return "Buenas tardes";
  return "Buenas noches";
}

const HEALTH_RANK = { risk: 0, attention: 1, healthy: 2 } as const;

function AttentionCard({ view }: { view: ProjectView }) {
  const { project: p, econ, health } = view;
  const dev = econ.mainDeviation;
  return (
    <Card className="flex flex-col">
      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-semibold text-slate-900">{p.name}</div>
            <div className="text-sm text-slate-500">
              {p.client} · {p.code}
            </div>
          </div>
          <HealthBadge health={health} />
        </div>
        <MarginShift from={econ.expectedMargin} to={econ.projectedMargin} />
        <div className="rounded-md bg-slate-50 px-3 py-2 text-sm">
          <span className="text-slate-500">Principal causa del desvío: </span>
          {dev ? (
            <span className="font-medium text-slate-900">
              {CATEGORY_LABELS[dev.category]} {formatSignedCurrency(dev.projectedVariance.amount)}
            </span>
          ) : (
            <span className="text-slate-700">sin desvíos de costo</span>
          )}
        </div>
        <div className="mt-auto flex items-center justify-between">
          <StatusBadge status={p.status} />
          <Button asChild variant="outline" size="sm">
            <Link href={`/projects/${p.id}`}>
              Ver proyecto <ArrowRight />
            </Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function Dashboard() {
  const views = useProjectViews();
  const active = useMemo(() => views.filter((v) => isActiveProject(v.project)), [views]);
  const agg = useMemo(() => aggregateMargins(active.map((v) => v.project)), [active]);
  const atRisk = active.filter((v) => v.health === "risk").length;
  const attention = useMemo(
    () =>
      active
        .filter((v) => v.health !== "healthy")
        .sort((a, b) => HEALTH_RANK[a.health] - HEALTH_RANK[b.health] || (a.econ.marginDeltaPp ?? 0) - (b.econ.marginDeltaPp ?? 0))
        .slice(0, 4),
    [active],
  );
  const chartData = active
    .filter((v) => v.econ.expectedMargin !== null && v.econ.projectedMargin !== null)
    .map((v) => ({ code: v.project.code, name: v.project.name, expected: Number(v.econ.expectedMargin!.toFixed(1)), projected: Number(v.econ.projectedMargin!.toFixed(1)) }));
  const aggDelta =
    agg.expectedAggregateMargin !== null && agg.projectedAggregateMargin !== null
      ? agg.projectedAggregateMargin - agg.expectedAggregateMargin
      : null;

  return (
    <div>
      <PageHeader title={greeting()} subtitle="Así están tus proyectos hoy." />

      <section aria-label="Indicadores" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat label="Proyectos activos" value={agg.count} hint="Aprobados a instalación" />
        <Stat label="Venta total activa" value={formatCompactCurrency(agg.totalSales)} />
        <Stat label="Margen esperado agregado" value={formatPercent(agg.expectedAggregateMargin)} hint="Ponderado por venta" />
        <Stat
          label="Margen proyectado agregado"
          value={formatPercent(agg.projectedAggregateMargin)}
          tooltip={MARGIN_TOOLTIP}
          tone={aggDelta !== null && aggDelta < -2 ? "yellow" : "default"}
          hint={aggDelta !== null ? `${formatPp(aggDelta)} vs. esperado` : undefined}
        />
        <Stat label="Proyectos en riesgo" value={atRisk} tone={atRisk > 0 ? "red" : "green"} hint={`${attention.length} necesitan atención`} className="col-span-2 md:col-span-1" />
      </section>

      <section aria-labelledby="attention-title" className="mt-8">
        <h2 id="attention-title" className="mb-3 text-lg font-semibold text-slate-900">
          Necesitan atención
        </h2>
        {attention.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="Todos los proyectos activos están dentro de presupuesto" />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {attention.map((v) => (
              <AttentionCard key={v.project.id} view={v} />
            ))}
          </div>
        )}
      </section>

      <div className="mt-8 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-3">
          <CardHeader>
            <CardTitle>Margen esperado vs. margen proyectado</CardTitle>
            <CardDescription>Por proyecto activo. La diferencia entre barras es la rentabilidad que se está perdiendo (o ganando).</CardDescription>
          </CardHeader>
          <CardContent>
            <MarginComparisonChart data={chartData} />
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Proyectos activos</CardTitle>
            <CardDescription>Hacé click en un proyecto para ver por qué se desvía.</CardDescription>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/projects">
              Ver todos <ArrowRight />
            </Link>
          </Button>
        </CardHeader>
        <div className="border-t border-slate-100">
          <ProjectsTable views={[...active].sort((a, b) => (a.econ.marginDeltaPp ?? 0) - (b.econ.marginDeltaPp ?? 0))} />
        </div>
      </Card>
      <p className="mt-3 text-xs text-slate-500">
        Desvío = margen proyectado − margen esperado, en puntos porcentuales (pp).
      </p>
    </div>
  );
}
