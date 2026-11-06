"use client";
import { useState } from "react";
import type { Project, Ledger } from "@/types";
import { hoursRows } from "@/lib/gerencia";
import { materialActualCost } from "@/lib/calculations";
import { publishedBom,quotedMaterialsOf } from "@/lib/ledger";
import { withExternalHours } from "@/lib/frontend-work";
import { rubroLabel } from "@/lib/rubros";
import { formatCurrency, formatNumber } from "@/lib/formatting";
import { ColumnChart } from "@/components/shared/column-chart";
import { Select } from "@/components/ui/input";
import { Table,TBody,TD,TH,THead,TR } from "@/components/ui/table";
const series = [{ key: "quoted", label: "Cotizado", color: "#60a5fa" },{ key: "real", label: "Real registrado", color: "#1d4ed8" }];
export function ProductionDeviations({ projects, ledger }: { projects: Project[]; ledger: Ledger }) {
  const [selected,setSelected] = useState(projects[0]?.id ?? "");
  const [scope,setScope] = useState("partial");
  const [table,setTable] = useState(false);
  const reporting = withExternalHours(projects.filter((p) => scope === "closed" ? p.isClosed : !p.isClosed),ledger);
  const hours = hoursRows(reporting,"project");
  const rubros = hoursRows(reporting,"rubro").sort((a,b) => b.deviation-a.deviation);
  const p = reporting.find((p) => p.id === selected) ?? reporting[0];
  const materials = reporting.map((p) => ({ id:p.id, label:p.code, tooltip:`${p.code} · ${p.name}: cotizado ${formatCurrency((p.baseline?.lines ?? p.budgetLines).filter((l) => l.category === "materials").reduce((s,l) => s+l.total,0))} · ${p.materialUsages.length ? `real ${formatCurrency(materialActualCost(p.materialUsages))}` : "Sin registro de materiales"}` ,values:{ quoted:(p.baseline?.lines ?? p.budgetLines).filter((l) => l.category === "materials").reduce((s,l) => s+l.total,0),real:p.materialUsages.length ? materialActualCost(p.materialUsages) : null } }));
  const maxDeviation = Math.max(1,...rubros.map((r) => Math.abs(r.deviation)));
  const hourChartColumns = hours.map((r) => {
    const project = reporting.find((p) => p.id === r.key);
    return {
      id: r.key,
      label: project?.code ?? r.label,
      tooltip: project ? `${project.code} · ${project.name}: cotizado ${formatNumber(r.budget)} h · ${project.actualEntries.some((e) => e.category === "labor" && e.labor) ? `real ${formatNumber(r.actual)} h` : "Sin registro de horas"}` : r.label,
      values: { quoted: r.budget, real: project?.actualEntries.some((e) => e.category === "labor" && e.labor) ? r.actual : null },
    };
  });
  return <section data-indicators="hours_compare hours_deviation materials_deviation production_detail" className="space-y-5" aria-label="Desvíos de producción">
    <h2 className="font-semibold">Desvíos de producción</h2>
    <label className="block text-sm">Alcance<Select className="mt-1 max-w-md" value={scope} onChange={(e) => setScope(e.target.value)}><option value="partial">Proyectos abiertos · resultados parciales</option><option value="closed">Proyectos cerrados</option></Select></label>
    {!reporting.length && <p className="text-sm text-slate-500">Sin datos para este alcance.</p>}
    <div><h3 className="text-sm font-medium mb-2">Horas cotizadas vs. reales por proyecto</h3><ColumnChart title="Horas cotizadas vs. reales por proyecto" series={series} columns={hourChartColumns} format={(n) => `${formatNumber(n)} h`} onColumnClick={(id) => id && setSelected(id)} /></div>
    <div><h3 className="text-sm font-medium mb-2">Desvíos de horas por rubro</h3>
      <p className="text-xs text-slate-500">Real − cotizado. Negativo = menor utilización registrada; en proyectos abiertos es una diferencia parcial, no ahorro.</p>
      <button type="button" className="mt-2 min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50" onClick={() => setTable(!table)}>{table ? "Ver gráfico de rubros" : "Ver tabla de rubros"}</button>
      {table ? <Table><THead><TR><TH>Rubro</TH><TH>Cotizado</TH><TH>Real registrado</TH><TH>Diferencia</TH></TR></THead><TBody>{rubros.map((r) => <TR key={r.key}><TD>{r.label}</TD><TD>{formatNumber(r.budget)} h</TD><TD>{formatNumber(r.actual)} h</TD><TD>{formatNumber(r.deviation)} h</TD></TR>)}</TBody></Table> : <ul className="space-y-2 mt-2">{rubros.map((r) => <li key={r.key} className="text-xs"><div className="flex justify-between"><span>{r.label}</span><span>{r.deviation > 0 ? "+" : ""}{formatNumber(r.deviation)} h · {r.pct === null ? "Sin base" : `${formatNumber(r.pct)} %`}</span></div><div className="relative h-3 bg-slate-100 rounded"><span className="absolute left-1/2 h-3 border-l border-slate-400" /><div className={r.deviation > 0 ? "absolute h-3 bg-red-500 rounded" : "absolute h-3 bg-blue-400 rounded"} style={{ left:r.deviation >= 0 ? "50%" : `${50-Math.abs(r.deviation)/maxDeviation*50}%`,width:`${Math.abs(r.deviation)/maxDeviation*50}%` }} /></div></li>)}</ul>}
    </div>
    <div><h3 className="text-sm font-medium mb-2">Materiales cotizados vs. reales por proyecto ($)</h3><ColumnChart title="Materiales cotizados vs. reales en pesos" series={series} columns={materials} format={formatCurrency} onColumnClick={(id) => id && setSelected(id)} /></div>
    <label className="block text-sm">Detalle del proyecto<Select className="mt-1 max-w-md" value={p?.id ?? ""} onChange={(e) => setSelected(e.target.value)}>{reporting.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</Select></label>
    {p && <details><summary className="cursor-pointer text-sm font-medium">Ver detalle por mueble, rubro y material · {p.isClosed ? "Cerrado" : "Parcial"}</summary>
      <Table><THead><TR><TH>Mueble / rubro</TH><TH>Cotizadas</TH><TH>Reales</TH><TH>Diferencia</TH><TH>%</TH></TR></THead><TBody>{p.items.flatMap((i) => i.rubros.map((r) => {
        const actual = p.actualEntries.filter((e) => e.itemId === i.id && e.rubro === r.rubro && e.category === "labor" && e.labor).reduce((s,e) => s+e.labor!.hours,0);
        return <TR key={`${i.id}:${r.rubro}`}><TD>{i.name} · {rubroLabel(r.rubro)}</TD><TD>{formatNumber(r.hours)} h</TD><TD>{formatNumber(actual)} h</TD><TD>{formatNumber(actual-r.hours)} h</TD><TD>{r.hours ? `${formatNumber((actual-r.hours)/r.hours*100)} %` : "Sin base"}</TD></TR>;
      }))}{hoursRows([p],"furniture").filter((r) => r.key.endsWith(":unattributed") && r.actual > 0).map((r) => <TR key={r.key}><TD>{r.label}</TD><TD>Sin atribuir</TD><TD>{formatNumber(r.actual)} h</TD><TD>—</TD><TD>—</TD></TR>)}</TBody></Table>
      {p.items.map((i) => {
        const frozen={...p,budgetLines:p.baseline?.lines??p.budgetLines};
        const ids=new Set(quotedMaterialsOf(frozen,i.name,i.id).map(l=>l.budgetLineId));
        const quoted=frozen.budgetLines.filter(l=>ids.has(l.id));
        const bom = publishedBom(ledger,p.id,i.id);
        const usages = p.materialUsages.filter((u) => u.itemId === i.id);
        const rows = [...new Map([...quoted.map((l) => ({ id:l.materialId ?? l.description,name:l.description,unit:l.unit })),...(bom?.lines ?? []).map((l) => ({ id:l.materialId ?? l.material,name:l.material,unit:l.unit })),...usages.map((u) => ({ id:u.materialId,name:u.materialName,unit:u.unit }))].map((r) => [`${r.id}|${r.unit}`,r])).values()];
        return <div key={i.id} className="mt-4 overflow-auto"><h4 className="text-sm font-medium">{i.name} · Materiales</h4><Table><THead><TR><TH>Material</TH><TH>Cant. cotizada</TH><TH>BOM publicado</TH><TH>Consumo</TH><TH>Desperdicio</TH><TH>Costo cotizado</TH><TH>Costo real</TH><TH>Diferencia</TH></TR></THead><TBody>{rows.map((r) => {
          const q = quoted.filter((l) => (l.materialId ?? l.description) === r.id && l.unit === r.unit); const b = bom?.lines.filter((l) => (l.materialId ?? l.material) === r.id && l.unit === r.unit); const u = usages.filter((u) => u.materialId === r.id && u.unit === r.unit);
          const qc = q.reduce((s,l) => s+l.total,0); const real = materialActualCost(u);
          return <TR key={`${r.id}|${r.unit}`}><TD>{r.name} ({r.unit})</TD><TD>{q.length ? formatNumber(q.reduce((s,l) => s+(l.quantity ?? 0),0)) : "Sin cotizar"}</TD><TD>{b ? formatNumber(b.reduce((s,l) => s+l.quantity,0)) : "Pendiente"}</TD><TD>{u.length ? formatNumber(u.reduce((s,l) => s+l.quantityConsumed,0)) : "Sin registro"}</TD><TD>{u.length ? formatNumber(u.reduce((s,l) => s+l.wasteQuantity,0)) : "Sin registro"}</TD><TD>{formatCurrency(qc)}</TD><TD>{u.length ? formatCurrency(real) : "Sin registro"}</TD><TD>{u.length ? formatCurrency(real-qc) : "Parcial"}</TD></TR>;
        })}</TBody></Table></div>;
      })}
      {p.materialUsages.some((u) => !u.itemId) && <p className="mt-2 text-xs text-slate-600">Materiales sin atribuir a mueble: {formatCurrency(materialActualCost(p.materialUsages.filter((u) => !u.itemId)))}. Incluidos una sola vez en el total del proyecto.</p>}
    </details>}
  </section>;
}
