"use client";
// Resumen del Administrativo (Auditoría UX · P0-5): responde primero "¿qué proyectos se desvían y por qué?".
//  1. Cuatro números económicos: plata en riesgo, Margen esperado → Margen proyectado (puntos de margen), desvíos
//     detectados aún no proyectados y Margen real final de los cerrados. Nunca se mezclan los márgenes.
//  2. Proyectos ordenados por impacto en pesos, con la causa principal y su monto; el plazo va en otra columna.
//  3. "¿Por qué se pierde?": causas sumadas de todas las obras en curso.
//  4. "Para revisar hoy": lo operativo, bajado de jerarquía y con lo que cuesta.
// Cada número se abre hasta el proyecto y, desde ahí, hasta sus registros.
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, ChevronDown } from "lucide-react";
import { profitOverview, type OverviewRow, type Severity } from "@/lib/dashboard";
import { costWithPoints } from "@/lib/deviations";
import { formatCurrency, formatDate, formatMarginPoints, formatPercent } from "@/lib/formatting";
import { useAppStore } from "@/store/use-app-store";
import { useAlerts, useToday } from "@/store/selectors";
import { PageHeader } from "@/components/shared/page-header";
import { ScheduleBadge } from "@/components/shared/badges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Tone = "red" | "amber" | "green";

const TONE_TEXT: Record<Tone, string> = { red: "text-red-700", amber: "text-amber-700", green: "text-emerald-700" };

/** Rojo solo para lo grave (umbral de Configuración); lo menor, en naranja; sin desvío, sin color. */
const severityTone = (s: Severity): Tone | undefined => (s === "grave" ? "red" : s === "menor" ? "amber" : undefined);

function Kpi({ href, label, value, hint, tone }: { href: string; label: string; value: React.ReactNode; hint: React.ReactNode; tone?: Tone }) {
  return (
    <a
      href={href}
      className="block rounded-lg border border-slate-200 bg-white p-4 hover:border-blue-300 focus-visible:outline-2 focus-visible:outline-blue-600"
    >
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <span className={cn("mt-1 block text-2xl font-semibold tabular", tone ? TONE_TEXT[tone] : "text-slate-900")}>{value}</span>
      <span className="mt-1 block text-xs text-slate-500">{hint}</span>
    </a>
  );
}

// En pesos nunca hay signo: "Pierde $ X" / "Detectado $ X". El signo − queda solo para los puntos de margen.
function Row({ r }: { r: OverviewRow }) {
  const detected = r.detected.notProjected.total;
  const tone = severityTone(r.severity);
  const moved = r.deltaPoints !== null && Math.abs(r.deltaPoints) >= 0.05;
  return (
    <tr className="border-b border-slate-100 align-top">
      <td className="py-2.5 pr-3">
        <Link href={`/projects/${r.project.id}`} className="font-medium text-blue-700 hover:underline">
          {r.project.code}
        </Link>{" "}
        <span className="text-slate-900">{r.project.name}</span>
        <span className="block text-xs text-slate-500">{Math.round(r.schedule.progress * 100)} % hecho</span>
      </td>
      <td className="py-2.5 pr-3 text-right tabular">
        {r.overrun > 0 && (
          <span className={cn("block font-semibold", tone ? TONE_TEXT[tone] : "text-slate-900")}>Pierde {formatCurrency(r.overrun)}</span>
        )}
        {detected > 0 && <span className="block text-amber-700">Detectado {formatCurrency(detected)}</span>}
        {r.overrun === 0 && detected === 0 && <span className="text-slate-500">Sin desvío</span>}
      </td>
      <td className="py-2.5 pr-3 text-right tabular">
        {moved ? (
          <>
            {formatPercent(r.expectedMargin)} → <strong className={cn(tone && TONE_TEXT[tone])}>{formatPercent(r.projectedMargin)}</strong>
            <span className={cn("block text-xs", tone ? TONE_TEXT[tone] : "text-emerald-700")}>{formatMarginPoints(r.deltaPoints ?? 0, { signed: true })}</span>
          </>
        ) : (
          <>
            <strong>{formatPercent(r.projectedMargin)}</strong>
            <span className="block text-xs text-slate-500">proyectado, igual al esperado</span>
          </>
        )}
        {r.possibleMargin !== null && (
          <span className="block text-xs text-amber-700">podría quedar en ~{formatPercent(r.possibleMargin)} si no se compensa</span>
        )}
      </td>
      <td className="py-2.5 pr-3">
        {r.mainCause ? (
          <>
            {r.mainCause.label}{" "}
            <strong className={cn("tabular", r.mainCause.kind === "detected" ? "text-amber-700" : tone ? TONE_TEXT[tone] : "text-slate-900")}>
              {formatCurrency(r.mainCause.amount)}
            </strong>
            {r.mainCause.detail && <span className="block text-xs text-slate-500">{r.mainCause.detail}</span>}
          </>
        ) : (
          <span className="text-slate-500">Sin desvío económico</span>
        )}
      </td>
      <td className="py-2.5">
        <ScheduleBadge view={r.schedule} />
      </td>
    </tr>
  );
}

