import type { Ledger,Project,PurchaseOrder } from "@/types";
import { withPublishedBom } from "./bom-needs";
import { quotedMaterialsOf } from "./ledger";
import { materialNeeds } from "./purchasing";
import { projectHoldings,type StockState } from "./stock";
import { materialKey } from "./material-reconciliation";
import { DomainError } from "./project-operations";

/** Validate publication against real commitments; never attribute project-only stock to an invented furniture. */
export function validateBomPublication(projects:Project[],before:Ledger,after:Ledger,orders:PurchaseOrder[],stock:StockState,today:string) {
 const published=after.boms.filter((b)=>b.status==="published" && !before.boms.some((old)=>old.id===b.id && old.status==="published"));
 for(const bom of published) {
  const p=projects.find((p)=>p.id===bom.projectId);
  if(!p || p.isClosed) throw new DomainError("No se publica BOM de un proyecto inexistente o cerrado.");
  const next=withPublishedBom(p,after);
  let previous=withPublishedBom(p,before);
  if(!before.boms.some((b)=>b.projectId===p.id && b.status==="published")) {
    const name=p.items.find((i)=>i.id===bom.itemId)?.name;
    const ids=new Set(name ? quotedMaterialsOf(p,name,bom.itemId).map((l)=>l.budgetLineId) : []);
    previous={...p,budgetLines:p.budgetLines.filter((l)=>ids.has(l.id))};
  }
  const validOrders=orders.filter((o)=>o.status!=="draft");
  const committed=materialNeeds([previous],validOrders,stock,today);
  const newLines=next.budgetLines.filter((l)=>l.category==="materials");
  const coverage=new Map<string,number>();
  for(const need of committed) {
   const key=`${need.key}|${need.unit}`;
   coverage.set(key,(coverage.get(key) ?? 0)+Math.max(0,need.ordered+need.direct+need.fromDepot));
   const old=previous.budgetLines.find((l)=>l.id===need.lineId)!;
   // An emitted order has an explicit need/destination. A draft is never a commitment.
   const floor=validOrders.flatMap((o)=>o.lines).filter((l)=>l.projectId===p.id && l.unit===need.unit && materialKey(l.materialId,l.materialName)===need.key && (l.budgetLineId===need.lineId || old.historicalNeedIds?.includes(l.budgetLineId))).reduce((s,l)=>s+l.quantity,0);
   if(floor<=0) continue;
   const line=newLines.find((l)=>l.unit===need.unit && (materialKey(l.materialId,l.description)===need.key || (!l.materialId && !need.materialId)) && (l.id===need.lineId || l.historicalNeedIds?.includes(need.lineId)));
   if((line?.quantity ?? 0)+1e-6<floor) throw new DomainError(`${need.description}: no puede reducirse por debajo de ${floor} ${need.unit} comprometidos para esa línea. Conservá el material y su destino; un reemplazo requiere resolver primero ese compromiso.`);
  }
  const physical=new Map<string,number>();
  for(const h of projectHoldings(stock,p.id)) {const key=`${h.lot.materialId}|${h.lot.unit}`;physical.set(key,(physical.get(key) ?? 0)+h.quantity);}
  for(const m of stock.movements.filter((m)=>["consume","waste"].includes(m.kind) && m.from.type==="project" && m.from.projectId===p.id)) {
    const lot=stock.lots.find((l)=>l.id===m.lotId);if(lot) {const key=`${lot.materialId}|${lot.unit}`;physical.set(key,(physical.get(key) ?? 0)+m.quantity);}
  }
  for(const item of p.items) {
    const known=new Map<string,number>();
    for(const m of stock.movements.filter((m)=>m.itemId===item.id && ["consume","waste"].includes(m.kind) && m.from.type==="project" && m.from.projectId===p.id)) {
      const lot=stock.lots.find((l)=>l.id===m.lotId);if(lot) {const key=`${lot.materialId}|${lot.unit}`;known.set(key,(known.get(key) ?? 0)+m.quantity);}
    }
    for(const [key,used] of known) {
      const itemBom=after.boms.filter((b)=>b.itemId===item.id && b.projectId===p.id && b.status==="published").sort((a,b)=>a.version-b.version).at(-1);
      const total=itemBom?.lines.filter((l)=>`${materialKey(l.materialId,l.material)}|${l.unit}`===key).reduce((s,l)=>s+l.quantity,0) ?? 0;
      const oldBom=before.boms.filter((b)=>b.itemId===item.id && b.projectId===p.id && b.status==="published").sort((a,b)=>a.version-b.version).at(-1);
      const oldTotal=oldBom?.lines.filter((l)=>`${materialKey(l.materialId,l.material)}|${l.unit}`===key).reduce((s,l)=>s+l.quantity,0) ?? 0;
      if(total+1e-6<Math.min(oldTotal,used)) throw new DomainError(`${item.name}: hay ${used} ${key.split("|").at(-1)} utilizados con mueble identificado. Revisá la cantidad.`);
    }
  }
  const lineKey=(l:typeof newLines[number])=>{
    const previousNeed=committed.find((n)=>n.unit===l.unit && !n.materialId && !l.materialId && (n.lineId===l.id || l.historicalNeedIds?.includes(n.lineId)));
    return `${previousNeed?.key ?? materialKey(l.materialId,l.description)}|${l.unit}`;
  };
  const relevant=new Set([...committed.map((n)=>`${n.key}|${n.unit}`),...newLines.map(lineKey)]);
  for(const key of relevant) {
   const floor=Math.max(coverage.get(key) ?? 0,physical.get(key) ?? 0);
   const lines=newLines.filter((l)=>lineKey(l)===key);
   const beforeTotal=previous.budgetLines.filter((l)=>`${materialKey(l.materialId,l.description)}|${l.unit}`===key).reduce((s,l)=>s+(l.quantity ?? 0),0);
   // An existing, unattributed overrun is a project warning. Unchanged/increased BOM does not create it.
   const minimum=Math.min(beforeTotal,floor);
   if(lines.reduce((s,l)=>s+(l.quantity ?? 0),0)+1e-6<minimum) {
    const old=committed.find((n)=>`${n.key}|${n.unit}`===key);
    throw new DomainError(`${old?.description ?? lines[0]?.description ?? key}: el proyecto registra ${floor} ${old?.unit ?? lines[0]?.unit ?? ""}. No reduzcas el total de ${minimum}; Compras/Planta debe conciliar.`);
   }
  }
 }
}

