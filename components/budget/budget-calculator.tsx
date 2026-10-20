"use client";
// Columna principal de la cotización por rubros: rubros, plazo, resultado, aprendizaje y atraso.
// El Cotizador y el paso "Costo presupuestado" de Nuevo proyecto la usan a través de QuoteWorkspace.
import { useState } from "react";
import { Plus } from "lucide-react";
import type { RubroId } from "@/types";
import { formatNumber } from "@/lib/formatting";
import { RUBROS } from "@/lib/rubros";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { HelpTip } from "@/components/ui/help-tip";
import { NumField, Section } from "./fields";
import { RubroSection } from "./rubro-section";
import { ProductsSection } from "./products-section";
import { MaterialCatalogList } from "./material-rows";
import { ResultSection } from "./result-section";
import { DelaySection } from "./delay-section";
import { FurnitureSubtotalsTable } from "./furniture-subtotals";
import { newProductRow, newRubroRow, ratesText, type CalcState, type CalculatorResult, type RubroRow } from "./calculator-state";

export interface ProjectTypeControl {
  value: string;
  /** Sin onChange el tipo es fijo (Nuevo proyecto lo toma de "Datos del proyecto"). */
  onChange?: (type: string) => void;
}

interface Props {
  state: CalcState;
  onState: (s: CalcState) => void;
  result: CalculatorResult;
  projectType: ProjectTypeControl;
  /** Precio de venta vigente (0 si todavía no se definió). */
  salesPrice: number;
  priceError?: string;
  onSalesPrice: (n: number) => void;
  /** false = sin ganancia ni rentabilidad (Administración / Comercial / Diseño). */
  showMargin?: boolean;
}

/** Qué rubros se ven: todos, los generales del proyecto o los de un mueble (ProductRow.key). */
type Scope = "all" | "general" | string;

export function BudgetCalculator({ state, onState, result, projectType, salesPrice, priceError, onSalesPrice, showMargin = true }: Props) {
  const set = (patch: Partial<CalcState>) => onState({ ...state, ...patch });
  const setRubro = (key: string, patch: Partial<RubroRow>) => set({ rubros: state.rubros.map((r) => (r.key === key ? { ...r, ...patch } : r)) });
  const furniture = state.products.map((p, i) => ({ key: p.key, label: p.name.trim() || `Mueble ${i + 1}` }));
  const furnitureOf = (r: RubroRow) => (r.productKey && furniture.some((f) => f.key === r.productKey) ? r.productKey : null);
  const [picked, setScope] = useState<Scope>("all");
  // Si el mueble elegido se quitó, se vuelve a ver todo.
  const scope: Scope = picked === "all" || picked === "general" || furniture.some((f) => f.key === picked) ? picked : "all";
  const visible = state.rubros.filter((r) => (scope === "all" ? true : scope === "general" ? furnitureOf(r) === null : furnitureOf(r) === scope));
  const target = scope === "all" || scope === "general" ? null : scope;
  const available = RUBROS.filter((r) => !state.rubros.some((x) => x.rubro === r.id && furnitureOf(x) === target));
  const [toAdd, setToAdd] = useState<RubroId | "">("");
  const { rates, input } = result;
  const addFurniture = () => {
    const row = newProductRow();
    set({ products: [...state.products, row] });
    setScope(row.key);
  };

  return (
    <div className="space-y-4">
      <MaterialCatalogList />

      <ProductsSection state={state} onState={set} result={result} onAdd={addFurniture} />

      <div className="flex items-center gap-1 text-sm font-semibold text-slate-900">
        Cotización por rubros
        <HelpTip label="Cómo se arma la cotización">
          <span className="block">
            Cada rubro tiene materiales, horas de diseño y horas de administración, de un mueble o generales del proyecto. La mano de obra se carga en los
            muebles. Transporte / Fletes e Imprevistos son solo un importe.
          </span>
          <span className="block">Las horas se valorizan con las tarifas de Configuración: {ratesText(rates)}. La tarifa y la jornada vigentes quedan guardadas en la cotización.</span>
        </HelpTip>
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-3">
        <div className="flex min-w-48 flex-col gap-1">
          <label htmlFor="rubro-scope" className="text-xs font-medium text-slate-600">Mueble</label>
          <Select id="rubro-scope" value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="all">Todos los rubros</option>
            <option value="general">Generales del proyecto</option>
            {furniture.map((f) => (
              <option key={f.key} value={f.key}>{f.label}</option>
            ))}
          </Select>
        </div>
        <p className="basis-full text-xs text-slate-500">
          Los materiales, el diseño y la administración se pueden cargar por mueble o como generales del proyecto. El costo total es el mismo: solo cambia cómo se
          agrupa.
        </p>
      </div>

      {visible.length === 0 && <p className="text-sm text-slate-500">Todavía no hay rubros {target ? "en este mueble" : "generales"}.</p>}
      {visible.map((row) => (
        <RubroSection
          key={row.key}
          row={row}
          result={result.rubros.find((r) => r.key === row.key)}
          onChange={(patch) => setRubro(row.key, patch)}
          onRemove={() => set({ rubros: state.rubros.filter((r) => r.key !== row.key) })}
          furniture={furniture}
          furnitureKey={furnitureOf(row)}
        />
      ))}

      {available.length > 0 && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-slate-300 p-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="add-rubro" className="text-xs font-medium text-slate-600">Agregar rubro</label>
            <Select id="add-rubro" value={toAdd} onChange={(e) => setToAdd(e.target.value as RubroId | "")}>
              <option value="">Elegí un rubro…</option>
              {available.map((r) => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
            </Select>
          </div>
          <Button
            variant="outline"
            disabled={!toAdd}
            onClick={() => {
              if (!toAdd) return;
              set({ rubros: [...state.rubros, newRubroRow(toAdd, target ?? undefined)] });
              setToAdd("");
            }}
          >
            <Plus /> Agregar{target ? ` a ${furniture.find((f) => f.key === target)?.label}` : ""}
          </Button>
        </div>
      )}

      <FurnitureSubtotalsTable state={state} result={result} salesPrice={salesPrice} />

      <Section
        title="Días de trabajo"
        help={
          <>
            <span className="block">
              Días de trabajo estimados = horas por operario / jornada del operario ({formatNumber(input.hoursPerDay, 1)} h, de Configuración), sumando cada
              producto y rubro como si se hicieran uno detrás de otro. Es un supuesto conservador, a confirmar: algunos rubros pueden hacerse en paralelo.
            </span>
            <span className="block">
              Con plazo, las horas que no entran se calculan como horas extra (tarifa × {formatNumber(input.overtimeMultiplier, 2)}). Sin plazo no hay horas extra.
            </span>
          </>
        }
      >
        <div className="max-w-[14rem]">
          <NumField id="c-deadline-days" label="Plazo (días hábiles)" placeholder="Opcional" value={state.deadlineDays} onChange={(v) => set({ deadlineDays: v })} />
        </div>
      </Section>

      <ResultSection state={state} onState={set} result={result} projectType={projectType} salesPrice={salesPrice} onSalesPrice={onSalesPrice} priceError={priceError} showMargin={showMargin} />

      {showMargin && result.delay && <DelaySection result={result} state={state} onState={set} />}
    </div>
  );
}
