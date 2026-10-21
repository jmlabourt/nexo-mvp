"use client";
// Gerencia → Dashboard. Más vacío que lleno: cuatro números, una lista corta de pendientes y el detalle plegado
// (facturación, rentabilidad, costos y horas, capacidad, alertas, cómo se calcula). Todo sale de funciones puras
// (lib/tablero.ts, lib/gerencia.ts) sobre los proyectos y los registros de la demo (lib/ledger.ts).
import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight } from "lucide-react";
import type { RubroCapacity } from "@/types";
import {
  capacityFromOperators,
  capacityRows,
  costRows,
  generalState,
  GENERAL_STATE_LABELS,
  hoursRows,
  loadByRubro,
  monthsBetween,
  opportunities,
  periodOf,
  type HoursGroup,
} from "@/lib/gerencia";
import { aggregateMargin, billingByOt, billingMonths, billingTotals, overdueSchedule, profitView } from "@/lib/tablero";
import { INDICATORS } from "@/lib/indicators";
import { profitOverview } from "@/lib/dashboard";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/formatting";
import { useAppStore } from "@/store/use-app-store";
import { useAlerts, useToday } from "@/store/selectors";
import { useManagementParams } from "@/store/session-data";
import { PageHeader } from "@/components/shared/page-header";
import { CircuitPending } from "@/components/shared/pending-list";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Choice } from "@/components/ui/choice";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { IndicatorTip, OriginTag } from "@/components/shared/data-origin";
import { cn } from "@/lib/utils";

const hours = (n: number) => `${formatNumber(n, 0)} h`;

function addMonths(iso: string, n: number): string {
  const [y, m] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}

