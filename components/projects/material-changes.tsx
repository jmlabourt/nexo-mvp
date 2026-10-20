"use client";
// Cambios de materiales de Diseño (cotizado → real) y desvío de materiales separado en cantidad y precio.
// Diseño corrige la cantidad de una línea de materiales con su motivo: es una corrección auditada del costo
// presupuestado (quién, cuándo, valor anterior, nuevo y motivo), la misma que ya existía. La cotización original queda
// en el presupuesto base del proyecto.
import { useMemo, useState } from "react";
import { PencilLine } from "lucide-react";
import type { Project } from "@/types";
import { changeText, lineFurniture, materialChanges, materialDeviationSplit, portfolioMaterialSplit } from "@/lib/circuit";
import { isFrozen } from "@/lib/corrections";
import { formatCurrency, formatDateTime, formatNumber, formatQty } from "@/lib/formatting";
import { parseDecimal } from "@/lib/schemas";
import { useAppStore } from "@/store/use-app-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { IndicatorTip } from "@/components/shared/data-origin";
import { cn } from "@/lib/utils";

/**
 * Materiales del proyecto por mueble: cantidad cotizada y real, la diferencia y el motivo de Diseño. `amounts`: con
 * importes (Gerencia y Administración); sin importes para el Jefe de planta. `canCorrect`: Diseño corrige cantidades.
 */
