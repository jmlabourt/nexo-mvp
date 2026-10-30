"use client";
// "Registrar mis horas" para Administración, Compras y el Jefe de planta: a un proyecto (se imputa a la OT con el
// costo por hora vigente) o "Trabajo interno general". En la demo se guarda en el navegador; en una empresa real,
// en la base: las horas son de quien las carga y el costo por hora lo congela el servidor (esos roles no leen tarifas).
import { useState } from "react";
import { Clock } from "lucide-react";
import type { SessionKey } from "@/lib/permissions";
import { hourlyCostAt, registerInternalHours } from "@/lib/ledger";
import { correctInternalWork } from "@/lib/internal-work";
import { generalAllocations } from "@/lib/frontend-work";
import { generalState } from "@/lib/gerencia";
import { formatNumber, todayISO } from "@/lib/formatting";
import { useAppStore } from "@/store/use-app-store";
import { useIdentity, useLedgerBacked } from "@/store/selectors";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PendingAction } from "@/components/shared/data-origin";

const INTERNAL = "__interno__";

export function OwnHoursButton({ projectId }: { projectId?: string }) {
  const ledgerBacked = useLedgerBacked();
  const demoLocal = useAppStore((s) => s.demoLocal);
  const projects = useAppStore((s) => s.projects);
  const ledger = useAppStore((s) => s.ledger);
  const employees = useAppStore((s) => s.operators);
  const adminRate = useAppStore((s) => s.hourRates.find((r) => r.category === "admin")?.hourlyRate ?? 0);
  const record = useAppStore((s) => s.recordLedger);
  const userId = useAppStore((s) => s.userId);
  const { session, actor: name } = useIdentity();
  const sessionName = session === "jefe_planta" ? "Jefe de planta" : session === "compras" ? "Compras" : session === "gerencia" ? "Gerencia" : "Administración";
  // En la demo todas las sesiones son el mismo usuario: la sesión distingue a la persona.
  // Empresa real: la persona es la cuenta (el servidor guarda de quién son las horas). Demo: la sesión distingue a la persona.
  const employee = employees.find((o) => (userId && o.userId === userId) || o.name === name);
  const actor = employee?.id ?? (demoLocal ? `${name} (${sessionName})` : (userId ?? name));
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ project: projectId ?? "", date: todayISO(), hours: "", task: "" });
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  // Gerencia no carga horas propias.
  if (session === "gerencia" || session === "operario") return null;
  if (!ledgerBacked) return <PendingAction label="Registrar mis horas" reason="Las horas del personal que no es operario se guardan cuando la base de tu empresa tenga habilitados estos registros." />;
  const active = projects.filter((p) => generalState(p) === "approved" || generalState(p) === "in_progress");
  const mine = ledger.internalHours.filter((h) => h.employeeId === actor && h.date === todayISO());

  const save = () => {
    const onProject = form.project && form.project !== INTERNAL ? form.project : undefined;
    const hourlyCost = hourlyCostAt(ledger, { employeeId: actor, date: form.date }, employee?.hourlyCost ?? adminRate);
    const sessions: SessionKey[] = ["administracion", "compras", "jefe_planta"];
    const r = record(sessions, (l, ctx) =>
      (() => {
        const next = registerInternalHours(l, { employeeId: actor, projectId: onProject, date: form.date, hours: Number(form.hours.replace(",", ".")), task: form.task, hourlyCost }, ctx);
        if (!demoLocal || onProject) return next;
        const last = next.internalHours.at(-1)!;
        return { ...next, internalHours: next.internalHours.map((h) => h.id === last.id ? { ...h, allocations: generalAllocations(projects, h.date, Math.round(h.hours * hourlyCost * 100) / 100) } : h) };
      })(),
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
                interno general reparte su costo entre los proyectos activos de la fecha trabajada (disponible en frontend local).
              </DialogDescription>
            </DialogHeader>
            <label className="block text-sm font-medium text-slate-700">
              ¿En qué?
              <Select className="mt-1" value={form.project} onChange={(e) => setForm({ ...form, project: e.target.value })}>
                <option value="">Elegí…</option>
                {active.map((p) => (
                  <option key={p.id} value={p.id}>{p.code} {p.name}</option>
                ))}
                <option value={INTERNAL}>Trabajo interno general</option>
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
            {demoLocal && <details className="border-t pt-2"><summary className="cursor-pointer text-sm">Mis registros recientes y correcciones</summary>{ledger.internalHours.filter((h) => h.employeeId === actor).slice(-20).reverse().map((h) => <OwnHoursCorrection key={h.id} id={h.id} />)}</details>}
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

function OwnHoursCorrection({ id }: { id: string }) {
  const row = useAppStore((s) => s.ledger.internalHours.find((h) => h.id === id));
  const [date,setDate] = useState(row?.date ?? "");
  const [hours,setHours] = useState(String(row?.hours ?? ""));
  const [reason,setReason] = useState(""); const [error,setError] = useState("");
  if (!row) return null;
  return <details className="mt-2 rounded border p-2 text-xs"><summary className="cursor-pointer">{row.date} · {row.hours} h · {row.projectId ? "Proyecto" : "Trabajo interno general"}</summary>
    <label className="block">Nueva fecha<Input type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} /></label>
    <label className="block">Horas reales<Input inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} /></label>
    <label className="block">Motivo<Input value={reason} onChange={(e) => setReason(e.target.value)} /></label>
    <Button size="sm" onClick={() => { const st=useAppStore.getState(); const r = st.recordLedger(["administracion","compras","jefe_planta"],(l,ctx) => correctInternalWork(l,st.projects,id,{ date,hours:Number(hours.replace(",",".")),reason },ctx)); setError(r.ok ? "" : r.error); }}>Guardar corrección</Button>
    {(row.corrections ?? []).map((c,i) => <p key={i}>{c.at} · {c.by} · {c.reason}: {c.previous.date} / {c.previous.hours} h → {c.next.date} / {c.next.hours} h</p>)}
    {error && <p role="alert" className="text-red-700">{error}</p>}
  </details>;
}