/** Project-level notice, never an attribution to the item currently being edited. */
export function bomProjectWarnings(p:Project,ledger:Ledger,stock:StockState,today:string):string[] {
 const needs=materialNeeds([withPublishedBom(p,ledger)],[],stock,today);
 const quantity=new Map<string,number>();
 for(const h of projectHoldings(stock,p.id)) {const key=`${h.lot.materialId}|${h.lot.unit}`;quantity.set(key,(quantity.get(key) ?? 0)+h.quantity);}
 for(const m of stock.movements.filter((m)=>["consume","waste"].includes(m.kind) && m.from.type==="project" && m.from.projectId===p.id)) {const lot=stock.lots.find((l)=>l.id===m.lotId);if(lot){const key=`${lot.materialId}|${lot.unit}`;quantity.set(key,(quantity.get(key) ?? 0)+m.quantity);}}
 const warnings:string[]=[];
 for(const key of new Set(needs.map((n)=>`${n.key}|${n.unit}`))) {const mine=needs.filter((n)=>`${n.key}|${n.unit}`===key);const total=mine.reduce((s,n)=>s+n.needed,0),physical=quantity.get(key) ?? 0;if(physical>total+1e-6)warnings.push(`${mine[0].description}: proyecto ${physical} ${mine[0].unit}; BOM ${total}. Compras/Planta debe conciliar.`);}
 return warnings;
}
