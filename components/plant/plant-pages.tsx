"use client";
// Jefe de planta: Dashboard, Proyectos, Operarios (con asignaciones y correcciones de horas) y Alertas. Sin importes:
// ni costos, ni precios, ni rentabilidad.
import { ProjectCard } from "./plant-projects";
import { ExternalWorkSection } from "./external-work";
import { AssignmentDialog, type AssignmentDraft } from "./assignment-dialog";
import { HoursReviews } from "./hours-review";
import { useMemo, useState } from "react";
import { AlertTriangle, CalendarDays } from "lucide-react";
import { formatDate, formatNumber } from "@/lib/formatting";
import { visibleOperators } from "@/lib/operators";
import { calendarCell, workDaysLabel, workDaysOf } from "@/lib/schedule";
import { plantView } from "@/lib/role-views";
import { useConfiguredOperators } from "@/store/selectors";
import { useAppStore } from "@/store/use-app-store";
import { usePlantAlerts, useToday } from "@/store/selectors";
import { AlertItem } from "@/components/alerts/alert-item";
import { OwnHoursButton } from "@/components/shared/own-hours";
import { PageHeader } from "@/components/shared/page-header";
import { CircuitPending } from "@/components/shared/pending-list";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PendingAction } from "@/components/shared/data-origin";
import { ScheduleDialog } from "./schedule-dialog";
import { AssignmentsPage } from "./assignments-page";

export function PlantSummaryPage() {
  const today = useToday();
  const projects = useAppStore((s) => s.projects);
  const [draft,setDraft] = useState<AssignmentDraft | null>(null);
  const list = projects.filter((p) => !p.isClosed && ["production", "installation"].includes(p.status));
  return <div className="space-y-4">
    <PageHeader title="Hoy" subtitle={`Producción del ${formatDate(today)} · Proyecto → Mueble → Rubro → Materiales`} actions={<OwnHoursButton />} />
    <CircuitPending session="jefe_planta" />
    {!list.length && <p className="text-sm text-slate-500">No hay proyectos activos en producción.</p>}
    {list.map((p) => <ProjectCard key={p.id} project={p} onAssign={setDraft} />)}
    <ExternalWorkSection />
    <AssignmentDialog draft={draft} onClose={() => setDraft(null)} />
  </div>;
}

export function PlantOperatorsPage({ tab = "asignaciones" }: { tab?: string } = {}) {
  const today = useToday();
  const projects = useAppStore((s) => s.projects);
  const allOperators = useConfiguredOperators();
  const assignments = useAppStore((s) => s.assignments);
  const exceptions = useAppStore((s) => s.dayExceptions);
  const hoursPerDay = useAppStore((s) => s.costSettings.hoursPerDay);
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const operators = visibleOperators(allOperators, showInactive);
  const view = useMemo(() => plantView(projects, operators), [projects, operators]);

  return (
    <div className="space-y-4">
      <PageHeader title="Operarios" subtitle="Asignaciones, disponibilidad y revisión de las horas cargadas. Sin costos." />
      <Tabs defaultValue={["asignaciones", "disponibilidad", "horas"].includes(tab) ? tab : "asignaciones"}>
        <TabsList aria-label="Secciones de Operarios">
          <TabsTrigger value="asignaciones">Asignaciones</TabsTrigger>
          <TabsTrigger value="disponibilidad">Disponibilidad</TabsTrigger>
          <TabsTrigger value="horas">Correcciones de horas</TabsTrigger>
        </TabsList>
        <TabsContent value="asignaciones">
          <AssignmentsPage embedded />
        </TabsContent>
        <TabsContent value="horas">
          <HoursReviews />
        </TabsContent>
        <TabsContent value="disponibilidad" className="space-y-4">
      <p className="text-sm text-slate-500">
        Especialidad, días laborales (con sus excepciones) y disponibilidad. La capacidad de un día laboral es la jornada de {formatNumber(hoursPerDay)} h
        (Configuración).
      </p>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" className="size-4" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Ver también los dados de baja
      </label>
      <Card>
        <CardContent className="overflow-x-auto pt-5">
          <Table>
            <THead>
              <TR>
                <TH>Operario</TH>
                <TH>Días laborales</TH>
                <TH>Excepciones próximas</TH>
                <TH>Hoy</TH>
                <TH className="text-right">Horas cargadas</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {view.operators.map((o) => {
                const cell = calendarCell(o, today, assignments, exceptions, hoursPerDay);
                const next = exceptions.filter((x) => x.operatorId === o.id && x.date >= today);
                return (
                  <TR key={o.id} className="align-top">
                    <TD className="font-medium text-slate-900">
                      {o.name}
                      <span className="block text-xs font-normal text-slate-500">{o.role}</span>
                      {!o.active && <Badge tone="gray">De baja</Badge>}
                    </TD>
                    <TD className="text-sm">{workDaysLabel(workDaysOf(o))}</TD>
                    <TD className="text-xs">
                      {next.length === 0
                        ? "—"
                        : next.map((x) => (
                            <div key={x.date} className="break-words">
                              {formatDate(x.date)}: {x.works ? `trabaja ${formatNumber(x.hours ?? hoursPerDay)} h` : "no trabaja"}
                              {x.note && <span className="text-slate-500"> ({x.note})</span>}
                            </div>
                          ))}
                    </TD>
                    <TD className="whitespace-nowrap tabular text-sm">
                      {!o.active ? "—" : (
                        <span className={cn(cell.over && "font-semibold text-red-700", !cell.capacity.working && "text-slate-500")} title={cell.capacity.reason}>
                          {cell.capacity.working || cell.planned > 0 ? `${formatNumber(cell.planned)}/${formatNumber(cell.capacity.hours)} h` : "No trabaja"}
                        </span>
                      )}
                    </TD>
                    <TD className="text-right tabular">{formatNumber(o.hours)} h</TD>
                    <TD className="text-right">
                      {o.active && (
                        <Button size="sm" variant="outline" onClick={() => setEditing(o.id)} aria-label={`Días laborales de ${o.name}`}>
                          <CalendarDays /> Días
                        </Button>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </CardContent>
      </Card>
        </TabsContent>
      </Tabs>
      <ScheduleDialog operatorId={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

export function PlantAlertsPage() {
  const alerts = usePlantAlerts();
  return (
    <div className="space-y-4">
      <PageHeader title="Alertas de planta" subtitle="Desvío de horas, operarios sobrecargados, rubros sin asignar a pocos días de la entrega y obras que arrancan sin material." />
      <PendingAction label="Registrar incidencia" reason="Las incidencias de planta (máquina parada, falta de material, retrabajo) se guardan cuando el backend lo habilite." />
      {alerts.length === 0 ? (
        <EmptyState icon={AlertTriangle} title="Sin alertas de planta" description="Cuando haya desvíos de horas o falte asignar a alguien, aparece acá." />
      ) : (
        alerts.map((a) => <AlertItem key={a.id} alert={a} readOnly link={{ href:a.id.startsWith("review:") ? "/planta/operarios?tab=horas" : a.id.startsWith("overload:") ? "/planta/asignaciones" : "/planta/proyectos",label:"Revisar registro" }} />)
      )}
    </div>
  );
}
