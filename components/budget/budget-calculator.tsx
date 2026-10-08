"use client";
import { Plus, Trash2 } from "lucide-react";
import type { BudgetCategory } from "@/types";
import { CATEGORY_LABELS, MATERIAL_CATALOG, MIN_COMPARABLE_PROJECTS } from "@/lib/constants";
import { addWorkingDays, dailyCrewCost, delayAnalysis, marginAt, showDelayChart, suggestedSalesPrice, totalWorkingDays, productionDays } from "@/lib/budget-calculator";
import { formatCurrency, formatDate, formatPercent, formatWorkingDays } from "@/lib/formatting";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DelayChart } from "@/components/charts/delay-chart";
import { newMachineRow, newMaterialRow, type CalcState, type CalculatorResult } from "./calculator-state";
import { LaborSection } from "./labor-section";

interface Props {
  state: CalcState;
  onState: (s: CalcState) => void;
  result: CalculatorResult;
  projectType: string;
  /** Precio de venta vigente del formulario (0 si todavía no se definió). */
  salesPrice: number;
  priceError?: string;
  onSalesPrice: (n: number) => void;
  onDueDate: (iso: string) => void;
  /** Plazo de entrega ("" = sin plazo): con él se estiman disponibilidad y horas extra. */
  deadline: string;
}

