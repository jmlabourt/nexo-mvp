"use client";
import { useState } from "react";
import type { ActualEntry, RubroId } from "@/types";
import { useAppStore } from "@/store/use-app-store";
import { rubroLabel } from "@/lib/rubros";
import { parseDecimal } from "@/lib/schemas";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { useToday } from "@/store/selectors";

export function ExecutionReviews() {
  const projects = useAppStore((s) => s.projects);
  const assignments = useAppStore((s) => s.assignments);
  const operators = useAppStore((s) => s.operators);
  const local = useAppStore((s) => s.demoLocal);
  const [date,setDate] = useState("");
  const entries = projects.flatMap((p) => p.actualEntries).filter((e) => e.labor && e.operatorId && (!date || e.date === date));
  return <section className="space-y-3"><h2 className="font-semibold">Registros individuales de horas reales</h2><label className="text-sm">Fecha (vacío: todas)<Input className="max-w-48" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
    {entries.map((e) => {
      const p = projects.find((p) => p.id === e.projectId)!; const a = assignments.find((a) => a.id === e.assignmentId);
      return <details key={e.id} className="rounded border p-3 text-sm"><summary className="cursor-pointer">{operators.find((o) => o.id === e.operatorId)?.name} · {e.date} · {p.code} · {p.items.find((i) => i.id === e.itemId)?.name ?? "Sin mueble"} · {e.rubro ? rubroLabel(e.rubro) : "Sin rubro"} · {e.labor!.hours} h reales</summary>
        <p className="mt-2 text-xs text-slate-600">Plan original: {a ? `${a.date} · ${projects.find((p) => p.id === a.projectId)?.code} · ${rubroLabel(a.rubro)} · ${a.plannedHours} h` : "Sin asignación"}.</p>
        {(e.corrections ?? []).map((c,i) => <p key={i} className="text-xs mt-1">{c.at} · {c.by}: {c.reason} · Antes: {c.previous.date}, {c.previous.projectId}, {c.previous.itemId ?? "sin mueble"}, {c.previous.rubro}, {c.previous.hours} h → Después: {c.next.date}, {c.next.projectId}, {c.next.itemId ?? "sin mueble"}, {c.next.rubro}, {c.next.hours} h</p>)}
        {local && !p.isClosed ? <CorrectForm entry={e} /> : <p className="text-xs text-slate-500">La edición completa está preparada en el frontend local. Las empresas reales conservan el circuito de revisión existente.</p>}
      </details>;
    })}
    {!entries.length && <p className="text-sm text-slate-500">Sin registros para la fecha elegida.</p>}
  </section>;
}
function CorrectForm({ entry }: { entry: ActualEntry }) {
  const projects = useAppStore((s) => s.projects).filter((p) => !p.isClosed && p.status !== "quotation");
  const today = useToday();
  const [form,setForm] = useState({ date: entry.date,projectId:entry.projectId,itemId:entry.itemId ?? "",rubro:entry.rubro ?? "",hours:String(entry.labor?.hours ?? ""),reason:"" });
  const [error,setError] = useState("");
  const p = projects.find((p) => p.id === form.projectId); const item = p?.items.find((i) => i.id === form.itemId);
  const rubros = (item?.rubros ?? p?.items.flatMap((i) => i.rubros) ?? []).filter((r,i,all) => all.findIndex((x) => x.rubro === r.rubro) === i);
  return <form className="mt-3 grid gap-2 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); const r = useAppStore.getState().correctExecutionLocal({ ...form,entryId:entry.id,itemId:form.itemId || undefined,rubro:form.rubro as RubroId,hours:parseDecimal(form.hours) }); setError(r.ok ? "" : r.error); }}>
    <label>Fecha<Input type="date" required max={today} value={form.date} onChange={(e) => setForm({ ...form,date:e.target.value })} /></label>
    <label>Proyecto<Select value={form.projectId} onChange={(e) => setForm({ ...form,projectId:e.target.value,itemId:"",rubro:"" })}>{projects.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}</Select></label>
    <label>Mueble<Select value={form.itemId} onChange={(e) => setForm({ ...form,itemId:e.target.value,rubro:"" })}><option value="">Sin atribuir</option>{p?.items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</Select></label>
    <label>Rubro<Select required value={form.rubro} onChange={(e) => setForm({ ...form,rubro:e.target.value })}><option value="">Elegí…</option>{rubros.map((r) => <option key={r.rubro} value={r.rubro}>{rubroLabel(r.rubro)}</option>)}</Select></label>
    <label>Horas reales<Input required inputMode="decimal" value={form.hours} onChange={(e) => setForm({ ...form,hours:e.target.value })} /></label>
    <label>Motivo<Input required value={form.reason} onChange={(e) => setForm({ ...form,reason:e.target.value })} /></label>
    <Button type="submit">Guardar corrección con historial</Button>{error && <p role="alert" className="text-red-700">{error}</p>}
  </form>;
}
