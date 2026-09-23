"use client";
import { useMemo, useState } from "react";
import { TriangleAlert } from "lucide-react";
import type { Project } from "@/types";
import { CATEGORY_LABELS } from "@/lib/constants";
import { projectEconomics } from "@/lib/calculations";
import { reconciliationSummary } from "@/lib/material-reconciliation";
import { closingSummary } from "@/lib/insights";
import { formatCurrency, formatPercent, formatPp, formatQty, formatSignedCurrency } from "@/lib/formatting";
import { useAppStore } from "@/store/use-app-store";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ReconciliationTable } from "@/components/materials/materials-tab";

export function CloseDialog({ project, open, onOpenChange }: { project: Project; open: boolean; onOpenChange: (o: boolean) => void }) {
  const closeProject = useAppStore((s) => s.closeProject);
  const [step, setStep] = useState<0 | 1>(0);
  const recon = useMemo(() => reconciliationSummary(project), [project]);
  // Simulamos el cierre para mostrar el margen real antes de confirmar.
  const simulated = useMemo(() => ({ ...project, status: "completed" as const }), [project]);
  const econ = useMemo(() => projectEconomics(simulated), [simulated]);
  const texts = useMemo(() => closingSummary(simulated), [simulated]);

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setStep(0); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Cerrar proyecto {project.code}</DialogTitle>
          <DialogDescription>Paso {step + 1} de 2 · {step === 0 ? "Reconciliación de materiales" : "Resultado final"}</DialogDescription>
        </DialogHeader>
        {step === 0 ? (
          <div className="space-y-4">
            {recon.allReconciled ? (
              <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">Todos los materiales comprados están explicados por consumo, desperdicio o sobrante.</p>
            ) : (
              <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-900" role="alert">
                <div className="flex items-center gap-2 font-medium">
                  <TriangleAlert className="size-4" /> Hay materiales sin reconciliar
                </div>
                <ul className="mt-1 list-disc pl-6">
                  {recon.pending.map((r) => (
                    <li key={r.key}>
                      {r.unexplainedQty > 0 ? `Falta reconciliar ${formatQty(r.unexplainedQty, r.unit)} de ${r.name}.` : `El uso registrado de ${r.name} supera lo comprado en ${formatQty(-r.unexplainedQty, r.unit)}.`}
                    </li>
                  ))}
                </ul>
                <p className="mt-2">Podés cerrar igual: el costo real se calcula sobre lo registrado. Conviene registrar lo faltante antes para que el margen real sea confiable.</p>
              </div>
            )}
            <div className="rounded-lg border border-slate-200">
              <ReconciliationTable rows={recon.rows} />
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Kpi label="Precio de venta" value={formatCurrency(econ.salesPrice)} />
              <Kpi label="Presupuesto" value={formatCurrency(econ.budgetTotal)} />
              <Kpi label="Costo real final" value={formatCurrency(econ.actualCostToDate)} />
              <Kpi label="Ganancia esperada → real" value={`${formatCurrency(econ.expectedProfit)} → ${formatCurrency(econ.finalProfit ?? 0)}`} small />
            </div>
            <div className="flex flex-wrap items-end gap-6 rounded-lg bg-slate-50 p-4">
              <div>
                <div className="text-xs text-slate-500">Margen esperado</div>
                <div className="text-3xl font-semibold tabular">{formatPercent(econ.expectedMargin)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Margen real</div>
                <div className="text-3xl font-semibold tabular">{formatPercent(econ.finalMargin)}</div>
              </div>
              <div className="pb-1 text-lg font-medium tabular text-slate-700">{formatPp(econ.marginDeltaPp)}</div>
            </div>
            {econ.categories.some((c) => c.budget > 0 && c.actual === 0) && (
              <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-900" role="alert">
                <div className="flex items-center gap-2 font-medium">
                  <TriangleAlert className="size-4" /> Categorías presupuestadas sin costos registrados
                </div>
                <p className="mt-1">
                  {econ.categories
                    .filter((c) => c.budget > 0 && c.actual === 0)
                    .map((c) => `${CATEGORY_LABELS[c.category]} (${formatCurrency(c.budget)})`)
                    .join(", ")}
                  . Si esos costos ya ocurrieron, registralos antes de cerrar: si no, el margen real va a quedar más alto de lo que fue.
                </p>
              </div>
            )}
            <div className="space-y-1 text-sm">
              <p className="font-medium text-slate-900">{texts.costText}</p>
              {texts.causeText && <p className="text-slate-700">{texts.causeText}</p>}
            </div>
            <Table>
              <THead>
                <TR>
                  <TH>Categoría</TH>
                  <TH className="text-right">Presupuestado</TH>
                  <TH className="text-right">Real</TH>
                  <TH className="text-right">Desvío</TH>
                </TR>
              </THead>
              <TBody>
                {econ.categories.map((c) => (
                  <TR key={c.category}>
                    <TD>{CATEGORY_LABELS[c.category]}</TD>
                    <TD className="text-right tabular">{formatCurrency(c.budget)}</TD>
                    <TD className="text-right tabular">{formatCurrency(c.actual)}</TD>
                    <TD className={`text-right tabular ${c.actualVariance.amount > 0 ? "text-red-700" : "text-emerald-700"}`}>{formatSignedCurrency(c.actualVariance.amount)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
        <DialogFooter>
          {step === 0 ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button onClick={() => setStep(1)}>{recon.allReconciled ? "Continuar" : "Continuar sin reconciliar"}</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep(0)}>Atrás</Button>
              <Button
                onClick={() => {
                  const r = closeProject(project.id);
                  if (r.ok) onOpenChange(false);
                }}
              >
                Confirmar cierre
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Kpi({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-md border border-slate-200 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 font-semibold tabular ${small ? "text-sm" : "text-base"}`}>{value}</div>
    </div>
  );
}
