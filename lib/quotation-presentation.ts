import type { BudgetLine,Project } from "@/types";
/** Frozen IDs or explicit legacy furniture metadata only; never match a description to an item name. */
export function frozenQuoteGroups(project:Project) {
 const baseline=project.baseline;if(!baseline) return [];
 const groups=new Map<string,{label:string;lines:BudgetLine[]}>();
 const general:BudgetLine[]=[],unassigned:BudgetLine[]=[];
 for(const line of baseline.lines) {
  const item=line.quotationItemId ? baseline.items?.find((i)=>i.id===line.quotationItemId) : undefined;
  const legacy=line.quotationItem ?? line.notes?.match(/^Mueble: (.+? × \d+(?:[.,]\d+)?)(?: · |$)/)?.[1];
  const label=item ? `${item.name} × ${item.quantity}` : legacy;
  if(label) {const key=item?.id ?? `legacy:${label}`;if(!groups.has(key)) groups.set(key,{label,lines:[]});groups.get(key)!.lines.push(line);}
  else if(["transport","contingency","financial"].includes(line.category)) general.push(line);
  else unassigned.push(line);
 }
 if(general.length) groups.set("general",{label:"Conceptos generales",lines:general});
 if(unassigned.length) groups.set("unassigned",{label:"Sin mueble identificado",lines:unassigned});
 return [...groups].map(([key,group])=>({key,...group}));
}
