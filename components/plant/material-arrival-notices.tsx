"use client";
import { useAppStore } from "@/store/use-app-store";
import { projectHoldings,type StockState } from "@/lib/stock";
import type {Project} from "@/types";
import { formatQty } from "@/lib/formatting";
/** Avisos derivados del saldo físico y sus movimientos, sin registros paralelos ni avisos por render. */
export function materialArrivalNotices(projects:Project[],stock:StockState){
 const groups=new Map<string,{id:string;code:string;material:string;unit:string;quantity:number;date:string;by:string}>();
 for(const p of projects.filter(p=>!p.isClosed))for(const h of projectHoldings(stock,p.id)){
  const arrival=stock.movements.filter(m=>m.lotId===h.lot.id&&m.to.type==="project"&&m.to.projectId===p.id&&["purchase_in","assign","transfer"].includes(m.kind)).sort((a,b)=>a.date.localeCompare(b.date)||a.createdAt.localeCompare(b.createdAt)).at(-1);
  if(!arrival)continue;
  const id=`${p.id}|${h.lot.materialId}|${h.lot.unit}`,old=groups.get(id);groups.set(id,{id,code:p.code,material:h.lot.materialName,unit:h.lot.unit,quantity:(old?.quantity??0)+h.quantity,date:old&&old.date>arrival.date?old.date:arrival.date,by:arrival.createdBy});
 }
 return [...groups.values()];
}
export function MaterialArrivalNotices(){
 const projects=useAppStore(s=>s.projects),stock=useAppStore(s=>s.stock);const rows=materialArrivalNotices(projects,stock);if(!rows.length)return null;
 return <section aria-label="Material recibido o asignado disponible" className="rounded border border-blue-200 bg-blue-50 p-3 text-sm"><h2 className="font-semibold">Material recibido o asignado disponible</h2>{rows.map(r=><p key={r.id}>{r.code} · {r.material}: {formatQty(r.quantity,r.unit)} disponibles · último ingreso {r.date} por {r.by}</p>)}<p className="text-xs">Se actualiza al consumir, devolver o transferir. La recepción no crea horas ni costo de consumo.</p></section>;
}
