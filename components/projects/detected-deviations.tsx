"use client";
// Desvíos detectados aún no proyectados (Auditoría UX · P0-1 opción b). Se muestran AL LADO del margen: no cambian
// el Margen proyectado y nunca se mezclan con Margen esperado, Margen proyectado ni Margen real final.
import { useMemo } from "react";
import { TriangleAlert } from "lucide-react";
import type { Project } from "@/types";
import { costWithPoints, detectedDeviations, hoursOverrunLabel } from "@/lib/deviations";
import { formatCurrency, formatDate, formatQty } from "@/lib/formatting";
import { useAppStore } from "@/store/use-app-store";
import { useToday } from "@/store/selectors";
import { Card, CardContent } from "@/components/ui/card";

export function DetectedDeviationsCard({ project }: { project: Project }) {
  const assignments = useAppStore((s) => s.assignments);
  const today = useToday();
  const d = useMemo(() => detectedDeviations(project, assignments, today), [project, assignments, today]);
  if (d.notProjected.total <= 0) return null;
  const detected = d.hoursCost + d.invoicesCost;
  const included = Math.max(0, detected - d.notProjected.total);
  return (
    <Card className="border-amber-300" aria-label="Desvíos detectados aún no proyectados">
      <CardContent className="space-y-3 pt-5">
        <div className="flex items-start gap-2">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-700" aria-hidden />
          <div>
            <h2 className="font-semibold text-slate-900">
              Desvíos detectados aún no proyectados: <span className="tabular text-amber-800">{costWithPoints(d.notProjected.total, d.points)}</span>
            </h2>
            <p className="text-sm text-slate-600">
              Ya pasaron y todavía no están en el Margen proyectado. Es un dato aparte: no se suma al Margen esperado, al Margen proyectado
              ni al Margen real final.
            </p>
          </div>
        </div>
        {d.hours.length > 0 && (
          <section aria-label="Horas de más" className="text-sm">
            <h3 className="font-medium text-slate-900">Horas de más: {formatCurrency(d.hoursCost)}</h3>
            <ul className="mt-1 space-y-0.5 text-slate-700">
              {d.hours.map((h) => (
                <li key={`${h.itemId}-${h.rubro}`} className="tabular">
                  {hoursOverrunLabel(h)} × {formatCurrency(h.hourlyCost)} por hora = {formatCurrency(h.cost)}
                  <span className="text-slate-500"> (estimadas {h.estimated} h, cargadas {h.actual} h)</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {d.invoices.length > 0 && (
          <section aria-label="Facturas más caras que lo estimado" className="text-sm">
            <h3 className="font-medium text-slate-900">Facturas más caras que lo estimado: {formatCurrency(d.invoicesCost)}</h3>
            <ul className="mt-1 space-y-0.5 text-slate-700">
              {d.invoices.map((i) => (
                <li key={i.purchaseId} className="tabular">
                  {i.materialName}: {formatCurrency(i.paidUnitCost)} contra {formatCurrency(i.budgetUnitCost)} estimado × {formatQty(i.quantity, i.unit)} ={" "}
                  {formatCurrency(i.overBy)} <span className="text-slate-500">({i.supplier ?? "sin proveedor"}, {formatDate(i.date)})</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {included > 0 && (
          <p className="text-xs text-slate-500">
            De lo detectado ({formatCurrency(detected)}), el Margen proyectado ya incluye {formatCurrency(included)}: acá queda solo lo que falta.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