const NumField = ({ id, label, value, onChange, suffix, placeholder, help }: { id: string; label: string; value: string; onChange: (v: string) => void; suffix?: string; placeholder?: string; help?: string }) => (
  <div className="flex flex-col gap-1">
    <label htmlFor={id} className="text-xs font-medium text-slate-600">{label}</label>
    <div className="relative">
      <Input id={id} aria-describedby={help ? `${id}-help` : undefined} inputMode="decimal" value={value} placeholder={placeholder ?? "0"} onChange={(e) => onChange(e.target.value)} className={suffix ? "pr-9 text-right" : "text-right"} />
      {suffix && <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">{suffix}</span>}
    </div>
    {help && <p id={`${id}-help`} className="text-[11px] text-slate-500">{help}</p>}
  </div>
);

const TextField = ({ id, label, value, onChange, placeholder, list }: { id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string; list?: string }) => (
  <div className="flex flex-col gap-1">
    <label htmlFor={id} className="text-xs font-medium text-slate-600">{label}</label>
    <Input id={id} value={value} list={list} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
  </div>
);

function Section({ title, hint, children, action }: { title: string; hint: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <p className="text-xs text-slate-500">{hint}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

const RemoveButton = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <Button variant="ghost" size="icon" aria-label={label} onClick={onClick} className="self-end">
    <Trash2 />
  </Button>
);

export function BudgetCalculator({ state, onState, result, projectType, salesPrice, priceError, onSalesPrice, onDueDate, deadline }: Props) {
  const set = (patch: Partial<CalcState>) => onState({ ...state, ...patch });
  const { input, total } = result;

  const suggested = suggestedSalesPrice(total, input.targetMarginPct);
  const days = totalWorkingDays(input);
  const prodDays = productionDays(input.labor, input.hoursPerDay);
  const dueDate = days > 0 ? addWorkingDays(input.startDate, days) : null;
  const margin = marginAt(salesPrice, total);
  const daily = dailyCrewCost(input.labor, input.hoursPerDay);
  const delay = delayAnalysis({ baseCost: total, salesPrice, dailyCost: daily, targetMarginPct: input.targetMarginPct });
  const usesSuggestedPrice = suggested !== null && salesPrice === suggested;

  const byCat = new Map<BudgetCategory, number>();
  for (const l of result.lines) byCat.set(l.category, (byCat.get(l.category) ?? 0) + (l.quantity === null ? l.unitCost : l.quantity * l.unitCost));

  const toggleAdjustment = (c: BudgetCategory) =>
    set({ appliedAdjustments: state.appliedAdjustments.includes(c) ? state.appliedAdjustments.filter((x) => x !== c) : [...state.appliedAdjustments, c] });

  return (
    <div className="space-y-4">
      <datalist id="calc-catalog">
        {MATERIAL_CATALOG.map((m) => (
          <option key={m.id} value={m.name} />
        ))}
      </datalist>

      <Section
        title="1 · Materiales"
        hint="Cantidad que vas a usar. El desperdicio esperado se suma a la cantidad presupuestada."
        action={<Button variant="outline" size="sm" onClick={() => set({ materials: [...state.materials, newMaterialRow()] })}><Plus /> Material</Button>}
      >
        <div className="space-y-3">
          {state.materials.map((m, i) => (
            <div key={m.key} className="grid grid-cols-2 gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]">
              <div className="col-span-2 sm:col-span-1">
                <TextField
                  id={`m-name-${m.key}`}
                  label="Material"
                  list="calc-catalog"
                  value={m.name}
                  placeholder="Ej.: Melamina blanca 18 mm"
                  onChange={(v) => {
                    const cat = MATERIAL_CATALOG.find((c) => c.name === v);
                    set({ materials: state.materials.map((x) => (x.key === m.key ? { ...x, name: v, ...(cat ? { unit: cat.unit, unitCost: x.unitCost || String(cat.referenceCost) } : {}) } : x)) });
                  }}
                />
              </div>
              <NumField id={`m-qty-${m.key}`} label="Cantidad" value={m.quantity} onChange={(v) => set({ materials: state.materials.map((x) => (x.key === m.key ? { ...x, quantity: v } : x)) })} />
              <TextField id={`m-unit-${m.key}`} label="Unidad" value={m.unit} onChange={(v) => set({ materials: state.materials.map((x) => (x.key === m.key ? { ...x, unit: v } : x)) })} />
              <NumField id={`m-cost-${m.key}`} label="Costo unitario" suffix="$" value={m.unitCost} onChange={(v) => set({ materials: state.materials.map((x) => (x.key === m.key ? { ...x, unitCost: v } : x)) })} />
              <NumField id={`m-waste-${m.key}`} label="Desperdicio" suffix="%" value={m.wastePct} onChange={(v) => set({ materials: state.materials.map((x) => (x.key === m.key ? { ...x, wastePct: v } : x)) })} />
              <RemoveButton label={`Quitar material ${i + 1}`} onClick={() => set({ materials: state.materials.filter((x) => x.key !== m.key) })} />
            </div>
          ))}
        </div>
      </Section>

      <LaborSection
        rows={state.labor}
        onRows={(labor) => set({ labor })}
        plan={result.labor}
        deadline={deadline}
        installationDays={input.installationDays}
        overtimeMultiplier={input.overtimeMultiplier}
      >
        <div className="mt-3 grid grid-cols-2 gap-2 sm:max-w-md">
          <NumField id="c-hpd" label="Horas por jornada" suffix="h" value={state.hoursPerDay} onChange={(v) => set({ hoursPerDay: v })} />
          <NumField id="c-instdays" label="Días de instalación" value={state.installationDays} onChange={(v) => set({ installationDays: v })} />
        </div>
      </LaborSection>

      <Section
        title="3 · Máquinas"
        hint="Horas de uso estimadas y costo por hora (energía, desgaste, alquiler)."
        action={<Button variant="outline" size="sm" onClick={() => set({ machines: [...state.machines, newMachineRow()] })}><Plus /> Máquina</Button>}
      >
        {state.machines.length === 0 ? (
          <p className="text-sm text-slate-500">Opcional. Agregá una máquina si querés que su uso sume al costo.</p>
        ) : (
          <div className="space-y-3">
            {state.machines.map((m, i) => (
              <div key={m.key} className="grid grid-cols-2 gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
                <div className="col-span-2 sm:col-span-1">
                  <TextField id={`mc-name-${m.key}`} label="Máquina" value={m.name} placeholder="Ej.: Seccionadora" onChange={(v) => set({ machines: state.machines.map((x) => (x.key === m.key ? { ...x, name: v } : x)) })} />
                </div>
                <NumField id={`mc-hours-${m.key}`} label="Horas de uso" suffix="h" value={m.hours} onChange={(v) => set({ machines: state.machines.map((x) => (x.key === m.key ? { ...x, hours: v } : x)) })} />
                <NumField id={`mc-cost-${m.key}`} label="Costo por hora" suffix="$" value={m.hourlyCost} onChange={(v) => set({ machines: state.machines.map((x) => (x.key === m.key ? { ...x, hourlyCost: v } : x)) })} />
                <RemoveButton label={`Quitar máquina ${i + 1}`} onClick={() => set({ machines: state.machines.filter((x) => x.key !== m.key) })} />
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="4 · Otros costos" hint="Montos globales estimados. Dejá en 0 lo que no aplique.">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <NumField id="c-out" label="Tercerizaciones (incluye terminaciones)" suffix="$" value={state.outsourcing} onChange={(v) => set({ outsourcing: v })} />
          <NumField id="c-log" label="Logística" suffix="$" value={state.logistics} onChange={(v) => set({ logistics: v })} />
          <NumField id="c-inst" label="Instalación" suffix="$" value={state.installation} onChange={(v) => set({ installation: v })} />
          <NumField id="c-cont" label="Imprevistos" suffix="%" value={state.contingencyPct} onChange={(v) => set({ contingencyPct: v })} />
        </div>
      </Section>

      <Section
        title="Aprendizaje de proyectos anteriores"
        hint={`Compara lo presupuestado con lo que realmente costó en proyectos finalizados tipo “${projectType}”.`}
      >
        {result.benchmarks.sampleSize === 0 ? (
          <p className="text-sm text-slate-600">Todavía no hay proyectos finalizados de este tipo. Cuando cierres algunos, acá vas a ver cuánto se desviaron.</p>
        ) : result.suggestions.length === 0 ? (
          <p className="text-sm text-slate-600">
            En {result.benchmarks.sampleSize} {result.benchmarks.sampleSize === 1 ? "proyecto finalizado" : "proyectos finalizados"} de este tipo no hubo sobrecostos relevantes por categoría.
          </p>
        ) : (
          <ul className="space-y-2">
            {result.suggestions.map((s) => (
              <li key={s.category} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
                <span>
                  <strong>{CATEGORY_LABELS[s.category]}</strong> cerró en promedio <strong>+{formatPercent(s.avgOverrunPct)}</strong> sobre lo presupuestado ({s.sampleSize} {s.sampleSize === 1 ? "proyecto" : "proyectos"}).
                </span>
                <label className="flex items-center gap-2 text-xs font-medium">
                  <input type="checkbox" checked={state.appliedAdjustments.includes(s.category)} onChange={() => toggleAdjustment(s.category)} className="size-4 accent-blue-700" />
                  Sumar ese margen de seguridad
                </label>
              </li>
            ))}
          </ul>
        )}
        {result.benchmarks.sampleSize > 0 && (
          <p className="mt-2 text-xs text-slate-500">
            Es un promedio simple de proyectos finalizados, no una predicción.
            {result.benchmarks.sampleSize < MIN_COMPARABLE_PROJECTS &&
              ` Con menos de ${MIN_COMPARABLE_PROJECTS} proyectos comparables, tomalo como un indicio, no como una conclusión.`}
          </p>
        )}
      </Section>

      <section className="rounded-lg border border-blue-200 bg-blue-50/50 p-4" aria-label="Resultado de la calculadora" aria-live="polite">
        <h3 className="text-sm font-semibold text-slate-900">Resultado</h3>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <dl className="space-y-1.5 text-sm">
              {[...byCat.entries()].map(([c, v]) => (
                <div key={c} className="flex justify-between">
                  <dt className="text-slate-600">{CATEGORY_LABELS[c]}</dt>
                  <dd className="tabular">{formatCurrency(v)}</dd>
                </div>
              ))}
              <div className="flex justify-between border-t border-blue-200 pt-1.5 font-semibold">
                <dt>Costo presupuestado</dt>
                <dd className="tabular">{formatCurrency(total)}</dd>
              </div>
            </dl>
          </div>
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <NumField id="c-target" label="Rentabilidad objetivo" help="Ganancia sobre el precio de venta" suffix="%" value={state.targetMarginPct} onChange={(v) => set({ targetMarginPct: v })} />
              <div className="flex flex-col gap-1">
                <label htmlFor="c-price" className="text-xs font-medium text-slate-600">Precio de venta</label>
                <Input id="c-price" inputMode="numeric" className="text-right" aria-invalid={!!priceError} value={salesPrice > 0 ? String(salesPrice) : ""} placeholder="0" onChange={(e) => onSalesPrice(Number(e.target.value.replace(/[^\d.]/g, "")) || 0)} />
              </div>
            </div>
            {priceError && <p role="alert" className="text-xs text-red-600">{priceError}</p>}
            {suggested !== null ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white p-2.5">
                <span>Para ganar {formatPercent(input.targetMarginPct)} conviene vender a <strong className="tabular">{formatCurrency(suggested)}</strong></span>
                <Button size="sm" variant="outline" onClick={() => onSalesPrice(suggested)}>Usar este precio</Button>
              </div>
            ) : (
              <p className="text-slate-500">Cargá costos y una rentabilidad objetivo menor a 100% para ver un precio sugerido.</p>
            )}
            {margin !== null && (
              <p>Con ese precio{usesSuggestedPrice ? " (el sugerido)" : ""} la <strong>rentabilidad esperada</strong> es <strong className="tabular">{formatPercent(margin)}</strong>.</p>
            )}
            {dueDate ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white p-2.5">
                <span>
                  Duración estimada: <strong>{formatWorkingDays(days)}</strong> ({prodDays} de producción{days - prodDays > 0 ? ` + ${days - prodDays} de instalación` : ""}). Entrega estimada: <strong>{formatDate(dueDate)}</strong>
                </span>
                <Button size="sm" variant="outline" onClick={() => onDueDate(dueDate)}>Usar esta fecha</Button>
              </div>
            ) : (
              <p className="text-slate-500">Cargá horas y operarios para estimar la duración.</p>
            )}
          </div>
        </div>

        {!showDelayChart({ salesPrice, workingDays: days, dailyCost: daily, cost: total }) ? (
          <p className="mt-5 border-t border-blue-200 pt-4 text-sm text-slate-500">
            “¿Qué pasa si el proyecto se alarga?” aparece cuando haya precio de venta y una duración estimada de más de un día laboral.
          </p>
        ) : (
          <div className="mt-5 border-t border-blue-200 pt-4">
            <h4 className="text-sm font-semibold text-slate-900">¿Qué pasa si el proyecto se alarga?</h4>
            <p className="mt-1 text-sm text-slate-600">
              Con el equipo asignado, cada día laboral extra cuesta <strong className="tabular">{formatCurrency(daily)}</strong>
              {" "}(≈ {formatPercent((daily / salesPrice) * 100)} del precio de venta).{" "}
              {delay.belowTargetAtBase
                ? "Con este costo ya no llegás a la rentabilidad objetivo, incluso en fecha."
                : delay.extraDaysBeforeTarget === 0
                  ? "Desde el primer día de atraso la rentabilidad baja del objetivo."
                  : `Podés absorber ${formatWorkingDays(delay.extraDaysBeforeTarget ?? 0)} de atraso antes de bajar de la rentabilidad objetivo.`}
              {delay.extraDaysToBreakEven !== null && ` Con ${formatWorkingDays(delay.extraDaysToBreakEven + 1)} extra la ganancia llegaría a cero.`}
            </p>
            <DelayChart points={delay.points} targetMarginPct={input.targetMarginPct} />
            <p className="text-xs text-slate-500">
              Estimación: supone que todo el equipo sigue asignado al proyecto durante el atraso. La línea punteada es tu rentabilidad objetivo.
              {usesSuggestedPrice && " Está calculado con el precio sugerido."}
            </p>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className="text-xs text-slate-500">Al continuar, este cálculo se guarda como el costo presupuestado del proyecto.</p>
        </div>
      </section>
    </div>
  );
}
