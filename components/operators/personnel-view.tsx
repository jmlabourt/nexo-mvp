"use client";
import { useState } from "react";
import type { FrontendPersonnel, Operator } from "@/types";
import { useAppStore } from "@/store/use-app-store";
import { SESSION_KEYS, SESSION_LABELS } from "@/lib/permissions";
import { Select, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/** Same employee list; frontend preference is explicitly separate from real access control. */
export function PersonnelView({ employee }: { employee: Operator }) {
  const local = useAppStore((s) => s.demoLocal);
  const saved = useAppStore((s) => s.ledger.personnel?.find((p) => p.employeeId === employee.id));
  const catalog = useAppStore((s) => s.ledger.rubroCatalog);
  const record = useAppStore((s) => s.recordLedger);
  const [form,setForm] = useState<FrontendPersonnel>(saved ?? { employeeId: employee.id, enabled: false, view: "operario", enabledRubros: employee.enabledRubros, hoursPerDay: employee.hoursPerDay });
  const [error,setError] = useState("");
  if (!local) return <span>{employee.userId ? "Operario · con acceso real" : "Sin acceso real"}<span className="block text-xs text-slate-500">Integración empleado/vista pendiente. Accesos reales en Configuración.</span></span>;
  return <details><summary className="cursor-pointer">{saved?.enabled ? SESSION_LABELS[saved.view] : "Sin acceso habilitado"}</summary>
    <form className="min-w-56 space-y-2 mt-2" onSubmit={(e) => { e.preventDefault(); const r = record(["gerencia"], (l) => {
      if (form.hoursPerDay !== undefined && !(form.hoursPerDay > 0 && form.hoursPerDay <= 24)) throw new Error("La jornada debe estar entre 0 y 24 horas.");
      return { ...l, personnel:[...(l.personnel ?? []).filter((p) => p.employeeId !== employee.id),form] };
    }); setError(r.ok ? "" : r.error); }}>
      <label className="block"><input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form,enabled:e.target.checked })} /> Habilitar vista de Blerp</label>
      <label className="block"><input type="checkbox" checked={form.productive ?? true} onChange={(e) => setForm({ ...form,productive:e.target.checked })} /> Aporta capacidad de producción (independiente de su vista)</label>
      <label className="block">Vista<Select value={form.view} onChange={(e) => setForm({ ...form,view:e.target.value as FrontendPersonnel["view"] })}>{SESSION_KEYS.map((v) => <option key={v} value={v}>{SESSION_LABELS[v]}</option>)}</Select></label>
      <label className="block">Jornada personal (vacío: general)<Input type="number" min="0.01" max="24" step="0.25" value={form.hoursPerDay ?? ""} onChange={(e) => setForm({ ...form,hoursPerDay:e.target.value ? Number(e.target.value) : undefined })} /></label>
      <fieldset><legend>Rubros habilitados</legend>{catalog.filter((r) => r.active).map((r) => <label key={r.id} className="block"><input type="checkbox" checked={form.enabledRubros?.includes(r.id as never) ?? false} onChange={(e) => setForm({ ...form,enabledRubros:e.target.checked ? [...(form.enabledRubros ?? []),r.id as never] : form.enabledRubros?.filter((id) => id !== r.id) })} /> {r.name}</label>)}</fieldset>
      <Button size="sm" type="submit">Guardar configuración de la persona</Button>
      {error && <p role="alert" className="text-red-700">{error}</p>}
    </form>
  </details>;
}
