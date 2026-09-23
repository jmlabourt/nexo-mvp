"use client";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Project } from "@/types";
import { laborSchema, type LaborValues } from "@/lib/schemas";
import { resolveHourlyCost } from "@/lib/project-operations";
import { formatCurrency, todayISO } from "@/lib/formatting";
import { useAppStore } from "@/store/use-app-store";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";

export function LaborForm({ project, onDone }: { project: Project; onDone: () => void }) {
  const addActualEntry = useAppStore((s) => s.addActualEntry);
  const { register, handleSubmit, control, setError, formState } = useForm<LaborValues>({
    resolver: zodResolver(laborSchema),
    defaultValues: { role: "Carpintería", workerName: "", hourlyCost: resolveHourlyCost(project), date: todayISO(), description: "" },
  });
  const e = formState.errors;
  const hours = Number(useWatch({ control, name: "hours" })) || 0;
  const rate = Number(useWatch({ control, name: "hourlyCost" })) || 0;
  const total = hours * rate;
  const submit = (v: LaborValues) => {
    const res = addActualEntry(project.id, {
      type: "labor",
      description: v.description ?? "",
      date: v.date,
      labor: { role: v.role, workerName: v.workerName || undefined, hours: v.hours, hourlyCost: v.hourlyCost },
    });
    if (!res.ok) return setError("root", { message: res.error });
    onDone();
  };
  return (
    <form onSubmit={handleSubmit(submit)} noValidate className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Rol" htmlFor="l-role" error={e.role?.message}>
          <Input id="l-role" list="roles" {...register("role")} />
          <datalist id="roles">
            {["Carpintería", "Armado", "Oficina técnica", "Pintura", "Instalación"].map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </Field>
        <Field label="Persona (opcional)" htmlFor="l-worker">
          <Input id="l-worker" {...register("workerName")} />
        </Field>
        <Field label="Horas" htmlFor="l-hours" error={e.hours?.message}>
          <Input id="l-hours" type="number" step="any" min={0} {...register("hours", { valueAsNumber: true })} aria-invalid={!!e.hours} />
        </Field>
        <Field label="Costo por hora" htmlFor="l-rate" error={e.hourlyCost?.message}>
          <Input id="l-rate" type="number" step="any" min={0} {...register("hourlyCost", { valueAsNumber: true })} aria-invalid={!!e.hourlyCost} />
        </Field>
        <Field label="Fecha" htmlFor="l-date" error={e.date?.message}>
          <Input id="l-date" type="date" {...register("date")} />
        </Field>
        <Field label="Descripción" htmlFor="l-desc">
          <Input id="l-desc" {...register("description")} placeholder="Opcional" />
        </Field>
      </div>
      <div className="rounded-md bg-slate-50 p-3 text-sm">
        Total: <strong className="tabular" aria-live="polite">{formatCurrency(total)}</strong>
        <span className="text-slate-500"> (horas × costo por hora)</span>
      </div>
      {e.root && <p role="alert" className="text-sm text-red-600">{e.root.message}</p>}
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>Cancelar</Button>
        <Button type="submit">Registrar horas</Button>
      </DialogFooter>
    </form>
  );
}
