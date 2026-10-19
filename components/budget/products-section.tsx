"use client";
// Productos de la cotización (Auditoría UX · P0-7): nombre, cantidad y, por rubro, horas estimadas para toda la
// cantidad y operarios pedidos. De acá sale la mano de obra presupuestada (la suma de los productos) y, al crear el
// proyecto, los productos que el Jefe de planta asigna. Las horas se cargan una sola vez.
import { Plus } from "lucide-react";
import type { RubroId } from "@/types";
import { formatCurrency, formatNumber } from "@/lib/formatting";
import { RUBROS, rubroLabel } from "@/lib/rubros";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { RemoveButton, Section } from "./fields";
import { newProductRow, newProductRubroRow, productRowError, type CalcState, type CalculatorResult, type ProductRow } from "./calculator-state";

const FULL_RUBROS = RUBROS.filter((r) => r.kind === "full");
const h = (n: number) => `${formatNumber(n, 2)} h`;

export function ProductsSection({ state, onState, result }: { state: CalcState; onState: (patch: Partial<CalcState>) => void; result: CalculatorResult }) {
  const setProduct = (key: string, patch: Partial<ProductRow>) => onState({ products: state.products.map((p) => (p.key === key ? { ...p, ...patch } : p)) });
  const laborTotal = result.products.reduce((s, p) => s + p.total, 0);
  const laborHours = result.products.reduce((s, p) => s + p.rubros.reduce((x, r) => x + r.labor.normalHours + r.labor.overtimeHours, 0), 0);

  return (
    <Section
      title="Productos"
      help={
        <>
          <span className="block">
            Presupuestá por producto (ej. “Mesa × 10”): por cada rubro que necesita, las horas estimadas para toda la cantidad y cuántos operarios pide.
          </span>
          <span className="block">La mano de obra presupuestada es la suma de los productos. Las horas se valorizan con la tarifa de Mano de obra de Configuración.</span>
        </>
      }
    >
      <div className="space-y-4">
        {state.products.map((p, i) => {
          const error = productRowError(p);
          const res = result.products.find((x) => x.key === p.key);
          const errId = `prod-err-${p.key}`;
          return (
            <fieldset key={p.key} className="space-y-3 rounded-md border border-slate-200 p-3" aria-describedby={error ? errId : undefined}>
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Producto {i + 1}</legend>
              <div className="grid grid-cols-[1fr_5.5rem_auto] items-end gap-2">
                <div className="flex min-w-0 flex-col gap-1">
                  <label htmlFor={`prod-name-${p.key}`} className="text-xs font-medium text-slate-600">Nombre</label>
                  <Input
                    id={`prod-name-${p.key}`}
                    value={p.name}
                    placeholder="Ej.: Mesa de comedor"
                    aria-invalid={!!error && p.name.trim().length < 2}
                    onChange={(e) => setProduct(p.key, { name: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor={`prod-qty-${p.key}`} className="text-xs font-medium text-slate-600">Cantidad</label>
                  <Input id={`prod-qty-${p.key}`} inputMode="numeric" className="text-right" value={p.quantity} onChange={(e) => setProduct(p.key, { quantity: e.target.value })} />
                </div>
                <RemoveButton label={`Quitar producto ${i + 1}${p.name ? ` (${p.name})` : ""}`} onClick={() => onState({ products: state.products.filter((x) => x.key !== p.key) })} />
              </div>

              <ul className="space-y-2" aria-label={`Rubros de ${p.name || `producto ${i + 1}`}`}>
                {p.rubros.map((r, j) => {
                  const labor = res?.rubros[j]?.labor;
                  const setRubro = (patch: Partial<typeof r>) => setProduct(p.key, { rubros: p.rubros.map((x) => (x.key === r.key ? { ...x, ...patch } : x)) });
                  return (
                    <li key={r.key} className="space-y-1">
                      <div className="grid grid-cols-[minmax(0,1fr)_5rem_5rem_auto] items-end gap-2">
                        <div className="flex min-w-0 flex-col gap-1">
                          <label htmlFor={`pr-rubro-${r.key}`} className="text-xs font-medium text-slate-600">Rubro</label>
                          <Select id={`pr-rubro-${r.key}`} value={r.rubro} onChange={(e) => setRubro({ rubro: e.target.value as RubroId })}>
                            {FULL_RUBROS.map((x) => (
                              <option key={x.id} value={x.id}>{x.label}</option>
                            ))}
                          </Select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label htmlFor={`pr-h-${r.key}`} className="text-xs font-medium text-slate-600">Horas</label>
                          <Input id={`pr-h-${r.key}`} inputMode="decimal" className="text-right" placeholder="0" value={r.hours} onChange={(e) => setRubro({ hours: e.target.value })} />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label htmlFor={`pr-w-${r.key}`} className="text-xs font-medium text-slate-600">Operarios</label>
                          <Input id={`pr-w-${r.key}`} inputMode="numeric" className="text-right" value={r.workers} onChange={(e) => setRubro({ workers: e.target.value })} />
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="self-end"
                          aria-label={`Quitar rubro ${rubroLabel(r.rubro)} de ${p.name || `producto ${i + 1}`}`}
                          disabled={p.rubros.length === 1}
                          onClick={() => setProduct(p.key, { rubros: p.rubros.filter((x) => x.key !== r.key) })}
                        >
                          <span aria-hidden>×</span>
                        </Button>
                      </div>
                      {labor && (
                        <p className="text-xs text-slate-600 tabular">
                          {h(labor.normalHours)} × {formatCurrency(labor.rate)} = {formatCurrency(labor.normalCost)}
                          {labor.overtimeHours > 0 && (
                            <>
                              {" "}+ <strong className="text-amber-800">{h(labor.overtimeHours)} extra</strong> × {formatCurrency(labor.overtimeRate)} ={" "}
                              {formatCurrency(labor.overtimeCost)}
                            </>
                          )}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setProduct(p.key, { rubros: [...p.rubros, newProductRubroRow(FULL_RUBROS.find((x) => !p.rubros.some((y) => y.rubro === x.id))?.id ?? "embalaje")] })
                  }
                >
                  <Plus /> Rubro
                </Button>
                {res && <span className="text-sm font-medium tabular text-slate-800">Mano de obra {formatCurrency(res.total)}</span>}
              </div>
              {error && (
                <p id={errId} role="alert" className="text-xs text-red-600">
                  {error}
                </p>
              )}
            </fieldset>
          );
        })}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="outline" onClick={() => onState({ products: [...state.products, newProductRow()] })}>
            <Plus /> Agregar producto
          </Button>
          {result.products.length > 0 && (
            <span className="text-sm text-slate-600 tabular">
              Mano de obra presupuestada: <strong className="text-slate-900">{formatCurrency(laborTotal)}</strong> ({h(laborHours)}, suma de{" "}
              {result.products.length} {result.products.length === 1 ? "producto" : "productos"})
            </span>
          )}
        </div>
      </div>
    </Section>
  );
}
