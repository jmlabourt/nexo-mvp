import type { Project } from "@/types";
import { frozenQuoteGroups } from "@/lib/quotation-presentation";
import { formatCurrency,formatNumber } from "@/lib/formatting";
import { rubroLabel } from "@/lib/rubros";
import { Section } from "./fields";
import { Table,THead,TBody,TR,TH,TD } from "@/components/ui/table";
export function FrozenQuote({ project }: { project:Project }) {
 const baseline=project.baseline;
 if(!baseline) return <p>Sin registro de cotización aprobada.</p>;
 return <Section title="Cotización original aprobada"><p className="mb-4 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm font-medium text-blue-900">Original aprobado · Solo lectura · Congelado</p><div className="space-y-4">{frozenQuoteGroups(project).map((group)=><fieldset key={group.key} className="rounded-lg border border-slate-300 bg-slate-50/50 p-4"><legend className="font-semibold">{group.key==="general"||(group.key==="unassigned"&&group.lines.every(l=>l.category!=="labor"&&l.category!=="materials"))?"Costos generales del proyecto":group.label}</legend>{group.lines.length===0 ? <p>Sin líneas atribuibles en el registro original.</p> : <Table><THead><TR><TH>Concepto / rubro</TH><TH>Cantidad / horas</TH><TH>Valor unitario cotizado</TH><TH>Total cotizado</TH></TR></THead><TBody>{group.lines.map((l)=><TR key={l.id}><TD>{l.description}{l.rubro && <span className="block text-xs text-slate-500">{rubroLabel(l.rubro)}</span>}</TD><TD>{l.quantity===null ? "Importe" : `${formatNumber(l.quantity)} ${l.unit}`}</TD><TD>{formatCurrency(l.unitCost)}</TD><TD>{formatCurrency(l.total)}</TD></TR>)}<TR className="font-semibold"><TD>Subtotal</TD><TD/><TD/><TD>{formatCurrency(group.lines.reduce((s,l)=>s+l.total,0))}</TD></TR></TBody></Table>}</fieldset>)}</div><p className="mt-4 font-semibold">Total cotizado: {formatCurrency(baseline.budgetTotal)} · Precio ofertado: {formatCurrency(baseline.salesPrice)}</p></Section>;
}
