"use client";
// Un rubro de la cotización: materiales, horas de diseño y de administración (o solo un importe en Transporte / Fletes e
// Imprevistos). La mano de obra va en los productos (ProductsSection). El desglose muestra de dónde sale cada importe.
import type { HourCharge } from "@/lib/budget-calculator";
import { formatCurrency, formatNumber } from "@/lib/formatting";
import { rubroDef } from "@/lib/rubros";
import { Select } from "@/components/ui/input";
import { NumField, RemoveButton } from "./fields";
import { MaterialRows } from "./material-rows";
import type { RubroResult, RubroRow } from "./calculator-state";

const h = (n: number) => `${formatNumber(n, 2)} h`;

export function RubroSection({
  row,
  result,
  onChange,
  onRemove,
  furniture = [],
  furnitureKey = null,
}: {
  row: RubroRow;
  result: RubroResult | undefined;
  onChange: (patch: Partial<RubroRow>) => void;
  onRemove: () => void;
  /** Muebles de la cotización, para elegir a cuál pertenece el rubro. */
  furniture?: Array<{ key: string; label: string }>;
  /** Mueble actual (null = general del proyecto). */
  furnitureKey?: string | null;
}) {
  const def = rubroDef(row.rubro);
  const labor = result?.labor ?? null;
  const owner = furniture.find((f) => f.key === furnitureKey)?.label;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4" aria-labelledby={`rubro-${row.key}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <h3 id={`rubro-${row.key}`} className="text-sm font-semibold text-slate-900">
          {def.label}
          <span className="ml-2 text-xs font-normal text-slate-500">{owner ? `· ${owner}` : "· General del proyecto"}</span>
        </h3>
        <div className="flex items-center gap-2">
          {furniture.length > 0 && (
            <>
              <label htmlFor={`owner-${row.key}`} className="sr-only">Mueble de {def.label}</label>
              <Select
                id={`owner-${row.key}`}
                className="h-8 w-auto text-xs"
                value={furnitureKey ?? ""}
                onChange={(e) => onChange({ productKey: e.target.value || undefined })}
              >
                <option value="">General del proyecto</option>
                {furniture.map((f) => (
                  <option key={f.key} value={f.key}>{f.label}</option>
                ))}
              </Select>
            </>
          )}
          <span className="text-sm font-medium tabular text-slate-800">{formatCurrency(result?.total ?? 0)}</span>
          <RemoveButton label={`Quitar rubro ${def.label}`} onClick={onRemove} />
        </div>
      </div>

      {def.kind === "amount" ? (
        <div className="max-w-xs">
          <NumField id={`amt-${row.key}`} label="Importe" suffix="$" value={row.amount} onChange={(v) => onChange({ amount: v })} />
        </div>
      ) : (
        <div className="space-y-4">
          <MaterialRows materials={row.materials} onChange={(materials) => onChange({ materials })} owner={def.label} />

          <p className="text-xs text-slate-500">La mano de obra de este rubro se carga en cada mueble (arriba): así las horas se cargan una sola vez.</p>

          <div className="grid max-w-md grid-cols-2 gap-2">
            <FlatHours id={`dis-${row.key}`} title="Diseño" value={row.designHours} charge={labor?.design} onChange={(v) => onChange({ designHours: v })} />
            <FlatHours id={`adm-${row.key}`} title="Administración" value={row.adminHours} charge={labor?.admin} onChange={(v) => onChange({ adminHours: v })} />
          </div>
        </div>
      )}
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
