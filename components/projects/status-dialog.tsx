"use client";
import { useState } from "react";
import type { Project, ProjectStatus } from "@/types";
import { STATUS_LABELS, STATUS_ORDER } from "@/lib/constants";
import { useAppStore } from "@/store/use-app-store";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Choice } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function StatusDialog({ project, open, onOpenChange }: { project: Project; open: boolean; onOpenChange: (o: boolean) => void }) {
  const changeProjectStatus = useAppStore((s) => s.changeProjectStatus);
  const setProgress = useAppStore((s) => s.setProgress);
  const [status, setStatus] = useState<ProjectStatus>(project.status);
  const [progress, setProgressValue] = useState(String(project.progressPercent));
  const [error, setError] = useState("");
  const options = STATUS_ORDER.filter((s) => s !== "completed");
  const lockWarning = (status === "purchasing" || status === "production" || status === "installation") && (project.status === "quotation" || project.status === "approved");

  const save = () => {
    const p = Number(progress);
    if (!Number.isFinite(p) || p < 0 || p > 100) return setError("El avance debe estar entre 0 y 100.");
    const r1 = changeProjectStatus(project.id, status);
    if (!r1.ok) return setError(r1.error);
    setProgress(project.id, p);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (o) { setStatus(project.status); setProgressValue(String(project.progressPercent)); setError(""); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cambiar estado y avance</DialogTitle>
          <DialogDescription>Para finalizar el proyecto usá “Cerrar proyecto”.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-slate-700">Estado</legend>
            <Choice<ProjectStatus> name="Estado" columns={3} value={status} onChange={setStatus} options={options.map((s) => ({ value: s, label: STATUS_LABELS[s] }))} />
          </fieldset>
          {lockWarning && (
            <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
              Al pasar a ejecución, el presupuesto queda bloqueado como línea base para medir desvíos.
            </p>
          )}
          <Field label="Avance (%) — carga manual" htmlFor="progress" hint="No se calcula automáticamente: lo informa el responsable.">
            <Input id="progress" type="number" min={0} max={100} value={progress} onChange={(e) => setProgressValue(e.target.value)} />
          </Field>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
