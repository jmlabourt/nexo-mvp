"use client";
// Muebles de la cotización: cada mueble es una tarjeta con su nombre (editable en el título), su cantidad y sus rubros.
// Dentro de cada rubro va todo junto (horas de operarios, operarios, materiales, diseño y administración: RubroSection).
// De acá sale todo el costo de los muebles y, al crear el proyecto, los muebles que el Jefe de planta asigna.
import { Plus } from "lucide-react";
import type { RubroId } from "@/types";
import { formatCurrency } from "@/lib/formatting";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { RemoveButton, Section } from "./fields";
import { FULL_RUBROS, RubroSection } from "./rubro-section";
import { newProductRow, newProductRubroRow, productLabel, productRowError, type CalcState, type CalculatorResult, type ProductRow } from "./calculator-state";

export function ProductsSection({ state, onState, result }: { state: CalcState; onState: (patch: Partial<CalcState>) => void; result: CalculatorResult }) {
  const setProduct = (key: string, patch: Partial<ProductRow>) => onState({ products: state.products.map((p) => (p.key === key ? { ...p, ...patch } : p)) });
  const total = result.products.reduce((s, p) => s + p.total, 0);

  return (
    <Section
      title="Muebles"
      help={
        <>
          <span className="block">Cada mueble (ej. “Mesa × 10”) tiene sus rubros. En cada rubro: horas de operarios para toda la cantidad y cuántos operarios pide, materiales, y horas de diseño y de administración.</span>
          <span className="block">Las horas se valorizan con las tarifas de Configuración. Cada rubro va una sola vez por mueble.</span>
        </>
      }
    >
      <div className="space-y-4">
        {state.products.map((p, i) => {
          const error = productRowError(p, i);
          const res = result.products.find((x) => x.key === p.key);
          const errId = `prod-err-${p.key}`;
          const label = productLabel(p, i);
          const used = p.rubros.map((r) => r.rubro);
          const available = FULL_RUBROS.filter((r) => !used.includes(r.id));
          return (
            <fieldset key={p.key} className="space-y-3 rounded-lg border border-slate-300 bg-slate-50/50 p-4" aria-label={label} aria-describedby={error ? errId : undefined}>
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-0 flex-1">
                  <label htmlFor={`prod-name-${p.key}`} className="sr-only">Nombre del mueble {i + 1}</label>
                  <Input
                    id={`prod-name-${p.key}`}
                    value={p.name}
                    placeholder={`Mueble ${i + 1}`}
                    className="h-10 border-transparent bg-transparent px-1 text-base font-semibold text-slate-900 shadow-none placeholder:text-slate-900 hover:border-slate-300 focus:border-slate-300 focus:bg-white"
                    onChange={(e) => setProduct(p.key, { name: e.target.value })}
                  />
                </div>
                <div className="flex w-24 flex-col gap-1">
                  <label htmlFor={`prod-qty-${p.key}`} className="text-xs font-medium text-slate-600">Cantidad</label>
                  <Input id={`prod-qty-${p.key}`} inputMode="numeric" className="text-right" value={p.quantity} onChange={(e) => setProduct(p.key, { quantity: e.target.value })} />
                </div>
                <RemoveButton label={`Quitar ${label}`} onClick={() => onState({ products: state.products.filter((x) => x.key !== p.key) })} />
              </div>

              {p.rubros.map((r) => (
                <RubroSection
                  key={r.key}
                  row={r}
                  owner={label}
                  result={res?.rubros.find((x) => x.key === r.key)}
                  usedRubros={used}
                  canRemove={p.rubros.length > 1}
                  onChange={(patch) => setProduct(p.key, { rubros: p.rubros.map((x) => (x.key === r.key ? { ...x, ...patch } : x)) })}
                  onRemove={() => setProduct(p.key, { rubros: p.rubros.filter((x) => x.key !== r.key) })}
                />
              ))}

              <div className="flex flex-wrap items-end justify-between gap-2">
                {available.length > 0 ? (
                  <AddRubro
                    id={`add-rubro-${p.key}`}
                    owner={label}
                    options={available.map((r) => ({ id: r.id, label: r.label }))}
                    onAdd={(rubro) => setProduct(p.key, { rubros: [...p.rubros, newProductRubroRow(rubro)] })}
                  />
                ) : (
                  <span className="text-xs text-slate-500">Ya están todos los rubros en este mueble.</span>
                )}
                {res && <span className="text-sm font-medium tabular text-slate-800">{label}: {formatCurrency(res.total)}</span>}
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
            <Plus /> Agregar mueble
          </Button>
          {result.products.length > 0 && (
            <span className="text-sm text-slate-600 tabular">
              Costo de los muebles: <strong className="text-slate-900">{formatCurrency(total)}</strong> (suma de {result.products.length}{" "}
              {result.products.length === 1 ? "mueble" : "muebles"})
            </span>
          )}
        </div>
      </div>
    </Section>
  );
}

/** Agregar un rubro al mueble: solo los que todavía no tiene. */
function AddRubro({ id, owner, options, onAdd }: { id: string; owner: string; options: Array<{ id: RubroId; label: string }>; onAdd: (r: RubroId) => void }) {
  return (
    <div className="flex items-end gap-2">
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className="text-xs font-medium text-slate-600">Agregar rubro a {owner}</label>
        <Select
          id={id}
          value=""
          onChange={(e) => {
            if (e.target.value) onAdd(e.target.value as RubroId);
          }}
        >
          <option value="">Elegí un rubro…</option>
          {options.map((r) => (
            <option key={r.id} value={r.id}>{r.label}</option>
          ))}
        </Select>
      </div>
    </div>
  );
}
