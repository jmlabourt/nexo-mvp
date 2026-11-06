"use client";
import type { Project } from "@/types";
import { materialKey } from "@/lib/material-reconciliation";
import { formatCurrency,formatQty } from "@/lib/formatting";
import { Card,CardHeader,CardTitle,CardContent } from "@/components/ui/card";
import { Table,THead,TBody,TR,TH,TD } from "@/components/ui/table";

/** Read-only approved source. Operational revisions belong exclusively to versioned BOMs. */
export function MaterialChangesCard({ project,amounts }: { project:Project;amounts:boolean;canCorrect:boolean }) {
  const lines = (project.baseline?.lines ?? project.budgetLines).filter((l) => l.category === "materials");
  if (!lines.length) return null;
  return <Card><CardHeader><CardTitle>Materiales de la cotización original</CardTitle></CardHeader><CardContent><Table><THead><TR><TH>Material</TH><TH>Cantidad cotizada</TH>{amounts && <TH>Costo cotizado</TH>}</TR></THead><TBody>{lines.map((l) => <TR key={l.id}><TD>{l.description}</TD><TD>{l.quantity === null ? "Sin cantidad" : formatQty(l.quantity,l.unit)}</TD>{amounts && <TD>{formatCurrency(l.total)}</TD>}</TR>)}</TBody></Table></CardContent></Card>;
}

/** Presentation only: comparisons use consumption + waste at the source cost, never purchases. */
export function MaterialSplitCard({ project }: { project:Project }) {
  const quoted = (project.baseline?.lines ?? project.budgetLines).filter((l) => l.category === "materials");
  const keys = [...new Set([...quoted.map((l) => `${materialKey(l.materialId,l.description)}|${l.unit}`),...project.materialUsages.map((u) => `${u.materialId}|${u.unit}`)])];
  const rows = keys.map((key) => {
    const q = quoted.filter((l) => `${materialKey(l.materialId,l.description)}|${l.unit}` === key);
    const u = project.materialUsages.filter((u) => `${u.materialId}|${u.unit}` === key && u.quantityConsumed+u.wasteQuantity > 0);
    const quantity = q.reduce((s,l) => s+(l.quantity ?? 0),0),budget = q.reduce((s,l) => s+l.total,0);
    const used = u.reduce((s,u) => s+u.quantityConsumed+u.wasteQuantity,0),actual = u.reduce((s,u) => s+(u.quantityConsumed+u.wasteQuantity)*u.unitCost,0);
    return { key,name:q[0]?.description ?? u[0]?.materialName,unit:q[0]?.unit ?? u[0]?.unit,quantity,budget,used,actual,recorded:u.length > 0,rate:quantity > 0 ? budget/quantity : null,actualRate:used > 0 ? actual/used : null };
  });
  if (!rows.length) return null;
  const comparable = rows.filter((r) => r.recorded && r.rate !== null);
  return <Card><CardHeader><CardTitle>Desvíos de materiales</CardTitle></CardHeader><CardContent className="space-y-3">
    <p className="text-xs text-slate-500">{project.isClosed ? "Proyecto cerrado" : "Comparación parcial"} · consumo y desperdicio registrados frente a la cotización aprobada.</p>
    <dl className="grid gap-3 sm:grid-cols-2"><div><dt>Desvío por precio</dt><dd>{comparable.length ? formatCurrency(comparable.reduce((s,r) => s+r.actual-r.used*r.rate!,0)) : "Sin datos comparables"}</dd></div><div><dt>Desvío total de materiales</dt><dd>{rows.some((r) => r.recorded) ? formatCurrency(rows.reduce((s,r) => s+r.actual-r.budget,0)) : "Sin registro"}</dd></div></dl>
    <Table><THead><TR><TH>Material</TH><TH>Cantidad cotizada → consumida/desperdiciada</TH><TH>Costo unitario cotizado → real</TH><TH>Desvío por precio</TH></TR></THead><TBody>{rows.map((r) => <TR key={r.key}><TD>{r.name}</TD><TD>{formatQty(r.quantity,r.unit)} → {r.recorded ? formatQty(r.used,r.unit) : "Sin registro"}</TD><TD>{r.rate === null ? "Sin base" : formatCurrency(r.rate)} → {r.actualRate === null ? "Sin registro" : formatCurrency(r.actualRate)}</TD><TD>{r.recorded && r.rate !== null ? formatCurrency(r.actual-r.used*r.rate) : "No comparable"}</TD></TR>)}</TBody></Table>
  </CardContent></Card>;
}

export function MaterialSplitSummary() { return null; }
