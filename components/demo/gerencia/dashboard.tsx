"use client";
// Gerencia → Dashboard (modo demostración). Un filtro Desde/Hasta para todo; 4 tarjetas, 3 gráficos, capacidad,
// desvíos, costos y alertas. Cada número sale de lib/core (y su cálculo está en Configuración → Indicadores y cálculos).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { gerenciaAlerts } from "@/lib/core/alerts";
import { capacityRows } from "@/lib/core/capacity";
import { collectedByProject, collectionSeries, costIndicators, dashboardCards, hoursDeviations, marginComparison, materialDeviations, activeInPeriod, periodFor, type Period, type PeriodShortcut } from "@/lib/core/dashboard";
import { itemName, materialName, materialUnit, rubroName } from "@/lib/core/lookup";
import { PageHeader } from "@/components/shared/page-header";
import { Stat } from "@/components/shared/stat";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { AlertList, day, money, num, OtLink, pct, Section, useCore, useDemoToday } from "../kit";
import { CompareChart, HBarChart, LineChart } from "../charts";

const SHORTCUTS: Array<{ key: PeriodShortcut; label: string }> = [
  { key: "month", label: "Este mes" },
  { key: "prev_month", label: "Mes anterior" },
  { key: "quarter", label: "Trimestre" },
  { key: "last90", label: "Últimos 90 días" },
  { key: "year", label: "Año" },
];

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function GerenciaDashboardDemo() {
  const w = useCore();
  const today = useDemoToday();
  const router = useRouter();
  const [period, setPeriod] = useState<Period>(() => periodFor("last90", today));
  const [shortcut, setShortcut] = useState<PeriodShortcut | null>("last90");
  const valid = period.from <= period.to;

  const data = useMemo(() => {
    if (!valid) return null;
    const cards = dashboardCards(w, period, today);
    const byProject = collectedByProject(w, period);
    const compare = marginComparison(w, period, today);
    const series = collectionSeries(w, period);
    const active = activeInPeriod(w, period, today);
    const capacity = capacityRows(w, period.from, period.to, today);
    const costs = costIndicators(w, period, today);
    const hours = hoursDeviations(w, active).filter((d) => d.budget > 0 || d.real > 0);
    const mats = materialDeviations(w, active).filter((d) => d.quoted > 0 || d.real > 0);
    return { cards, byProject, compare, series, capacity, costs, hours, mats };
  }, [w, period, today, valid]);
  const alerts = useMemo(() => gerenciaAlerts(w, today), [w, today]);

  const ot = (id: string) => w.projects.find((p) => p.id === id)?.ot ?? id;
  const go = (id: string) => router.push(`/projects/${id}`);

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" />
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Desde
          <Input type="date" value={period.from} onChange={(e) => { setShortcut(null); setPeriod({ ...period, from: e.target.value }); }} className="w-40" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Hasta
          <Input type="date" value={period.to} onChange={(e) => { setShortcut(null); setPeriod({ ...period, to: e.target.value }); }} className="w-40" />
        </label>
        <div className="flex flex-wrap gap-1">
          {SHORTCUTS.map((s) => (
            <Button key={s.key} size="sm" variant={shortcut === s.key ? "default" : "outline"} onClick={() => { setShortcut(s.key); setPeriod(periodFor(s.key, today)); }}>
              {s.label}
            </Button>
          ))}
        </div>
        {data && <span className="ml-auto text-xs text-slate-500">Fecha de corte: {day(data.cards.cutoff)}</span>}
      </div>
      {!valid || !data ? (
        <p role="alert" className="text-sm text-red-600">
          La fecha Desde no puede ser posterior a Hasta.
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Dinero cobrado" value={money(data.cards.collected)} hint={<Link className="hover:underline" href="/settings?s=indicadores#ind-cobrado">Ver cálculo</Link>} />
            <Stat label="Pendiente de cobrar" value={money(data.cards.pending)} hint={<Link className="hover:underline" href="/settings?s=indicadores#ind-pendiente">Saldo al {day(data.cards.cutoff)} · ver cálculo</Link>} />
            <Stat
              label="Rentabilidad total"
              value={data.cards.margin.marginPct === null ? "Sin OTs cerradas" : pct(data.cards.margin.marginPct)}
              hint={
                <Link className="hover:underline" href="/settings?s=indicadores#ind-rentabilidad">
                  {data.cards.margin.projectIds.length} OT cerrada{data.cards.margin.projectIds.length === 1 ? "" : "s"} en el período
                  {data.cards.margin.incompleteIds.length ? ` · ${data.cards.margin.incompleteIds.length} con información incompleta` : ""}
                </Link>
              }
            />
            <Stat label="Ventas contratadas" value={money(data.cards.sales)} hint={<Link className="hover:underline" href="/settings?s=indicadores#ind-ventas">{data.cards.salesRows.length} OT aprobada{data.cards.salesRows.length === 1 ? "" : "s"} · ver cálculo</Link>} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="Dinero cobrado por proyecto">
              <HBarChart
                title="Dinero cobrado por proyecto"
                rows={data.byProject.map((r) => ({ key: r.projectId, label: ot(r.projectId), text: ot(r.projectId), value: r.amount, onClick: () => go(r.projectId) }))}
                format={money}
                empty="No hubo cobros en el período."
              />
            </Section>
            <Section title="Rentabilidad cotizada vs. real">
              <CompareChart
                title="Rentabilidad cotizada vs. real"
                rows={data.compare.map((r) => ({ key: r.projectId, label: ot(r.projectId), quoted: r.quoted, real: r.real, partial: r.stage !== "final", onClick: () => go(r.projectId) }))}
                empty="No hay OTs aprobadas en el período."
              />
            </Section>
          </div>
          <Section title={`Cobros por ${data.series.unit === "week" ? "semana" : "mes"}`}>
            <LineChart
              title="Evolución de cobros"
              points={data.series.buckets.map((b) => ({ key: b.key, label: data.series.unit === "week" ? `${b.from.slice(8, 10)}/${b.from.slice(5, 7)}` : `${MONTHS[Number(b.key.slice(5, 7)) - 1]} ${b.key.slice(2, 4)}`, value: b.amount }))}
              format={money}
              empty="Sin datos en el período."
            />
          </Section>

          <div className="grid gap-4 lg:grid-cols-3">
            <Section title="Costos del período" className="lg:col-span-1">
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-600">Costo de desperdicios</dt>
                  <dd className="font-medium tabular">{money(data.costs.waste)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-600">Otros gastos directos</dt>
                  <dd className="font-medium tabular">{money(data.costs.other)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-600">Costo financiero</dt>
                  <dd className="font-medium tabular">{money(data.costs.financial)}</dd>
                </div>
              </dl>
              <Link href="/settings?s=indicadores#ind-costos" className="mt-3 inline-block text-xs text-blue-700 hover:underline">
                Ver cálculo
              </Link>
            </Section>
            <Section title="Alertas" className="lg:col-span-2">
              <AlertList alerts={alerts} limit={6} hrefOf={(a) => (a.projectId ? `/projects/${a.projectId}` : undefined)} />
            </Section>
          </div>

          <Section title="Capacidad por rubro">
            {data.capacity.length === 0 ? (
              <p className="text-sm text-slate-500">El rango elegido ya pasó: la capacidad es futura (desde el {day(today)}).</p>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Rubro</TH>
                    <TH className="text-right">Disponible</TH>
                    <TH className="text-right">Comprometidas</TH>
                    <TH className="text-right">Saldo</TH>
                    <TH className="text-right">Potenciales</TH>
                    <TH className="text-right">Saldo con potenciales</TH>
                  </TR>
                </THead>
                <TBody>
                  {data.capacity.map((r) => (
                    <TR key={r.rubroId}>
                      <TD>{rubroName(w, r.rubroId)}</TD>
                      <TD className="text-right tabular">{num(r.capacity, "h")}</TD>
                      <TD className="text-right tabular">{num(r.committed, "h")}</TD>
                      <TD className={cn("text-right font-medium tabular", r.balance < 0 && "text-red-700")}>{num(r.balance, "h")}</TD>
                      <TD className="text-right tabular">{num(r.potential, "h")}</TD>
                      <TD className={cn("text-right tabular", r.balanceWithPotential < 0 && "text-amber-700")}>{num(r.balanceWithPotential, "h")}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
            <p className="mt-2 text-xs text-slate-500">
              Del {day(period.from > today ? period.from : today)} al {day(period.to)}.{" "}
              <Link href="/settings?s=indicadores#ind-capacidad" className="text-blue-700 hover:underline">
                Cómo se calcula
              </Link>
            </p>
          </Section>

          <details className="rounded-lg border border-slate-200 bg-white">
            <summary className="cursor-pointer px-5 py-4 text-base font-semibold text-slate-900">Desvíos por proyecto, mueble y rubro</summary>
            <div className="space-y-6 px-5 pb-5">
              <div>
                <h3 className="mb-2 text-sm font-medium text-slate-700">Horas</h3>
                <Table>
                  <THead>
                    <TR>
                      <TH>OT</TH>
                      <TH>Mueble</TH>
                      <TH>Rubro</TH>
                      <TH className="text-right">Cotizadas</TH>
                      <TH className="text-right">Reales</TH>
                      <TH className="text-right">Desvío</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {data.hours.map((d) => {
                      const p = w.projects.find((x) => x.id === d.projectId);
                      return (
                        <TR key={`${d.projectId}${d.itemId}${d.rubroId}`}>
                          <TD><OtLink projectId={d.projectId} /></TD>
                          <TD>{itemName(p, d.itemId)}</TD>
                          <TD>{rubroName(w, d.rubroId)}</TD>
                          <TD className="text-right tabular">{num(d.budget, "h")}</TD>
                          <TD className="text-right tabular">{num(d.real, "h")}</TD>
                          <TD className={cn("text-right tabular", d.diff > 0 && "text-red-700")}>
                            {d.diff > 0 ? "+" : ""}
                            {num(d.diff, "h")} {d.pct !== null && <span className="text-xs text-slate-500">({d.pct > 0 ? "+" : ""}{pct(d.pct)})</span>}
                          </TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
              </div>
              <div>
                <h3 className="mb-2 text-sm font-medium text-slate-700">Materiales</h3>
                <Table>
                  <THead>
                    <TR>
                      <TH>OT</TH>
                      <TH>Mueble</TH>
                      <TH>Material</TH>
                      <TH className="text-right">Cantidad cotizada</TH>
                      <TH className="text-right">BOM publicado</TH>
                      <TH className="text-right">Cantidad real</TH>
                      <TH className="text-right">Desvío</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {data.mats.map((d) => {
                      const p = w.projects.find((x) => x.id === d.projectId);
                      const u = materialUnit(w, d.materialId);
                      return (
                        <TR key={`${d.projectId}${d.itemId}${d.materialId}`}>
                          <TD><OtLink projectId={d.projectId} /></TD>
                          <TD>{itemName(p, d.itemId)}</TD>
                          <TD>{materialName(w, d.materialId)}</TD>
                          <TD className="text-right tabular">{num(d.quoted, u)}</TD>
                          <TD className="text-right tabular">{d.bom === null ? "—" : num(d.bom, u)}</TD>
                          <TD className="text-right tabular">{num(d.real, u)}</TD>
                          <TD className={cn("text-right tabular", d.diff > 0 && "text-red-700")}>
                            {d.diff > 0 ? "+" : ""}
                            {num(d.diff, u)} {d.pct !== null && <span className="text-xs text-slate-500">({d.pct > 0 ? "+" : ""}{pct(d.pct)})</span>}
                          </TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
                <p className="mt-2 text-xs text-slate-500">Cantidad real = consumido + desperdiciado rendido por Planta. Cada material en su unidad: nunca se suman unidades distintas.</p>
              </div>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
