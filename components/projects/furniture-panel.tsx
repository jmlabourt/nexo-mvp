"use client";
// Muebles del proyecto (Administración / Comercial / Diseño): cada mueble con su cantidad, estado de Diseño, etapas
// (pueden estar varias activas a la vez), lista de materiales (BOM), archivos, horas y observaciones.
// "Mueble" es el mismo registro que "producto" (project_items): no hay un modelo nuevo. Diseño, etapas y BOM todavía
// no tienen guardado en la base: en la demo se muestran datos de ejemplo y las acciones quedan deshabilitadas.
import type { DesignStatus, FurnitureDesign, FurnitureStage, Project } from "@/types";
import { formatNumber } from "@/lib/formatting";
import { itemHours } from "@/lib/production";
import { rubroLabel } from "@/lib/rubros";
import { useFurnitureDesign } from "@/store/session-data";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { AttachButton, AttachmentList } from "@/components/shared/attachments";
import { OriginTag, PendingAction } from "@/components/shared/data-origin";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ItemsTab } from "./items-tab";
import { BomVersions } from "./bom-versions";
import { unassignedMaterials } from "@/lib/ledger";
import { useAppStore } from "@/store/use-app-store";
import { MaterialChangesCard } from "./material-changes";

export const DESIGN_STATUS_LABELS: Record<DesignStatus, string> = {
  preparing: "Preparando planos",
  sent: "Planos enviados",
  waiting_approval: "Esperando aprobación",
  approved: "Diseño aprobado",
};

export const FURNITURE_STAGES: Array<{ id: FurnitureStage; label: string }> = [
  { id: "design", label: "Diseño" },
  { id: "purchasing", label: "Compras" },
  { id: "production", label: "Producción" },
  { id: "installation", label: "Instalación" },
  { id: "done", label: "Finalizado" },
];

export function FurniturePanel({ project, canEdit }: { project: Project; canEdit: boolean }) {
  const design = useFurnitureDesign(project);
  const demoLocal = useAppStore((s) => s.demoLocal);
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <div className="space-y-3">
        <Button variant="outline" onClick={() => setEditing(false)}>Volver a los muebles</Button>
        <ItemsTab project={project} />
      </div>
    );
  }
  const of = (itemId: string): FurnitureDesign | undefined => design.data.find((d) => d.itemId === itemId);
  // Materiales reales del proyecto (cotizado → real, con el motivo de Diseño): datos guardados, no de ejemplo.
  const realMaterials = <MaterialChangesCard project={project} amounts canCorrect={canEdit} />;

  if (project.items.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-slate-500">El proyecto todavía no tiene muebles: se cargan al cotizar.</p>
        {canEdit && !project.isClosed && <Button variant="outline" size="sm" onClick={() => setEditing(true)}>Agregar mueble</Button>}
        {realMaterials}
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {realMaterials}
      {demoLocal && unassignedMaterials(project).length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <strong>Pendiente de asignación:</strong> {unassignedMaterials(project).map((l) => l.description).join(", ")}. Estos materiales cotizados no tienen mueble: no se
          reparten solos. Asignalos al armar el BOM de cada mueble.
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
        <span className="flex flex-wrap items-center gap-2">Diseño, etapas y lista de materiales de cada mueble. <OriginTag origin={design.origin} /></span>
        {canEdit && !project.isClosed && <Button variant="outline" size="sm" onClick={() => setEditing(true)}>Agregar o editar muebles</Button>}
      </div>
      {project.items.map((item) => {
        const d = of(item.id);
        const hours = itemHours(project, item.id);
        const files = project.attachments.filter((a) => a.itemId === item.id);
        return (
          <Card key={item.id}>
            <CardHeader className="flex-row flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {item.name} <span className="text-sm font-normal text-slate-500">× {item.quantity}</span>
                  {d && <Badge tone={d.designStatus === "approved" ? "green" : "yellow"}>{DESIGN_STATUS_LABELS[d.designStatus]}</Badge>}
                </CardTitle>
                <p className="mt-1 text-sm text-slate-500">
                  {item.rubros.map((r) => `${rubroLabel(r.rubro)} ${formatNumber(r.hours)} h`).join(" · ")} · {formatNumber(hours)} h cargadas · {item.completedUnits} de {item.quantity} terminados
                </p>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Etapas (pueden ir a la vez)</h4>
                <ul className="flex flex-wrap gap-1.5" aria-label={`Etapas de ${item.name}`}>
                  {FURNITURE_STAGES.map((s) => {
                    const on = d?.stages.includes(s.id) ?? false;
                    return (
                      <li key={s.id}>
                        <span className={cn("inline-flex rounded-full border px-2.5 py-0.5 text-xs", on ? "border-blue-300 bg-blue-50 font-medium text-blue-800" : "border-slate-200 text-slate-400")} aria-current={on ? "step" : undefined}>
                          {s.label}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
              {demoLocal ? (
                <BomVersions project={project} item={item} canEdit={canEdit && !project.isClosed} />
              ) : (
              <div>
                <h4 className="mb-1 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Lista de materiales (BOM)
                  {d && <Badge tone={d.bomStatus === "ready" ? "green" : "gray"}>{d.bomStatus === "ready" ? "Lista para Compras" : "En preparación"}</Badge>}
                </h4>
                {!d || d.bom.length === 0 ? (
                  <p className="text-sm text-slate-500">Sin materiales cargados.</p>
                ) : (
                  <Table>
                    <THead>
                      <TR>
                        <TH>Material</TH>
                        <TH>Especificación</TH>
                        <TH className="text-right">Cantidad</TH>
                        <TH>Unidad</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {d.bom.map((l, i) => (
                        <TR key={i}>
                          <TD>{l.material}</TD>
                          <TD className="text-xs text-slate-500">{l.spec ?? "—"}</TD>
                          <TD className="text-right tabular">{formatNumber(l.quantity)}</TD>
                          <TD>{l.unit}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                )}
              </div>
              )}
              <div>
                <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Archivos</h4>
                <AttachmentList attachments={files} projectId={project.id} canRemove={canEdit && !project.isClosed} />
                {canEdit && !project.isClosed && <AttachButton projectId={project.id} itemId={item.id} />}
              </div>
              {canEdit && !project.isClosed && (
                <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-3">
                  <PendingAction label="Cambiar estado de Diseño" reason="" />
                  {!demoLocal && <PendingAction label="Editar BOM" reason="" />}
                  <PendingAction label="Marcar etapas" reason="Diseño, etapas y BOM se guardan cuando el backend lo habilite." />
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