export function Dashboard() {
  const projects = useAppStore((s) => s.projects);
  const assignments = useAppStore((s) => s.assignments);
  const dueSoonDays = useAppStore((s) => s.settings.dueSoonDays);
  const severePoints = useAppStore((s) => s.settings.marginWarningPp);
  const today = useToday();
  const { open } = useAlerts();
  const o = useMemo(() => profitOverview(projects, assignments, today, dueSoonDays, severePoints), [projects, assignments, today, dueSoonDays, severePoints]);
  const [showAll, setShowAll] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const withDeviation = o.rows.filter((r) => !r.inOrder);
  const rest = o.rows.filter((r) => !withDeviation.includes(r));
  const visible = showAll ? o.rows : withDeviation;
  const aggDelta = o.expected !== null && o.projected !== null ? o.projected - o.expected : null;
  // Lo operativo: todo lo que no es pérdida de margen (esa ya está en la tabla), lo más grave y caro primero.
  const review = open.filter((a) => a.kind !== "margin").slice(0, 5);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Resumen"
        subtitle={`¿Qué proyectos se desvían y por qué? Hoy, ${formatDate(today)} · ${o.rows.length} proyectos en curso. Cada número se abre hasta sus registros.`}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          href="#proyectos"
          label="Plata en riesgo (en curso)"
          value={formatCurrency(o.atRisk)}
          tone={o.atRisk > 0 ? severityTone(o.severity) : undefined}
          hint="Costo final proyectado por encima del costo presupuestado."
        />
        <Kpi
          href="#proyectos"
          label="Margen esperado → Margen proyectado"
          value={
            <>
              {formatPercent(o.expected)} →{" "}
              <span className={cn((aggDelta ?? 0) < -0.05 && TONE_TEXT[severityTone(o.severity) ?? "amber"])}>{formatPercent(o.projected)}</span>
            </>
          }
          hint={aggDelta === null ? "Proyectos en curso." : `${formatMarginPoints(aggDelta, { signed: true })} · proyectos en curso`}
        />
        <Kpi
          href="#causas"
          label="Desvíos detectados aún no proyectados"
          value={formatCurrency(o.detected)}
          tone={o.detected > 0 ? "amber" : undefined}
          hint="Horas de más y facturas más caras que todavía no están en el Margen proyectado."
        />
        <Kpi
          href="#cerrados"
          label="Margen real final (cerrados)"
          value={formatPercent(o.closedMargin)}
          hint={`${o.closed.length} ${o.closed.length === 1 ? "proyecto cerrado" : "proyectos cerrados"} · no se mezcla con los de arriba`}
        />
      </div>

      <Card id="proyectos">
        <CardHeader>
          <CardTitle>Proyectos ordenados por impacto en pesos</CardTitle>
          <p className="text-sm text-slate-500">La plata y el plazo van en columnas separadas: &quot;Atrasado&quot; no significa &quot;pierde plata&quot;.</p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {o.inOrder.length > 0 && (
            <p className="mb-3 flex items-start gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                <strong>
                  {o.inOrder.length} {o.inOrder.length === 1 ? "proyecto en orden" : "proyectos en orden"}
                </strong>
                : sin desvío económico y en tiempo ({o.inOrder.map((r) => r.project.code).join(", ")}).
              </span>
            </p>
          )}
          {o.rows.length === 0 ? (
            <p className="text-sm text-slate-500">No hay proyectos en curso.</p>
          ) : (
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3 font-medium">Proyecto</th>
                  <th className="py-2 pr-3 text-right font-medium">Impacto</th>
                  <th className="py-2 pr-3 text-right font-medium">Margen esperado → proyectado</th>
                  <th className="py-2 pr-3 font-medium">Causa principal</th>
                  <th className="py-2 font-medium">Plazo</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <Row key={r.project.id} r={r} />
                ))}
              </tbody>
            </table>
          )}
          {rest.length > 0 && (
            <button type="button" onClick={() => setShowAll(!showAll)} className="mt-3 inline-flex items-center gap-1 text-sm text-blue-700 hover:underline" aria-expanded={showAll}>
              {showAll ? "Ver solo los que se desvían" : `Ver también ${rest.length === 1 ? "el que está en orden" : `los ${rest.length} que están en orden`}`}
              <ChevronDown className={cn("size-4 transition-transform", showAll && "rotate-180")} aria-hidden />
            </button>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card id="causas" className="lg:col-span-2">
          <CardHeader>
            <CardTitle>¿Por qué se pierde? (todas las obras en curso)</CardTitle>
          </CardHeader>
          <CardContent>
            {o.causes.length === 0 ? (
              <p className="text-sm text-slate-500">Ningún proyecto en curso se desvía de lo presupuestado.</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {o.causes.map((c) => (
                  <li key={c.key} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                    <span className={cn("min-w-0", c.kind === "detected" && "text-amber-900")}>
                      {c.label}
                      <span className="block text-xs text-slate-500">
                        {c.projects.map((code, i) => {
                          const p = o.rows.find((r) => r.project.code === code)?.project;
                          return (
                            <span key={code}>
                              {i > 0 && ", "}
                              {p ? (
                                <Link href={`/projects/${p.id}`} className="text-blue-700 hover:underline">
                                  {code}
                                </Link>
                              ) : (
                                code
                              )}
                            </span>
                          );
                        })}
                      </span>
                    </span>
                    <strong className={cn("tabular", c.kind === "detected" ? "text-amber-700" : "text-slate-900")}>{formatCurrency(c.amount)}</strong>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Para revisar hoy</CardTitle>
          </CardHeader>
          <CardContent>
            {review.length === 0 ? (
              <p className="text-sm text-slate-500">Nada pendiente.</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {review.map((a) => (
                  <li key={a.id} className="py-2">
                    <span className="font-medium text-slate-900">
                      {a.projectCode} · {a.title}
                    </span>
                    {a.impactAmount !== undefined && a.impactAmount > 0 && (
                      <span className="block text-xs text-amber-700">Cuesta ≈ {costWithPoints(a.impactAmount, a.impactPoints)}</span>
                    )}
                    {a.action && <span className="block text-xs text-slate-500">{a.action}</span>}
                  </li>
                ))}
              </ul>
            )}
            <Link href="/alerts" className="mt-2 inline-flex items-center gap-1 text-sm text-blue-700 hover:underline">
              Ver todas las alertas <ArrowRight className="size-4" />
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card id="cerrados">
        <CardHeader>
          <button type="button" onClick={() => setShowClosed(!showClosed)} aria-expanded={showClosed} className="flex items-center gap-2 text-left">
            <CardTitle>Margen real final de los proyectos cerrados: {formatPercent(o.closedMargin)}</CardTitle>
            <ChevronDown className={cn("size-4 text-slate-400 transition-transform", showClosed && "rotate-180")} aria-hidden />
          </button>
          <p className="text-sm text-slate-500">Solo proyectos cerrados. No se mezcla con el Margen esperado ni con el Margen proyectado.</p>
        </CardHeader>
        {showClosed && (
          <CardContent>
            <ul className="divide-y divide-slate-100 text-sm">
              {o.closed.map(({ project, real }) => (
                <li key={project.id} className="flex justify-between gap-2 py-1.5">
                  <Link href={`/projects/${project.id}`} className="text-blue-700 hover:underline">
                    {project.code} {project.name}
                  </Link>
                  <span className="tabular">{formatPercent(real)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
