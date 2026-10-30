"use client";
import { useState } from "react";
import type { ExternalWork, RubroId } from "@/types";
import { useAppStore } from "@/store/use-app-store";
import { useIdentity, useToday } from "@/store/selectors";
import { registerExternal, confirmExternal } from "@/lib/frontend-work";
import { formatCurrency, formatNumber } from "@/lib/formatting";
import { rubroLabel } from "@/lib/rubros";
import { parseDecimal } from "@/lib/schemas";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export function ExternalWorkSection({ projectId }: { projectId?: string }) {
  const projects = useAppStore((s) => s.projects);
  const ledger = useAppStore((s) => s.ledger);
  const local = useAppStore((s) => s.demoLocal);
  const record = useAppStore((s) => s.recordLedger);
  const { session } = useIdentity();
  const today = useToday();
  const manager = session === "gerencia";
  const active = projects.filter((p) => !p.isClosed && p.status !== "quotation");
  const [form,setForm] = useState({ projectId: projectId ?? active[0]?.id ?? "", itemId: "", rubro: "", kind: "hourly", date: today, description: "", supplier: "", hours: "", cost: "" });
  const [error,setError] = useState("");
  const [done,setDone] = useState("");
  const p = active.find((p) => p.id === form.projectId);
  const item = p?.items.find((i) => i.id === form.itemId);
  const rubros = (item?.rubros ?? p?.items.flatMap((i) => i.rubros) ?? []).filter((r,i,all) => all.findIndex((x) => x.rubro === r.rubro) === i);
  const rows = (ledger.externalWork ?? []).filter((r) => !projectId || r.projectId === projectId);
  return <Card>
    <CardHeader><CardTitle>Operarios externos y tercerizaciones</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      {!local && <p className="text-sm text-slate-500">Los nuevos registros externos y su confirmación están preparados en el frontend local. Su guardado en empresas reales requiere integración del backend.</p>}
      {rows.map((row) => <ExternalRow key={row.id} row={row} manager={manager && local} project={projects.find((p) => p.id === row.projectId)?.code ?? row.projectId} />)}
      {!manager && local && <details><summary className="cursor-pointer text-sm font-medium">Registrar trabajo externo</summary>
        <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={(e) => {
          e.preventDefault();
          const r = record(["jefe_planta"], (l,ctx) => registerExternal(l,projects,{ projectId: form.projectId, itemId: form.itemId || undefined, rubro: form.rubro as RubroId, kind: form.kind as "hourly" | "workshop", date: form.date, description: form.description, supplier: form.supplier || undefined, hours: form.kind === "hourly" ? parseDecimal(form.hours) : undefined, estimatedCost: form.cost.trim() ? parseDecimal(form.cost) : undefined },ctx));
          setError(r.ok ? "" : r.error);
          if (r.ok) { setDone("Trabajo registrado. Gerencia debe confirmar el costo definitivo."); setForm({ ...form, hours: "", cost: "", description: "" }); }
        }}>
          <label className="text-sm">Proyecto<Select value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value, itemId: "", rubro: "" })}>{active.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</Select></label>
          <label className="text-sm">Tipo<Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}><option value="hourly">Operario externo por horas</option><option value="workshop">Trabajo a taller tercero (precio cerrado)</option></Select></label>
          <label className="text-sm">Mueble (opcional)<Select value={form.itemId} onChange={(e) => setForm({ ...form, itemId: e.target.value, rubro: "" })}><option value="">Sin atribución a mueble</option>{p?.items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</Select></label>
          <label className="text-sm">Rubro<Select required value={form.rubro} onChange={(e) => setForm({ ...form, rubro: e.target.value })}><option value="">Elegí…</option>{rubros.map((r) => <option key={r.rubro} value={r.rubro}>{rubroLabel(r.rubro)}</option>)}</Select></label>
          <label className="text-sm">Fecha<Input type="date" max={today} required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
          {form.kind === "hourly" && <label className="text-sm">Horas reales de la persona<Input required inputMode="decimal" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} /></label>}
          <label className="text-sm">Persona / proveedor (opcional)<Input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} /></label>
          <label className="text-sm">Costo conocido (opcional)<Input inputMode="decimal" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} placeholder="Pendiente de confirmar" /></label>
          <label className="text-sm sm:col-span-2">Descripción<Input required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <Button type="submit">Guardar trabajo externo</Button>
        </form>
      </details>}
      {manager && !rows.length && <p className="text-sm text-slate-500">No hay trabajos externos registrados.</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {done && <p role="status" className="text-sm text-emerald-700">{done}</p>}
    </CardContent>
  </Card>;
}
function ExternalRow({ row, manager, project }: { row: ExternalWork; manager: boolean; project: string }) {
  const record = useAppStore((s) => s.recordLedger);
  const [reason,setReason] = useState("");
  const closed = useAppStore((s) => s.projects.find((p) => p.id === row.projectId)?.isClosed);
  const [amount,setAmount] = useState(String(row.confirmedCost ?? row.estimatedCost ?? ""));
  const [error,setError] = useState("");
  return <div className="rounded border border-slate-200 p-3 text-sm space-y-2">
    <p><strong>{project} · {row.description}</strong> · {row.date} · {rubroLabel(row.rubro)}{row.kind === "hourly" ? ` · ${formatNumber(row.hours ?? 0)} h externas` : " · Taller tercero"}{row.supplier && ` · ${row.supplier}`}</p>
    <p>{row.confirmedCost !== undefined ? `Costo confirmado por ${row.confirmedBy}: ${formatCurrency(row.confirmedCost)}` : row.estimatedCost !== undefined ? `Estimación: ${formatCurrency(row.estimatedCost)} · Pendiente de confirmar por Gerencia` : "Costo pendiente de confirmar"}</p>
    {manager && !closed && <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (!amount.trim()) return setError("Indicá el costo definitivo."); const r = record(["gerencia"], (l,ctx,state) => { if (state.projects.find((p) => p.id === row.projectId)?.isClosed) throw new Error("El proyecto está cerrado."); return confirmExternal(l,row.id,parseDecimal(amount),ctx,reason); }); setError(r.ok ? "" : r.error); }}><label>Costo definitivo<Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>{row.confirmedCost !== undefined && <label>Motivo de corrección<Input value={reason} onChange={(e) => setReason(e.target.value)} /></label>}<Button type="submit" size="sm">{row.confirmedCost === undefined ? "Confirmar costo" : "Corregir costo"}</Button></form>}
    {(row.costHistory ?? []).length > 0 && <details className="text-xs"><summary>Historial de confirmaciones</summary>{row.costHistory!.map((c,i) => <p key={i}>{c.at} · {c.by} · {c.previous === undefined ? "Pendiente" : formatCurrency(c.previous)} → {formatCurrency(c.next)}{c.reason && ` · ${c.reason}`}</p>)}</details>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
  </div>;
}
