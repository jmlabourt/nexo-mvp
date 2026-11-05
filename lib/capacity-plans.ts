import type {CapacityPlan,Ledger,RubroId} from "@/types";
import { DomainError } from "./project-operations";
import { createId } from "./activity";
import type {LedgerCtx} from "./ledger";
export function saveCapacityPlan(l:Ledger,input:Pick<CapacityPlan,"rubro"|"from"|"to"|"workers"|"hoursPerWorker"|"note">,ctx:LedgerCtx):Ledger {
 if(!l.rubroCatalog.some(r=>r.id===input.rubro&&r.active)||!/^\d{4}-\d{2}-\d{2}$/.test(input.from)||!/^\d{4}-\d{2}-\d{2}$/.test(input.to)||input.from>input.to||!Number.isInteger(input.workers)||input.workers<0||!Number.isFinite(input.hoursPerWorker)||input.hoursPerWorker<0||input.hoursPerWorker>168||input.note.trim().length<3)throw new DomainError("Revisá rubro, período, cantidad de operarios, horas semanales y motivo.");
 return {...l,capacityPlans:[...(l.capacityPlans??[]),{...input,id:createId("capacity"),by:ctx.actor,at:ctx.now}]};
}
export function manualCapacityAt(l:Ledger|undefined,rubro:RubroId,date:string):number|undefined {
 const plan=l?.capacityPlans?.filter(p=>p.rubro===rubro&&p.from<=date&&p.to>=date).sort((a,b)=>a.at.localeCompare(b.at)).at(-1);
 return plan?plan.workers*plan.hoursPerWorker:l?.capacityBase?.[rubro];
}
