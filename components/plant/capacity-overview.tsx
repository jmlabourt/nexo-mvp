"use client";
import { useState } from "react";
import { useAppStore } from "@/store/use-app-store";
import { useConfiguredOperators,useToday } from "@/store/selectors";
import { capacityTimeline } from "@/lib/tablero";
import { weeklyCapacity,withExternalHours } from "@/lib/frontend-work";
import { opportunities } from "@/lib/gerencia";
import { fullWeek } from "@/lib/schedule";
import { formatNumber } from "@/lib/formatting";
import { Table,THead,TBody,TR,TH,TD } from "@/components/ui/table";
import { Select } from "@/components/ui/input";
/** Misma proyección de capacidad en Gerencia y Planta; sin operaciones ni importes. */
export function CapacityOverview(){
 const today=useToday(),operators=useConfiguredOperators();const projects=useAppStore(s=>s.projects),ledger=useAppStore(s=>s.ledger),assignments=useAppStore(s=>s.assignments),exceptions=useAppStore(s=>s.dayExceptions),hoursPerDay=useAppStore(s=>s.costSettings.hoursPerDay);
 const [granularity,setGranularity]=useState<"week"|"month">("week"),[rubro,setRubro]=useState("");
 const report=withExternalHours(projects,ledger),week=fullWeek(today),summary=weeklyCapacity(report,operators,assignments,exceptions,week[0],week[6],today,hoursPerDay,undefined,ledger);
 const rows=capacityTimeline([],report,opportunities(projects,[]),today,granularity,rubro||undefined,{operators,exceptions,hoursPerDay,roleToRubro:{},assignments,ledger});
 const h=(n:number)=>`${formatNumber(n)} h`;
 return <section aria-label="Capacidad compartida" className="space-y-3 rounded-lg border bg-white p-4"><h2 className="font-semibold">Resumen de capacidad y demanda</h2><p>Semana {week[0]} al {week[6]} · Disponibles: {h(summary.available)} · Planificadas: {h(summary.planned)} · Necesarias estimadas: {h(summary.needed)}.</p><p className="text-xs">La capacidad manual reemplaza Personal en su rubro y vigencia. No amplía la jornada individual. Los ajustes se suman una vez; las tercerizaciones no crean horas internas.</p><div className="flex flex-wrap gap-3"><label>Ver capacidad por<Select value={granularity} onChange={e=>setGranularity(e.target.value as "week"|"month")}><option value="week">Semana</option><option value="month">Mes</option></Select></label><label>Rubro de la capacidad<Select value={rubro} onChange={e=>setRubro(e.target.value)}><option value="">Todos</option>{ledger.rubroCatalog.filter(r=>r.active).map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</Select></label></div><Table><THead><TR><TH>Período</TH><TH>Disponible</TH><TH>Necesarias estimadas</TH><TH>Planificadas</TH><TH>Potencial</TH></TR></THead><TBody>{rows.map(r=><TR key={r.from}><TD>{r.label}</TD><TD className={r.pendingConfiguration?"font-medium text-amber-800":undefined}>{r.pendingConfiguration?`${h(r.capacity)} · pendiente de configuración`:h(r.capacity)}</TD><TD>{h(r.confirmed)}</TD><TD>{h(r.planned??0)}</TD><TD>{h(r.potential)}</TD></TR>)}</TBody></Table><p className="text-xs">Demanda estimada repartida hasta entrega; planificar no suma trabajo ni costo real. Sin rubros históricos, el desglose queda pendiente.</p></section>;
}
