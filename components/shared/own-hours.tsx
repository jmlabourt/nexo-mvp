"use client";
// "Registrar mis horas" para Administración, Compras y el Jefe de planta: a un proyecto (se imputa a la OT con el
// costo por hora vigente) o "Trabajo interno (sin proyecto)". En la demo se guarda de verdad (lib/ledger.ts); en una
// empresa real queda como "Pendiente de backend".
import { useState } from "react";
import { Clock } from "lucide-react";
import type { SessionKey } from "@/lib/permissions";
import { hourlyCostAt, registerInternalHours } from "@/lib/ledger";
import { generalState } from "@/lib/gerencia";
import { formatNumber, todayISO } from "@/lib/formatting";
import { useAppStore } from "@/store/use-app-store";
import { useIdentity } from "@/store/selectors";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PendingAction } from "@/components/shared/data-origin";

const INTERNAL = "__interno__";

export function OwnHoursButton({ projectId }: { projectId?: string }) {
  const demoLocal = useAppStore((s) => s.demoLocal);
  const projects = useAppStore((s) => s.projects);
  const ledger = useAppStore((s) => s.ledger);
  const adminRate = useAppStore((s) => s.hourRates.find((r) => r.category === "admin")?.hourlyRate ?? 0);
  const record = useAppStore((s) => s.recordLedger);
  const { session, actor: name } = useIdentity();
  const sessionName = session === "jefe_planta" ? "Jefe de planta" : session === "compras" ? "Compras" : session === "gerencia" ? "Gerencia" : "Administración";
  // En la demo todas las sesiones son el mismo usuario: la sesión distingue a la persona.
  const actor = `${name} (${sessionName})`;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ project: projectId ?? "", date: todayISO(), hours: "", task: "" });
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  if (!demoLocal) return <PendingAction label="Registrar mis horas" reason="Las horas del personal que no es operario se guardan cuando el backend lo habilite." />;
  const active = projects.filter((p) => generalState(p) === "approved" || generalState(p) === "in_progress");
  const mine = ledger.internalHours.filter((h) => h.employeeId === actor && h.date === todayISO());

  const save = () => {
    const onProject = form.project && form.project !== INTERNAL ? form.project : undefined;
    const hourlyCost = hourlyCostAt(ledger, { employeeId: actor, date: form.date }, adminRate);
    const sessions: SessionKey[] = ["administracion", "compras", "jefe_planta", "gerencia"];
    const r = record(sessions, (l, ctx) =>
      registerInternalHours(l, { employeeId: actor, projectId: onProject, date: form.date, hours: Number(form.hours.replace(",", ".")), task: form.task, hourlyCost }, ctx),
    );
    if (!r.ok) return setError(r.error);
    setError("");
    setDone(`${form.hours} h registradas${onProject ? ` en ${projects.find((p) => p.id === onProject)?.code}` : " como trabajo interno"}.`);
    setForm({ ...form, hours: "", task: "" });
    setOpen(false);
  };

  return (
    <>
      <span className="inline-flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Clock /> Registrar mis horas
        </Button>
        {done && <span role="status" className="text-xs text-emerald-700">{done}</span>}
        {!done && mine.length > 0 && <span className="text-xs text-slate-500">Hoy: {formatNumber(mine.reduce((s, h) => s + h.hours, 0))} h</span>}
      </span>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form
            noValidate
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <DialogHeader>
              <DialogTitle>Registrar mis horas</DialogTitle>
              <DialogDescription>
                {actor}. Las horas de un proyecto suman a su costo; el trabajo
                interno no se imputa a ninguna OT.
              </DialogDescription>
            </DialogHeader>
            <label className="block text-sm font-medium text-slate-700">
              ¿En qué?
              <Select className="mt-1" value={form.project} onChange={(e) => setForm({ ...form, project: e.target.value })}>
                <option value="">Elegí…</option>
                {active.map((p) => (
                  <option key={p.id} value={p.id}>{p.code} {p.name}</option>
                ))}
                <option value={INTERNAL}>Trabajo interno (sin proyecto)</option>
              </Select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm font-medium text-slate-700">
                Fecha
                <Input className="mt-1" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Horas
                <Input className="mt-1" inputMode="decimal" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} />
              </label>
            </div>
            <label className="block text-sm font-medium text-slate-700">
              Tarea
              <Input className="mt-1" value={form.task} onChange={(e) => setForm({ ...form, task: e.target.value })} placeholder="Planos, pedidos a proveedores, control de calidad…" />
            </label>
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={!form.project}>Guardar horas</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
