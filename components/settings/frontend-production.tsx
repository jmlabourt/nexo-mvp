"use client";
import { useState } from "react";
import type { RubroId } from "@/types";
import { useAppStore } from "@/store/use-app-store";
import { useToday } from "@/store/selectors";
import { createId } from "@/lib/activity";
import { rubroLabel } from "@/lib/rubros";
import { parseDecimal } from "@/lib/schemas";
import { formatCurrency } from "@/lib/formatting";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card,CardHeader,CardTitle,CardContent } from "@/components/ui/card";
export function FrontendProductionSettings({ kind }: { kind: "capacity" | "rates" }) {
  const ledger = useAppStore((s) => s.ledger); const local = useAppStore((s) => s.demoLocal); const today = useToday();
  const [form,setForm] = useState({ rubro:"",date:today,value:"",note:"" }); const [error,setError] = useState("");
  const capacity = kind === "capacity";
  return <Card><CardHeader><CardTitle>{capacity ? "Ajustes puntuales y refuerzos confirmados" : "Tarifas de operarios externos"}</CardTitle></CardHeader><CardContent className="space-y-3">
    <p className="text-sm text-slate-600">{capacity ? "El ajuste se suma a la capacidad base en su fecha. Usá valores negativos para reducciones. Solo registrá refuerzos acordados; tercerizar a otro taller no agrega horas internas." : "Tarifa por rubro y vigencia. Las horas externas se registran en Planta y Gerencia confirma el costo definitivo antes de cerrar."}</p>
    {!local ? <p className="text-sm text-slate-500">Configuración preparada en frontend local; integración backend pendiente.</p> : <form className="grid gap-2 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); const value = parseDecimal(form.value); if (!Number.isFinite(value) || (!capacity && value < 0) || !form.date || (capacity && form.note.trim().length < 3)) return setError("Completá una fecha, valor válido y motivo (para capacidad).");
      const r = useAppStore.getState().recordLedger(["gerencia"],(l,ctx) => capacity ? { ...l,capacityAdjustments:[...(l.capacityAdjustments ?? []),{ id:createId("cap"),rubro:form.rubro as RubroId || undefined,date:form.date,hours:value,note:form.note.trim(),by:ctx.actor,at:ctx.now }] } : { ...l,externalRates:[...(l.externalRates ?? []),{ rubro:form.rubro as RubroId,hourlyCost:value,validFrom:form.date,by:ctx.actor,at:ctx.now }] }); setError(r.ok ? "" : r.error); if (r.ok) setForm({ ...form,value:"",note:"" });
    }}>
      <label className="text-sm">Rubro<Select required={!capacity} value={form.rubro} onChange={(e) => setForm({ ...form,rubro:e.target.value })}><option value="">{capacity ? "Capacidad general" : "Elegí…"}</option>{ledger.rubroCatalog.filter((r) => r.active).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></label>
      <label className="text-sm">{capacity ? "Fecha del ajuste" : "Vigente desde"}<Input required type="date" value={form.date} onChange={(e) => setForm({ ...form,date:e.target.value })} /></label>
      <label className="text-sm">{capacity ? "Horas de ajuste" : "Costo por hora"}<Input required inputMode="decimal" value={form.value} onChange={(e) => setForm({ ...form,value:e.target.value })} /></label>
      {capacity && <label className="text-sm">Acuerdo / motivo<Input required value={form.note} onChange={(e) => setForm({ ...form,note:e.target.value })} /></label>}
      <Button type="submit">Guardar {capacity ? "ajuste" : "tarifa"}</Button>
    </form>}
    {capacity ? (ledger.capacityAdjustments ?? []).map((a) => <p key={a.id} className="text-sm">{a.date} · {a.rubro ? rubroLabel(a.rubro) : "General"} · {a.hours > 0 ? "+" : ""}{a.hours} h · {a.note}</p>) : (ledger.externalRates ?? []).map((a,i) => <p key={i} className="text-sm">{a.validFrom} · {rubroLabel(a.rubro)} · {formatCurrency(a.hourlyCost)}/h</p>)}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </CardContent></Card>;
}

export function StaffCategoriesSettings() {
  const ledger = useAppStore((s) => s.ledger); const local = useAppStore((s) => s.demoLocal);
  const [name,setName] = useState(""); const [cost,setCost] = useState(""); const [error,setError] = useState("");
  const [editingId,setEditingId] = useState<string | null>(null);
  return <Card><CardHeader><CardTitle>Categorías de personal no operario</CardTitle></CardHeader><CardContent className="space-y-3">
    <p className="text-sm text-slate-600">Las categorías configuradas se ofrecen en el Cotizador. Sus horas y costos quedan congelados en las líneas del presupuesto, separados de las horas productivas.</p>
    {(ledger.staffCategories ?? []).map((c) => <p key={c.id} className="text-sm">{c.name} · {formatCurrency(c.hourlyCost)}/h {local && <Button size="sm" variant="ghost" onClick={() => { setEditingId(c.id);setName(c.name);setCost(String(c.hourlyCost)); }}>Editar categoría</Button>}</p>)}
    {local ? <form className="flex flex-wrap gap-2 items-end" onSubmit={(e) => { e.preventDefault(); const rate = parseDecimal(cost); if (name.trim().length < 2 || !Number.isFinite(rate) || rate < 0) return setError("Indicá nombre y costo horario válido."); const r = useAppStore.getState().recordLedger(["gerencia"],(l) => { if (l.staffCategories?.some((c) => c.id !== editingId && c.name.toLowerCase() === name.trim().toLowerCase())) throw new Error("Esa categoría ya existe."); return { ...l,staffCategories:[...(l.staffCategories ?? []).filter((c) => c.id !== editingId),{ id:editingId ?? createId("staff"),name:name.trim(),category:"admin",hourlyCost:rate }] }; }); setError(r.ok ? "" : r.error); if (r.ok) { setName("");setCost("");setEditingId(null); } }}><label className="text-sm">Categoría<Input required value={name} onChange={(e) => setName(e.target.value)} /></label><label className="text-sm">Costo por hora<Input required inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} /></label><Button type="submit">{editingId ? "Guardar categoría" : "Agregar categoría"}</Button></form> : <p className="text-sm text-slate-500">La configuración ampliada de categorías requiere integración backend. Se conservan las categorías actuales.</p>}
    {error && <p role="alert" className="text-red-700 text-sm">{error}</p>}
  </CardContent></Card>;
}
