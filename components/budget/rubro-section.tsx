"use client";
// Un rubro dentro de un mueble, con todo junto: horas de operarios (para toda la cantidad) y cuántos operarios pide,
// materiales, y horas de diseño y de administración de ese rubro en ese mueble. El desglose muestra de dónde sale cada
// importe. Cada rubro va una sola vez por mueble.
import { useAppStore } from "@/store/use-app-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { HourCharge, RubroLabor } from "@/lib/budget-calculator";
import type { RubroId } from "@/types";
import { formatCurrency, formatNumber } from "@/lib/formatting";
import { RUBROS, rubroDef } from "@/lib/rubros";
import { Select } from "@/components/ui/input";
import { NumField, RemoveButton } from "./fields";
import { MaterialRows } from "./material-rows";
import type { ProductRubroRow } from "./calculator-state";

const h = (n: number) => `${formatNumber(n, 2)} h`;
export const FULL_RUBROS = RUBROS.filter((r) => r.kind === "full");

export function RubroSection({
  row,
  owner,
  result,
  usedRubros,
  onChange,
  onRemove,
  canRemove,
}: {
  row: ProductRubroRow;
  /** Nombre del mueble (para las etiquetas accesibles). */
  owner: string;
  result: { labor: RubroLabor; total: number } | undefined;
  /** Rubros que ya tiene el mueble: no se ofrecen al cambiar este. */
  usedRubros: RubroId[];
  onChange: (patch: Partial<ProductRubroRow>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const configured = useAppStore((s) => s.ledger.staffCategories);
  const categories = configured ?? [];
  const def = rubroDef(row.rubro);
  const labor = result?.labor ?? null;
  const where = `${def.label} de ${owner}`;
  const options = FULL_RUBROS.filter((r) => r.id === row.rubro || !usedRubros.includes(r.id));

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4" aria-label={where}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div className="flex min-w-48 flex-col gap-1">
          <label htmlFor={`rubro-${row.key}`} className="text-xs font-medium text-slate-600">Rubro</label>
          <Select id={`rubro-${row.key}`} value={row.rubro} onChange={(e) => onChange({ rubro: e.target.value as RubroId })}>
            {options.map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium tabular text-slate-800">{formatCurrency(result?.total ?? 0)}</span>
          {canRemove && <RemoveButton label={`Quitar rubro ${where}`} onClick={onRemove} />}
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Operarios</h4>
          <h4 className="text-sm font-medium">Horas de personal no operario</h4>
        <div className="grid max-w-md grid-cols-2 gap-2">
            <NumField id={`pr-h-${row.key}`} label="Horas" suffix="h" value={row.hours} onChange={(v) => onChange({ hours: v })} help="Horas estimadas para toda la cantidad del mueble." />
            <NumField id={`pr-w-${row.key}`} label="Operarios" value={row.workers} onChange={(v) => onChange({ workers: v })} />
          </div>
          {labor && labor.normalHours + labor.overtimeHours > 0 && (
            <p className="mt-1 text-xs text-slate-600 tabular">
              {h(labor.normalHours)} × {formatCurrency(labor.rate)} = {formatCurrency(labor.normalCost)}
              {labor.overtimeHours > 0 && (
                <>
                  {" "}+ <strong className="text-amber-800">{h(labor.overtimeHours)} extra</strong> × {formatCurrency(labor.overtimeRate)} = {formatCurrency(labor.overtimeCost)}
                </>
              )}
            </p>
          )}
        </div>

        <MaterialRows materials={row.materials ?? []} onChange={(materials) => onChange({ materials })} owner={where} />

        <h4 className="text-sm font-medium">Horas de personal no operario</h4>
        <div className="grid max-w-md grid-cols-2 gap-2">
          <FlatHours id={`dis-${row.key}`} title="Diseño" value={row.designHours ?? ""} charge={labor?.design} onChange={(v) => onChange({ designHours: v })} />
          <FlatHours id={`adm-${row.key}`} title="Administración" value={row.adminHours ?? ""} charge={labor?.admin} onChange={(v) => onChange({ adminHours: v })} />
          {(row.staffHours ?? []).map((h,i) => <label key={h.rateId} className="text-sm">{h.name}<Input inputMode="decimal" value={h.hours} onChange={(e) => onChange({ staffHours:row.staffHours!.map((x,j) => i === j ? { ...x,hours:e.target.value } : x) })} /><Button size="sm" variant="ghost" onClick={() => onChange({ staffHours:row.staffHours!.filter((_,j) => j !== i) })}>Quitar {h.name}</Button></label>)}
          {categories.length > 0 && <label className="text-sm">Agregar categoría configurada<Select value="" onChange={(e) => { const c = categories.find((c) => c.id === e.target.value); if (c) onChange({ staffHours:[...(row.staffHours ?? []),{ rateId:c.id,name:c.name,category:c.category,hourlyCost:c.hourlyCost,hours:"" }] }); }}><option value="">Elegí…</option>{categories.filter((c) => !row.staffHours?.some((h) => h.rateId === c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></label>}
        </div>
      </div>
    </section>
  );
}

/** Horas de diseño o de administración: horas totales × su tarifa (sin horas extra). */
function FlatHours({ id, title, value, charge, onChange }: { id: string; title: string; value: string; charge: HourCharge | undefined; onChange: (v: string) => void }) {
  return (
    <div>
      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h4>
      <NumField id={id} label={`Horas de ${title.toLowerCase()}`} suffix="h" value={value} onChange={onChange} />
      {charge && charge.hours > 0 && (
        <p className="mt-1 text-xs text-slate-600 tabular">
          {h(charge.hours)} × {formatCurrency(charge.rate)} = {formatCurrency(charge.cost)}
        </p>
      )}
    </div>
  );
}
