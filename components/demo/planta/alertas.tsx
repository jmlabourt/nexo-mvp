"use client";
// Jefe de planta → Alertas (modo demostración): solo hechos comprobables, sin importes.
import { useMemo } from "react";
import { plantaAlerts } from "@/lib/core/alerts";
import { PageHeader } from "@/components/shared/page-header";
import { AlertList, Section, useCore, useDemoToday } from "../kit";

export function PlantaAlertasDemo() {
  const w = useCore();
  const today = useDemoToday();
  const alerts = useMemo(() => plantaAlerts(w, today), [w, today]);
  return (
    <div className="space-y-4">
      <PageHeader title="Alertas" />
      <Section title={`${alerts.length} alerta${alerts.length === 1 ? "" : "s"}`}>
        <AlertList
          alerts={alerts}
          hrefOf={(a) => (a.kind === "hours_review" ? "/planta/operarios?tab=revision" : a.kind === "unassigned" ? "/planta/operarios?tab=pendientes" : a.projectId ? `/planta/proyectos?p=${a.projectId}` : undefined)}
        />
      </Section>
    </div>
  );
}
