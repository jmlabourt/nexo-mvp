"use client";
// Filas de materiales de una cotización: descripción (con el catálogo), cantidad, unidad, costo unitario y desperdicio.
// La usan un rubro del Cotizador y el Cotizador de materiales de Compras (Lote 5C).
import { Plus } from "lucide-react";
import { materialBudgetQuantity } from "@/lib/budget-calculator";
import { formatCurrency, formatNumber } from "@/lib/formatting";
import { parseDecimal } from "@/lib/schemas";
import { Select,Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { HelpTip } from "@/components/ui/help-tip";
import { useMaterialCatalog, useCatalogPrice } from "@/store/selectors";
import { NumField, RemoveButton } from "./fields";
import { newMaterialRow, type MaterialRow } from "./calculator-state";

/** Id del datalist con el catálogo de materiales: va una sola vez por pantalla (MaterialCatalogList). */
const CATALOG_LIST = "calc-catalog";

export function MaterialCatalogList() {
  const catalog = useMaterialCatalog().filter((m) => m.active !== false);
  return (
    <datalist id={CATALOG_LIST}>
      {catalog.map((m) => (
        <option key={m.id} value={m.name} />
      ))}
    </datalist>
  );
}

const num = (s: string) => {
  const v = parseDecimal(s);
  return Number.isFinite(v) && v > 0 ? v : 0;
};

/** `owner`: de qué son los materiales (nombre del rubro), para las etiquetas accesibles. */
export function MaterialRows({ materials, onChange, owner }: { materials: MaterialRow[]; onChange: (materials: MaterialRow[]) => void; owner: string }) {
  const catalogPrice = useCatalogPrice();
  const catalog = useMaterialCatalog().filter((m) => m.active !== false);
  const setMaterial = (key: string, patch: Partial<MaterialRow>) => onChange(materials.map((m) => (m.key === key ? { ...m, ...patch } : m)));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Materiales
          <HelpTip label="Materiales">
            Cantidad × costo unitario ESTIMADO (de memoria: el costo real lo trae la factura de la orden de compra), más el desperdicio esperado. Para algo
            que se compra hecho o se corta, alcanza con cantidad 1 y el costo total.
          </HelpTip>
        </h4>
        <Button variant="outline" size="sm" onClick={() => onChange([...materials, newMaterialRow()])}>
          <Plus /> Material
        </Button>
      </div>
      <div className="space-y-2">
        {materials.map((m, i) => (
          <div key={m.key} className="grid grid-cols-2 gap-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
            <div className="col-span-2 lg:col-span-1">
              <label htmlFor={`m-name-${m.key}`} className="text-xs font-medium text-slate-600">Descripción</label>
              <Select id={`m-name-${m.key}`} value={m.materialId ?? ""} onChange={(e)=>{const cat=catalog.find((c)=>c.id===e.target.value);if(cat) setMaterial(m.key,{materialId:cat.id,name:cat.name,unit:cat.unit,unitCost:String(catalogPrice(cat.id))});}}><option value="">Seleccioná material…</option>{m.materialId && !catalog.some((c)=>c.id===m.materialId) && <option value={m.materialId} disabled>{m.name} · Histórico</option>}{catalog.map((c)=><option key={c.id} value={c.id}>{c.name}</option>)}</Select>
            </div>
            <NumField id={`m-qty-${m.key}`} label="Cantidad" value={m.quantity} onChange={(v) => setMaterial(m.key, { quantity: v })} />
            <label className="text-xs">Unidad<Input id={`m-unit-${m.key}`} value={m.unit} readOnly /></label>
            <NumField id={`m-cost-${m.key}`} label="Costo unitario estimado" suffix="$" value={m.unitCost} onChange={(v) => setMaterial(m.key, { unitCost: v })} />
            <NumField id={`m-waste-${m.key}`} label="Desperdicio" suffix="%" value={m.wastePct} onChange={(v) => setMaterial(m.key, { wastePct: v })} />
            <RemoveButton label={`Quitar material ${i + 1} de ${owner}`} onClick={() => onChange(materials.filter((x) => x.key !== m.key))} />
            {num(m.quantity) > 0 && num(m.unitCost) > 0 && (
              <p className="col-span-2 text-right text-xs text-slate-500 tabular lg:col-span-6">
                {formatNumber(materialBudgetQuantity({ quantity: num(m.quantity), wastePct: num(m.wastePct) }), 2)} {m.unit || "u"} × {formatCurrency(num(m.unitCost))} ={" "}
                {formatCurrency(materialBudgetQuantity({ quantity: num(m.quantity), wastePct: num(m.wastePct) }) * num(m.unitCost))}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
