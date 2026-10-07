"use client";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import type { Project } from "@/types";
import { formatCurrency } from "@/lib/formatting";
import { useAppStore } from "@/store/use-app-store";
import { useIdentity } from "@/store/selectors";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { AttachButton, AttachmentList } from "@/components/shared/attachments";

/** Muebles del proyecto: permiten asociar materiales, horas, archivos y costos a una pieza. */
export function ItemsTab({ project }: { project: Project }) {
  const addItem = useAppStore((s) => s.addItem);
  const removeItem = useAppStore((s) => s.removeItem);
  const { isManager } = useIdentity();
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const editable = isManager && !project.isClosed;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const r = addItem(project.id, { name, quantity: Number(qty), ...(description.trim() ? { description } : {}) });
    if (!r.ok) return setError(r.error);
    setName(""); setQty("1"); setDescription(""); setError("");
  };

  const costOf = (itemId: string | undefined) => {
    const mats = project.materialUsages.filter((u) => u.itemId === itemId).reduce((s, u) => s + (u.quantityConsumed + u.wasteQuantity) * u.unitCost, 0);
    const other = project.actualEntries.filter((a) => a.itemId === itemId).reduce((s, a) => s + a.amount, 0);
    return { mats, other, total: mats + other };
  };
  const general = project.attachments.filter((a) => !a.itemId && !a.stage);
  const generalCost = costOf(undefined);

  return (
    <div className="space-y-6">
      {editable && (
        <Card>
          <CardHeader>
            <CardTitle>Agregar mueble</CardTitle>
            <CardDescription>Opcional. Si lo cargás, los materiales, horas y archivos se pueden asociar a cada mueble o a “General del proyecto”.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="grid gap-4 md:grid-cols-[2fr_1fr_3fr_auto] md:items-end" noValidate>
              <Field label="Nombre" htmlFor="it-name"><Input id="it-name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
              <Field label="Cantidad" htmlFor="it-qty"><Input id="it-qty" type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
              <Field label="Descripción (opcional)" htmlFor="it-desc"><Input id="it-desc" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
              <Button type="submit">Agregar</Button>
              {error && <p role="alert" className="text-sm text-red-600 md:col-span-4">{error}</p>}
            </form>
          </CardContent>
        </Card>
      )}

      {project.items.map((it) => {
        const c = costOf(it.id);
        const files = project.attachments.filter((a) => a.itemId === it.id);
        return (
          <Card key={it.id}>
            <CardHeader className="flex-row items-start justify-between gap-2">
              <div>
                <CardTitle>{it.name} <span className="text-sm font-normal text-slate-500">× {it.quantity}</span></CardTitle>
                {it.description && <CardDescription>{it.description}</CardDescription>}
              </div>
              {editable && (
                <Button size="icon" variant="ghost" aria-label={`Quitar ${it.name}`} onClick={() => removeItem(project.id, it.id)}><Trash2 /></Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {isManager && (
                <p className="text-sm text-slate-600">
                  Costo real asociado: <strong className="tabular">{formatCurrency(c.total)}</strong>
                  <span className="text-slate-400"> · materiales {formatCurrency(c.mats)} · otros {formatCurrency(c.other)}</span>
                </p>
              )}
              <AttachmentList attachments={files} projectId={project.id} canRemove={editable} />
              {!project.isClosed && <AttachButton projectId={project.id} itemId={it.id} />}
            </CardContent>
          </Card>
        );
      })}

      <Card>
        <CardHeader>
          <CardTitle>General del proyecto</CardTitle>
          <CardDescription>Planos, fotos y documentos que no son de un mueble en particular.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isManager && project.items.length > 0 && (
            <p className="text-sm text-slate-600">Costo real sin mueble asignado: <strong className="tabular">{formatCurrency(generalCost.total)}</strong></p>
          )}
          <AttachmentList attachments={general} projectId={project.id} canRemove={editable} />
          {!project.isClosed && <AttachButton projectId={project.id} />}
        </CardContent>
      </Card>
    </div>
  );
}
