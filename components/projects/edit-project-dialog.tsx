"use client";
// Editar la información de un proyecto (Administración / Comercial / Diseño y Gerencia): nombre, cliente, descripción,
// entrega y responsable. Guarda de verdad con updateProject (sin tocar costos ni precio). El cliente se elige de los ya
// cargados para no duplicar nombres (o se escribe uno nuevo).
import { useMemo, useState } from "react";
import type { Project } from "@/types";
import { clientsFrom } from "@/lib/directory";
import { useAppStore } from "@/store/use-app-store";
import { useConfirmedAction } from "@/store/confirmed-action";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function EditProjectDialog({ project, open, onOpenChange }: { project: Project; open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>{open && <EditForm project={project} onDone={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  );
}

function EditForm({ project, onDone }: { project: Project; onDone: () => void }) {
  const projects = useAppStore((s) => s.projects);
  const update = useConfirmedAction("updateProject");
  const clients = useMemo(() => clientsFrom(projects).map((c) => c.name), [projects]);
  const [v, setV] = useState({ name: project.name, client: project.client, description: project.description, dueDate: project.dueDate, owner: project.owner });
  const [error, setError] = useState("");
  const problem = v.name.trim().length < 3 ? "El nombre tiene que tener al menos 3 letras." : !v.client.trim() ? "Elegí o escribí el cliente." : !v.dueDate ? "Indicá la fecha de entrega." : v.dueDate < project.startDate ? "La entrega no puede ser antes del inicio." : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (problem) return setError(problem);
    const r = await update(project.id, { name: v.name.trim(), client: v.client.trim(), description: v.description.trim(), dueDate: v.dueDate, owner: v.owner.trim() });
    if (!r.ok) return setError(r.error);
    onDone();
  };

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>Editar información</DialogTitle>
        <DialogDescription>{project.code}. No cambia el costo presupuestado ni el precio.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre" htmlFor="ep-name" className="sm:col-span-2">
          <Input id="ep-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        </Field>
        <Field label="Cliente" htmlFor="ep-client" hint="Elegí uno de la lista para no duplicar.">
          <Input id="ep-client" list="ep-clients" value={v.client} onChange={(e) => setV({ ...v, client: e.target.value })} />
          <datalist id="ep-clients">
            {clients.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Fecha de entrega" htmlFor="ep-due">
          <Input id="ep-due" type="date" value={v.dueDate} onChange={(e) => setV({ ...v, dueDate: e.target.value })} />
        </Field>
        <Field label="Responsable" htmlFor="ep-owner">
          <Input id="ep-owner" value={v.owner} onChange={(e) => setV({ ...v, owner: e.target.value })} />
        </Field>
        <Field label="Descripción" htmlFor="ep-desc" className="sm:col-span-2">
          <Textarea id="ep-desc" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
        </Field>
      </div>
      {(error || problem) && <p role="alert" className="mt-3 text-sm text-red-600">{error || problem}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>Cancelar</Button>
        <Button type="submit" disabled={!!problem}>Guardar</Button>
      </DialogFooter>
    </form>
  );
}
