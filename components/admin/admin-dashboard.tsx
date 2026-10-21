"use client";
// Administración / Comercial / Diseño → Dashboard: lo operativo, sin información económica gerencial.
// Cuántos proyectos hay en cada estado, qué diseños y planos esperan, qué vence pronto y qué necesita seguimiento.
import Link from "next/link";
import { useMemo } from "react";
import { exampleFurnitureDesign } from "@/lib/demo/ejemplos";
import { GENERAL_STATE_LABELS, generalState } from "@/lib/gerencia";
import { scheduleSignal } from "@/lib/production";
import { formatDate } from "@/lib/formatting";
import { useAppStore } from "@/store/use-app-store";
import { useMaterialsStateOf, useToday } from "@/store/selectors";
import { useExampleData } from "@/store/session-data";
import { OwnHoursButton } from "@/components/shared/own-hours";
import { PageHeader } from "@/components/shared/page-header";
import { CircuitPending } from "@/components/shared/pending-list";
import { Stat } from "@/components/shared/stat";
import { OriginTag } from "@/components/shared/data-origin";
import { ScheduleBadge } from "@/components/shared/badges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DESIGN_STATUS_LABELS } from "@/components/projects/furniture-panel";

export function AdminDashboard() {
  const today = useToday();
  const projects = useAppStore((s) => s.projects);
  const dueSoonDays = useAppStore((s) => s.settings.dueSoonDays);
  const materialsOf = useMaterialsStateOf();
  const example = useExampleData();
  const count = (st: ReturnType<typeof generalState>) => projects.filter((p) => generalState(p) === st).length;
  const live = projects.filter((p) => generalState(p) !== "closed");
  const designs = useMemo(
    () => (example ? live.flatMap((p) => exampleFurnitureDesign(p).map((d) => ({ p, d, item: p.items.find((i) => i.id === d.itemId) }))) : []),
    [example, live],
  );
  const pendingDesign = designs.filter((x) => x.d.designStatus === "preparing" || x.d.designStatus === "sent");
  const waitingApproval = designs.filter((x) => x.d.designStatus === "waiting_approval" || x.d.designStatus === "sent");
  const views = live.filter((p) => generalState(p) !== "quotation").map((p) => ({ p, s: scheduleSignal(p, today, dueSoonDays) }));
  const dueSoon = views.filter((v) => v.s.daysLeft >= 0 && v.s.daysLeft <= dueSoonDays);
  // Seguimiento: atrasados o en riesgo, obras que arrancan sin material y cotizaciones esperando respuesta.
  const followUp = [
    ...views.filter((v) => v.s.signal !== "on_time").map((v) => ({ p: v.p, why: v.s.reason, badge: <ScheduleBadge view={v.s} /> })),
    ...live.filter((p) => generalState(p) !== "quotation" && materialsOf(p) === "none" && p.startDate <= today).map((p) => ({ p, why: "Arrancó y todavía no se compró material.", badge: null })),
    ...live.filter((p) => generalState(p) === "quotation").map((p) => ({ p, why: "Cotización esperando respuesta del cliente.", badge: null })),
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle={`Hoy, ${formatDate(today)}. Proyectos, diseños y entregas que necesitan seguimiento.`} actions={<OwnHoursButton />} />
      <CircuitPending session="administracion" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="En cotización" value={String(count("quotation"))} />
        <Stat label="Aprobados" value={String(count("approved"))} />
        <Stat label="En proceso" value={String(count("in_progress"))} />
        <Stat label="Diseños pendientes" value={example ? String(pendingDesign.length) : "—"} hint={example ? undefined : "Pendiente de backend"} />
        <Stat label="Próximos vencimientos" value={String(dueSoon.length)} hint={`Entregas en ${dueSoonDays} días o menos`} tone={dueSoon.length ? "yellow" : undefined} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Necesitan seguimiento</CardTitle>
          </CardHeader>
          <CardContent>
            {followUp.length === 0 ? (
              <p className="text-sm text-slate-500">Nada para seguir hoy.</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {followUp.slice(0, 8).map(({ p, why, badge }, i) => (
                  <li key={`${p.id}-${i}`} className="flex flex-wrap items-start justify-between gap-2 py-2">
                    <span>
                      <Link href={`/projects/${p.id}`} className="font-medium text-blue-700 hover:underline">{p.code}</Link> {p.name}
                      <span className="block text-xs text-slate-500">{why}</span>
                    </span>
                    {badge}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Próximas entregas</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-slate-100 text-sm">
              {[...views].sort((a, b) => a.p.dueDate.localeCompare(b.p.dueDate)).slice(0, 6).map(({ p, s }) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <Link href={`/projects/${p.id}`} className="font-medium text-blue-700 hover:underline">{p.code}</Link> {p.client}
                    <span className="block text-xs text-slate-500">{GENERAL_STATE_LABELS[generalState(p)]} · {Math.round(s.progress * 100)} % hecho</span>
                  </span>
                  <span className="flex items-center gap-2 text-xs tabular text-slate-600">{formatDate(p.dueDate)} <ScheduleBadge view={s} /></span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">Muebles pendientes de Diseño {example && <OriginTag origin="example" />}</CardTitle>
          </CardHeader>
          <CardContent>
            {!example ? (
              <p className="text-sm text-slate-500">El estado de Diseño de cada mueble se guarda cuando el backend lo habilite.</p>
            ) : pendingDesign.length === 0 ? (
              <p className="text-sm text-slate-500">No hay muebles esperando Diseño.</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {pendingDesign.map(({ p, d, item }) => (
                  <li key={`${p.id}-${d.itemId}`} className="flex flex-wrap justify-between gap-2 py-2">
                    <span><Link href={`/projects/${p.id}`} className="text-blue-700 hover:underline">{p.code}</Link> · {item?.name ?? "Mueble"}</span>
                    <span className="text-xs text-slate-500">{DESIGN_STATUS_LABELS[d.designStatus]}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">Planos pendientes de aprobación {example && <OriginTag origin="example" />}</CardTitle>
          </CardHeader>
          <CardContent>
            {!example ? (
              <p className="text-sm text-slate-500">Se ve cuando el backend guarde el estado de los planos.</p>
            ) : waitingApproval.length === 0 ? (
              <p className="text-sm text-slate-500">No hay planos esperando aprobación.</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {waitingApproval.map(({ p, d, item }) => (
                  <li key={`${p.id}-${d.itemId}`} className="flex flex-wrap justify-between gap-2 py-2">
                    <span><Link href={`/projects/${p.id}`} className="text-blue-700 hover:underline">{p.code}</Link> · {item?.name ?? "Mueble"} · {p.client}</span>
                    <span className="text-xs text-slate-500">{DESIGN_STATUS_LABELS[d.designStatus]}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
