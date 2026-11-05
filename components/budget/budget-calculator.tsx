"use client";
// Columna principal de la cotización: muebles (cada uno con sus rubros), plazo, resultado, aprendizaje y atraso.
// El Cotizador y el paso "Costo presupuestado" de Nuevo proyecto la usan a través de QuoteWorkspace.
import { useAppStore } from "@/store/use-app-store";
import { categoryCostAt } from "@/lib/personnel";
import { todayISO,formatCurrency } from "@/lib/formatting";
import { Input,Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/formatting";
import { HelpTip } from "@/components/ui/help-tip";
import { NumField, Section } from "./fields";
import { ProductsSection } from "./products-section";
import { MaterialCatalogList } from "./material-rows";
import { ResultSection } from "./result-section";
import { DelaySection } from "./delay-section";
import { FurnitureSubtotalsTable } from "./furniture-subtotals";
import { type CalcState, type CalculatorResult } from "./calculator-state";

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
  const { input } = result;
  const mixedProductiveRates=new Set(result.products.flatMap(p=>p.rubros.flatMap(r=>r.labor&&r.labor.normalHours+r.labor.overtimeHours>0?[r.labor.rate]:[]))).size>1;
  const categories=useAppStore(s=>s.ledger.staffCategories)??[];

  return (
    <div className="min-w-0 space-y-6">
      <MaterialCatalogList />

      <p className="flex items-center gap-1 text-xs text-slate-500">
        Las horas se valorizan con las categorías y tarifas vigentes configuradas en Gerencia → Personal.
        <HelpTip label="Tarifas de la cotización">La tarifa y la jornada vigentes quedan guardadas en la cotización. Las excepciones individuales solo se utilizan al registrar horas reales.</HelpTip>
      </p>

      <ProductsSection state={state} onState={set} result={result} />

      <Section title="Horas de personal no operario del proyecto" help="Se presupuestan una sola vez por proyecto, sin mueble ni multiplicación por cantidad de muebles.">
        {(state.staffHours??[]).map((row,i)=>{const c=categories.find(c=>c.id===row.categoryId),cost=c?categoryCostAt(c,todayISO()):undefined;return <div key={row.categoryId} className="mb-4 grid items-end gap-3 rounded-md border border-slate-200 p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"><label>Horas estimadas de {c?.name??"Categoría no disponible"}<Input inputMode="decimal" value={row.hours} onChange={e=>set({staffHours:state.staffHours!.map((r,j)=>i===j?{...r,hours:e.target.value}:r)})}/></label><p className="text-sm">{cost===undefined?"Sin tarifa vigente":`${formatCurrency(cost)}/h · Subtotal ${Number.isFinite(Number(row.hours.replace(",",".")))?formatCurrency(Number(row.hours.replace(",","."))*cost):"Pendiente: horas inválidas"}`}</p><Button variant="outline" onClick={()=>set({staffHours:state.staffHours!.filter((_,j)=>i!==j)})}>Quitar {c?.name}</Button></div>;})}
        <label className="text-sm">Agregar categoría no operaria al proyecto<Select value="" onChange={e=>{if(e.target.value)set({staffHours:[...(state.staffHours??[]),{categoryId:e.target.value,hours:""}]});}}><option value="">Elegí categoría…</option>{categories.filter(c=>c.category!=="labor"&&c.active!==false&&!state.staffHours?.some(r=>r.categoryId===c.id)).map(c=><option key={c.id} value={c.id} disabled={categoryCostAt(c,todayISO())===undefined}>{c.name}{categoryCostAt(c,todayISO())===undefined?" · Sin tarifa vigente":""}</option>)}</Select></label>
      </Section>
      {result.errors.map((error,i)=><p key={i} role="alert" className="text-sm text-red-700">{error}</p>)}
      {!result.errors.length&&<FurnitureSubtotalsTable result={result} salesPrice={salesPrice} />}

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

      {!result.errors.length?<ResultSection state={state} onState={set} result={result} projectType={projectType} salesPrice={salesPrice} onSalesPrice={onSalesPrice} priceError={priceError} />:<p role="status">Resultado pendiente de validar tarifas y horas. No se asigna costo cero a una tarifa desconocida.</p>}

      {mixedProductiveRates&&!result.errors.length&&<Section title="Si se atrasa"><p>Esta cotización utiliza varias tarifas productivas. Para calcular un costo diario de atraso hace falta definir qué equipo seguirá trabajando; no se aplica una tarifa promedio.</p></Section>}
      {result.delay && <DelaySection result={result} state={state} onState={set} />}
    </div>
  );
}