function Kpi({ label, value, hint, ind, href, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; ind: string; href: string; tone?: "red" }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
        <a href={href} className="hover:text-blue-700 hover:underline">{label}</a>
        <IndicatorTip id={ind} />
      </div>
      <a href={href} className={cn("mt-1.5 block text-2xl font-semibold tabular tracking-tight", tone === "red" ? "text-red-700" : "text-slate-900")}>
        {value}
      </a>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

/** Sección plegable: el detalle está, pero no ocupa la pantalla. */
function Section({ id, title, ind, children, open = false, tag }: { id: string; title: string; ind?: string; children: React.ReactNode; open?: boolean; tag?: React.ReactNode }) {
  return (
    <details id={id} open={open} className="group rounded-lg border border-slate-200 bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-slate-800">
        <ArrowRight className="size-4 text-slate-400 transition-transform group-open:rotate-90" aria-hidden />
        {title}
        {ind && <IndicatorTip id={ind} />}
        {tag && <span className="ml-auto">{tag}</span>}
      </summary>
      <div className="border-t border-slate-100 p-4">{children}</div>
    </details>
  );
}

const money = (n: number | null | undefined) => (n === null || n === undefined ? "—" : formatCurrency(n));

export function GerenciaDashboard() {
  const today = useToday();
  const projects = useAppStore((s) => s.projects);
  const ledger = useAppStore((s) => s.ledger);
  const demoLocal = useAppStore((s) => s.demoLocal);
  const operators = useAppStore((s) => s.operators);
  const hoursPerDay = useAppStore((s) => s.costSettings.hoursPerDay);
  const params = useManagementParams();
  const { open } = useAlerts();

  const [ref, setRef] = useState(today.slice(0, 7));
  const [hoursGroup, setHoursGroup] = useState<HoursGroup>("project");
  const month = periodOf("month", `${ref}-01`);

  const sales = projects.filter((p) => generalState(p) !== "quotation");
  const otRows = useMemo(() => billingByOt(projects, ledger), [projects, ledger]);
  const totals = billingTotals(otRows);
  const months = useMemo(() => billingMonths(projects, ledger, addMonths(month.from, -3), periodOf("month", addMonths(month.from, 3)).to), [projects, ledger, month.from]);
  const thisMonth = months.find((m) => m.key === ref) ?? { planned: 0, invoiced: 0, collected: 0 };

  const profits = useMemo(() => sales.map((p) => ({ project: p, view: profitView(p, ledger) })), [sales, ledger]);
  const aggregate = aggregateMargin(profits.filter((x) => x.view.toDate.contract > 0).map((x) => ({ profit: x.view.toDate.profit, contract: x.view.toDate.contract })));
  const anyPartial = profits.some((x) => x.view.toDate.partial);
  const assignments = useAppStore((s) => s.assignments);
  const dueSoonDays = useAppStore((s) => s.settings.dueSoonDays);
  const severePoints = useAppStore((s) => s.settings.marginWarningPp);
  const overview = useMemo(() => profitOverview(projects, assignments, today, dueSoonDays, severePoints), [projects, assignments, today, dueSoonDays, severePoints]);

  // Capacidad de los próximos 3 meses: confirmado (aprobados y en proceso) y potencial (cotizaciones). Sin probabilidades.
  const capacities: RubroCapacity[] = useMemo(() => capacityFromOperators(operators, params.roleToRubro, hoursPerDay), [operators, params.roleToRubro, hoursPerDay]);
  const opps = useMemo(() => opportunities(projects, []), [projects]);
  const horizonTo = monthsBetween(today, addMonths(today, 2)).at(-1)!.to;
  const capRows = useMemo(() => capacityRows(capacities, loadByRubro(projects, opps, today, horizonTo, today), today, horizonTo), [capacities, projects, opps, today, horizonTo]);

  const overdue = overdueSchedule(projects, ledger, today);
  const alerts = [
    ...open
      .filter((a) => a.kind === "margin" || a.kind === "category" || a.kind === "due" || a.kind === "hours")
      .map((a) => ({ key: a.id, title: `${a.projectCode} · ${a.title}`, detail: a.action ?? a.message, href: `/projects/${a.projectId}`, red: a.level === "critical" })),
    ...overdue.map(({ project, amount }) => ({ key: `cob-${project.id}`, title: `${project.code} · cobro previsto vencido`, detail: `Faltan ${formatCurrency(amount)} de lo previsto a hoy.`, href: `/projects/${project.id}?tab=facturacion`, red: false })),
    ...capRows.filter((r) => r.status === "over").map((r) => ({ key: `cap-${r.rubro}`, title: `${r.rubro}: lo confirmado no entra`, detail: `${hours(r.confirmed)} confirmadas contra ${hours(r.capacity)} disponibles.`, href: "#capacidad", red: true })),
  ].slice(0, 5);

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle="Cuánto vendimos, facturamos y cobramos, cuánto ganamos y qué carga se viene." />
      <CircuitPending session="gerencia" />

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-slate-600">
          Mes
          <Input type="month" className="mt-1 w-40" value={ref} onChange={(e) => e.target.value && setRef(e.target.value)} />
        </label>
        {demoLocal ? <span className="text-xs text-slate-500">Datos de ejemplo</span> : <OriginTag origin="pending" />}
      </div>

      <section aria-label="Resumen" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label={`Facturado en ${month.label}`} value={formatCurrency(thisMonth.invoiced)} hint={`Previsto en el mes: ${formatCurrency(thisMonth.planned)}`} ind="billing_month" href="#facturacion" />
        <Kpi label={`Cobrado en ${month.label}`} value={formatCurrency(thisMonth.collected)} hint="Por fecha de ingreso." ind="collected" href="#facturacion" />
        <Kpi label="Pendiente de cobro" value={formatCurrency(totals.pendingToCollect)} hint={`De ${formatCurrency(totals.contracted)} contratados vigentes.`} ind="collected" href="#facturacion" />
        <Kpi
          label={anyPartial ? "Margen agregado hasta hoy (parcial)" : "Margen agregado"}
          value={formatPercent(aggregate.margin)}
          tone={(aggregate.margin ?? 0) < 0 ? "red" : undefined}
          hint={`Σ ganancias ${formatCurrency(aggregate.profit)} / Σ contratos.`}
          ind="margin_aggregate"
          href="#rentabilidad"
        />
      </section>

      {alerts.length > 0 && (
        <section aria-label="Pendientes" className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-slate-800">Para mirar hoy</h2>
          <ul className="space-y-2">
            {alerts.map((a) => (
              <li key={a.key} className="flex items-start gap-2 text-sm">
                <AlertTriangle className={cn("mt-0.5 size-4 shrink-0", a.red ? "text-red-600" : "text-amber-600")} aria-hidden />
                <span className="flex-1">
                  <Link href={a.href} className="font-medium text-slate-800 hover:underline">{a.title}</Link>
                  <span className="block text-xs text-slate-500">{a.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Section id="facturacion" title="Facturación y cobros" ind="billing_project">
        <div className="space-y-4">
          <Table>
            <THead>
              <TR>
                <TH>Mes</TH>
                <TH className="text-right">Previsto</TH>
                <TH className="text-right">Facturado</TH>
                <TH className="text-right">Cobrado</TH>
              </TR>
            </THead>
            <TBody>
              {months.map((m) => (
                <TR key={m.key} className={m.key === ref ? "bg-slate-50 font-medium" : undefined}>
                  <TD>{m.label}</TD>
                  <TD className="text-right tabular">{formatCurrency(m.planned)}</TD>
                  <TD className="text-right tabular">{formatCurrency(m.invoiced)}</TD>
                  <TD className="text-right tabular">{formatCurrency(m.collected)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <Table>
            <THead>
              <TR>
                <TH>OT</TH>
                <TH className="text-right">Contrato vigente</TH>
                <TH className="text-right">Previsto</TH>
                <TH className="text-right">Facturado</TH>
                <TH className="text-right">Cobrado</TH>
                <TH className="text-right">Pendiente de cobro</TH>
              </TR>
            </THead>
            <TBody>
              {otRows.map((r) => (
                <TR key={r.project.id}>
                  <TD>
                    <Link href={`/projects/${r.project.id}?tab=facturacion`} className="font-medium hover:underline">{r.project.code}</Link>
                    <span className="block text-xs text-slate-500">{r.project.name}</span>
                    {r.overInvoiced > 0 && <Badge tone="yellow">Facturado de más: {formatCurrency(r.overInvoiced)}</Badge>}
                  </TD>
                  <TD className="text-right tabular">{formatCurrency(r.contracted)}</TD>
                  <TD className="text-right tabular">{formatCurrency(r.planned)}</TD>
                  <TD className="text-right tabular">{formatCurrency(r.invoiced)}</TD>
                  <TD className="text-right tabular">{formatCurrency(r.collected)}</TD>
                  <TD className="text-right tabular">{formatCurrency(r.pendingToCollect)}</TD>
                </TR>
              ))}
              <TR className="font-semibold">
                <TD>Total</TD>
                <TD className="text-right tabular">{formatCurrency(totals.contracted)}</TD>
                <TD className="text-right tabular">{formatCurrency(totals.planned)}</TD>
                <TD className="text-right tabular">{formatCurrency(totals.invoiced)}</TD>
                <TD className="text-right tabular">{formatCurrency(totals.collected)}</TD>
                <TD className="text-right tabular">{formatCurrency(totals.pendingToCollect)}</TD>
              </TR>
            </TBody>
          </Table>
        </div>
      </Section>

      <Section id="rentabilidad" title="Rentabilidad por proyecto" ind="profit_views">
        <Table>
          <THead>
            <TR>
              <TH>Proyecto</TH>
              <TH className="text-right">Presupuestada</TH>
              <TH className="text-right">Hasta hoy</TH>
              <TH className="text-right">Final</TH>
            </TR>
          </THead>
          <TBody>
            {profits.map(({ project, view }) => (
              <TR key={project.id}>
                <TD>
                  <Link href={`/projects/${project.id}`} className="font-medium hover:underline">{project.code}</Link>
                  <span className="block text-xs text-slate-500">{GENERAL_STATE_LABELS[generalState(project)]}</span>
                </TD>
                <TD className="text-right tabular">
                  {view.budgeted ? (
                    <>
                      {formatPercent(view.budgeted.margin)}
                      <span className="block text-xs text-slate-500">{money(view.budgeted.profit)}</span>
                    </>
                  ) : (
                    <span className="text-xs text-slate-500">No calculable</span>
                  )}
                </TD>
                <TD className="text-right tabular">
                  {formatPercent(view.toDate.margin)}
                  <span className="block text-xs text-slate-500">
                    {money(view.toDate.profit)}
                    {view.toDate.partial && " · PARCIAL"}
                  </span>
                </TD>
                <TD className="text-right tabular">
                  {view.final ? (
                    <>
                      {formatPercent(view.final.margin)}
                      <span className="block text-xs text-slate-500">{money(view.final.profit)}</span>
                    </>
                  ) : (
                    <span className="text-xs text-slate-500" title={view.finalReason ?? undefined}>No calculable</span>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {overview.causes.length > 0 && (
          <div className="mt-4 rounded-md border border-slate-200 p-3">
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
          </div>
        )}
        <p className="mt-2 text-xs text-slate-500">
          Hasta hoy = contrato vigente − costo real cargado: es parcial mientras falten costos. La final aparece al cerrar el proyecto sin costos pendientes.
        </p>
      </Section>

      <Section id="costos" title="Costos y horas" ind="actual_cost">
        <div className="space-y-4">
          <Table>
            <THead>
              <TR>
                <TH>Costo</TH>
                <TH className="text-right">Presupuestado</TH>
                <TH className="text-right">Real cargado</TH>
              </TR>
            </THead>
            <TBody>
              {costRows(sales).map((r) => (
                <TR key={r.key}>
                  <TD className={r.label.startsWith("·") ? "pl-6 text-slate-500" : undefined}>{r.label.replace(/^· /, "")}</TD>
                  <TD className="text-right tabular">{r.budget ? formatCurrency(r.budget) : "—"}</TD>
                  <TD className="text-right tabular">{formatCurrency(r.actual)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <Choice<HoursGroup>
            name="Horas por"
            value={hoursGroup}
            onChange={setHoursGroup}
            size="sm"
            options={[
              { value: "project", label: "Proyecto" },
              { value: "furniture", label: "Mueble" },
              { value: "rubro", label: "Rubro" },
            ]}
          />
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
              {hoursRows(sales, hoursGroup)
                .filter((r) => r.budget > 0 || r.actual > 0)
                .map((r) => (
                  <TR key={r.key}>
                    <TD>{r.label}</TD>
                    <TD className="text-right tabular">{hours(r.budget)}</TD>
                    <TD className="text-right tabular">{hours(r.actual)}</TD>
                    <TD className={cn("text-right tabular", r.deviation > 0 && "text-red-700")}>{r.deviation > 0 ? "+" : ""}{hours(r.deviation)}</TD>
                  </TR>
                ))}
            </TBody>
          </Table>
        </div>
      </Section>

      <Section id="capacidad" title="Capacidad (próximos 3 meses)" ind="capacity">
        <Table>
          <THead>
            <TR>
              <TH>Rubro</TH>
              <TH className="text-right">Disponible</TH>
              <TH className="text-right">CONFIRMADO</TH>
              <TH className="text-right">POTENCIAL</TH>
              <TH>Estado</TH>
            </TR>
          </THead>
          <TBody>
            {capRows.map((r) => (
              <TR key={r.rubro}>
                <TD>{r.rubro}</TD>
                <TD className="text-right tabular">{hours(r.capacity)}</TD>
                <TD className="text-right tabular">{hours(r.confirmed)}</TD>
                <TD className="text-right tabular">{hours(r.potential)}</TD>
                <TD>
                  <Badge tone={r.status === "over" ? "red" : r.status === "risk" ? "yellow" : "green"}>
                    {r.status === "over" ? "No entra lo confirmado" : r.status === "risk" ? "Entra lo confirmado" : "Entra todo"}
                  </Badge>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        <p className="mt-2 text-xs text-slate-500">
          Confirmado: lo que falta de los proyectos aprobados y en proceso. Potencial: las cotizaciones abiertas, si se aprobaran todas (sin probabilidades).
          Las horas se reparten entre hoy y la entrega: es una distribución estimada. Cada persona cuenta una sola vez, en su rubro principal.
        </p>
      </Section>

      <Section id="calculo" title="Cómo se calcula">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          {INDICATORS.filter((i) => ["contract_current", "billing_month", "collected", "profit_views", "margin_aggregate", "capacity", "financial_cost"].includes(i.id)).map((i) => (
            <div key={i.id}>
              <dt className="font-medium text-slate-800">{i.name}</dt>
              <dd className="text-xs text-slate-600">{i.formula}</dd>
              <dd className="text-xs text-slate-500">{i.limits}</dd>
            </div>
          ))}
        </dl>
      </Section>
    </div>
  );
}
