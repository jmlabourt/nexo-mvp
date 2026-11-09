"use client";
import { useState } from "react";


import { formatCurrency } from "@/lib/formatting";
import { parseDecimal } from "@/lib/schemas";
import { useCatalogPrice, useMaterialCatalog, useToday } from "@/store/selectors";
import { useAppStore } from "@/store/use-app-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export function MaterialCatalogSettings() {
  const catalog = useMaterialCatalog();
  const currentPrice = useCatalogPrice();
  const local = useAppStore((s) => s.demoLocal || s.ledgerReady);
  const today = useToday();
  const [form,setForm] = useState({ id:"",name:"",unit:"",price:"",validFrom:today });
  const [error,setError] = useState("");
  return <Card><CardHeader><CardTitle>Materiales y precios de referencia</CardTitle></CardHeader><CardContent className="space-y-3">
    <p className="text-sm text-slate-500">El catálogo alimenta Cotizador y BOM. Las ediciones conservan los identificadores y no cambian presupuestos aprobados ni consumos históricos.</p>
    <ul className="space-y-2">{catalog.map((m) => <li key={m.id} className="flex flex-wrap gap-2 items-center text-sm">{m.name} · {m.unit} · {formatCurrency(currentPrice(m.id))}{m.active === false && " · Inactivo"}
      {local && <><Button size="sm" variant="ghost" onClick={() => setForm({ id:m.id,name:m.name,unit:m.unit,price:String(currentPrice(m.id)),validFrom:today })}>Editar material</Button><Button size="sm" variant="ghost" onClick={() => {
        const r = useAppStore.getState().recordLedger(["administracion"],(l) => ({ ...l,materialCatalog:[...(l.materialCatalog ?? []).filter((x) => x.id !== m.id),{ ...m,active:m.active === false,validFrom:m.validFrom ?? today }] })); setError(r.ok ? "" : r.error);
      }}>{m.active === false ? "Reactivar" : "Desactivar"}</Button></>}
    </li>)}</ul>
    {local ? <form className="grid gap-2 sm:grid-cols-2" onSubmit={(e) => {
      e.preventDefault(); const price = parseDecimal(form.price);
      if (form.name.trim().length < 2 || !form.unit.trim() || !Number.isFinite(price) || price < 0) return setError("Completá nombre, unidad y precio válido.");
      if (catalog.some((m) => m.id !== form.id && m.name.trim().toLowerCase() === form.name.trim().toLowerCase())) return setError("Ese material ya existe.");
      const r = useAppStore.getState().saveCatalogMaterial({ ...form,id:form.id || undefined,price });
      if (!r.ok) return setError(r.error);
      setError("");setForm({ id:"",name:"",unit:"",price:"",validFrom:today });
    }}>
      <label className="text-sm">Nombre del material<Input value={form.name} onChange={(e) => setForm({ ...form,name:e.target.value })} /></label>
      <label className="text-sm">Unidad<Input value={form.unit} onChange={(e) => setForm({ ...form,unit:e.target.value })} /></label>
      <label className="text-sm">Precio de referencia<Input inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form,price:e.target.value })} /></label>
      <div className="flex gap-2"><Button type="submit">{form.id ? "Guardar material" : "Crear material"}</Button><Button type="button" variant="outline" onClick={() => setForm({ id:"",name:"",unit:"",price:"",validFrom:today })}>Cancelar</Button></div>
    </form> : <p className="text-sm text-slate-500">Altas y edición todavía no disponibles para tu empresa.</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </CardContent></Card>;
}
