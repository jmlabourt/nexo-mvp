"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowRightLeft, ClipboardPen, Clock, FolderX, Lock, Pencil } from "lucide-react";
import { formatDate, formatDays, daysBetween, todayISO } from "@/lib/formatting";
import { useAppStore } from "@/store/use-app-store";
import { useIdentity, useMaterialsStateOf, useProjectAlerts, useProjectView } from "@/store/selectors";
import { can } from "@/lib/permissions";
import { canQuoteProject } from "@/lib/project-rules";
import { generalState } from "@/lib/gerencia";
import { closureOf } from "@/lib/tablero";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HealthBadge } from "@/components/shared/badges";
import { GeneralStateBadge } from "./projects-table";
import { FurniturePanel } from "./furniture-panel";
import { HoursTab } from "./hours-tab";
import { BillingTab } from "./billing-tab";
import { OwnHoursButton } from "@/components/shared/own-hours";
import { ContractTerms } from "./contract-terms";
import { EditProjectDialog } from "./edit-project-dialog";
import { HoursForm } from "@/components/actual-costs/hours-form";
import { CircuitActions, CircuitBadge } from "./circuit-actions";
import { MaterialSplitCard } from "./material-changes";
import { MaterialsBadge } from "@/components/purchasing/purchasing-projects";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusTimeline } from "./status-timeline";
import { EconomicSummary } from "./economic-summary";
import { DetectedDeviationsCard } from "./detected-deviations";
import { DeviationSection } from "./deviation-section";
import { ActivityTab } from "./activity-tab";
import { ScheduleCard } from "./schedule-card";
import { TeamCard } from "./team-card";
import { StagesTab } from "./stages-tab";
import { StatusDialog } from "./status-dialog";
import { CloseDialog } from "./close-dialog";
import { BudgetTab } from "@/components/budget/budget-tab";
import { MaterialsTab } from "@/components/materials/materials-tab";
import { ActualCostsTab } from "@/components/actual-costs/actual-costs-tab";
import { RecordDialog } from "@/components/actual-costs/record-dialog";
import { AlertItem } from "@/components/alerts/alert-item";
import { BackButton } from "@/components/layout/back-button";

type DialogName = "record" | "hours" | "status" | "close" | "edit" | null;

/**
 * Pestañas por sesión. Gerencia: la economía completa y su explicación. Administración / Comercial / Diseño: los
 * muebles (Diseño, etapas, BOM, archivos) y las etapas, sin importes gerenciales.
 */
const GERENCIA_TABS = ["summary", "items", "budget", "materials", "hours", "costs", "billing", "activity"] as const;
const ADMIN_TABS = ["items", "contract", "stages"] as const;

