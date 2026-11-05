"use client";
import {useRef,useState} from "react";
import type {ActualEntry,Project} from "@/types";
import {otherCostGroup,type OtherCostChange} from "@/lib/other-costs";
import {actualEntryLabel,CATEGORY_LABELS,ACTUAL_TYPE_LABELS} from "@/lib/constants";
import {createId} from "@/lib/activity";
import {todayISO,formatCurrency} from "@/lib/formatting";
import {parseDecimal} from "@/lib/schemas";
import {useAppStore} from "@/store/use-app-store";
import {useIdentity} from "@/store/selectors";
import {Input,Select} from "@/components/ui/input";
import {Button} from "@/components/ui/button";
export function CostAdjustment({project,entry}:{project:Project;entry:ActualEntry}){
 const {session}=useIdentity(),local=useAppStore(s=>s.demoLocal);const group=otherCostGroup(project,entry.id);
 const [kind,setKind]=useState<OtherCostChange["kind"]>("correction"),[amount,setAmount]=useState(String(group.value.amount)),[date,setDate]=useState(group.value.date),[effective,setEffective]=useState(todayISO()),[description,setDescription]=useState(group.value.description),[supplier,setSupplier]=useState(group.value.supplier??""),[reason,setReason]=useState(""),[reference,setReference]=useState(""),[error,setError]=useState("");const id=useRef(createId("cost-event"));
 const [classification,setClassification]=useState(group.value.type==="other"?`other:${group.value.category}`:group.value.type);
 const allowed=local&&(session==="gerencia"||session==="administracion"&&!project.isClosed)&&!group.cancelled;
 return <div className="text-xs"><details><summary>Origen e historial de este costo</summary><p>{entry.id} · {entry.date} · {entry.createdBy} · {actualEntryLabel(entry)} · Original {formatCurrency(entry.amount)} · Neto {formatCurrency(group.value.amount)}</p>{group.history.map(e=><p key={e.costAdjustment!.eventId}>{e.createdAt} · {e.createdBy} · {e.costAdjustment!.kind} · Fecha efectiva {e.costAdjustment!.effectiveDate} · {formatCurrency(e.costAdjustment!.previous.amount)} → {formatCurrency(e.costAdjustment!.next.amount)} · {e.costAdjustment!.previous.date} / {CATEGORY_LABELS[e.costAdjustment!.previous.category]} / {e.costAdjustment!.previous.description} → {e.costAdjustment!.next.date} / {CATEGORY_LABELS[e.costAdjustment!.next.category]} / {e.costAdjustment!.next.description} · {e.costAdjustment!.reason} · {e.costAdjustment!.reference??""}</p>)}</details>
 {allowed&&<details><summary>Rectificar otro costo</summary><form className="space-y-2" onSubmit={e=>{e.preventDefault();const result=useAppStore.getState().adjustOtherCostLocal(project.id,entry.id,{requestId:id.current,kind,reason,reference,date:effective,amount:parseDecimal(amount),patch:kind==="correction"?{type:classification.split(":")[0] as typeof group.value.type,category:classification.startsWith("other:")?classification.split(":")[1] as "admin"|"design"|"financial":undefined,description,date,supplier:supplier||undefined,notes:group.value.notes,itemId:group.value.itemId,amount:parseDecimal(amount)}:undefined});setError(result.ok?"":result.error);if(result.ok){id.current=createId("cost-event");setReason("");setReference("");}}}>
 <label>Operación<Select value={kind} onChange={e=>setKind(e.target.value as typeof kind)}><option value="correction">Corregir carga</option><option value="reduction">Bonificación o devolución documentada</option><option value="cancellation">Anular carga errónea</option></Select></label>
 {kind!=="cancellation"&&<label>{kind==="reduction"?"Importe de la reducción":"Importe correcto"}<Input inputMode="decimal" required value={amount} onChange={e=>setAmount(e.target.value)}/></label>}
 {kind==="correction"&&<><label>Tipo y categoría<Select value={classification} onChange={e=>setClassification(e.target.value)}>{(["outsourcing","finishing","logistics","installation","unexpected"] as const).map(t=><option key={t} value={t}>{ACTUAL_TYPE_LABELS[t]}</option>)}{(["design","admin","financial"] as const).map(c=><option key={c} value={`other:${c}`}>{CATEGORY_LABELS[c]}</option>)}</Select></label><label>Descripción correcta<Input required value={description} onChange={e=>setDescription(e.target.value)}/></label><label>Fecha del gasto<Input type="date" required max={todayISO()} value={date} onChange={e=>setDate(e.target.value)}/></label><label>Proveedor<Input value={supplier} onChange={e=>setSupplier(e.target.value)}/></label></>}
 <label>{kind==="reduction"?"Fecha efectiva del beneficio":"Fecha de rectificación"}<Input required type="date" max={todayISO()} value={effective} onChange={e=>setEffective(e.target.value)}/></label><label>Referencia del documento<Input required={kind==="reduction"} value={reference} onChange={e=>setReference(e.target.value)}/></label><label>Motivo de rectificación<Input required value={reason} onChange={e=>setReason(e.target.value)}/></label><Button type="submit">Guardar rectificación</Button>{error&&<p role="alert">{error}</p>}
 </form></details>}</div>;
}
