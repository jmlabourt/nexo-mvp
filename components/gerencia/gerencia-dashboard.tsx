"use client";
// Gerencia → Dashboard: ¿cuánto facturamos, cuánto ganamos, cuánto nos cuesta producir y qué carga de trabajo se viene?
// Ocho bloques en el orden del pedido: resumen económico, facturación, rentabilidad por proyecto, costos reales, horas,
// cotizaciones y carga futura, capacidad de personal y alertas. Todos los números salen de lib/gerencia.ts (funciones
// puras) y cada uno tiene su definición (ⓘ) en Configuración → Indicadores y cálculos.
import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight } from "lucide-react";
import type { RubroCapacity } from "@/types";
import {
  billingByMonth,
  billingRows,
  billingSummary,
  capacityFromOperators,
  capacityHours,
  capacityRows,
  costRows,
  delayImpact,
  filterProfit,
  GENERAL_STATE_LABELS,
  generalState,
  hoursRows,
  loadByRubro,
  monthsBetween,
  opportunities,
  overdueCollections,
  periodOf,
  profitRows,
  projectedTotals,
  PROFIT_FILTER_LABELS,
  type HoursGroup,
  type PeriodKind,
  type ProfitFilter,
} from "@/lib/gerencia";
import { formatCurrency, formatDate, formatNumber, formatPercent } from "@/lib/formatting";
import { profitOverview } from "@/lib/dashboard";
import { useAppStore } from "@/store/use-app-store";
import { useAlerts, useToday } from "@/store/selectors";
import { useInvoices, useManagementParams, useOpportunityInfo } from "@/store/session-data";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/input";
import { Choice } from "@/components/ui/choice";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ColumnChart, CHART_COLORS } from "@/components/shared/column-chart";
import { IndicatorTip, OriginTag } from "@/components/shared/data-origin";
import { cn } from "@/lib/utils";

const PERIODS: Array<{ value: PeriodKind; label: string }> = [
  { value: "month", label: "Mes" },
  { value: "quarter", label: "Trimestre" },
  { value: "year", label: "Año" },
  { value: "custom", label: "Personalizado" },
];

const NEGOTIATION = { sent: "Enviada", negotiating: "En negociación", waiting_client: "Esperando al cliente" } as const;
const moneyShort = (n: number) => (Math.abs(n) >= 1_000_000 ? `$ ${formatNumber(n / 1_000_000, 1)} M` : formatCurrency(n));
const hours = (n: number) => `${formatNumber(n, 0)} h`;

