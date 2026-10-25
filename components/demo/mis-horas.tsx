"use client";
// "Registrar mis horas" (Administración, Compras, Jefe de planta y, opcional, Gerencia) en el modo demostración.
// La persona sale de la sesión; la fecha arranca en hoy. Varias tareas por día: una OT (con mueble opcional) o Trabajo
// interno, que no se imputa a ninguna OT. Sin mínimo diario.
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { saveDayHours } from "@/lib/core/ops";
import { categoryName, clientName, itemName } from "@/lib/core/lookup";
import { r2, sumBy } from "@/lib/core/util";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { day, Empty, num, num2, Section, useAct, useCore, useDemoToday, useFlash, useSessionPerson } from "./kit";

interface Row {
  key: string;
  projectId: string;
  itemId: string;
  hours: string;
  note: string;
}

const INTERNAL = "interno";

export function MisHorasDemo() {
  const w = useCore();
  const today = useDemoToday();
  const person = useSessionPerson();
  const act = useAct();
  const flash = useFlash();
  const [date, setDate] = useState(today);
  const existing = w.timeEntries.filter((t) => t.employeeId === person?.id && t.date === date);
  const fromSaved = (): Row[] => existing.map((t) => ({ key: t.id, projectId: t.projectId ?? INTERNAL, itemId: t.itemId ?? "", hours: String(t.hours), note: t.note ?? "" }));
  const [rows, setRows] = useState<Row[] | null>(null);
  const list = rows ?? (existing.length ? fromSaved() : [{ key: "r0", projectId: "", itemId: "", hours: "", note: "" }]);
  const projects = w.projects.filter((p) => p.status !== "closed");
  const total = r2(sumBy(list, (r) => (Number.isFinite(num2(r.hours)) ? num2(r.hours) : 0)));
  const recent = w.timeEntries.filter((t) => t.employeeId === person?.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15);
  if (!person) return <Empty>No hay una persona con esta sesión en Usuarios y permisos.</Empty>;
  const set = (key: string, patch: Partial<Row>) => setRows(list.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-4">
      <PageHeader title="Registrar mis horas" />
      <Section title={`${person.name} · ${categoryName(w, person.categoryId)}`}>
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            Fecha
            <Input type="date" value={date} max={today} onChange={(e) => { setDate(e.target.value); setRows(null); flash.clear(); }} className="w-44" />
          </label>
        </div>
        <Table>
          <THead><TR><TH>OT o trabajo interno</TH><TH>Mueble (opcional)</TH><TH>Nota</TH><TH className="text-right">Horas</TH><TH /></TR></THead>
          <TBody>
            {list.map((r) => {
              const p = projects.find((x) => x.id === r.projectId);
              return (
                <TR key={r.key}>
                  <TD>
                    <Select aria-label="OT" className="h-8 min-w-[14rem]" value={r.projectId} onChange={(e) => set(r.key, { projectId: e.target.value, itemId: "" })}>
                      <option value="">Elegí…</option>
                      <option value={INTERNAL}>Trabajo interno</option>
                      {projects.map((x) => <option key={x.id} value={x.id}>{x.ot.split("_")[0]} · {clientName(w, x.clientId)}</option>)}
                    </Select>
                  </TD>
                  <TD>
                    <Select aria-label="Mueble" className="h-8" value={r.itemId} disabled={!p} onChange={(e) => set(r.key, { itemId: e.target.value })}>
                      <option value="">General</option>
                      {p?.items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </Select>
                  </TD>
                  <TD><Input aria-label="Nota" className="h-8" value={r.note} onChange={(e) => set(r.key, { note: e.target.value })} /></TD>
                  <TD className="text-right"><Input aria-label="Horas" inputMode="decimal" className="ml-auto h-8 w-20 text-right" value={r.hours} onChange={(e) => set(r.key, { hours: e.target.value })} /></TD>
                  <TD><button type="button" aria-label="Quitar" className="text-slate-400 hover:text-red-600" onClick={() => setRows(list.filter((x) => x.key !== r.key))}><Trash2 className="size-4" /></button></TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <Button size="sm" variant="outline" onClick={() => setRows([...list, { key: `r${Date.now()}`, projectId: "", itemId: "", hours: "", note: "" }])}><Plus /> Agregar tarea</Button>
          <span className="text-sm">Total del día: <strong className="tabular">{num(total, "h")}</strong></span>
        </div>
        <Button
          className="mt-3"
          onClick={() => {
            const r = act((cw, ctx) =>
              saveDayHours(cw, { employeeId: person.id, date, rows: list.filter((x) => x.projectId && num2(x.hours) > 0).map((x) => (x.projectId === INTERNAL ? { hours: num2(x.hours), note: x.note } : { projectId: x.projectId, itemId: x.itemId || undefined, hours: num2(x.hours), note: x.note })) }, ctx),
            );
            if (r.ok) setRows(null);
            flash.show(r, `Guardado: ${num(total, "h")} el ${day(date)}.`);
          }}
        >
          Guardar registro del día
        </Button>
        <div className="mt-2">{flash.node}</div>
      </Section>
      <Section title="Últimos registros">
        {recent.length === 0 ? <Empty>Todavía no cargaste horas.</Empty> : (
          <Table>
            <TBody>
              {recent.map((t) => {
                const p = w.projects.find((x) => x.id === t.projectId);
                return (
                  <TR key={t.id}>
                    <TD className="whitespace-nowrap">{day(t.date)}</TD>
                    <TD>{p ? `${p.ot.split("_")[0]}${t.itemId ? ` · ${itemName(p, t.itemId)}` : ""}` : "Trabajo interno"}</TD>
                    <TD className="text-xs text-slate-500">{t.note}</TD>
                    <TD className="text-right tabular">{num(t.hours, "h")}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Section>
    </div>
  );
}
