"use client";
// Administración → Dashboard (modo demostración): 4 indicadores y "Pendientes" con solo cuatro tipos de aviso.
import Link from "next/link";
import { useMemo } from "react";
import { adminPending } from "@/lib/core/alerts";
import { QUOTE_STATE_LABELS } from "@/lib/core/ops";
import { draftBom } from "@/lib/core/needs";
import { addDays } from "@/lib/core/util";
import { PageHeader } from "@/components/shared/page-header";
import { Stat } from "@/components/shared/stat";
import { day, Empty, OtLink, Section, useCore, useDemoToday } from "../kit";

export function AdminDashboardDemo() {
  const w = useCore();
  const today = useDemoToday();
  const pend = useMemo(() => adminPending(w, today), [w, today]);
  const inQuote = w.projects.filter((p) => p.status === "quotation" && p.quote.state !== "rejected").length;
  const running = w.projects.filter((p) => ["approved", "purchasing", "production"].includes(p.status)).length;
  const soon = w.projects.filter((p) => ["approved", "purchasing", "production"].includes(p.status) && p.dueDate >= today && p.dueDate <= addDays(today, 30) && !w.handovers.some((h) => h.projectId === p.id)).length;
  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="En cotización" value={String(inQuote)} />
        <Stat label="Aprobados y en ejecución" value={String(running)} />
        <Stat label="Pendientes de BOM" value={String(pend.bom.length)} tone={pend.bom.length ? "yellow" : "default"} />
        <Stat label="Entregas en 30 días" value={String(soon)} />
      </div>
      <Section title="Pendientes">
        <div className="grid gap-6 lg:grid-cols-2">
          <Group title="Cotizaciones esperando respuesta">
            {pend.quotes.map((p) => (
              <li key={p.id} className="flex justify-between gap-2">
                <Link href={`/quotes?ot=${p.id}`} className="break-all text-blue-800 hover:underline">{p.ot}</Link>
                <span className="shrink-0 text-xs text-slate-500">{QUOTE_STATE_LABELS[p.quote.state]}{p.quote.sentAt ? ` · ${day(p.quote.sentAt)}` : ""}</span>
              </li>
            ))}
          </Group>
          <Group title="BOM por publicar">
            {pend.bom.map((p) => (
              <li key={p.id} className="flex justify-between gap-2">
                <OtLink projectId={p.id} tab="bom" />
                <span className="shrink-0 text-xs text-slate-500">{draftBom(w, p.id) ? "Borrador guardado" : "Sin empezar"} · inicio {day(p.startDate)}</span>
              </li>
            ))}
          </Group>
          <Group title="Información incompleta">
            {pend.incomplete.map((x) => (
              <li key={x.project.id} className="flex justify-between gap-2">
                <Link href={x.project.status === "quotation" ? `/quotes?ot=${x.project.id}` : `/projects/${x.project.id}`} className="break-all text-blue-800 hover:underline">{x.project.ot}</Link>
                <span className="text-right text-xs text-slate-500">Falta: {x.missing.join(", ")}</span>
              </li>
            ))}
          </Group>
          <Group title="Entregas próximas o atrasadas">
            {pend.deliveries.map((d) => (
              <li key={d.project.id} className="flex justify-between gap-2">
                <OtLink projectId={d.project.id} />
                <span className={d.late ? "shrink-0 text-xs font-medium text-red-700" : "shrink-0 text-xs text-slate-500"}>
                  {d.late ? "Atrasada" : "Entrega"} {day(d.project.dueDate)} · {d.done}/{d.total} unidades
                </span>
              </li>
            ))}
          </Group>
        </div>
      </Section>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode[] }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium text-slate-700">
        {title} <span className="text-slate-400">({children.length})</span>
      </h3>
      {children.length === 0 ? <Empty>Nada pendiente.</Empty> : <ul className="space-y-2 text-sm">{children}</ul>}
    </div>
  );
}
