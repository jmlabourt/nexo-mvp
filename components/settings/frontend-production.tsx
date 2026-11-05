"use client";
import { saveCapacityPlan } from "@/lib/capacity-plans";
import { categoryCostAt } from "@/lib/personnel";
import { todayISO } from "@/lib/formatting";
import { useState } from "react";
import type { RubroId } from "@/types";
import { useAppStore } from "@/store/use-app-store";
import { useToday,useIdentity } from "@/store/selectors";
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
  const capacity = kind === "capacity";const {session}=useIdentity();const writable=local&&(capacity?session==="jefe_planta":session==="gerencia");
  return <Card><CardHeader><CardTitle>{capacity ? "Ajustes puntuales y refuerzos confirmados" : "Tarifas de operarios externos"}</CardTitle></CardHeader><CardContent className="space-y-3">
    <p className="text-sm text-slate-600">{capacity ? "El ajuste se suma a la capacidad base en su fecha. Usá valores negativos para reducciones. Solo registrá refuerzos acordados; tercerizar a otro taller no agrega horas internas." : "Tarifa por rubro y vigencia. Las horas externas se registran en Planta y Gerencia confirma el costo definitivo antes de cerrar."}</p>
    {!writable ? <p className="text-sm text-slate-500">Configuración de solo consulta. Edición preparada en frontend local; integración backend pendiente.</p> : <form className="grid gap-2 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); const value = parseDecimal(form.value); if (!Number.isFinite(value) || (!capacity && value < 0) || !form.date || (capacity && form.note.trim().length < 3)) return setError("Completá una fecha, valor válido y motivo (para capacidad).");
      const r = useAppStore.getState().recordLedger(capacity?["jefe_planta"]:["gerencia"],(l,ctx) => capacity ? { ...l,capacityAdjustments:[...(l.capacityAdjustments ?? []),{ id:createId("cap"),rubro:form.rubro as RubroId || undefined,date:form.date,hours:value,note:form.note.trim(),by:ctx.actor,at:ctx.now }] } : { ...l,externalRates:[...(l.externalRates ?? []),{ rubro:form.rubro as RubroId,hourlyCost:value,validFrom:form.date,by:ctx.actor,at:ctx.now }] }); setError(r.ok ? "" : r.error); if (r.ok) setForm({ ...form,value:"",note:"" });
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
  const [category,setCategory] = useState<"labor" | "design" | "admin">("admin");
  return <Card><CardHeader><CardTitle>Categorías laborales</CardTitle></CardHeader><CardContent className="space-y-3">
    <p className="text-sm text-slate-600">Tarifas por categoría y vigencia. Las horas anteriores conservan su costo registrado.</p>
    {!ledger.staffCategories?.length && <p className="text-sm text-slate-500">Sin categorías registradas.</p>}
    {(ledger.staffCategories ?? []).map((c) => <p key={c.id} className="text-sm">{c.name} · {categoryCostAt(c,todayISO()) === undefined ? "Sin tarifa vigente" : `${formatCurrency(categoryCostAt(c,todayISO())!)}/h`} {c.active === false ? " · Inactiva" : " · Activa"} {local && <Button size="sm" variant="ghost" onClick={() => { setEditingId(c.id);setCategory(c.category);setName(c.name);setCost(String(c.hourlyCost)); }}>Editar categoría</Button>} {local && <Button size="sm" variant="ghost" onClick={() => { const r = useAppStore.getState().recordLedger(["gerencia"],(l) => ({ ...l,staffCategories:l.staffCategories?.map((x) => x.id === c.id ? { ...x,active:x.active === false } : x) })); setError(r.ok ? "" : r.error); }}>{c.active === false ? "Reactivar" : "Desactivar"}</Button>}</p>)}
    {local && <div className="flex gap-2"><Button variant="outline" disabled={(ledger.staffCategories??[]).some(c=>c.id==="staff-operator")} onClick={()=>{setEditingId("staff-operator");setCategory("labor");setName("Operario");setCost("");}}>Configurar categoría Operario</Button><Button variant="ghost" onClick={()=>{setEditingId(null);setCategory("admin");setName("");setCost("");}}>Nueva categoría no operativa</Button></div>}
    {(ledger.staffCategories??[]).some(c=>c.category==="labor"&&c.id!=="staff-operator") && <p className="text-sm text-amber-800">Se conservan categorías operativas históricas por su ID. No se unifican ni se reasignan empleados automáticamente.</p>}
    {local ? <form className="flex flex-wrap gap-2 items-end" onSubmit={(e) => { e.preventDefault(); const rate = parseDecimal(cost); if (!category || name.trim().length < 2 || !Number.isFinite(rate) || rate < 0) return setError("Indicá nombre y costo horario válido."); const r = useAppStore.getState().recordLedger(["gerencia"],(l,ctx) => { if (l.staffCategories?.some((c) => c.id !== editingId && c.name.toLowerCase() === name.trim().toLowerCase())) throw new Error("Esa categoría ya existe."); return { ...l,staffCategories:[...(l.staffCategories ?? []).filter((c) => c.id !== editingId),{ ...l.staffCategories?.find((c) => c.id === editingId),id:editingId ?? createId("staff"),...(editingId==="staff-operator"?{kind:"operator" as const}:{}),name:name.trim(),category,hourlyCost:rate,rates:[...(l.staffCategories?.find((c) => c.id === editingId)?.rates ?? []),{ validFrom:todayISO(),hourlyCost:rate,by:ctx.actor,at:ctx.now }] }] }; }); setError(r.ok ? "" : r.error); if (r.ok) { setName("");setCost("");setEditingId(null);setCategory("admin"); } }}><label className="text-sm">Categoría<Input required value={name} onChange={(e) => setName(e.target.value)} /></label><label className="text-sm">Costo por hora<Input required inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} /></label><Button type="submit">{editingId ? "Guardar categoría" : "Agregar categoría"}</Button></form> : <p className="text-sm text-slate-500">La configuración ampliada de categorías requiere integración backend. Se conservan las categorías actuales.</p>}
    {error && <p role="alert" className="text-red-700 text-sm">{error}</p>}
  </CardContent></Card>;
}