export function MaterialChangesCard({ project, amounts, canCorrect }: { project: Project; amounts: boolean; canCorrect: boolean }) {
  const corrections = useAppStore((s) => s.corrections);
  const changes = useMemo(() => new Map(materialChanges(project, corrections).map((c) => [c.lineId, c])), [project, corrections]);
  const lines = project.budgetLines.filter((l) => l.category === "materials" && l.quantity !== null);
  const [open, setOpen] = useState(false);
  if (lines.length === 0) return null;
  const groups = new Map<string, typeof lines>();
  for (const l of lines) {
    const k = lineFurniture(l) ?? "";
    groups.set(k, [...(groups.get(k) ?? []), l]);
  }
  const frozen = isFrozen(project);

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle>Materiales: cotizado → real</CardTitle>
          <CardDescription>
            {changes.size === 0 ? "Diseño no cambió cantidades: se usa lo cotizado." : `Diseño cambió ${changes.size} ${changes.size === 1 ? "material" : "materiales"} respecto de la cotización.`}
          </CardDescription>
        </div>
        {canCorrect && frozen && !project.isClosed && (
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            <PencilLine /> Corregir cantidad (Diseño)
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {!frozen && <p className="text-sm text-slate-500">En cotización las cantidades se cambian en la cotización. Desde Aprobado, Diseño las corrige acá con su motivo.</p>}
        {[...groups.entries()].map(([furniture, rows]) => (
          <section key={furniture || "proyecto"} aria-label={`Materiales de ${furniture || "el proyecto"}`}>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{furniture || "Sin mueble (cotización anterior por rubro)"}</h4>
            <Table>
              <THead>
                <TR>
                  <TH>Material</TH>
                  <TH className="text-right">Cantidad</TH>
                  {amounts && <TH className="text-right">Impacto</TH>}
                  <TH>Motivo de Diseño</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((l) => {
                  const c = changes.get(l.id);
                  return (
                    <TR key={l.id} className={cn(c && "bg-amber-50/60")}>
                      <TD className="font-medium text-slate-900">{l.description}</TD>
                      <TD className="text-right tabular">
                        {c ? (
                          <span className={c.diff > 0 ? "text-amber-800" : "text-slate-700"}>
                            {changeText(c)} {l.unit}
                          </span>
                        ) : (
                          formatQty(l.quantity ?? 0, l.unit)
                        )}
                      </TD>
                      {amounts && <TD className="text-right tabular">{c ? `${c.amount > 0 ? "+" : ""}${formatCurrency(c.amount)}` : "—"}</TD>}
                      <TD className="text-xs text-slate-600">
                        {c?.reason ?? "—"}
                        {c?.changedBy && <span className="block text-slate-400">{c.changedBy} · {c.changedAt ? formatDateTime(c.changedAt) : ""}</span>}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </section>
        ))}
        {open && <DesignCorrectionDialog project={project} onClose={() => setOpen(false)} />}
      </CardContent>
    </Card>
  );
}

function DesignCorrectionDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const correctValue = useAppStore((s) => s.correctValue);
  const lines = project.budgetLines.filter((l) => l.category === "materials" && l.quantity !== null);
  const [lineId, setLineId] = useState(lines[0]?.id ?? "");
  const line = lines.find((l) => l.id === lineId);
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            const v = parseDecimal(qty);
            if (!(v > 0)) return setError("Indicá la cantidad que de verdad se necesita.");
            if (reason.trim().length < 3) return setError("Escribí el motivo.");
            const r = await correctValue(project.id, { target: "budget_line", field: "quantity", lineId, newValue: v, reason: `Diseño: ${reason.trim()}` });
            if (!r.ok) return setError(r.error);
            onClose();
          }}
        >
          <DialogHeader>
            <DialogTitle>Corregir cantidad de material (Diseño)</DialogTitle>
            <DialogDescription>
              Queda registrado quién y cuándo, la cantidad anterior, la nueva y el motivo. Cambian las necesidades de Compras y el costo presupuestado; la
              cotización original queda en el presupuesto base.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Material" htmlFor="dc-line">
              <Select id="dc-line" value={lineId} onChange={(e) => setLineId(e.target.value)}>
                {lines.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.description}{lineFurniture(l) ? ` · ${lineFurniture(l)}` : ""} ({formatQty(l.quantity ?? 0, l.unit)})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={`Cantidad real${line ? ` (${line.unit})` : ""}`} htmlFor="dc-qty">
              <Input id="dc-qty" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
            </Field>
            <Field label="Motivo" htmlFor="dc-reason">
              <Textarea id="dc-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej.: con los planos finales se necesitan 6 placas" />
            </Field>
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit">Guardar corrección</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Gerencia: desvío de materiales separado en cantidad (Diseño) y precio (Compras). Suman el desvío total. */
export function MaterialSplitCard({ project }: { project: Project }) {
  const corrections = useAppStore((s) => s.corrections);
  const split = useMemo(() => materialDeviationSplit(project, corrections), [project, corrections]);
  if (split.rows.length === 0) return null;
  const shown = split.rows.filter((r) => r.quantityDeviation !== 0 || r.priceDeviation !== 0);
  const money = (v: number) => (v === 0 ? "—" : `${v > 0 ? "+" : ""}${formatCurrency(v)}`);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">Desvío de materiales: cantidad y precio <IndicatorTip id="materials_deviation" /></CardTitle>
        <CardDescription>Por cantidad: Diseño cambió lo que se necesita. Por precio: lo comprado costó distinto de lo cotizado. Los dos suman el desvío total.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          {[
            ["Por cantidad (Diseño)", split.quantityDeviation],
            ["Por precio (Compras)", split.priceDeviation],
            ["Desvío total de materiales", split.total],
          ].map(([label, v]) => (
            <div key={label as string} className="rounded-md border border-slate-200 p-3">
              <dt className="text-xs text-slate-500">{label}</dt>
              <dd className={cn("mt-1 text-lg font-semibold tabular", (v as number) > 0 ? "text-red-700" : "text-slate-900")}>{money(v as number)}</dd>
            </div>
          ))}
        </dl>
        {shown.length > 0 && (
          <Table>
            <THead>
              <TR>
                <TH>Material</TH>
                <TH className="text-right">Cantidad cotizada → real</TH>
                <TH className="text-right">Costo unitario cotizado → real</TH>
                <TH className="text-right">Por cantidad</TH>
                <TH className="text-right">Por precio</TH>
              </TR>
            </THead>
            <TBody>
              {shown.map((r) => (
                <TR key={r.lineId}>
                  <TD>
                    {r.description}
                    {r.reason && <span className="block text-xs text-slate-500">{r.reason}</span>}
                  </TD>
                  <TD className="text-right tabular">{formatNumber(r.quotedQty)} → {formatNumber(r.realQty)} {r.unit}</TD>
                  <TD className="text-right tabular">{formatCurrency(r.quotedUnitCost)} → {formatCurrency(r.realUnitCost)}</TD>
                  <TD className="text-right tabular">{money(r.quantityDeviation)}</TD>
                  <TD className="text-right tabular">{money(r.priceDeviation)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/** Dashboard de Gerencia: desvío de materiales por cantidad (Diseño) y por precio (Compras) de los proyectos. */
export function MaterialSplitSummary() {
  const projects = useAppStore((s) => s.projects);
  const corrections = useAppStore((s) => s.corrections);
  const s = useMemo(() => portfolioMaterialSplit(projects, corrections), [projects, corrections]);
  const money = (v: number) => (v === 0 ? "—" : `${v > 0 ? "+" : ""}${formatCurrency(v)}`);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">Desvío de materiales: cantidad y precio <IndicatorTip id="materials_deviation" /></CardTitle>
        <CardDescription>Proyectos aprobados, en proceso y cerrados. Por cantidad + por precio = desvío total de materiales.</CardDescription>
      </CardHeader>
      <CardContent>
        {s.rows.length === 0 ? (
          <p className="text-sm text-slate-500">Ningún proyecto tiene desvío de materiales por cantidad ni por precio.</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Proyecto</TH>
                <TH className="text-right">Por cantidad (Diseño)</TH>
                <TH className="text-right">Por precio (Compras)</TH>
                <TH className="text-right">Total</TH>
              </TR>
            </THead>
            <TBody>
              {s.rows.map(({ project: p, split }) => (
                <TR key={p.id}>
                  <TD>{p.code} · {p.name}</TD>
                  <TD className="text-right tabular">{money(split.quantityDeviation)}</TD>
                  <TD className="text-right tabular">{money(split.priceDeviation)}</TD>
                  <TD className="text-right tabular">{money(split.total)}</TD>
                </TR>
              ))}
              <TR className="font-semibold">
                <TD>Total</TD>
                <TD className="text-right tabular">{money(s.quantityDeviation)}</TD>
                <TD className="text-right tabular">{money(s.priceDeviation)}</TD>
                <TD className="text-right tabular">{money(s.total)}</TD>
              </TR>
            </TBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
