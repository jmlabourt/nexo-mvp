"use client";
import { useState } from "react";
import { useAppStore } from "@/store/use-app-store";
import { useMaterialCatalog } from "@/store/selectors";
import { useConfirmedAction } from "@/store/confirmed-action";
import { todayISO,formatCurrency } from "@/lib/formatting";
import { parseDecimal } from "@/lib/schemas";
import { Input,Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
export function StockOrderForm({onDone,onCancel}:{onDone:()=>void;onCancel?:()=>void}){
 const catalog=useMaterialCatalog().filter(m=>m.active!==false),suppliers=useAppStore(s=>s.ledger.suppliers);
 const save=useConfirmedAction("saveOrder");const [supplier,setSupplier]=useState(""),[date,setDate]=useState(todayISO()),[notes,setNotes]=useState(""),[error,setError]=useState("");
 const [rows,setRows]=useState([{materialId:"",quantity:"",unitCost:""}]);
 const change=(i:number,patch:Partial<typeof rows[number]>)=>setRows(rows.map((r,index)=>i===index?{...r,...patch}:r));
 return <form className="flex min-h-0 flex-col" onSubmit={async e=>{e.preventDefault();const lines=rows.map(r=>{const m=catalog.find(m=>m.id===r.materialId);return {destination:"warehouse" as const,projectId:"",budgetLineId:"",materialId:r.materialId,materialName:m?.name??"",unit:m?.unit??"",quantity:parseDecimal(r.quantity),unitCost:parseDecimal(r.unitCost)};});const result=await save({supplier,date,notes,lines});setError(result.ok?"":result.error);if(result.ok)onDone();}}>
 <div className="min-h-0 space-y-4 overflow-y-auto pb-4 pr-1 text-sm"><p>Reposición de depósito sin proyecto. Las recepciones quedan libres; el costo de un proyecto cambia cuando consume o desperdicia material asignado.</p>
 <label>Proveedor<Select required value={supplier} onChange={e=>setSupplier(e.target.value)}><option value="">Seleccioná…</option>{suppliers.filter(s=>s.active!==false).map(s=><option key={s.id} value={s.name}>{s.name}</option>)}</Select></label>
 <label>Fecha de la orden<Input required type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
 {rows.map((r,i)=><fieldset className="grid gap-2 rounded border p-2" key={i}><legend>Material {i+1}</legend><label>Material de catálogo<Select required value={r.materialId} onChange={e=>change(i,{materialId:e.target.value})}><option value="">Seleccioná…</option>{catalog.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</Select></label><p>Unidad: {catalog.find(m=>m.id===r.materialId)?.unit??"Seleccioná material"}</p><label>Cantidad<Input required inputMode="decimal" value={r.quantity} onChange={e=>change(i,{quantity:e.target.value})}/></label><label>Costo unitario real<Input required inputMode="decimal" value={r.unitCost} onChange={e=>change(i,{unitCost:e.target.value})}/></label>{rows.length>1&&<Button type="button" variant="ghost" onClick={()=>setRows(rows.filter((_,n)=>n!==i))}>Quitar material</Button>}</fieldset>)}
 <Button type="button" variant="outline" onClick={()=>setRows([...rows,{materialId:"",quantity:"",unitCost:""}])}>Agregar material</Button>
 <label>Notas de la orden<Input value={notes} onChange={e=>setNotes(e.target.value)}/></label>
 <p>Total: {formatCurrency(rows.reduce((sum,r)=>sum+(parseDecimal(r.quantity)||0)*(parseDecimal(r.unitCost)||0),0))}</p>
 {error&&<p role="alert">{error}</p>}</div><div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-200 bg-white pt-3">{onCancel&&<Button variant="outline" onClick={onCancel}>Cancelar</Button>}<Button type="submit">Guardar orden de stock</Button></div>
 </form>;
}