export function BaseCapacitySettings() {
 const ledger=useAppStore(s=>s.ledger),local=useAppStore(s=>s.demoLocal),today=useToday();
 const {session}=useIdentity();
 const [form,setForm]=useState({rubro:"",from:today,to:today,workers:"",hours:"",note:""}),[error,setError]=useState("");
 return <Card><CardHeader><CardTitle>Capacidad semanal por rubro</CardTitle></CardHeader><CardContent className="space-y-3"><p>Declaración por período: operarios × horas semanales por operario. No crea personas ni modifica sus jornadas.</p>{Object.entries(ledger.capacityBase??{}).map(([id,h])=><p key={id}>{rubroLabel(id as RubroId)} · Base legada: {h} h/semana, sin vigencia registrada. Se conserva y se reemplaza durante un período configurado.</p>)}{(ledger.capacityPlans??[]).map(p=><p key={p.id}>{rubroLabel(p.rubro)} · {p.from} al {p.to} · {p.workers} × {p.hoursPerWorker} = {p.workers*p.hoursPerWorker} h/semana · {p.note} · {p.by}</p>)}{local&&session==="jefe_planta"&&<form className="grid gap-2 sm:grid-cols-3" onSubmit={e=>{e.preventDefault();const r=useAppStore.getState().recordLedger(["jefe_planta"],(l,ctx)=>saveCapacityPlan(l,{rubro:form.rubro as RubroId,from:form.from,to:form.to,workers:parseDecimal(form.workers),hoursPerWorker:parseDecimal(form.hours),note:form.note},ctx));setError(r.ok?"":r.error);}}><label>Rubro de capacidad<Select required value={form.rubro} onChange={e=>setForm({...form,rubro:e.target.value})}><option value="">Elegí…</option>{ledger.rubroCatalog.filter(r=>r.active).map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</Select></label><label>Vigente desde<Input type="date" required value={form.from} onChange={e=>setForm({...form,from:e.target.value})}/></label><label>Vigente hasta<Input type="date" required value={form.to} onChange={e=>setForm({...form,to:e.target.value})}/></label><label>Número de operarios<Input required inputMode="numeric" value={form.workers} onChange={e=>setForm({...form,workers:e.target.value})}/></label><label>Horas semanales por operario<Input required inputMode="decimal" value={form.hours} onChange={e=>setForm({...form,hours:e.target.value})}/></label><label>Motivo de capacidad<Input required value={form.note} onChange={e=>setForm({...form,note:e.target.value})}/></label><p>{form.workers||"0"} × {form.hours||"0"} = {(parseDecimal(form.workers)||0)*(parseDecimal(form.hours)||0)} h/semana</p><Button type="submit">Guardar capacidad base</Button></form>}{error&&<p role="alert">{error}</p>}</CardContent></Card>;
}

export function QuoteDefaultsSettings() {
 const defaults=useAppStore((s)=>s.ledger.quoteDefaults),local=useAppStore((s)=>s.demoLocal);
 const [materials,setMaterials]=useState(String(defaults?.materialsTargetPct ?? 30)),[labor,setLabor]=useState(String(defaults?.laborTargetPct ?? 30)),[error,setError]=useState("");
 return <Card><CardHeader><CardTitle>Rentabilidad objetivo de nuevas cotizaciones</CardTitle></CardHeader><CardContent><form className="flex flex-wrap items-end gap-3" onSubmit={(e)=>{e.preventDefault();const r=useAppStore.getState().recordLedger(["gerencia"],(l)=>({...l,quoteDefaults:{materialsTargetPct:parseDecimal(materials),laborTargetPct:parseDecimal(labor)}}));setError(r.ok ? "" : r.error);}}><label>Materiales (%)<Input inputMode="decimal" value={materials} onChange={(e)=>setMaterials(e.target.value)} /></label><label>Mano de obra (%)<Input inputMode="decimal" value={labor} onChange={(e)=>setLabor(e.target.value)} /></label><Button disabled={!local} type="submit">Guardar objetivos</Button></form>{error && <p role="alert">{error}</p>}</CardContent></Card>;
}
