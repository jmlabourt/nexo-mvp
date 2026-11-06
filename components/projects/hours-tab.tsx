"use client";
// Gerencia → proyecto → Horas: presupuestadas vs reales por mueble y por rubro (con las correcciones del Jefe de planta
// ya aplicadas en los registros, sin duplicar).
import { useAppStore } from "@/store/use-app-store";
import { laborCostDetails,staffCostRecords } from "@/lib/calculations";
import { ledgerAtDate } from "@/lib/tablero";
import { todayISO,formatCurrency } from "@/lib/formatting";
import type { Project } from "@/types";
import { hoursRows } from "@/lib/gerencia";
import { formatNumber } from "@/lib/formatting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { IndicatorTip } from "@/components/shared/data-origin";
import { cn } from "@/lib/utils";

const h = (n: number) => `${formatNumber(n, 1)} h`;

export function HoursTab({ project }: { project: Project }) {
  const ledger=ledgerAtDate(useAppStore(s=>s.ledger),todayISO());
  const atCut={...project,actualEntries:project.actualEntries.filter(e=>e.date<=todayISO())};
  const staff=laborCostDetails(atCut,ledger).filter(d=>d.category!=="labor"&&(d.estimatedHours>0||d.actualHours>0));
  const records=staffCostRecords(project.id,ledger);
  const groups = [
    { title: "Producción por mueble", rows: hoursRows([atCut], "furniture") },
    { title: "Producción por rubro", rows: hoursRows([atCut], "rubro") },
  ];
  return (
    <><div className="grid gap-4 lg:grid-cols-2">
      {groups.map((g) => (
        <Card key={g.title}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">{g.title} <IndicatorTip id="hours_deviation" /></CardTitle>
          </CardHeader>
          <CardContent>
            {g.rows.length === 0 ? (
              <p className="text-sm text-slate-500">Sin horas presupuestadas ni cargadas.</p>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>{g.title === "Producción por mueble" ? "Mueble" : "Rubro"}</TH>
                    <TH className="text-right">Presupuestadas</TH>
                    <TH className="text-right">Trabajadas</TH>
                    <TH className="text-right">Diferencia</TH>
                  </TR>
                </THead>
                <TBody>
                  {g.rows.map((r) => (
                    <TR key={r.key}>
                      <TD>{r.label.replace(`${project.code} · `, "")}</TD>
                      <TD className="text-right tabular">{h(r.budget)}</TD>
                      <TD className="text-right tabular">{h(r.actual)}</TD>
                      <TD className={cn("text-right tabular", r.deviation > 0 ? "text-red-700" : "text-slate-600")}>
                        {r.deviation > 0 ? "+" : ""}{h(r.deviation)}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ))}
      <p className="text-xs text-slate-500 lg:col-span-2">Las horas de producción las cargan los operarios en Mi día y las controla el Jefe de planta. Un desvío negativo en un mueble sin terminar no es un ahorro: falta trabajo.</p>
    </div>
    <Card className="mt-4"><CardHeader><CardTitle>Horas no operarias del proyecto por categoría</CardTitle></CardHeader><CardContent><p className="mb-2 text-sm">No son ejecución productiva ni avance de muebles. Costo y tarifa histórica de cada registro, hasta {todayISO()}.</p><Table><THead><TR><TH>Categoría</TH><TH>Horas cotizadas</TH><TH>Horas reales</TH><TH>Costo real</TH></TR></THead><TBody>{staff.map(d=><TR key={d.key}><TD>{d.name}</TD><TD>{d.estimatedHours===0&&d.budget>0?"Sin base de horas identificada":h(d.estimatedHours)}</TD><TD>{h(d.actualHours)}</TD><TD>{formatCurrency(d.actual)}</TD></TR>)}</TBody></Table>{records.map(r=><p key={r.id} className="text-xs">{r.date} · {r.name} · {r.task} · {r.hours===null?"Asignación monetaria, sin horas productivas":h(r.hours)} · {r.amount===null?"Costo pendiente: falta tarifa histórica":formatCurrency(r.amount)} · Origen {r.id}</p>)}</CardContent></Card></>
  );
}
