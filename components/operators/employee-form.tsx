"use client";
import { useState } from "react";
import type { FrontendPersonnel, Operator, RubroId } from "@/types";
import { personnelViews, employeeCost } from "@/lib/personnel";
import { SESSION_KEYS, SESSION_LABELS } from "@/lib/permissions";
import { formatCurrency,todayISO } from "@/lib/formatting";
import { useAppStore } from "@/store/use-app-store";
import { Input,Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/** One editor for creation, edition and the existing inline preference entrypoint. */
export function EmployeeForm({ employee,onSaved,onCancel }: { employee?:Operator;onSaved?:()=>void;onCancel?:()=>void }) {
 const projects=useAppStore((s)=>s.projects),operators=useAppStore((s)=>s.operators);
 const [plan,setPlan]=useState<Record<string,string|null>>({});
 const ledger=useAppStore((s)=>s.ledger), history=useAppStore((s)=>s.priceHistory);
 const saved=ledger.personnel?.find((p)=>p.employeeId===employee?.id);
 const [form,setForm]=useState<Omit<FrontendPersonnel,"employeeId">>(saved ? {...saved,views:[saved.view]} : { enabled:false,view:"operario",views:["operario"],productive:employee ? employee.productive : false,categoryIds:[],enabledRubros:employee?.enabledRubros ?? [],hoursPerDay:employee?.hoursPerDay,workDays:employee?.workDays ?? [1,2,3,4,5] });
 const [name,setName]=useState(employee?.name ?? ""),[email,setEmail]=useState(employee?.email ?? ""),[active,setActive]=useState(employee?.active ?? true);
 const [rate,setRate]=useState(""),[validFrom,setValidFrom]=useState(todayISO()),[error,setError]=useState("");
 const categories=(ledger.staffCategories ?? []).filter((c)=>c.active!==false || form.categoryIds?.includes(c.id));
 const selected=(e:React.ChangeEvent<HTMLSelectElement>)=>Array.from(e.target.selectedOptions,(o)=>o.value);
 const individual=employee && ledger.rates.filter((r)=>r.scope==="employee" && r.subjectId===employee.id && r.validFrom<=todayISO()).sort((a,b)=>a.validFrom.localeCompare(b.validFrom)||a.createdAt.localeCompare(b.createdAt)).at(-1);
 const costs=(form.categoryIds ?? []).map((id)=>{ try { return `${categories.find((c)=>c.id===id)?.name}: ${employee ? formatCurrency(employeeCost(ledger,employee,todayISO(),id,history).hourlyCost) : "tarifa de categoría"}`; } catch { return "Sin tarifa vigente"; } });
 return <form className="flex min-h-0 flex-col" onSubmit={(e)=>{
  e.preventDefault();
  const r=useAppStore.getState().saveEmployeeLocal({ id:employee?.id,name,email,active,reassignmentPlan:plan,profile:{ ...form,view:personnelViews(form as FrontendPersonnel)[0] ?? form.view },individualRate:rate.trim() ? { hourlyCost:Number(rate.replace(",",".")),validFrom } : undefined });
  setError(r.ok ? "" : r.error);if(r.ok) onSaved?.();
 }}>
  <div className="min-h-0 space-y-5 overflow-y-auto pr-1 pb-4">
  {!categories.length && <p role="status" className="text-sm text-amber-800">Primero creá categorías laborales en Personal. No se asignarán puestos automáticamente.</p>}
  <h3 className="font-semibold text-slate-900">Datos de la persona y trabajo</h3>
  <div className="grid gap-3 sm:grid-cols-2">
   <label>Nombre y apellido<Input required value={name} onChange={(e)=>setName(e.target.value)} /></label>
   <label>Email<Input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} /></label>
   <label>Contacto<Input value={form.contact ?? ""} onChange={(e)=>setForm({...form,contact:e.target.value})} /></label>
   <label>Teléfono<Input type="tel" value={form.phone ?? ""} onChange={(e)=>setForm({...form,phone:e.target.value})} /></label>
   <label>Fecha de ingreso<Input type="date" value={form.joinedOn ?? ""} onChange={(e)=>setForm({...form,joinedOn:e.target.value})} /></label>
   <label>Alta en Blerp<Input type="date" value={form.accessEnabledOn ?? employee?.createdAt.slice(0,10) ?? ""} onChange={(e)=>setForm({...form,accessEnabledOn:e.target.value})} /></label>
   <label>Categorías laborales<Select className="h-auto min-h-24" multiple required value={form.categoryIds ?? []} onChange={(e)=>{const ids=selected(e);const productive=categories.some(c=>ids.includes(c.id)&&c.category==="labor");setForm({...form,categoryIds:ids,productive,enabledRubros:productive?form.enabledRubros:[]});}}>{categories.map((c)=><option key={c.id} value={c.id}>{c.name}{c.active===false ? " · Inactiva" : ""}</option>)}</Select></label>
   <label>Vista de Blerp<Select required value={form.view} onChange={(e)=>{const view=e.target.value as FrontendPersonnel["view"];setForm({...form,view,views:[view]});}}>{SESSION_KEYS.map((v)=><option key={v} value={v}>{SESSION_LABELS[v]}</option>)}</Select></label>
   <label>Jornada personal (vacío: general)<Input type="number" min="0.01" max="24" step="any" value={form.hoursPerDay ?? ""} onChange={(e)=>setForm({...form,hoursPerDay:e.target.value ? Number(e.target.value) : undefined})} /></label>
   {categories.some(c=>form.categoryIds?.includes(c.id)&&c.category==="labor") && <label>Rubros habilitados<Select className="h-auto min-h-24" multiple value={form.enabledRubros ?? []} onChange={(e)=>setForm({...form,enabledRubros:selected(e) as RubroId[]})}>{ledger.rubroCatalog.filter((r)=>r.active).map((r)=><option key={r.id} value={r.id}>{r.name}</option>)}</Select></label>}
  </div>
  <p className="text-sm text-slate-600">La categoría define el trabajo y su tarifa. La vista define qué puede hacer en Blerp. Para elegir varias categorías o rubros, usá Ctrl o ⌘; en el celular, tocá las opciones.</p>
  <fieldset><legend className="mb-2 font-medium">Días laborales</legend><div className="flex flex-wrap gap-2">{["Do","Lu","Ma","Mi","Ju","Vi","Sá"].map((d,i)=><label key={d} className="flex min-h-11 items-center gap-2 rounded-md border border-slate-300 px-3"><input type="checkbox" checked={form.workDays?.includes(i) ?? false} onChange={(e)=>setForm({...form,workDays:e.target.checked ? [...(form.workDays ?? []),i] : form.workDays?.filter((x)=>x!==i)})} />{d}</label>)}</div></fieldset>
  <fieldset className="rounded-lg border border-slate-200 p-3"><legend className="px-1 font-medium">Estado laboral y acceso</legend><div className="flex flex-wrap gap-4"><label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={active} onChange={(e)=>setActive(e.target.checked)} /> Empleado activo</label><label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={form.enabled} onChange={(e)=>setForm({...form,enabled:e.target.checked})} /> Acceso habilitado</label></div><p className="text-sm text-slate-600">El estado laboral y la posibilidad de ingresar a Blerp se configuran por separado.</p></fieldset>
  {employee?.active && !active && projects.filter((p)=>!p.isClosed && p.assignedOperatorIds.includes(employee.id)).map((p)=><label key={p.id}>Reasignar {p.code}<Select value={plan[p.id]===null ? "none" : plan[p.id] ?? ""} onChange={(e)=>setPlan({...plan,[p.id]:e.target.value==="none" ? null : e.target.value})}><option value="">Elegí destino…</option><option value="none">Sin asignar</option>{operators.filter((o)=>o.active && o.id!==employee.id).map((o)=><option key={o.id} value={o.id}>{o.name}</option>)}</Select></label>)}
  <h3 className="font-semibold text-slate-900">Tarifa efectiva y excepciones</h3>
  <p className="text-sm text-slate-600">{individual ? `Excepción individual vigente: ${formatCurrency(individual.hourlyRate)}/h` : "Se aplica la tarifa vigente de la categoría del registro."} {costs.join(" · ")}</p>
  <div className="grid gap-3 sm:grid-cols-2"><label>Nueva tarifa individual (opcional)<Input inputMode="decimal" value={rate} onChange={(e)=>setRate(e.target.value)} /></label><label>Tarifa vigente desde<Input type="date" value={validFrom} onChange={(e)=>setValidFrom(e.target.value)} /></label></div>
  {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </div>
  <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-200 bg-white pt-3">{onCancel && <Button variant="outline" onClick={onCancel}>Cancelar</Button>}<Button type="submit">Guardar configuración de la persona</Button></div>
 </form>;
}