export function ProjectDetail({ id, tab: initialTab, purchase }: { id: string; tab?: string; purchase?: string }) {
  const view = useProjectView(id);
  const settings = useAppStore((s) => s.settings);
  const ledger = useAppStore((s) => s.ledger);
  const alerts = useProjectAlerts(view?.project);
  const materialsOf = useMaterialsStateOf();
  const { session, isManager, isQuoter, role } = useIdentity();
  const gerencia = session === "gerencia";
  const tabs: readonly string[] = gerencia ? GERENCIA_TABS : ADMIN_TABS;
  const [dialog, setDialog] = useState<DialogName>(null);
  const [tab, setTab] = useState<string>(tabs.includes(initialTab ?? "") ? (initialTab as string) : purchase && gerencia ? "materials" : tabs[0]);

  if (!view) {
    return (
      <EmptyState
        icon={FolderX}
        title="Proyecto no encontrado"
        description="Puede que se haya reseteado la demo."
        action={
          <Button asChild variant="outline">
            <Link href="/projects">Ver proyectos</Link>
          </Button>
        }
      />
    );
  }
  const { project: p, econ, health } = view;
  const closure = closureOf(ledger, p.id);
  const closed = p.isClosed;
  const daysLeft = daysBetween(todayISO(), p.dueDate);
  const openDialog = (d: DialogName) => () => setDialog(d);
  const onOpenChange = (o: boolean) => !o && setDialog(null);

  return (
    <div className="min-w-0 space-y-6">
      <header className="space-y-4">
        <BackButton fallback="/projects" />
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <span className="font-medium">{p.code}</span>
              <GeneralStateBadge state={generalState(p)} />
              <CircuitBadge project={p} />
              {gerencia && health && <HealthBadge health={health} />}
              <MaterialsBadge state={materialsOf(p)} />
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{p.name}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {p.client} · {p.projectType} · Responsable: {p.owner}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-600">
              <span>
                Entrega: <strong className="tabular text-slate-900">{formatDate(p.dueDate)}</strong>
                {!closed && <span className={daysLeft < 0 ? "text-red-700" : "text-slate-500"}> ({daysLeft < 0 ? `vencida hace ${formatDays(-daysLeft)}` : daysLeft === 0 ? "hoy" : `en ${formatDays(daysLeft)}`})</span>}
              </span>
              {closed && p.closedAt && <span>Cerrado el {formatDate(p.closedAt)}</span>}
              {closed && closure && closure.pendingCosts.length > 0 && <span className="text-amber-800">Cerrado con costos pendientes</span>}
            </div>
          </div>
          {!closed ? (
            <div className="flex flex-wrap gap-2 xl:justify-end">
              {gerencia ? (
                <Button onClick={openDialog("record")} size="lg">
                  <ClipboardPen /> Registrar otro costo
                </Button>
              ) : (
                <>
                  {isManager && (
                    <Button onClick={openDialog("hours")} size="lg">
                      <Clock /> Registrar horas de operarios
                    </Button>
                  )}
                  <OwnHoursButton projectId={p.id} />
                </>
              )}
              {isQuoter && canQuoteProject(role, p) && (
                <Button variant="outline" onClick={openDialog("edit")} size="lg">
                  <Pencil /> Editar información
                </Button>
              )}
              {isManager && (
                <Button variant="outline" onClick={openDialog("status")} size="lg">
                  <ArrowRightLeft /> Cambiar etapa
                </Button>
              )}
              {can(session, "closeProjects") && (
                <Button variant="outline" onClick={openDialog("close")} size="lg" className="text-slate-700">
                  <Lock /> Cerrar proyecto
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-600">Proyecto cerrado · solo lectura</div>
          )}
        </div>
        {!closed && <CircuitActions project={p} canClose={can(session, "closeProjects")} />}
        <StatusTimeline status={p.status} />
      </header>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          {gerencia ? (
            <>
              <TabsTrigger value="summary">Resumen</TabsTrigger>
              <TabsTrigger value="items">Muebles</TabsTrigger>
              <TabsTrigger value="budget">Presupuesto original</TabsTrigger>
              <TabsTrigger value="materials">Materiales</TabsTrigger>
              <TabsTrigger value="hours">Horas</TabsTrigger>
              <TabsTrigger value="costs">Otros costos</TabsTrigger>
              <TabsTrigger value="billing">Facturación</TabsTrigger>
              <TabsTrigger value="activity">Historial</TabsTrigger>
            </>
          ) : (
            <>
              <TabsTrigger value="items">Muebles</TabsTrigger>
              <TabsTrigger value="contract">Contrato y pagos</TabsTrigger>
              <TabsTrigger value="stages">Etapas y notas</TabsTrigger>
            </>
          )}
        </TabsList>

        <TabsContent value="summary" className="space-y-6">
          <EconomicSummary project={p} econ={econ} />
          <DetectedDeviationsCard project={p} />
          <MaterialSplitCard project={p} />
          <div className="grid gap-4 lg:grid-cols-2">
            <ScheduleCard project={p} />
            <TeamCard project={p} />
          </div>
          <DeviationSection econ={econ} settings={settings} completed={p.status === "completed"} />
          <Card>
            <CardHeader>
              <CardTitle>Alertas del proyecto</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {alerts.length === 0 ? (
                <p className="text-sm text-slate-500">{p.status === "completed" ? "Los proyectos finalizados no generan alertas." : p.status === "quotation" ? "Los proyectos en Cotización no generan alertas." : "Sin alertas abiertas."}</p>
              ) : (
                alerts.slice(0, 5).map((a) => <AlertItem key={a.id} alert={a} showProject={false} compact />)
              )}
              {alerts.length > 5 && (
                <Link href="/alerts" className="text-sm text-blue-700">
                  Ver las {alerts.length} alertas
                </Link>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="budget">
          <BudgetTab project={p} />
        </TabsContent>
        <TabsContent value="materials">
          <MaterialsTab project={p} highlightPurchaseId={purchase} />
        </TabsContent>
        <TabsContent value="costs">
          <ActualCostsTab project={p} />
        </TabsContent>
        <TabsContent value="stages">
          <StagesTab project={p} />
        </TabsContent>
        <TabsContent value="items">
          <FurniturePanel project={p} canEdit />
        </TabsContent>
        <TabsContent value="hours">
          <HoursTab project={p} />
        </TabsContent>
        <TabsContent value="contract">
          <ContractTerms project={p} />
        </TabsContent>
        <TabsContent value="billing">
          <BillingTab project={p} />
        </TabsContent>
        <TabsContent value="activity">
          <ActivityTab project={p} />
        </TabsContent>
      </Tabs>

      {!closed && (
        <>
          <RecordDialog project={p} open={dialog === "record"} onOpenChange={onOpenChange} />
          <Dialog open={dialog === "hours"} onOpenChange={onOpenChange}>
            <DialogContent side="right">
              <DialogHeader>
                <DialogTitle>Registrar horas</DialogTitle>
                <DialogDescription>
                  {p.code} · Diseño, Administración u otros trabajos: persona, mueble, rubro y horas reales.
                </DialogDescription>
              </DialogHeader>
              <HoursForm project={p} onDone={() => setDialog(null)} showCost={false} />
            </DialogContent>
          </Dialog>
          <EditProjectDialog project={p} open={dialog === "edit"} onOpenChange={onOpenChange} />
          <StatusDialog project={p} open={dialog === "status"} onOpenChange={onOpenChange} />
          <CloseDialog project={p} open={dialog === "close"} onOpenChange={onOpenChange} />
        </>
      )}
    </div>
  );
}
