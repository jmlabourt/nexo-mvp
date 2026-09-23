"use client";
import type { ProjectEconomics } from "@/lib/calculations";
import type { AlertSettings } from "@/types";
import { CATEGORY_LABELS, TONE_CLASSES } from "@/lib/constants";
import { categoryAlertLevel } from "@/lib/alerts";
import { formatCurrency, formatSignedCurrency, formatSignedPercent } from "@/lib/formatting";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

function statusFor(budget: number, actual: number, s: AlertSettings) {
  if (actual <= budget) return actual === 0 ? { tone: "gray" as const, label: "Pendiente" } : { tone: "green" as const, label: "Dentro de presupuesto" };
  if (budget === 0) return { tone: "yellow" as const, label: "No presupuestado" };
  const lvl = categoryAlertLevel(((actual - budget) / budget) * 100, s);
  return lvl === "critical" ? { tone: "red" as const, label: "En riesgo" } : lvl === "warning" ? { tone: "yellow" as const, label: "Atención" } : { tone: "blue" as const, label: "Levemente arriba" };
}

export function DeviationSection({ econ, settings }: { econ: ProjectEconomics; settings: AlertSettings }) {
  const max = Math.max(1, ...econ.categories.map((c) => Math.max(c.budget, c.actual)));
  return (
    <Card>
      <CardHeader>
        <CardTitle>¿Dónde se está desviando?</CardTitle>
        <CardDescription>Presupuesto vs. real hasta hoy por categoría. El proyectado toma el mayor de ambos.</CardDescription>
      </CardHeader>
      <Table>
        <THead>
          <TR>
            <TH>Categoría</TH>
            <TH className="text-right">Presupuesto</TH>
            <TH className="text-right">Real hasta hoy</TH>
            <TH className="text-right">Proyectado</TH>
            <TH className="text-right">Desvío</TH>
            <TH className="min-w-40">Presupuesto vs. real</TH>
            <TH>Estado</TH>
          </TR>
        </THead>
        <TBody>
          {econ.categories.map((c) => {
            const st = statusFor(c.budget, c.actual, settings);
            const over = c.projectedVariance.amount;
            return (
              <TR key={c.category}>
                <TD className="font-medium text-slate-900">{CATEGORY_LABELS[c.category]}</TD>
                <TD className="text-right tabular">{formatCurrency(c.budget)}</TD>
                <TD className="text-right tabular">{formatCurrency(c.actual)}</TD>
                <TD className="text-right tabular">{formatCurrency(c.projected)}</TD>
                <TD className={`text-right tabular whitespace-nowrap ${over > 0 ? "font-medium text-red-700" : "text-slate-500"}`}>
                  {over > 0 ? (
                    <>
                      {formatSignedCurrency(over)}
                      {c.projectedVariance.percent !== null && <span className="ml-1 text-xs">({formatSignedPercent(c.projectedVariance.percent, 0)})</span>}
                    </>
                  ) : (
                    "—"
                  )}
                </TD>
                <TD>
                  <div className="space-y-1" aria-hidden>
                    <div className="h-1.5 rounded-full bg-slate-300" style={{ width: `${(c.budget / max) * 100}%` }} />
                    <div className="h-1.5 rounded-full" style={{ width: `${(c.actual / max) * 100}%`, background: TONE_CLASSES[st.tone === "gray" ? "blue" : st.tone].bar }} />
                  </div>
                  <span className="sr-only">
                    Presupuesto {formatCurrency(c.budget)}, real {formatCurrency(c.actual)}
                  </span>
                </TD>
                <TD>
                  <Badge tone={st.tone}>{st.label}</Badge>
                </TD>
              </TR>
            );
          })}
          <TR className="bg-slate-50 font-semibold">
            <TD>Total</TD>
            <TD className="text-right tabular">{formatCurrency(econ.budgetTotal)}</TD>
            <TD className="text-right tabular">{formatCurrency(econ.actualCostToDate)}</TD>
            <TD className="text-right tabular">{formatCurrency(econ.projectedFinalCost)}</TD>
            <TD className={`text-right tabular ${econ.costOverrun > 0 ? "text-red-700" : ""}`}>{econ.costOverrun > 0 ? formatSignedCurrency(econ.costOverrun) : "—"}</TD>
            <TD colSpan={2} />
          </TR>
        </TBody>
      </Table>
      <CardContent className="pt-3">
        <div className="flex gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5"><span className="h-1.5 w-4 rounded-full bg-slate-300" /> Presupuesto</span>
          <span className="flex items-center gap-1.5"><span className="h-1.5 w-4 rounded-full bg-blue-600" /> Real hasta hoy (color según estado)</span>
        </div>
      </CardContent>
    </Card>
  );
}
