"use client";
// Jefe de planta → Operarios (modo demostración): pendientes de asignar, asignaciones, disponibilidad (excepciones, no
// jornadas contractuales) y revisión de horas por jornada (confirmar o corregir el mismo registro).
import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { TimeEntry } from "@/lib/core/types";
import * as op from "@/lib/core/ops";
import { dayReviews } from "@/lib/core/hours";
import { employeeName, itemName, rubroName, workers } from "@/lib/core/lookup";
import { enabledRubros } from "@/lib/core/needs";
import { assignedToEmployeeOn, availabilityRows, isPlantProject, pendingToAssign } from "@/lib/core/plant";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { day, Empty, FormDialog, num, num2, Section, useAct, useCore, useDemoToday, useFlash } from "../kit";

const WD = ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sá"];

export function PlantaOperariosDemo({ tab }: { tab?: string }) {
  return (
    <div className="space-y-4">
      <PageHeader title="Operarios" />
      <Tabs defaultValue={tab && ["pendientes", "asignaciones", "disponibilidad", "revision"].includes(tab) ? tab : "pendientes"}>
        <TabsList>
          <TabsTrigger value="pendientes">Pendientes de asignar</TabsTrigger>
          <TabsTrigger value="asignaciones">Asignaciones</TabsTrigger>
          <TabsTrigger value="disponibilidad">Disponibilidad</TabsTrigger>
          <TabsTrigger value="revision">Revisión de horas</TabsTrigger>
        </TabsList>
        <TabsContent value="pendientes"><Pending /></TabsContent>
        <TabsContent value="asignaciones"><Assignments /></TabsContent>
        <TabsContent value="disponibilidad"><Availability /></TabsContent>
        <TabsContent value="revision"><Review /></TabsContent>
      </Tabs>
    </div>
  );
}

