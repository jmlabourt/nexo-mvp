"use client";
import type { Project } from "@/types";
import { STATUS_LABELS } from "@/lib/constants";
import { projectSchedule } from "@/lib/project-rules";
import { formatDate, todayISO } from "@/lib/formatting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress";

/** Plazo transcurrido: reemplaza al % de avance manual. Se calcula con las fechas del proyecto. */
export function ScheduleCard({ project }: { project: Project }) {
  const s = projectSchedule(project, project.isClosed && project.closedAt ? project.closedAt.slice(0, 10) : todayISO());
  const state = project.isClosed
    ? "Proyecto finalizado"
    : s.notStarted
      ? `Empieza el ${formatDate(project.startDate)}`
      : s.overdue
        ? `Vencido hace ${-s.remainingDays} días`
        : s.remainingDays === 0
          ? "Se entrega hoy"
          : `Faltan ${s.remainingDays} días`;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Plazo transcurrido</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-2xl font-semibold tabular text-slate-900">{s.elapsedPct}%</span>
          <span className={`text-sm ${s.overdue && !project.isClosed ? "font-medium text-red-700" : "text-slate-600"}`}>{state}</span>
        </div>
        <ProgressBar value={s.elapsedPct} />
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
          <div><dt className="text-xs text-slate-500">Inicio</dt><dd className="tabular">{formatDate(project.startDate)}</dd></div>
          <div><dt className="text-xs text-slate-500">Entrega</dt><dd className="tabular">{formatDate(project.dueDate)}</dd></div>
          <div><dt className="text-xs text-slate-500">Días transcurridos</dt><dd className="tabular">{Math.min(s.elapsedDays, s.totalDays)} de {s.totalDays}</dd></div>
          <div><dt className="text-xs text-slate-500">Etapa actual</dt><dd>{STATUS_LABELS[project.status]}</dd></div>
        </dl>
        <p className="text-xs text-slate-500">Es el tiempo que pasó, no el trabajo hecho. Se compara con la etapa para avisar si el proyecto va atrasado.</p>
      </CardContent>
    </Card>
  );
}
