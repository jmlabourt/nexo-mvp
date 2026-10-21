"use client";
// Columna principal de la cotización: muebles (cada uno con sus rubros), plazo, resultado, aprendizaje y atraso.
// El Cotizador y el paso "Costo presupuestado" de Nuevo proyecto la usan a través de QuoteWorkspace.
import { formatNumber } from "@/lib/formatting";
import { HelpTip } from "@/components/ui/help-tip";
import { NumField, Section } from "./fields";
import { ProductsSection } from "./products-section";
import { MaterialCatalogList } from "./material-rows";
import { ResultSection } from "./result-section";
import { DelaySection } from "./delay-section";
import { FurnitureSubtotalsTable } from "./furniture-subtotals";
import { ratesText, type CalcState, type CalculatorResult } from "./calculator-state";

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
}

export function BudgetCalculator({ state, onState, result, projectType, salesPrice, priceError, onSalesPrice }: Props) {
  const set = (patch: Partial<CalcState>) => onState({ ...state, ...patch });
  const { rates, input } = result;

  return (
    <div className="space-y-4">
      <MaterialCatalogList />

      <p className="flex items-center gap-1 text-xs text-slate-500">
        Las horas se valorizan con las tarifas de Configuración: {ratesText(rates)}.
        <HelpTip label="Tarifas de la cotización">La tarifa y la jornada vigentes quedan guardadas en la cotización. Se cambian solo en Configuración.</HelpTip>
      </p>

      <ProductsSection state={state} onState={set} result={result} />

      <FurnitureSubtotalsTable result={result} salesPrice={salesPrice} />

      <Section
        title="Días de trabajo"
        help={
          <>
            <span className="block">
              Días de trabajo estimados = horas por operario / jornada del operario ({formatNumber(input.hoursPerDay, 1)} h, de Configuración), sumando cada
              mueble y rubro como si se hicieran uno detrás de otro. Es un supuesto conservador, a confirmar: algunos rubros pueden hacerse en paralelo.
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

      <ResultSection state={state} onState={set} result={result} projectType={projectType} salesPrice={salesPrice} onSalesPrice={onSalesPrice} priceError={priceError} />

      {result.delay && <DelaySection result={result} state={state} onState={set} />}
    </div>
  );
}