function Pending() {
  const w = useCore();
  const today = useDemoToday();
  const rows = pendingToAssign(w, today);
  if (rows.length === 0) return <Empty>Todo lo planificado tiene operario.</Empty>;
  return (
    <Section title="Horas planificadas sin distribuir">
      <Table>
        <THead><TR><TH>Fecha</TH><TH>OT</TH><TH>Mueble</TH><TH>Rubro</TH><TH className="text-right">Horas sin asignar</TH><TH /></TR></THead>
        <TBody>
          {rows.map((r) => {
            const p = w.projects.find((x) => x.id === r.projectId);
            return (
              <TR key={`${r.projectId}${r.itemId}${r.rubroId}${r.date}`}>
                <TD>{day(r.date)}</TD>
                <TD>{p?.ot.split("_")[0]}</TD>
                <TD>{itemName(p, r.itemId)}</TD>
                <TD>{rubroName(w, r.rubroId)}</TD>
                <TD className="text-right tabular">{num(r.pending, "h")}</TD>
                <TD><AssignDialog preset={{ projectId: r.projectId, itemId: r.itemId, rubroId: r.rubroId, from: r.date, to: r.date, hoursPerDay: String(r.pending) }} /></TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    </Section>
  );
}

type Preset = { projectId: string; itemId: string; rubroId: string; from: string; to: string; hoursPerDay: string; employeeId?: string; id?: string };

function AssignDialog({ preset, trigger }: { preset?: Preset; trigger?: React.ReactNode }) {
  const w = useCore();
  const act = useAct();
  const today = useDemoToday();
  const [f, setF] = useState<Preset>(preset ?? { projectId: "", itemId: "", rubroId: "", from: today, to: today, hoursPerDay: "" });
  const projects = w.projects.filter(isPlantProject);
  const p = projects.find((x) => x.id === f.projectId);
  const rubros = p && f.itemId ? enabledRubros(w, p, f.itemId) : [];
  const people = workers(w).filter((e) => !f.rubroId || e.rubroIds.includes(f.rubroId));
  return (
    <FormDialog
      trigger={trigger ?? <Button size="sm">Asignar</Button>}
      title={f.id ? "Editar asignación" : "Asignar trabajo"}
      submitLabel="Guardar"
      onSubmit={() => act((cw, ctx) => op.saveAssignment(cw, { id: f.id, projectId: f.projectId, itemId: f.itemId, rubroId: f.rubroId, employeeId: f.employeeId ?? "", from: f.from, to: f.to, hoursPerDay: num2(f.hoursPerDay) }, ctx))}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="OT" htmlFor="as-p">
          <Select id="as-p" value={f.projectId} onChange={(e) => setF({ ...f, projectId: e.target.value, itemId: "", rubroId: "" })}>
            <option value="">Elegí…</option>
            {projects.map((x) => <option key={x.id} value={x.id}>{x.ot.split("_")[0]}</option>)}
          </Select>
        </Field>
        <Field label="Mueble" htmlFor="as-i">
          <Select id="as-i" value={f.itemId} disabled={!p} onChange={(e) => setF({ ...f, itemId: e.target.value, rubroId: "" })}>
            <option value="">Elegí…</option>
            {p?.items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </Select>
        </Field>
        <Field label="Rubro" htmlFor="as-r">
          <Select id="as-r" value={f.rubroId} disabled={!f.itemId} onChange={(e) => setF({ ...f, rubroId: e.target.value })}>
            <option value="">Elegí…</option>
            {rubros.map((r) => <option key={r} value={r}>{rubroName(w, r)}</option>)}
          </Select>
        </Field>
        <Field label="Operario (habilitado para el rubro)" htmlFor="as-e">
          <Select id="as-e" value={f.employeeId ?? ""} onChange={(e) => setF({ ...f, employeeId: e.target.value })}>
            <option value="">Elegí…</option>
            {people.map((e) => <option key={e.id} value={e.id}>{e.name} · {assignedToEmployeeOn(w, e.id, f.from)} h asignadas el {day(f.from)}</option>)}
          </Select>
        </Field>
        <Field label="Desde" htmlFor="as-f"><Input id="as-f" type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
        <Field label="Hasta" htmlFor="as-t"><Input id="as-t" type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
        <Field label="Horas por día" htmlFor="as-h"><Input id="as-h" inputMode="decimal" value={f.hoursPerDay} onChange={(e) => setF({ ...f, hoursPerDay: e.target.value })} /></Field>
      </div>
    </FormDialog>
  );
}

function Assignments() {
  const w = useCore();
  const act = useAct();
  const today = useDemoToday();
  const flash = useFlash();
  const list = w.assignments.filter((a) => a.to >= today).sort((a, b) => a.from.localeCompare(b.from));
  return (
    <Section title="Asignaciones vigentes" actions={<AssignDialog trigger={<Button size="sm"><Plus /> Asignar trabajo</Button>} />}>
      {flash.node}
      {list.length === 0 ? <Empty>Sin asignaciones.</Empty> : (
        <Table>
          <THead><TR><TH>Operario</TH><TH>OT</TH><TH>Mueble · rubro</TH><TH>Desde</TH><TH>Hasta</TH><TH className="text-right">h/día</TH><TH /></TR></THead>
          <TBody>
            {list.map((a) => {
              const p = w.projects.find((x) => x.id === a.projectId);
              return (
                <TR key={a.id}>
                  <TD>{employeeName(w, a.employeeId)}</TD>
                  <TD>{p?.ot.split("_")[0]}</TD>
                  <TD>{itemName(p, a.itemId)} · {rubroName(w, a.rubroId)}</TD>
                  <TD>{day(a.from)}</TD>
                  <TD>{day(a.to)}</TD>
                  <TD className="text-right tabular">{num(a.hoursPerDay)}</TD>
                  <TD className="whitespace-nowrap">
                    <AssignDialog preset={{ ...a, hoursPerDay: String(a.hoursPerDay) }} trigger={<Button size="sm" variant="ghost">Editar</Button>} />
                    <Button size="sm" variant="ghost" aria-label="Quitar" onClick={() => flash.show(act((cw, ctx) => op.removeAssignment(cw, a.id, ctx)), "Asignación quitada.")}><Trash2 /></Button>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
    </Section>
  );
}

function Availability() {
  const w = useCore();
  const act = useAct();
  const today = useDemoToday();
  const flash = useFlash();
  const rows = availabilityRows(w, today);
  const [ex, setEx] = useState({ employeeId: "", date: today, hours: "0", note: "" });
  return (
    <Section
      title="Disponibilidad"
      actions={
        <FormDialog trigger={<Button size="sm">Cargar excepción</Button>} title="Ausencia o excepción" submitLabel="Guardar" note="Las jornadas habituales y las tarifas las define Gerencia." onSubmit={() => act((cw, ctx) => op.setException(cw, { employeeId: ex.employeeId, date: ex.date, availableHours: num2(ex.hours), note: ex.note }, ctx))}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Operario" htmlFor="ex-e">
              <Select id="ex-e" value={ex.employeeId} onChange={(e) => setEx({ ...ex, employeeId: e.target.value })}>
                <option value="">Elegí…</option>
                {workers(w).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </Select>
            </Field>
            <Field label="Fecha" htmlFor="ex-d"><Input id="ex-d" type="date" value={ex.date} onChange={(e) => setEx({ ...ex, date: e.target.value })} /></Field>
            <Field label="Horas que trabaja ese día (0 = ausente)" htmlFor="ex-h"><Input id="ex-h" inputMode="decimal" value={ex.hours} onChange={(e) => setEx({ ...ex, hours: e.target.value })} /></Field>
            <Field label="Nota" htmlFor="ex-n"><Input id="ex-n" value={ex.note} onChange={(e) => setEx({ ...ex, note: e.target.value })} /></Field>
          </div>
        </FormDialog>
      }
    >
      {flash.node}
      <Table>
        <THead><TR><TH>Operario</TH><TH>Días laborables</TH><TH>Rubros habilitados</TH><TH>Excepciones próximas</TH><TH className="text-right">Asignadas hoy</TH><TH className="text-right">Laborables hoy</TH></TR></THead>
        <TBody>
          {rows.map((r) => (
            <TR key={r.employee.id}>
              <TD>{r.employee.name}</TD>
              <TD>{r.employee.workDays.map((d) => WD[d]).join(" ")} · {r.employee.dailyHours} h</TD>
              <TD className="text-xs">{r.employee.rubroIds.map((x) => rubroName(w, x)).join(", ")}</TD>
              <TD className="text-xs">
                {r.exceptions.length === 0 ? "—" : (
                  <span className="flex flex-col gap-0.5">
                    {r.exceptions.slice(0, 4).map((x) => (
                      <span key={x.id} className="flex items-center gap-1">
                        {day(x.date)}: {x.availableHours === 0 ? "ausente" : `${x.availableHours} h`}{x.note ? ` · ${x.note}` : ""}
                        <button type="button" aria-label="Quitar excepción" className="text-slate-400 hover:text-red-600" onClick={() => flash.show(act((cw, ctx) => op.removeException(cw, x.id, ctx)), "Excepción quitada.")}>×</button>
                      </span>
                    ))}
                    {r.exceptions.length > 4 && <span className="text-slate-500">y {r.exceptions.length - 4} más</span>}
                  </span>
                )}
              </TD>
              <TD className={cn("text-right tabular", r.assignedToday > r.availableToday && "text-red-700")}>{num(r.assignedToday, "h")}</TD>
              <TD className="text-right tabular">{num(r.availableToday, "h")}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </Section>
  );
}

function Review() {
  const w = useCore();
  const act = useAct();
  const flash = useFlash();
  const [onlyPending, setOnlyPending] = useState(true);
  const reviews = useMemo(() => dayReviews(w, (e, d) => assignedToEmployeeOn(w, e, d)).filter((r) => !onlyPending || !r.reviewed), [w, onlyPending]);
  return (
    <Section title="Revisión de horas por jornada" actions={<label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} /> Solo sin revisar</label>}>
      {flash.node}
      {reviews.length === 0 ? <Empty>No hay jornadas para revisar.</Empty> : (
        <ul className="divide-y divide-slate-100">
          {reviews.slice(0, 40).map((r) => (
            <li key={`${r.employeeId}${r.date}`} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  <strong>{employeeName(w, r.employeeId)}</strong> · {day(r.date)} · asignadas {num(r.planned, "h")} · declaradas{" "}
                  <span className={cn(Math.abs(r.declared - r.planned) > 0.01 && "font-medium text-amber-700")}>{num(r.declared, "h")}</span>
                </span>
                {!r.reviewed && <Button size="sm" onClick={() => flash.show(act((cw, ctx) => op.confirmDay(cw, r.employeeId, r.date, ctx)), "Jornada confirmada.")}>Confirmar</Button>}
              </div>
              <ul className="mt-1 space-y-1 text-xs text-slate-600">
                {r.entries.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-2">
                    <span>{entryText(w, t)} · {num(t.hours, "h")}{t.review ? ` · ${t.review.status === "corrected" ? "corregida" : "confirmada"}` : ""}</span>
                    {t.corrections.length > 0 && <span className="text-slate-400">antes: {num(t.corrections[0].before.hours, "h")}</span>}
                    <CorrectDialog entry={t} />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function entryText(w: ReturnType<typeof useCore>, t: TimeEntry) {
  if (!t.projectId) return `Trabajo interno${t.note ? ` (${t.note})` : ""}`;
  const p = w.projects.find((x) => x.id === t.projectId);
  return `${p?.ot.split("_")[0]} · ${itemName(p, t.itemId)} · ${rubroName(w, t.rubroId)}`;
}

function CorrectDialog({ entry }: { entry: TimeEntry }) {
  const w = useCore();
  const act = useAct();
  const [f, setF] = useState({ projectId: entry.projectId ?? "", itemId: entry.itemId ?? "", rubroId: entry.rubroId ?? "", hours: String(entry.hours) });
  const p = w.projects.find((x) => x.id === f.projectId);
  return (
    <FormDialog
      trigger={<Button size="sm" variant="ghost" className="h-6 px-2 text-xs">Corregir</Button>}
      title="Corregir registro"
      submitLabel="Guardar corrección"
      note="Se corrige el mismo registro (queda la versión anterior) y se recalcula el costo de la OT. La planificación no cambia."
      onSubmit={() => act((cw, ctx) => op.correctEntry(cw, entry.id, { projectId: f.projectId || undefined, itemId: f.itemId || undefined, rubroId: f.rubroId || undefined, hours: num2(f.hours) }, ctx))}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="OT" htmlFor={`co-p-${entry.id}`}>
          <Select id={`co-p-${entry.id}`} value={f.projectId} onChange={(e) => setF({ ...f, projectId: e.target.value, itemId: "", rubroId: "" })}>
            <option value="">Trabajo interno</option>
            {w.projects.filter(isPlantProject).map((x) => <option key={x.id} value={x.id}>{x.ot.split("_")[0]}</option>)}
          </Select>
        </Field>
        {p && (
          <>
            <Field label="Mueble" htmlFor={`co-i-${entry.id}`}>
              <Select id={`co-i-${entry.id}`} value={f.itemId} onChange={(e) => setF({ ...f, itemId: e.target.value, rubroId: "" })}>
                <option value="">Elegí…</option>
                {p.items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </Select>
            </Field>
            <Field label="Rubro" htmlFor={`co-r-${entry.id}`}>
              <Select id={`co-r-${entry.id}`} value={f.rubroId} onChange={(e) => setF({ ...f, rubroId: e.target.value })}>
                <option value="">Elegí…</option>
                {(f.itemId ? enabledRubros(w, p, f.itemId) : []).map((r) => <option key={r} value={r}>{rubroName(w, r)}</option>)}
              </Select>
            </Field>
          </>
        )}
        <Field label="Horas" htmlFor={`co-h-${entry.id}`}><Input id={`co-h-${entry.id}`} inputMode="decimal" value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} /></Field>
      </div>
    </FormDialog>
  );
}
