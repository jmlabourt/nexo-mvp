"use client";
import { CapacityOverview } from "@/components/plant/capacity-overview";
import { rubroLabel } from "@/lib/rubros";
import { DASHBOARD_CALCULATIONS } from "@/lib/dashboard-indicators";
import { cashInPeriod } from "@/lib/post-meeting";
// Gerencia → Dashboard. Más vacío que lleno: cuatro números, una lista corta de pendientes y el detalle plegado
// (facturación, rentabilidad, costos y horas, capacidad, alertas, cómo se calcula). Todo sale de funciones puras
// (lib/tablero.ts, lib/gerencia.ts) sobre los proyectos y los registros de la demo (lib/ledger.ts).
import { ProductionDeviations } from "./production-deviations";
import { ExternalWorkSection } from "@/components/plant/external-work";
import { approvalDate, pendingDemandEstimates, weeklyCapacity, withExternalHours,externalCost } from "@/lib/frontend-work";
import { currentContract } from "@/lib/ledger";
import { inPeriod } from "@/lib/gerencia";
import { addDays } from "@/lib/plant";
import Link from "next/link";
import { useEffect,useRef,useMemo, useState } from "react";
import { AlertTriangle, ArrowRight } from "lucide-react";
import {
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
import { economicView, collectionsReport, ledgerAtDate, financialCostInPeriod, aggregateMargin, billingByOt, billingMonths, billingTotals, overdueSchedule, profitView } from "@/lib/tablero";
import { prioritizeDashboardNotices, profitOverview } from "@/lib/dashboard";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/formatting";
import { useConfiguredOperators } from "@/store/selectors";
import { useAppStore } from "@/store/use-app-store";
import { useAlerts, useToday } from "@/store/selectors";
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

function openDashboardAnchor(href:string){
 if(!href.startsWith("#"))return;const target=document.getElementById(href.slice(1));for(let el:HTMLElement|null=target;el;el=el.parentElement)if(el instanceof HTMLDetailsElement)el.open=true;
}

function Kpi({ label, value, hint, ind, href, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; ind: string; href: string; tone?: "red" }) {
  return (
    <div data-indicator={ind} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
        <a href={href} onClick={()=>openDashboardAnchor(href)} className="hover:text-blue-700 hover:underline">{label}</a>
        <IndicatorTip id={ind} />
      </div>
      <a href={href} onClick={()=>openDashboardAnchor(href)} className={cn("mt-1.5 block text-2xl font-semibold tabular tracking-tight", tone === "red" ? "text-red-700" : "text-slate-900")}>
        {value}
      </a>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

/** Sección plegable: el detalle está, pero no ocupa la pantalla. */
function Section({ id, title, ind, children, open = true, tag }: { id: string; title: string; ind?: string; children: React.ReactNode; open?: boolean; tag?: React.ReactNode }) {
  const ref=useRef<HTMLDetailsElement>(null);const [expanded,setExpanded]=useState(open);
  useEffect(()=>{const sync=()=>{if(window.location.hash===`#${id}`){setExpanded(true);const scroll=()=>ref.current?.scrollIntoView?.({block:"start"});if(typeof window.requestAnimationFrame==="function")window.requestAnimationFrame(scroll);else window.setTimeout(scroll,0);}};sync();window.addEventListener("hashchange",sync);return ()=>window.removeEventListener("hashchange",sync);},[id]);
  return (
    <details data-indicators={(DASHBOARD_CALCULATIONS[id]??(ind?[ind]:[])).join(" ")} ref={ref} id={id} open={expanded} onToggle={e=>setExpanded(e.currentTarget.open)} className="group scroll-mt-20 rounded-lg border border-slate-200 bg-white shadow-sm">
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
  const ledgerReady = useAppStore((s) => s.ledgerReady);
  const operators = useConfiguredOperators();
  const hoursPerDay = useAppStore((s) => s.costSettings.hoursPerDay);
  const { open } = useAlerts();

  const [range, setRange] = useState(() => periodOf("month", today));
  const month = range;
  const cutoff = month.to > today ? today : month.to;
  const cutoffLedger = useMemo(() => ledgerAtDate(ledger, cutoff), [ledger, cutoff]);
  const [profitTable,setProfitTable] = useState(true);
  const [hoursGroup, setHoursGroup] = useState<HoursGroup>("project");

  const approved = projects.filter((p) => p.status !== "quotation" && inPeriod(approvalDate(p),month) && approvalDate(p)!<=cutoff);
  const collectionReport=collectionsReport(projects,ledger,month.from,cutoff);
  const collections=collectionReport.collections;
  const exceptions = useAppStore((s) => s.dayExceptions);
  const sales = projects.filter((p) => generalState(p) !== "quotation" && (!approvalDate(p) || approvalDate(p)! <= cutoff));
  const salesAtCut=sales.map(p=>({...p,actualEntries:p.actualEntries.filter(e=>e.date<=cutoff),materialUsages:p.materialUsages.filter(u=>u.date<=cutoff)}));
  const otRows = billingByOt(sales, cutoffLedger);
  const totals = billingTotals(otRows);
  const months = billingMonths(projects,{ ...ledger,collections:ledger.collections.filter((r) => inPeriod(r.date,month) && r.date<=cutoff),salesInvoices:ledger.salesInvoices.filter((r) => inPeriod(r.date,month) && r.date<=cutoff),paymentTerms:ledger.paymentTerms.map((t) => ({ ...t,schedule:t.schedule.filter((r) => inPeriod(r.date,month)) })) },month.from,month.to);

  const profits = sales.map((p) => ({ project: p, view: profitView(p, ledger,cutoff) }));
  const aggregate = aggregateMargin(profits.filter((x) => x.view.toDate.contract > 0).map((x) => ({ profit: x.view.toDate.profit, contract: x.view.toDate.contract })));
  const cash=cashInPeriod(ledger,month.from,cutoff);
  const anyPartial = profits.some((x) => x.view.toDate.partial);
  const periodCostRows = costRows(sales.map((p) => ({ ...p, actualEntries:p.actualEntries.filter((e) => inPeriod(e.date,{from:month.from,to:cutoff})),materialUsages:p.materialUsages.filter((u) => inPeriod(u.date,{from:month.from,to:cutoff})) })));
  const periodCostSubtotal = periodCostRows.filter((r) => ["waste","other"].includes(r.key)).reduce((s,r) => s+r.actual,0) + financialCostInPeriod(sales,ledger,month.from,month.to > today ? today : month.to);
  const assignments = useAppStore((s) => s.assignments);
  const dueSoonDays = useAppStore((s) => s.settings.dueSoonDays);
  const severePoints = useAppStore((s) => s.settings.marginWarningPp);
  const overview = useMemo(() => profitOverview(projects, assignments, today, dueSoonDays, severePoints,p=>economicView(p,ledger,today).econ), [projects, assignments, today, dueSoonDays, severePoints,ledger]);

  // Capacidad de los próximos 3 meses: confirmado (aprobados y en proceso) y potencial (cotizaciones). Sin probabilidades.
  const opps = useMemo(() => opportunities(projects, []), [projects]);
  const horizonTo = monthsBetween(today, addMonths(today, 2)).at(-1)!.to;
  const capRows = useMemo(() => {
    const load = loadByRubro(projects, opps, today, horizonTo, today);
    return ledger.rubroCatalog.filter((r) => r.active).map((r) => {
      const shared = weeklyCapacity(withExternalHours(projects,ledger),operators,assignments,exceptions,today,horizonTo,today,hoursPerDay,r.id as never,ledger);
      const potential = load.potential[rubroLabel(r.id as never)] ?? 0;
      return { rubro:r.name, capacity:shared.available, confirmed:shared.needed, potential, pendingConfiguration:shared.pendingConfiguration,
        status:shared.needed > shared.available ? "over" as const : shared.needed + potential > shared.available ? "risk" as const : "ok" as const };
    });
  }, [projects, opps, today, horizonTo, ledger, operators, assignments, exceptions, hoursPerDay]);
  const pendingDemand = pendingDemandEstimates(withExternalHours(projects,ledger),today);

  const overdue = overdueSchedule(projects, ledger, today);
  const alerts = prioritizeDashboardNotices([
    ...open
      .filter((a) => a.kind === "margin" || a.kind === "category" || a.kind === "due" || a.kind === "hours")
      .map((a) => ({ key: a.id, title: `${a.projectCode} · ${a.title}`, detail: a.action ?? a.message, href: `/projects/${a.projectId}`, level:a.level,impactAmount:a.impactAmount,red: a.level === "critical" })),
    ...overdue.map(({ project, amount }) => ({ key: `cob-${project.id}`, title: `${project.code} · cobro previsto vencido`, detail: `Faltan ${formatCurrency(amount)} de lo previsto a hoy.`, href: `/projects/${project.id}?tab=billing`,level:"warning" as const,impactAmount:amount, red: false })),
    ...capRows.filter((r) => !r.pendingConfiguration && r.status === "over").map((r) => ({ key: `cap-${r.rubro}`, title: `${r.rubro}: lo confirmado no entra`, detail: `${hours(r.confirmed)} confirmadas contra ${hours(r.capacity)} disponibles.`, href: "#capacidad",level:"critical" as const, red: true })),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle="Cuánto vendimos, facturamos y cobramos, cuánto ganamos y qué carga se viene." />
      <div data-indicators="circuit_pending"><CircuitPending session="gerencia" /></div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-slate-600">Desde<Input type="date" className="mt-1 w-40" value={range.from} max={range.to} onChange={(e) => e.target.value && setRange(periodOf("custom",today,{ from:e.target.value,to:range.to }))} /></label>
        <label className="text-xs font-medium text-slate-600">Hasta<Input type="date" className="mt-1 w-40" value={range.to} min={range.from} onChange={(e) => e.target.value && setRange(periodOf("custom",today,{ from:range.from,to:e.target.value }))} /></label>
        <div className="flex flex-wrap gap-2">{[
          { label:"Este mes",period:periodOf("month",today) },
          { label:"Mes anterior",period:periodOf("month",addMonths(today,-1)) },
          { label:"Últimos 90 días",period:periodOf("custom",today,{ from:addDays(today,-89),to:today }) },
          { label:"Trimestre",period:periodOf("quarter",today) },
          { label:"Año",period:periodOf("year",today) },
        ].map((p) => <button key={p.label} type="button" aria-pressed={range.from === p.period.from && range.to === p.period.to} className={cn("rounded-full border px-3 py-1 text-xs",range.from === p.period.from && range.to === p.period.to ? "border-blue-600 bg-blue-50 text-blue-800" : "border-slate-200 text-slate-600")} onClick={() => setRange(p.period)}>{p.label}</button>)}</div>
        {demoLocal ? <span className="text-xs text-slate-500">Datos de ejemplo</span> : !ledgerReady && <OriginTag origin="pending" />}
      </div>

      <section data-indicators={DASHBOARD_CALCULATIONS.resumen.join(" ")} aria-label="Resumen" className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-5">
        <Kpi label={anyPartial?"Ganancia económica acumulada (parcial)":"Ganancia económica acumulada"} value={formatCurrency(aggregate.profit)} hint={`Al ${cutoff} · todos los proyectos aprobados al corte. Margen ${formatPercent(aggregate.margin)}.`} ind="profit_views" href="#rentabilidad"/>

        <Kpi label="Proyectos aprobados" value={formatCurrency(approved.reduce((s,p) => s+(p.baseline?.salesPrice ?? currentContract(p,cutoffLedger)),0))} hint={`${approved.length} proyectos · aprobaciones de ${month.label}`} ind="approved_period" href="#aprobaciones" />
        <Kpi label="Dinero cobrado" value={formatCurrency(collections.reduce((s,c) => s+c.amount,0))} hint={`Por fecha de ingreso · ${month.label}`} ind="collected" href="#cobros-proyecto" />
        <Kpi label="Pendiente de cobro" value={formatCurrency(totals.pendingToCollect)} hint={`Saldo contractual al ${cutoff}, facturado o no · de ${formatCurrency(totals.contracted)} acordados.`} ind="contract_balance" href="#facturacion" />
        <Kpi
          label={anyPartial ? "Rentabilidad total al corte (parcial)" : "Rentabilidad total"}
          value={formatPercent(aggregate.margin)}
          tone={(aggregate.margin ?? 0) < 0 ? "red" : undefined}
          hint={`Al ${cutoff}: Σ ganancias ${formatCurrency(aggregate.profit)} / Σ contratos.`}
          ind="margin_aggregate"
          href="#rentabilidad"
        />
      </section>

      {alerts.length > 0 && (
        <section data-indicators={DASHBOARD_CALCULATIONS.pendientes.join(" ")} aria-label="Pendientes" className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
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

      <Section id="aprobaciones" title="Proyectos aprobados en el período">
        <p>Aprobaciones entre {month.from} y {cutoff}; esta cohorte es diferente de la ganancia acumulada al corte.</p><Table><THead><TR><TH>Proyecto</TH><TH>Fecha de aprobación</TH><TH>Importe aprobado</TH></TR></THead><TBody>{approved.map(p=><TR key={p.id}><TD><Link href={`/projects/${p.id}`}>{p.code}</Link></TD><TD>{approvalDate(p)}</TD><TD>{formatCurrency(p.baseline?.salesPrice??currentContract(p,cutoffLedger))}</TD></TR>)}<TR><TD>Total</TD><TD/><TD>{formatCurrency(approved.reduce((s,p)=>s+(p.baseline?.salesPrice??currentContract(p,cutoffLedger)),0))}</TD></TR></TBody></Table>
      </Section>
      <Section id="cobros-proyecto" title="Dinero cobrado por proyecto" open>
        <p className="mb-2 text-xs">Cobros efectivos entre {month.from} y {cutoff}; ganancia económica acumulada al {cutoff}. Incluye proyectos con cobros en el rango aunque su aprobación sea posterior al corte. En esos casos no se calcula ganancia al corte. Son métricas separadas.</p>
        <Table><THead><TR><TH>Proyecto</TH><TH>Cliente</TH><TH>Cobrado en el rango</TH><TH>Ganancia económica acumulada al {cutoff}</TH></TR></THead><TBody>{collectionReport.rows.map(({project:p,view,collected})=><TR key={p.id}><TD><Link href={`/projects/${p.id}?tab=billing`}>{p.code}</Link></TD><TD>{p.client}</TD><TD>{formatCurrency(collected)}</TD><TD>{view?<>{formatCurrency(view.toDate.profit)} · {view.toDate.partial?"parcial":"final"}</>:"— · Sin aprobación registrada al corte; ganancia no calculable"}</TD></TR>)}<TR className="font-semibold"><TD>Total</TD><TD/><TD>{formatCurrency(collections.reduce((s,c)=>s+c.amount,0))}</TD><TD>{formatCurrency(aggregate.profit)}</TD></TR></TBody></Table>
      </Section>
      <Section id="caja" title="Resultado de caja registrado del período" open><p>{month.from} al {cutoff}: cobros efectivos {formatCurrency(cash.collected)} − pagos efectivos registrados {formatCurrency(cash.paid)} = <strong>{formatCurrency(cash.result)}</strong>.</p><p className="text-xs">Solo movimientos de cobros y pagos registrados en Blerp, por fecha efectiva. Solicitudes y e-cheqs emitidos no son débitos. Los costos generales de Configuración son informativos y no están asignados a proyectos ni acreditan pagos; tampoco hay pagos salariales capturados. No representa dinero en el banco ni una caja completa si faltan movimientos.</p></Section>
      <p className="text-xs text-slate-500">Desvíos acumulados hasta el {cutoff}; referencia cotizada completa. Las fechas del filtro seleccionan cobros y aprobaciones; saldos y rentabilidad se calculan al corte.</p>
      <ProductionDeviations projects={sales.map((p) => ({ ...p,actualEntries:p.actualEntries.filter((e) => e.date <= cutoff),materialUsages:p.materialUsages.filter((u) => u.date <= cutoff) }))} ledger={cutoffLedger} />
      <div data-indicators="external_work"><p className="text-xs text-slate-500">Trabajos externos: estado operativo a hoy, independiente de Desde/Hasta.</p><ExternalWorkSection /></div>
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
                <TR key={m.key} className={m.key === month.from.slice(0,7) ? "bg-slate-50 font-medium" : undefined}>
                  <TD>{m.label}</TD>
                  <TD className="text-right tabular">{formatCurrency(m.planned)}</TD>
                  <TD className="text-right tabular">{formatCurrency(m.invoiced)}</TD>
                  <TD className="text-right tabular">{formatCurrency(m.collected)}</TD>
                </TR>
              ))}
              <TR className="font-semibold"><TD>Total</TD>{["planned","invoiced","collected"].map((key) => <TD key={key} className="text-right tabular">{formatCurrency(months.reduce((sum,row) => sum+row[key as "planned"],0))}</TD>)}</TR>
            </TBody>
          </Table>
          <Table>
            <THead>
              <TR>
                <TH>Proyecto</TH>
                <TH className="text-right">Previsto</TH>
                <TH className="text-right">Facturado</TH>
                <TH className="text-right">Cobrado</TH>
                <TH className="text-right">Pendiente contractual de cobro</TH>
              </TR>
            </THead>
            <TBody>
              {otRows.map((r) => (
                <TR key={r.project.id}>
                  <TD>
                    <Link href={`/projects/${r.project.id}?tab=billing`} className="font-medium hover:underline">{r.project.code}</Link>
                    <span className="block text-xs text-slate-500">{r.project.name}</span>
                    {r.overInvoiced > 0 && <Badge tone="yellow">Facturado de más: {formatCurrency(r.overInvoiced)}</Badge>}
                  </TD>
                  <TD className="text-right tabular">{formatCurrency(r.planned)}</TD>
                  <TD className="text-right tabular">{formatCurrency(r.invoiced)}</TD>
                  <TD className="text-right tabular">{formatCurrency(r.collected)}</TD>
                  <TD className="text-right tabular">{formatCurrency(r.pendingToCollect)}</TD>
                </TR>
              ))}
              <TR className="font-semibold">
                <TD>Total</TD>
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
        <p>Ganancia económica acumulada al {cutoff}: <strong>{formatCurrency(aggregate.profit)}</strong>. Todos los proyectos aprobados al corte, aunque no se hayan aprobado ni cobrado dentro del rango. No es ganancia del mes ni caja.</p>
        <button type="button" className="mb-3 text-xs text-blue-700" onClick={() => setProfitTable(!profitTable)}>{profitTable ? "Ver gráfico" : "Ver como tabla"}</button>
        {!profitTable ? <div className="mb-4 space-y-3" role="img" aria-label="Rentabilidad estimada y real registrada por proyecto, parcial mientras esté abierto">
          {profits.map(({ project,view }) => <div key={project.id} className="text-xs"><Link href={`/projects/${project.id}`} className="font-medium text-blue-700">{project.code}</Link>{[{ label:"Estimada aprobada",value:view.budgeted?.margin },{ label:view.toDate.partial ? "Hasta hoy (parcial)" : "Real final",value:view.toDate.margin }].map((r) => <div key={r.label} className="mt-1 flex items-center gap-2"><span className="w-36 shrink-0">{r.label}</span><div className="w-full max-w-72 h-2 bg-slate-100 rounded"><div className={r.value != null && r.value < 0 ? "bg-red-500 h-2 rounded" : r.label === "Estimada aprobada" ? "bg-blue-300 h-2 rounded" : "bg-blue-700 h-2 rounded"} style={{ width:`${Math.min(100,Math.abs(r.value ?? 0))}%` }} /></div><span>{r.value == null ? "Sin base" : formatPercent(r.value)}</span></div>)}</div>)}
        </div> : <Table>
          <THead>
            <TR>
              <TH>Proyecto</TH>
              <TH className="text-right">Presupuestada</TH>
              <TH className="text-right">Ganancia y margen al {cutoff}</TH>
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
            <TR className="font-semibold"><TD>Total al {cutoff}</TD><TD/><TD>{formatCurrency(aggregate.profit)} · {formatPercent(aggregate.margin)}</TD><TD/></TR>
          </TBody>
        </Table>}
        {overview.causes.length > 0 && (
          <div className="mt-4 rounded-md border border-slate-200 p-3">
            <h3 className="text-sm font-semibold text-slate-900">¿Por qué se pierde? (proyectos en curso)</h3><p className="text-xs">Situación operativa a hoy; este listado no se recorta por Desde/Hasta.</p>
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
        <p className="mb-3 text-sm font-medium">Subtotal del período (desperdicios + otros gastos directos + costo financiero): {formatCurrency(periodCostSubtotal)}</p>
        <div className="space-y-4">
          <p className="text-xs text-slate-500">Detalle acumulado al {cutoff}. El subtotal anterior corresponde al período seleccionado. Las subfilas de rubros desglosan mano de obra y no se suman nuevamente.</p>
          <Table>
            <THead>
              <TR>
                <TH>Costo</TH>
                <TH className="text-right">Presupuestado</TH>
                <TH className="text-right">Real cargado</TH>
              </TR>
            </THead>
            <TBody>
              {[...costRows(salesAtCut,cutoffLedger).map(r=>r.key==="financial"?{...r,actual:sales.reduce((sum,p)=>sum+economicView(p,ledger,cutoff).financialCost,0)}:r),{ key:"external",label:"Externos y tercerizaciones realizados (confirmados y estimados; pendientes señalados arriba)",budget:0,actual:sales.reduce((s,p)=>s+externalCost(cutoffLedger,p.id),0) }].map((r) => (
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
              {hoursRows(salesAtCut, hoursGroup)
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

      {pendingDemand.length > 0 && <p role="status" className="text-sm text-amber-800">Demanda pendiente de confirmar: {pendingDemand.map((r) => `${r.projectCode} · ${r.rubro}`).join(", ")}. Las horas cotizadas están agotadas y quedan muebles por terminar.</p>}
      <div data-indicators={DASHBOARD_CALCULATIONS.capacidad.join(" ")} id="capacidad"><CapacityOverview/></div>


    </div>
  );
}
