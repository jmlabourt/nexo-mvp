"use client";
import { useState } from "react";
import { Lock, Pencil } from "lucide-react";
import type { Project } from "@/types";
import { BUDGET_EDITABLE_STATUSES, CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/constants";
import { budgetByCategory, budgetTotal } from "@/lib/calculations";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/formatting";
import { marginPercent } from "@/lib/calculations";
import { useAppStore } from "@/store/use-app-store";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { BudgetEditor, draftFromLine, draftToInput, type DraftLine } from "./budget-editor";

export function BudgetTab({ project }: { project: Project }) {
  const editable = BUDGET_EDITABLE_STATUSES.includes(project.status);
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<DraftLine[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const store = useAppStore();
  const total = budgetTotal(project.budgetLines);
  const byCat = budgetByCategory(project.budgetLines);

  const start = () => {
    setDrafts(project.budgetLines.map(draftFromLine));
    setErrors({});
    setEditing(true);
  };

  const save = () => {
    const errs: Record<string, string> = {};
    const parsed = drafts.map((d) => ({ d, r: draftToInput(d) }));
    for (const { d, r } of parsed) if (r.error) errs[d.key] = r.error;
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const existing = new Set(project.budgetLines.map((l) => l.id));
    const kept = new Set(drafts.map((d) => d.key));
    for (const l of project.budgetLines) if (!kept.has(l.id)) store.removeBudgetLine(project.id, l.id);
    for (const { d, r } of parsed) {
      if (!r.input) continue;
      const res = existing.has(d.key) ? store.updateBudgetLine(project.id, d.key, r.input) : store.addBudgetLine(project.id, r.input);
      if (!res.ok) return setMsg(res.error);
    }
    setEditing(false);
    setMsg("");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-600">
          {editable ? null : <Lock className="mr-1.5 inline size-4 text-slate-400" aria-hidden />}
          Este es el presupuesto base contra el que se medirán los desvíos.
          {!editable && " Quedó bloqueado cuando el proyecto pasó a ejecución."}
        </p>
        {editable && !editing && (
          <Button variant="outline" size="sm" onClick={start}>
            <Pencil /> Editar presupuesto
          </Button>
        )}
      </div>

      {editing ? (
        <Card>
          <CardContent className="pt-5">
            <BudgetEditor lines={drafts} onChange={setDrafts} errors={errors} />
            {msg && <p role="alert" className="mt-2 text-sm text-red-600">{msg}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditing(false)}>Cancelar</Button>
              <Button onClick={save}>Guardar presupuesto</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>Categoría</TH>
                  <TH>Descripción</TH>
                  <TH className="text-right">Cantidad</TH>
                  <TH>Unidad</TH>
                  <TH className="text-right">Costo unitario</TH>
                  <TH className="text-right">Total</TH>
                </TR>
              </THead>
              <TBody>
                {[...project.budgetLines]
                  .sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category))
                  .map((l) => (
                    <TR key={l.id}>
                      <TD className="whitespace-nowrap text-slate-500">{CATEGORY_LABELS[l.category]}</TD>
                      <TD className="font-medium text-slate-900">{l.description}</TD>
                      <TD className="text-right tabular">{l.quantity === null ? "—" : formatNumber(l.quantity)}</TD>
                      <TD>{l.quantity === null ? "monto directo" : l.unit}</TD>
                      <TD className="text-right tabular">{l.quantity === null ? "—" : formatCurrency(l.unitCost)}</TD>
                      <TD className="text-right font-medium tabular">{formatCurrency(l.total)}</TD>
                    </TR>
                  ))}
                <TR className="bg-slate-50 font-semibold">
                  <TD colSpan={5}>Total presupuestado</TD>
                  <TD className="text-right tabular">{formatCurrency(total)}</TD>
                </TR>
              </TBody>
            </Table>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Resumen</CardTitle>
              <CardDescription>Margen esperado al cotizar</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {CATEGORY_ORDER.filter((c) => byCat[c] > 0).map((c) => (
                <div key={c} className="flex justify-between">
                  <span className="text-slate-500">{CATEGORY_LABELS[c]}</span>
                  <span className="tabular">{formatCurrency(byCat[c])}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-slate-100 pt-2">
                <span className="text-slate-500">Precio de venta</span>
                <span className="tabular">{formatCurrency(project.salesPrice)}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>Margen esperado</span>
                <span className="tabular">{formatPercent(marginPercent(project.salesPrice - total, project.salesPrice))}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
