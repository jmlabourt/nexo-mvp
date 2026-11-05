"use client";
import { useState } from "react";
import type {Project,ProjectItem} from "@/types";
import { useAppStore } from "@/store/use-app-store";
import { useIdentity,useToday } from "@/store/selectors";
import { actualStart } from "@/lib/frontend-work";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
export function OperationalStage({project:p}:{project:Project}){
 const {session}=useIdentity();const local=useAppStore(s=>s.demoLocal),ledger=useAppStore(s=>s.ledger);const today=useToday();const [date,setDate]=useState(today),[reason,setReason]=useState(""),[error,setError]=useState("");
 return <div className="space-y-2 text-sm"><p>Inicio decidido por Planta: {p.productionDecision?.date??"No registrado"} · Primer trabajo productivo registrado: {actualStart(p,ledger)??"No registrado"}</p>{session==="jefe_planta"&&local&&!p.isClosed&&["purchasing","production"].includes(p.status)&&<form className="flex flex-wrap items-end gap-2" onSubmit={e=>{e.preventDefault();const target="production";const r=useAppStore.getState().operationalStageLocal(p.id,target,date,reason);setError(r.ok?"":r.error);}}><label>Fecha operativa<Input type="date" required max={today} value={date} onChange={e=>setDate(e.target.value)}/></label><label>Motivo operativo<Input value={reason} onChange={e=>setReason(e.target.value)}/></label><span className="text-xs text-slate-500">Motivo opcional en el primer inicio; obligatorio para excepciones.</span>{(p.status!=="production"||!p.productionDecision)&&<Button type="submit">Iniciar producción</Button>}{p.status==="production"&&<Button type="button" onClick={()=>{const r=useAppStore.getState().operationalStageLocal(p.id,"purchasing",date,reason);setError(r.ok?"":r.error);}}>Solicitar materiales adicionales</Button>}</form>}{error&&<p role="alert">{error}</p>}</div>;
}
export function RenameFurniture({project:p,item}:{project:Project;item:ProjectItem}){
 const {session}=useIdentity();const local=useAppStore(s=>s.demoLocal);const [name,setName]=useState(item.name),[error,setError]=useState("");if(session!=="administracion"||!local||p.isClosed)return null;
 return <details><summary>Editar nombre operativo</summary><form className="flex items-end gap-2" onSubmit={e=>{e.preventDefault();const r=useAppStore.getState().renameItemLocal(p.id,item.id,name);setError(r.ok?"":r.error);}}><label>Nombre operativo del mueble<Input required value={name} onChange={e=>setName(e.target.value)}/></label><Button type="submit">Guardar nombre</Button></form>{error&&<p role="alert">{error}</p>}</details>;
}
