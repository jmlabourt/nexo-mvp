"use client";
import { useRef, useState } from "react";
import type { Operator, RubroId, WorkAssignment } from "@/types";
import { useAppStore } from "@/store/use-app-store";
import { useToday } from "@/store/selectors";
import { createId } from "@/lib/activity";
import { generalAllocations } from "@/lib/frontend-work";
import { hourlyCostAt, registerInternalHours } from "@/lib/ledger";
import { rubroLabel } from "@/lib/rubros";
import { parseDecimal } from "@/lib/schemas";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";

export function FlexibleWork({ operator, assignment, onSaved }: { operator: Operator; assignment?: WorkAssignment; onSaved: (message: string) => void }) {
  const all = useAppStore((s) => s.projects);
  const local = useAppStore((s) => s.demoLocal);
  const today = useToday();
  const [form,setForm] = useState({ projectId: assignment?.projectId ?? "", itemId: assignment?.itemId ?? "", rubro: assignment?.rubro ?? "", hours: "" });
  const [error,setError] = useState("");
  const [busy,setBusy] = useState(false);
  const request = useRef<string | null>(null);
  const projects = all.filter((p) => !p.isClosed && ["approved","purchasing","production","installation"].includes(p.status));
  const p = projects.find((p) => p.id === form.projectId);
  const item = p?.items.find((i) => i.id === form.itemId);
  const rubros = (item?.rubros ?? p?.items.flatMap((i) => i.rubros) ?? []).filter((r,i,all) => all.findIndex((x) => x.rubro === r.rubro) === i && (!operator.enabledRubros || operator.enabledRubros.includes(r.rubro)));
  if (!local) return <p className="text-xs text-slate-500">Cambiar la imputación o registrar trabajo sin asignación requiere integración del backend. Podés registrar la asignación original.</p>;
  return <form className="space-y-3 rounded border border-slate-200 p-3" onSubmit={(e) => {
    e.preventDefault(); if (busy) return; setBusy(true);
    const st = useAppStore.getState(); const hours = parseDecimal(form.hours);
    request.current ??= createId("exec");
    const result = form.projectId === "internal" ? st.recordLedger(["operario"],(l,ctx) => {
      const actual = all.flatMap((p) => p.actualEntries).filter((e) => e.operatorId === operator.id && e.date === today).reduce((s,e) => s+(e.labor?.hours ?? 0),0);
      const internal = l.internalHours.filter((h) => h.employeeId === operator.id && h.date === today).reduce((s,h) => s+h.hours,0);
      if (actual+internal+hours > 24) throw new Error("La suma de horas reales del día supera las 24 h.");
      const rate = hourlyCostAt(l,{ employeeId: operator.id, date: today },operator.hourlyCost);
      const next = registerInternalHours(l,{ employeeId: operator.id, date: today, hours, hourlyCost: rate, task: "Trabajo interno general" },ctx);
      const row = next.internalHours.at(-1)!;
      return { ...next, internalHours: next.internalHours.map((h) => h.id === row.id ? { ...h, allocations: generalAllocations(all,today,Math.round(hours*rate*100)/100) } : h) };
    }) : st.executeWorkLocal({ requestId: request.current, operatorId: operator.id, projectId: form.projectId, itemId: form.itemId || undefined, rubro: form.rubro as RubroId, date: assignment?.date ?? today, hours, assignmentId: assignment?.id });
    setBusy(false); setError(result.ok ? "" : result.error);
    if (result.ok) { request.current = null; setForm({ ...form,hours:"" }); onSaved("Horas reales registradas una sola vez. La planificación original se conserva."); }
  }}>
    <p className="text-xs text-slate-600">{assignment ? `Planificado: ${assignment.plannedHours} h. Registrá lo que realmente trabajaste.` : "Agregá otro trabajo válido o trabajo interno general."}</p>
    <label className="block text-sm">Proyecto<Select required value={form.projectId} onChange={(e) => setForm({ ...form,projectId:e.target.value,itemId:"",rubro:"" })}><option value="">Elegí…</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}<option value="internal">Trabajo interno general</option></Select></label>
    {p && <><label className="block text-sm">Mueble (opcional)<Select value={form.itemId} onChange={(e) => setForm({ ...form,itemId:e.target.value,rubro:"" })}><option value="">Sin atribuir a mueble</option>{p.items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</Select></label><label className="block text-sm">Rubro<Select required value={form.rubro} onChange={(e) => setForm({ ...form,rubro:e.target.value })}><option value="">Elegí…</option>{rubros.map((r) => <option key={r.rubro} value={r.rubro}>{rubroLabel(r.rubro)}</option>)}</Select></label></>}
    <label className="block text-sm">Horas reales<Input required inputMode="decimal" value={form.hours} onChange={(e) => setForm({ ...form,hours:e.target.value })} /></label>
    <Button type="submit" disabled={busy || !form.projectId}>Registrar ejecución real</Button>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </form>;
}
