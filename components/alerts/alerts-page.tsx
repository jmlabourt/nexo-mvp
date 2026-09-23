"use client";
import { useState } from "react";
import { BellOff } from "lucide-react";
import { useAlerts } from "@/store/selectors";
import { PageHeader } from "@/components/shared/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { AlertItem } from "./alert-item";
import type { Alert } from "@/types";

function List({ alerts, resolved = false }: { alerts: Alert[]; resolved?: boolean }) {
  if (alerts.length === 0) return <EmptyState icon={BellOff} title="No hay alertas en esta vista" />;
  return (
    <div className="space-y-3">
      {alerts.map((a) => (
        <AlertItem key={a.id} alert={a} resolved={resolved} />
      ))}
    </div>
  );
}

export function AlertsPage() {
  const { open, resolved } = useAlerts();
  const [tab, setTab] = useState("all");
  const critical = open.filter((a) => a.level === "critical");
  const warning = open.filter((a) => a.level === "warning");
  return (
    <div>
      <PageHeader title="Alertas" subtitle="Se calculan automáticamente a partir de los registros y de los umbrales de Configuración." />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">Todas <span className="ml-1 text-xs text-slate-400">{open.length}</span></TabsTrigger>
          <TabsTrigger value="critical">Críticas <span className="ml-1 text-xs text-slate-400">{critical.length}</span></TabsTrigger>
          <TabsTrigger value="warning">Atención <span className="ml-1 text-xs text-slate-400">{warning.length}</span></TabsTrigger>
          <TabsTrigger value="resolved">Resueltas <span className="ml-1 text-xs text-slate-400">{resolved.length}</span></TabsTrigger>
        </TabsList>
        <TabsContent value="all"><List alerts={open} /></TabsContent>
        <TabsContent value="critical"><List alerts={critical} /></TabsContent>
        <TabsContent value="warning"><List alerts={warning} /></TabsContent>
        <TabsContent value="resolved">
          <p className="mb-3 text-sm text-slate-500">Marcar una alerta como resuelta no cambia los números: si la situación empeora, vuelve a aparecer con el nuevo nivel.</p>
          <List alerts={resolved} resolved />
        </TabsContent>
      </Tabs>
    </div>
  );
}