function Kpi({ label, value, hint, ind, href, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; ind: string; href: string; tone?: "green" | "red" | "amber" }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
        <a href={href} className="hover:text-blue-700 hover:underline">{label}</a>
        <IndicatorTip id={ind} />
      </div>
      <a href={href} className={cn("mt-1.5 block text-2xl font-semibold tabular tracking-tight", tone === "green" ? "text-emerald-700" : tone === "red" ? "text-red-700" : tone === "amber" ? "text-amber-700" : "text-slate-900")}>
        {value}
      </a>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

const marginTone = (m: number | null, expected: number | null) => (m === null ? undefined : m < 0 ? "text-red-700" : expected !== null && m < expected - 0.05 ? "text-amber-700" : "text-emerald-700");

export function GerenciaDashboard() {
  const today = useToday();
  const projects = useAppStore((s) => s.projects);
  const operators = useAppStore((s) => s.operators);
  const hoursPerDay = useAppStore((s) => s.costSettings.hoursPerDay);
  const laborRate = useAppStore((s) => s.hourRates.find((r) => r.category === "labor")?.hourlyRate ?? 0);
  const deviationPct = useAppStore((s) => s.settings.categoryWarningPct);
  const invoices = useInvoices();
  const oppInfo = useOpportunityInfo();
  const params = useManagementParams();
  const { open } = useAlerts();
  const assignments = useAppStore((s) => s.assignments);
  const dueSoonDays = useAppStore((s) => s.settings.dueSoonDays);
  const severePoints = useAppStore((s) => s.settings.marginWarningPp);

  const [kind, setKind] = useState<PeriodKind>("month");
  const [ref, setRef] = useState(today.slice(0, 7));
  const [custom, setCustom] = useState({ from: today.slice(0, 8) + "01", to: today });
  const [projectId, setProjectId] = useState("");
  const [profitFilter, setProfitFilter] = useState<ProfitFilter>("all");
  const [hoursGroup, setHoursGroup] = useState<HoursGroup>("project");
  const [rubro, setRubro] = useState("");

  const period = useMemo(() => periodOf(kind, `${ref}-01`, custom), [kind, ref, custom]);
  const scope = projectId ? projects.filter((p) => p.id === projectId) : projects;
  const confirmed = projects.filter((p) => generalState(p) !== "quotation");

  const billing = useMemo(() => billingSummary(projects, invoices.data, period, today), [projects, invoices.data, period, today]);
  const chartRange = kind === "month" ? { from: periodOf("month", addMonths(period.from, -3)).from, to: periodOf("month", addMonths(period.from, 3)).to } : period;
  const byMonth = billingByMonth(projects, invoices.data, chartRange.from, chartRange.to);
  const bRows = billingRows(scope, invoices.data);
  const pRowsAll = useMemo(() => profitRows(projects), [projects]);
  const totals = projectedTotals(pRowsAll);
  const overview = useMemo(() => profitOverview(projects, assignments, today, dueSoonDays, severePoints), [projects, assignments, today, dueSoonDays, severePoints]);
  const pRows = filterProfit(projectId ? pRowsAll.filter((r) => r.project.id === projectId) : pRowsAll, profitFilter, deviationPct);
  const costs = costRows(scope.filter((p) => generalState(p) !== "quotation"));
  const hRows = hoursRows(scope.filter((p) => generalState(p) !== "quotation"), hoursGroup, period).filter((r) => r.budget > 0 || r.actual > 0);
  const opps = useMemo(() => opportunities(projects, oppInfo.data), [projects, oppInfo.data]);

  // Carga futura: los próximos 4 meses desde hoy, por rubro.
  const horizon = monthsBetween(today, addMonths(today, 3));
  const capacities: RubroCapacity[] = useMemo(() => capacityFromOperators(operators, params.roleToRubro, hoursPerDay), [operators, params.roleToRubro, hoursPerDay]);
  const loads = horizon.map((m) => ({ m, load: loadByRubro(projects, opps, m.from < today ? today : m.from, m.to, today) }));
  const rubros = [...new Set([...capacities.map((c) => c.rubro), ...loads.flatMap(({ load }) => [...Object.keys(load.confirmed), ...Object.keys(load.potential)])])].sort();
  const pick = (rec: Record<string, number>) => (rubro ? (rec[rubro] ?? 0) : Object.values(rec).reduce((s, x) => s + x, 0));
  const capOf = (from: string, to: string) => capacities.filter((c) => !rubro || c.rubro === rubro).reduce((s, c) => s + capacityHours(c, from, to), 0);
  const horizonFrom = today;
  const horizonTo = horizon[horizon.length - 1].to;
  const capRows = capacityRows(capacities, loadByRubro(projects, opps, horizonFrom, horizonTo, today), horizonFrom, horizonTo);

  // Alertas gerenciales: pocas y accionables.
  const overdue = overdueCollections(invoices.data, today);
  const late = confirmed.map((p) => ({ p, d: delayImpact(p, today, laborRate, hoursPerDay) })).filter((x) => x.d.lateDays > 0);
  const managerial = [
    ...open
      .filter((a) => a.kind === "margin" || a.kind === "category" || a.kind === "hours" || a.kind === "due")
      .slice(0, 4)
      .map((a) => ({ key: a.id, title: `${a.projectCode} · ${a.title}`, detail: a.action ?? a.message, href: `/projects/${a.projectId}`, level: a.level === "critical" ? "red" : "amber" })),
    ...capRows.filter((r) => r.status === "over").map((r) => ({ key: `cap-${r.rubro}`, title: `${r.rubro}: falta capacidad para lo confirmado`, detail: `${hours(r.confirmed)} confirmadas contra ${hours(r.capacity)} disponibles en los próximos meses.`, href: "#capacidad", level: "red" })),
    ...late.map(({ p, d }) => ({ key: `late-${p.id}`, title: `${p.code} atrasado ${d.lateDays} días hábiles`, detail: `Impacto estimado ≈ ${formatCurrency(d.amount)} (${d.crew} operarios × jornada × tarifa). Es una estimación, no un gasto registrado.`, href: `/projects/${p.id}`, level: "amber" })),
    ...(overdue.length ? [{ key: "cobros", title: `${overdue.length} ${overdue.length === 1 ? "cobro demorado" : "cobros demorados"}: ${formatCurrency(overdue.reduce((s, i) => s + i.amount, 0))}`, detail: "Facturas vencidas sin cobrar. Revisar con el cliente.", href: "#facturacion", level: "amber" }] : []),
  ].slice(0, 7);

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle={`Resultados y actividad de la empresa · ${period.label}. Datos históricos y proyecciones, siempre separados.`} />

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-3" role="group" aria-label="Filtros del dashboard">
        <Choice<PeriodKind> name="Período" value={kind} onChange={setKind} options={PERIODS} size="sm" className="min-w-72" />
        {kind !== "custom" ? (
          <label className="text-xs font-medium text-slate-600">
            {kind === "year" ? "Año" : "Mes de referencia"}
            <Input type="month" className="mt-1 w-40" value={ref} onChange={(e) => e.target.value && setRef(e.target.value)} />
          </label>
        ) : (
          <>
            <label className="text-xs font-medium text-slate-600">Desde<Input type="date" className="mt-1 w-40" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /></label>
            <label className="text-xs font-medium text-slate-600">Hasta<Input type="date" className="mt-1 w-40" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></label>
          </>
        )}
        <label className="text-xs font-medium text-slate-600">
          Proyecto
          <Select className="mt-1 w-56" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">Todos</option>
            {confirmed.map((p) => (
              <option key={p.id} value={p.id}>{p.code} {p.name}</option>
            ))}
          </Select>
        </label>
        {invoices.origin === "example" && <span className="ml-auto"><OriginTag origin="example" /></span>}
      </div>

      {/* 1. Resumen económico */}
      <section aria-label="Resumen económico" className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi label={`Facturación mensual (${billing.month.label})`} value={formatCurrency(billing.monthInvoiced)} hint="Efectivamente facturado en el mes." ind="billing_month" href="#facturacion" />
          <Kpi label="Facturación prevista" value={formatCurrency(billing.monthPlanned)} hint={`Previsto para ${billing.month.label}, todavía sin facturar.`} ind="billing_planned" href="#facturacion" />
          <Kpi
            label="Ganancia proyectada"
            value={formatCurrency(totals.projectedProfit)}
            tone={totals.projectedProfit < 0 ? "red" : undefined}
            hint="Proyección de los proyectos aprobados y en proceso."
            ind="profit"
            href="#rentabilidad"
          />
          <Kpi label="Rentabilidad proyectada" value={formatPercent(totals.projectedMargin)} hint="Ganancia proyectada / precio de venta." ind="margin" href="#rentabilidad" />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Kpi label="Facturación acumulada" value={formatCurrency(billing.periodInvoiced)} hint={`En ${period.label} · total general ${formatCurrency(billing.totalInvoiced)}`} ind="billing_total" href="#facturacion" />
          <Kpi label="Pendiente de facturar" value={formatCurrency(billing.pendingToInvoice)} hint="Ventas confirmadas todavía sin facturar." ind="billing_project" href="#facturacion" />
          <Kpi label="Proyectos activos" value={String(totals.activeCount)} hint="Aprobados o en proceso." ind="profit" href="#rentabilidad" />
        </div>
      </section>

      {/* 2. Facturación */}
      <Card id="facturacion">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Facturación <IndicatorTip id="billing_project" /> <OriginTag origin={invoices.origin} />
          </CardTitle>
          <p className="text-sm text-slate-500">Monto de venta acordado, facturado, pendiente y previsto. Una cotización no suma: está en Cotizaciones.</p>
        </CardHeader>
        <CardContent className="space-y-5">
          {invoices.origin === "pending" ? (
            <p className="text-sm text-slate-500">Todavía no hay registros de facturación al cliente en la base. Cuando el backend los guarde, acá se ven por proyecto, por mes y en total.</p>
          ) : (
            <>
              <ColumnChart
                title="Facturación por mes"
                series={[{ key: "issued", label: "Facturado", color: CHART_COLORS.real }, { key: "planned", label: "Previsto", color: CHART_COLORS.planned }]}
                columns={byMonth.map((m) => ({ label: m.label, values: { issued: m.issued, planned: m.planned } }))}
                format={moneyShort}
              />
              <Table>
                <THead>
                  <TR>
                    <TH>Código</TH>
                    <TH>Cliente</TH>
                    <TH>Proyecto</TH>
                    <TH className="text-right">Importe de venta</TH>
                    <TH className="text-right">Facturado</TH>
                    <TH className="text-right">Pendiente</TH>
                    <TH>Próxima fecha prevista</TH>
                    <TH>Estado</TH>
                  </TR>
                </THead>
                <TBody>
                  {bRows.map((r) => (
                    <TR key={r.project.id}>
                      <TD><Link href={`/projects/${r.project.id}?tab=billing`} className="font-medium text-blue-700 hover:underline">{r.project.code}</Link></TD>
                      <TD>{r.project.client}</TD>
                      <TD className="max-w-56 truncate" title={r.project.name}>{r.project.name}</TD>
                      <TD className="text-right tabular">{formatCurrency(r.salesPrice)}</TD>
                      <TD className="text-right tabular">{formatCurrency(r.invoiced)}</TD>
                      <TD className="text-right tabular">{formatCurrency(r.pendingToInvoice)}</TD>
                      <TD className="tabular">{r.nextPlannedDate ? formatDate(r.nextPlannedDate) : "—"}</TD>
                      <TD><Badge tone={r.state === "closed" ? "gray" : "blue"}>{GENERAL_STATE_LABELS[r.state]}</Badge></TD>
                    </TR>
                  ))}
                  <TR className="bg-slate-50 font-semibold">
                    <TD colSpan={3}>Total general</TD>
                    <TD className="text-right tabular">{formatCurrency(bRows.reduce((s, r) => s + r.salesPrice, 0))}</TD>
                    <TD className="text-right tabular">{formatCurrency(bRows.reduce((s, r) => s + r.invoiced, 0))}</TD>
                    <TD className="text-right tabular">{formatCurrency(bRows.reduce((s, r) => s + r.pendingToInvoice, 0))}</TD>
                    <TD colSpan={2} />
                  </TR>
                </TBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>

      {/* 3. Rentabilidad y ganancias por proyecto */}
      <Card id="rentabilidad">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">Rentabilidad y ganancias por proyecto <IndicatorTip id="margin" /></CardTitle>
          <p className="text-sm text-slate-500">Ganancia en pesos y rentabilidad en %. Proyectada mientras está en curso; real final solo al cerrar.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Choice<ProfitFilter>
            name="Filtrar proyectos"
            value={profitFilter}
            onChange={setProfitFilter}
            size="sm"
            className="max-w-3xl"
            options={(Object.keys(PROFIT_FILTER_LABELS) as ProfitFilter[]).map((k) => ({ value: k, label: PROFIT_FILTER_LABELS[k] }))}
          />
          <Table>
            <THead>
              <TR>
                <TH>Código</TH>
                <TH>Cliente</TH>
                <TH className="text-right">Precio de venta</TH>
                <TH className="text-right">Costo real acumulado</TH>
                <TH className="text-right">Costo proyectado final</TH>
                <TH className="text-right">Ganancia proyectada</TH>
                <TH className="text-right">Rentabilidad</TH>
                <TH className="text-right">Desvío vs presupuesto</TH>
              </TR>
            </THead>
            <TBody>
              {pRows.length === 0 && (
                <TR><TD colSpan={8} className="text-slate-500">Ningún proyecto con ese filtro.</TD></TR>
              )}
              {pRows.map((r) => {
                const closed = r.state === "closed";
                const margin = closed ? r.finalMargin : r.projectedMargin;
                const profit = closed ? r.salesPrice - r.actualCost : r.projectedProfit;
                return (
                  <TR key={r.project.id}>
                    <TD><Link href={`/projects/${r.project.id}`} className="font-medium text-blue-700 hover:underline">{r.project.code}</Link></TD>
                    <TD>{r.project.client}</TD>
                    <TD className="text-right tabular">{formatCurrency(r.salesPrice)}</TD>
                    <TD className="text-right tabular">{formatCurrency(r.actualCost)}</TD>
                    <TD className="text-right tabular">{formatCurrency(r.projectedCost)}</TD>
                    <TD className={cn("text-right tabular", (profit ?? 0) < 0 ? "text-red-700" : "text-emerald-700")}>{profit === null ? "—" : formatCurrency(profit)}</TD>
                    <TD className={cn("text-right tabular", marginTone(margin, r.expectedMargin))}>
                      {formatPercent(margin)}
                      <span className="block text-xs text-slate-500">{closed ? "real final" : `esperada ${formatPercent(r.expectedMargin)}`}</span>
                    </TD>
                    <TD className={cn("text-right tabular", r.deviation > 0 ? "text-red-700" : "text-slate-600")}>
                      {r.deviation > 0 ? formatCurrency(r.deviation) : "Sin desvío"}
                      {r.deviationPct !== null && r.deviation > 0 && <span className="block text-xs">{formatNumber(r.deviationPct, 1)} %</span>}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
          {overview.causes.length > 0 && (
            <div className="rounded-md border border-slate-200 p-3">
              <h3 className="text-sm font-semibold text-slate-900">¿Por qué se pierde? (proyectos en curso)</h3>
              <ul className="mt-1 divide-y divide-slate-100 text-sm">
                {overview.causes.slice(0, 5).map((c) => (
                  <li key={c.key} className="flex flex-wrap justify-between gap-2 py-1.5">
                    <span className={cn(c.kind === "detected" && "text-amber-800")}>
                      {c.label} <span className="text-xs text-slate-500">· {c.projects.join(", ")}</span>
                    </span>
                    <strong className={cn("tabular", c.kind === "detected" ? "text-amber-700" : "text-slate-900")}>{formatCurrency(c.amount)}</strong>
                  </li>
                ))}
              </ul>
              {overview.detected > 0 && (
                <p className="mt-1 text-xs text-slate-500">
                  En naranja, desvíos detectados aún no proyectados ({formatCurrency(overview.detected)}): horas de más y facturas más caras que todavía no están en el costo proyectado. No se suman a ningún margen.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* 4. Costos reales */}
        <Card id="costos">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">Costos reales {projectId ? `· ${projects.find((p) => p.id === projectId)?.code}` : "· todos los proyectos"} <IndicatorTip id="actual_cost" /></CardTitle>
            <p className="text-sm text-slate-500">Presupuestado vs real por tipo. Lo comprado y no consumido no es costo.</p>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2.5 text-sm">
              {costs.filter((c) => c.budget > 0 || c.actual > 0).map((c) => {
                const max = Math.max(c.budget, c.actual, 1);
                const over = c.budget > 0 && c.actual > c.budget;
                return (
                  <li key={c.key} className={cn(c.label.startsWith("·") && "pl-4 text-slate-600")}>
                    <div className="flex flex-wrap justify-between gap-2">
                      <span>{c.label.replace(/^· /, "")}</span>
                      <span className="tabular text-slate-600">
                        {c.budget > 0 && <>{formatCurrency(c.budget)} → </>}
                        <strong className={over ? "text-red-700" : "text-slate-900"}>{formatCurrency(c.actual)}</strong>
                      </span>
                    </div>
                    {!c.label.startsWith("·") && (
                      <div className="mt-1 space-y-[2px]" aria-hidden>
                        {c.budget > 0 && <div className="h-1.5 rounded-full bg-slate-300" style={{ width: `${(c.budget / max) * 100}%` }} />}
                        <div className={cn("h-1.5 rounded-full", over ? "bg-red-500" : "bg-blue-700")} style={{ width: `${(c.actual / max) * 100}%` }} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-xs text-slate-500">Barra gris: presupuestado · barra de color: real hasta hoy.</p>
          </CardContent>
        </Card>

        {/* 5. Horas */}
        <Card id="horas">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">Horas presupuestadas vs reales <IndicatorTip id="hours_deviation" /></CardTitle>
            <p className="text-sm text-slate-500">Reales: cargadas en {period.label} (con las correcciones del Jefe de planta). Presupuestadas: total del proyecto.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <Choice<HoursGroup> name="Agrupar horas" value={hoursGroup} onChange={setHoursGroup} size="sm" options={[{ value: "project", label: "Proyecto" }, { value: "furniture", label: "Mueble" }, { value: "rubro", label: "Rubro" }]} />
            <Table>
              <THead>
                <TR>
                  <TH>{hoursGroup === "project" ? "Proyecto" : hoursGroup === "furniture" ? "Mueble" : "Rubro"}</TH>
                  <TH className="text-right">Presupuestadas</TH>
                  <TH className="text-right">Reales</TH>
                  <TH className="text-right">Desvío</TH>
                </TR>
              </THead>
              <TBody>
                {hRows.slice(0, 12).map((r) => (
                  <TR key={r.key}>
                    <TD className="max-w-56 truncate" title={r.label}>{r.label}</TD>
                    <TD className="text-right tabular">{hours(r.budget)}</TD>
                    <TD className="text-right tabular">{hours(r.actual)}</TD>
                    <TD className={cn("text-right tabular", r.deviation > 0 ? "text-red-700" : "text-slate-600")}>
                      {r.deviation > 0 ? "+" : ""}{hours(r.deviation)}{r.pct !== null && <span className="text-xs"> ({formatNumber(r.pct, 0)} %)</span>}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Link href="/horas" className="inline-flex items-center gap-1 text-sm text-blue-700 hover:underline">Ver todas las horas <ArrowRight className="size-4" /></Link>
          </CardContent>
        </Card>
      </div>

      {/* 6. Cotizaciones y carga futura */}
      <Card id="carga">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">Cotizaciones y carga futura <IndicatorTip id="load_potential" /> <OriginTag origin={oppInfo.origin} /></CardTitle>
          <p className="text-sm text-slate-500">Confirmada (aprobados), potencial (si se aprueban las cotizaciones) y ponderada (con la probabilidad informada) por separado.</p>
        </CardHeader>
        <CardContent className="space-y-5">
          <Table>
            <THead>
              <TR>
                <TH>Referencia</TH>
                <TH>Cliente</TH>
                <TH className="text-right">Importe cotizado</TH>
                <TH>Aprobación probable</TH>
                <TH>Inicio → entrega tentativos</TH>
                <TH className="text-right">Horas</TH>
                <TH>Negociación</TH>
                <TH className="text-right">Probabilidad</TH>
              </TR>
            </THead>
            <TBody>
              {opps.length === 0 && <TR><TD colSpan={8} className="text-slate-500">No hay cotizaciones abiertas.</TD></TR>}
              {opps.map((o) => (
                <TR key={o.id}>
                  <TD>{o.projectId ? <Link href={`/projects/${o.projectId}`} className="font-medium text-blue-700 hover:underline">{o.ref}</Link> : o.ref}<span className="block text-xs text-slate-500">{o.name}</span></TD>
                  <TD>{o.client}</TD>
                  <TD className="text-right tabular">{formatCurrency(o.amount)}</TD>
                  <TD className="tabular">{o.expectedApprovalDate ? formatDate(o.expectedApprovalDate) : "—"}</TD>
                  <TD className="tabular">{o.startDate ? `${formatDate(o.startDate)} → ${o.dueDate ? formatDate(o.dueDate) : "—"}` : "Sin fecha"}</TD>
                  <TD className="text-right tabular" title={Object.entries(o.hoursByRubro).map(([k, v]) => `${k}: ${v} h`).join(" · ")}>{hours(Object.values(o.hoursByRubro).reduce((s, x) => s + x, 0))}</TD>
                  <TD>{NEGOTIATION[o.negotiation]}</TD>
                  <TD className="text-right tabular">{o.probability === null ? <span className="text-slate-500">Sin estimar</span> : `${o.probability} %`}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">Carga por mes{rubro ? ` · ${rubro}` : " · todos los rubros"}</h3>
            <label className="text-xs font-medium text-slate-600">
              Rubro
              <Select className="mt-1 w-56" value={rubro} onChange={(e) => setRubro(e.target.value)}>
                <option value="">Todos</option>
                {rubros.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </Select>
            </label>
          </div>
          <ColumnChart
            title="Horas confirmadas y potenciales por mes, con la capacidad disponible"
            mode="stacked"
            series={[{ key: "confirmed", label: "Confirmadas", color: CHART_COLORS.real }, { key: "potential", label: "Potenciales", color: CHART_COLORS.planned }]}
            columns={loads.map(({ m, load }) => ({
              label: m.label,
              values: { confirmed: pick(load.confirmed), potential: pick(load.potential) },
              reference: capOf(m.from < today ? today : m.from, m.to),
            }))}
            referenceLabel="Capacidad"
            format={hours}
          />
          <p className="text-xs text-slate-500">
            Ponderada (con probabilidad informada): {hours(loads.reduce((s, { load }) => s + pick(load.weighted), 0))} en los próximos meses. Las cotizaciones sin probabilidad no suman a la ponderada.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-3">
        {/* 7. Capacidad y necesidades de personal */}
        <Card id="capacidad" className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">Capacidad y necesidades de personal <IndicatorTip id="capacity_gap" /></CardTitle>
            <p className="text-sm text-slate-500">
              De hoy al {formatDate(horizonTo)}. Capacidad: personal activo, cada persona una vez en su rubro principal (<Link href="/settings#capacidad" className="text-blue-700 hover:underline">Configuración</Link>).
            </p>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>Rubro</TH>
                  <TH className="text-right">Capacidad</TH>
                  <TH className="text-right">Confirmada</TH>
                  <TH className="text-right">Potencial</TH>
                  <TH className="text-right">Brecha</TH>
                  <TH>Situación</TH>
                </TR>
              </THead>
              <TBody>
                {capRows.map((r) => (
                  <TR key={r.rubro}>
                    <TD>{r.rubro}</TD>
                    <TD className="text-right tabular">{hours(r.capacity)}</TD>
                    <TD className="text-right tabular">{hours(r.confirmed)}</TD>
                    <TD className="text-right tabular">{hours(r.potential)}</TD>
                    <TD className={cn("text-right tabular", r.gapPotential > 0 ? "text-red-700" : "text-emerald-700")}>
                      {r.gapPotential > 0 ? `faltan ${hours(r.gapPotential)}` : `sobran ${hours(-r.gapPotential)}`}
                      {r.extraPeople > 0 && <span className="block text-xs text-slate-500">≈ {r.extraPeople} {r.extraPeople === 1 ? "persona" : "personas"} más (estimación)</span>}
                    </TD>
                    <TD>
                      <Badge tone={r.status === "over" ? "red" : r.status === "risk" ? "yellow" : "green"}>
                        {r.status === "over" ? "No entra lo confirmado" : r.status === "risk" ? "Entra si no se aprueba todo" : "Entra todo"}
                      </Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>

        {/* 8. Alertas gerenciales */}
        <Card id="alertas">
          <CardHeader>
            <CardTitle>Alertas</CardTitle>
          </CardHeader>
          <CardContent>
            {managerial.length === 0 ? (
              <p className="text-sm text-slate-500">Nada importante para revisar.</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {managerial.map((a) => (
                  <li key={a.key} className="py-2">
                    <a href={a.href} className="flex items-start gap-2 hover:text-blue-700">
                      <AlertTriangle className={cn("mt-0.5 size-4 shrink-0", a.level === "red" ? "text-red-600" : "text-amber-600")} aria-hidden />
                      <span>
                        <span className="font-medium text-slate-900">{a.title}</span>
                        <span className="block text-xs text-slate-500">{a.detail}</span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/alerts" className="mt-2 inline-flex items-center gap-1 text-sm text-blue-700 hover:underline">Ver todas las alertas <ArrowRight className="size-4" /></Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function addMonths(iso: string, n: number): string {
  const [y, m] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}
