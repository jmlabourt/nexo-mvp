"use client";
// Gerencia → proyecto → Horas: presupuestadas vs reales por mueble y por rubro (con las correcciones del Jefe de planta
// ya aplicadas en los registros, sin duplicar).
import type { Project } from "@/types";
import { hoursRows } from "@/lib/gerencia";
import { formatNumber } from "@/lib/formatting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { IndicatorTip } from "@/components/shared/data-origin";
import { cn } from "@/lib/utils";

const h = (n: number) => `${formatNumber(n, 1)} h`;

export function HoursTab({ project }: { project: Project }) {
  const groups = [
    { title: "Por mueble", rows: hoursRows([project], "furniture") },
    { title: "Por rubro", rows: hoursRows([project], "rubro") },
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
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
                    <TH>{g.title === "Por mueble" ? "Mueble" : "Rubro"}</TH>
                    <TH className="text-right">Presupuestadas</TH>
                    <TH className="text-right">Reales</TH>
                    <TH className="text-right">Desvío</TH>
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
  );
}
