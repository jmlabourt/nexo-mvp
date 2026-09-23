"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRightLeft, ClipboardPen, FolderX, Lock, QrCode, ShoppingCart } from "lucide-react";
import { formatDate, daysBetween, todayISO } from "@/lib/formatting";
import { projectInsights } from "@/lib/insights";
import { useAppStore } from "@/store/use-app-store";
import { useProjectAlerts, useProjectView } from "@/store/selectors";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ProgressBar } from "@/components/ui/progress";
import { HealthBadge, StatusBadge } from "@/components/shared/badges";
import { EmptyState } from "@/components/shared/empty-state";
import { InsightList } from "@/components/shared/insight-list";
import { StatusTimeline } from "./status-timeline";
import { EconomicSummary } from "./economic-summary";
import { DeviationSection } from "./deviation-section";
import { ActivityTab } from "./activity-tab";
import { QrDialog } from "./qr-dialog";
import { StatusDialog } from "./status-dialog";
import { CloseDialog } from "./close-dialog";
import { BudgetTab } from "@/components/budget/budget-tab";
import { MaterialsTab } from "@/components/materials/materials-tab";
import { ActualCostsTab } from "@/components/actual-costs/actual-costs-tab";
import { RecordDialog } from "@/components/actual-costs/record-dialog";
import { PurchaseForm } from "@/components/materials/purchase-form";
import { AlertItem } from "@/components/alerts/alert-item";

type DialogName = "record" | "purchase" | "qr" | "status" | "close" | null;

export function ProjectDetail({ id }: { id: string }) {
  const view = useProjectView(id);
  const settings = useAppStore((s) => s.settings);
  const alerts = useProjectAlerts(view?.project);
  const [dialog, setDialog] = useState<DialogName>(null);
  const [tab, setTab] = useState("summary");
  const insights = useMemo(() => (view ? projectInsights(view.project) : []), [view]);

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
  const closed = p.isClosed;
  const daysLeft = daysBetween(todayISO(), p.dueDate);
  const openDialog = (d: DialogName) => () => setDialog(d);
  const onOpenChange = (o: boolean) => !o && setDialog(null);

  return (
    <div className="min-w-0 space-y-6">
      <header className="space-y-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <span className="font-medium">{p.code}</span>
              <StatusBadge status={p.status} />
              <HealthBadge health={health} />
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{p.name}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {p.client} · {p.projectType} · Responsable: {p.owner}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-600">
              <span>
                Entrega: <strong className="tabular text-slate-900">{formatDate(p.dueDate)}</strong>
                {!closed && <span className={daysLeft < 0 ? "text-red-700" : "text-slate-500"}> ({daysLeft < 0 ? `vencida hace ${-daysLeft} días` : `en ${daysLeft} días`})</span>}
              </span>
              <span className="flex items-center gap-2">
                Avance
                <ProgressBar value={p.progressPercent} className="w-28" />
                <strong className="tabular text-slate-900">{p.progressPercent}%</strong>
              </span>
              {closed && p.closedAt && <span>Cerrado el {formatDate(p.closedAt)}</span>}
            </div>
          </div>
          {!closed ? (
            <div className="flex flex-wrap gap-2 xl:justify-end">
              <Button onClick={openDialog("record")} size="lg">
                <ClipboardPen /> Registrar lo que pasó
              </Button>
              <Button variant="outline" onClick={openDialog("purchase")} size="lg">
                <ShoppingCart /> Registrar compra
              </Button>
              <Button variant="outline" onClick={openDialog("qr")} size="lg">
                <QrCode /> Generar QR
              </Button>
              <Button variant="outline" onClick={openDialog("status")} size="lg">
                <ArrowRightLeft /> Cambiar estado
              </Button>
              <Button variant="outline" onClick={openDialog("close")} size="lg" className="text-slate-700">
                <Lock /> Cerrar proyecto
              </Button>
            </div>
          ) : (
            <div className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-600">Proyecto cerrado · solo lectura</div>
          )}
        </div>
        <StatusTimeline status={p.status} />
      </header>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="summary">Resumen</TabsTrigger>
          <TabsTrigger value="budget">Presupuesto</TabsTrigger>
          <TabsTrigger value="materials">Materiales</TabsTrigger>
          <TabsTrigger value="costs">Costos reales</TabsTrigger>
          <TabsTrigger value="activity">Actividad</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="space-y-6">
          <EconomicSummary project={p} econ={econ} />
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Lectura rápida</CardTitle>
              </CardHeader>
              <CardContent>
                <InsightList insights={insights} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Alertas del proyecto</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {alerts.length === 0 ? (
                  <p className="text-sm text-slate-500">{closed ? "Los proyectos cerrados no generan alertas." : "Sin alertas abiertas."}</p>
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
          </div>
          <DeviationSection econ={econ} settings={settings} />
        </TabsContent>
        <TabsContent value="budget">
          <BudgetTab project={p} />
        </TabsContent>
        <TabsContent value="materials">
          <MaterialsTab project={p} />
        </TabsContent>
        <TabsContent value="costs">
          <ActualCostsTab project={p} />
        </TabsContent>
        <TabsContent value="activity">
          <ActivityTab project={p} />
        </TabsContent>
      </Tabs>

      {!closed && (
        <>
          <RecordDialog project={p} open={dialog === "record"} onOpenChange={onOpenChange} />
          <Dialog open={dialog === "purchase"} onOpenChange={onOpenChange}>
            <DialogContent side="right">
              <DialogHeader>
                <DialogTitle>Registrar compra</DialogTitle>
                <DialogDescription>
                  {p.code} · {p.name}
                </DialogDescription>
              </DialogHeader>
              <PurchaseForm project={p} onDone={() => setDialog(null)} />
            </DialogContent>
          </Dialog>
          <QrDialog project={p} open={dialog === "qr"} onOpenChange={onOpenChange} />
          <StatusDialog project={p} open={dialog === "status"} onOpenChange={onOpenChange} />
          <CloseDialog project={p} open={dialog === "close"} onOpenChange={onOpenChange} />
        </>
      )}
    </div>
  );
}
