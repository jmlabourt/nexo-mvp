// Estado de la cotización por rubros (campos como texto para permitir vacíos) y su conversión a números.
// Lo usan el Cotizador y Nuevo proyecto: los dos muestran la misma calculadora con el mismo resultado.
import type { BudgetCategory, HourRate, Project, RubroId } from "@/types";
import {
  adjustmentLines,
  financialLine,
  productLaborRubros,
  quoteBreakdown,
  ratesByCategory,
  rubroLabor,
  rubroLines,
  totalOfLines,
  workSchedule,
  type CalcAdjustment,
  type QuoteBreakdown,
  type QuoteInput,
  type QuoteMaterial,
  type QuoteRubro,
  type RatesByCategory,
  type RubroLabor,
  type WorkSchedule,
} from "@/lib/budget-calculator";
import { delayAnalysis, type DelayResult } from "@/lib/delay";
import { benchmarksForType, learningInsights, type LearningInsight } from "@/lib/historical-benchmarks";
import type { BudgetLineInput } from "@/lib/project-operations";
import { productInputError, type ProductInput } from "@/lib/production";
import { CATEGORY_LABELS, DEFAULT_FINANCIAL_PCT, HOUR_CATEGORIES, MATERIAL_CATALOG } from "@/lib/constants";
import { formatCurrency, formatNumber, formatWorkingDays } from "@/lib/formatting";
import { rubroDef } from "@/lib/rubros";
import { parseDecimal } from "@/lib/schemas";

export interface MaterialRow {
  key: string;
  name: string;
  unit: string;
  quantity: string;
  unitCost: string;
  wastePct: string;
}

/**
 * Un rubro del proyecto que no es de un mueble: Transporte / Fletes e Imprevistos (solo un importe). Las cotizaciones
 * anteriores también podían tener acá materiales y horas de diseño o administración "generales": se siguen calculando
 * igual, pero la pantalla ya no los crea (todo se carga dentro de cada mueble).
 */
export interface RubroRow {
  key: string;
  rubro: RubroId;
  materials: MaterialRow[];
  designHours: string;
  adminHours: string;
  /** Solo rubros de importe (Transporte / Fletes, Imprevistos). */
  amount: string;
}

/**
 * Un rubro de un mueble, con todo junto: horas de operarios para toda la cantidad y cuántos operarios pide, materiales
 * y horas de diseño y de administración de ese rubro en ese mueble.
 */
export interface ProductRubroRow {
  staffHours?: Array<{ rateId: string; name: string; category: "design" | "admin"; hours: string; hourlyCost: number }>;
  key: string;
  rubro: RubroId;
  hours: string;
  workers: string;
  materials?: MaterialRow[];
  designHours?: string;
  adminHours?: string;
}

/** Un mueble en edición ("Mesa de comedor × 10"). Su nombre se edita en el título de la tarjeta. */
export interface ProductRow {
  key: string;
  name: string;
  quantity: string;
  rubros: ProductRubroRow[];
}

export interface CalcState {
  /** Muebles: cada uno con sus rubros (horas, operarios, materiales, diseño y administración). */
  products: ProductRow[];
  /** Rubros del proyecto que no son de un mueble (Transporte / Fletes, Imprevistos). */
  rubros: RubroRow[];
  /** Plazo en días hábiles (opcional). Sin plazo no hay horas extra. */
  deadlineDays: string;
  materialsTargetPct: string;
  laborTargetPct: string;
  financialPct: string;
  /**
   * Condiciones de cobro para el gasto financiero (fechas, días de pago, seña y cuotas). Con ellas el % de gasto
   * financiero se calcula (lib/financial.ts) y deja de cargarse a mano. Opcional: las cotizaciones viejas no lo traen.
   */
  finance?: QuoteFinanceForm;
  /** Márgenes de seguridad aplicados desde el aprendizaje (% editable). */
  safetyMargins: SafetyMarginRow[];
  /** Atraso: multa o costo por día (opcional). */
  delayPenalty: string;
  /** Atraso: piso de rentabilidad en % ("" = la rentabilidad total del precio sugerido). */
  delayFloorPct: string;
}

export interface QuoteFinanceForm {
  startDate: string;
  deliveryDate: string;
  daysAfterDelivery: string;
  seniaPct: string;
  installments: string;
}

/** Margen de seguridad aplicado: el % se puede editar; la referencia queda para que sea trazable. */
export interface SafetyMarginRow {
  category: BudgetCategory;
  pct: string;
  /** Desvío promedio de los proyectos comparables al aplicarlo, en %. */
  referencePct: number;
  sampleSize: number;
  projectType: string;
}

let seq = 0;
const rowKey = () => `r${Date.now()}${(seq += 1)}`;

/** Lo más simple: cantidad 1 y el costo total alcanza para algo que se compra hecho. */
export const newMaterialRow = (): MaterialRow => ({ key: rowKey(), name: "", unit: "u", quantity: "1", unitCost: "", wastePct: "0" });

export function newRubroRow(rubro: RubroId): RubroRow {
  const full = rubroDef(rubro).kind === "full";
  return { key: rowKey(), rubro, materials: full ? [newMaterialRow()] : [], designHours: "", adminHours: "", amount: "" };
}

export const newProductRubroRow = (rubro: RubroId): ProductRubroRow => ({
  key: rowKey(),
  rubro,
  hours: "",
  workers: "1",
  materials: [newMaterialRow()],
  designHours: "",
  adminHours: "",
});

export const newProductRow = (name = ""): ProductRow => ({ key: rowKey(), name, quantity: "1", rubros: [newProductRubroRow("carpinteria_madera")] });

export function initialCalcState(financialPct = DEFAULT_FINANCIAL_PCT): CalcState {
  return {
    products: [newProductRow()],
    rubros: [],
    deadlineDays: "",
    materialsTargetPct: "30",
    laborTargetPct: "30",
    financialPct: String(financialPct).replace(".", ","),
    safetyMargins: [],
    delayPenalty: "",
    delayFloorPct: "",
  };
}

const round2 = (v: number) => Math.round(v * 100) / 100;

const n = (s: string) => {
  const v = parseDecimal(s);
  return Number.isFinite(v) && v > 0 ? v : 0;
};

/** Lo que la calculadora necesita además de lo que se tipea. */
export interface CalculatorContext {
  projects: Project[];
  rates: HourRate[];
  overtimeMultiplier: number;
  /** Jornada del operario (Configuración): queda congelada en las líneas de horas. */
  hoursPerDay: number;
  /** Precio de venta elegido (0 = todavía no): de él sale el gasto financiero. */
  salesPrice: number;
  /** Empresa demo: el aprendizaje se muestra aunque haya pocos proyectos, rotulado. */
  isDemo: boolean;
}

/** Una fila de material en edición → material de la cotización (con su id de catálogo si coincide el nombre). */
export function materialRowToQuote(m: MaterialRow): QuoteMaterial {
  return {
    materialId: MATERIAL_CATALOG.find((c) => c.name.toLowerCase() === m.name.trim().toLowerCase())?.id,
    name: m.name,
    unit: m.unit,
    quantity: n(m.quantity),
    unitCost: n(m.unitCost),
    wastePct: n(m.wastePct),
  };
}

/** Nombre que se muestra del mueble: el escrito en el título o "Mueble N". */
export const productLabel = (p: Pick<ProductRow, "name">, index: number) => p.name.trim() || `Mueble ${index + 1}`;

/** ¿El rubro del mueble tiene algo cargado además de las horas? (materiales, diseño o administración) */
const rubroHasExtras = (r: ProductRubroRow) =>
  (r.materials ?? []).some((m) => m.name.trim() && n(m.quantity) > 0) || n(r.designHours ?? "") > 0 || n(r.adminHours ?? "") > 0 || (r.staffHours ?? []).some((h) => n(h.hours) > 0);

/** Rubro con horas de operarios escritas: es mano de obra del mueble (y lo que el Jefe de planta asigna). */
const hasLaborHours = (r: ProductRubroRow) => r.hours.trim() !== "";

/** Un mueble vacío (sin nombre ni nada cargado) no cuenta: es la tarjeta que la pantalla ofrece para empezar. */
const isBlankProduct = (p: ProductRow) => !p.name.trim() && p.rubros.every((r) => !hasLaborHours(r) && !rubroHasExtras(r));

/**
 * Fila de mueble → lo que se valida y se guarda (project_items). Solo van los rubros con horas de operarios; un rubro
 * con solo materiales (o diseño / administración) no lleva horas de planta. Cantidad y operarios vacíos quedan en NaN.
 */
const toProductInput = (p: ProductRow, index: number): ProductInput => ({
  name: productLabel(p, index),
  quantity: p.quantity.trim() ? Number(p.quantity.trim().replace(",", ".")) : NaN,
  rubros: p.rubros.filter(hasLaborHours).map((r) => ({ rubro: r.rubro, hours: n(r.hours), workers: r.workers.trim() ? Number(r.workers.trim()) : NaN })),
});

/** Problema de una fila de mueble (null = bien o vacía). La pantalla lo muestra al lado del mueble. */
export function productRowError(p: ProductRow, index = 0): string | null {
  if (isBlankProduct(p)) return null;
  const empty = p.rubros.find((r) => !hasLaborHours(r) && !rubroHasExtras(r));
  if (empty) return `Indicá las horas estimadas de ${rubroDef(empty.rubro).label}.`;
  return productInputError(toProductInput(p, index));
}

/** Muebles cargados → lo que guarda el proyecto (project_items) y lo que valoriza la calculadora. */
export function productInputs(s: Pick<CalcState, "products">): ProductInput[] {
  return s.products.flatMap((p, i) => (isBlankProduct(p) ? [] : [toProductInput(p, i)]));
}

/** Primer problema de los muebles ("Mueble 2 (Silla): …"), o null si están bien. */
export function productsError(s: Pick<CalcState, "products">): string | null {
  for (const [i, p] of s.products.entries()) {
    const error = productRowError(p, i);
    if (error) return `Mueble ${i + 1}${p.name.trim() ? ` (${p.name.trim()})` : ""}: ${error}`;
  }
  return null;
}

function rubroRowToQuote(r: RubroRow): QuoteRubro {
  return {
    rubro: r.rubro,
    materials: r.materials.map(materialRowToQuote),
    workers: 0,
    hoursPerWorker: 0,
    designHours: n(r.designHours),
    adminHours: n(r.adminHours),
    amount: n(r.amount),
  };
}

/** Solo los muebles válidos se valorizan: uno a medio cargar no se valoriza a medias. */
const validRows = (s: Pick<CalcState, "products">) =>
  s.products.flatMap((p, index) => (!isBlankProduct(p) && productRowError(p, index) === null ? [{ row: p, index }] : []));

/**
 * Cada rubro de un mueble válido → una entrada de la cotización con todo junto: mano de obra (horas para toda la
 * cantidad y operarios, como productLaborRubros), materiales y horas de diseño y de administración. Valoriza lo mismo
 * que tenerlos por separado: la mano de obra sigue siendo la suma de los muebles.
 */
function productQuoteRubros(s: Pick<CalcState, "products">): Array<{ productKey: string; rubroKey: string; quote: QuoteRubro }> {
  return validRows(s).flatMap(({ row, index }) => {
    const input = toProductInput(row, index);
    // Mismo rótulo que productLaborRubros: "Mesa de comedor × 10".
    const product = `${input.name.trim()} × ${input.quantity}`;
    return row.rubros
      .filter((r) => hasLaborHours(r) || rubroHasExtras(r))
      .map((r) => {
        const [labor] = hasLaborHours(r) ? productLaborRubros([{ ...input, rubros: input.rubros.filter((x) => x.rubro === r.rubro) }]) : [];
        const quote: QuoteRubro = {
          rubro: r.rubro,
          product,
          materials: (r.materials ?? []).map(materialRowToQuote),
          workers: labor?.workers ?? 0,
          hoursPerWorker: labor?.hoursPerWorker ?? 0,
          ...(labor ? { totalHours: labor.totalHours } : {}),
          designHours: n(r.designHours ?? ""),
          adminHours: n(r.adminHours ?? ""),
          staffHours: (r.staffHours ?? []).map((h) => ({ ...h,hours:n(h.hours) })),
          amount: 0,
        };
        return { productKey: row.key, rubroKey: r.key, quote };
      });
  });
}

function calcStateToInput(s: CalcState, ctx: Pick<CalculatorContext, "rates" | "overtimeMultiplier" | "hoursPerDay">): QuoteInput {
  return {
    rubros: [...s.rubros.map(rubroRowToQuote), ...productQuoteRubros(s).map((x) => x.quote)],
    hoursPerDay: ctx.hoursPerDay,
    deadlineDays: n(s.deadlineDays) || null,
    rates: ctx.rates,
    overtimeMultiplier: ctx.overtimeMultiplier,
    materialsTargetPct: n(s.materialsTargetPct),
    laborTargetPct: n(s.laborTargetPct),
    financialPct: n(s.financialPct),
  };
}

const toAdjustments = (margins: SafetyMarginRow[]): CalcAdjustment[] =>
  margins.map((m) => ({ category: m.category, pct: n(m.pct), referencePct: m.referencePct, sampleSize: m.sampleSize, projectType: m.projectType }));

/** Margen de seguridad a partir de una línea de aprendizaje: arranca con el desvío promedio (1 decimal). */
export function safetyMarginFrom(insight: LearningInsight, projectType: string): SafetyMarginRow {
  const pct = Math.round(insight.avgOverrunPct * 10) / 10;
  return { category: insight.category, pct: String(pct).replace(".", ","), referencePct: insight.avgOverrunPct, sampleSize: insight.sampleSize, projectType };
}

export interface RubroResult {
  key: string;
  rubro: RubroId;
  /** null en rubros de importe. */
  labor: RubroLabor | null;
  lines: BudgetLineInput[];
  total: number;
}

/** Costo de un mueble: una entrada por rubro (mano de obra, materiales, diseño y administración), con sus líneas. */
export interface ProductResult {
  /** Fila de la pantalla (ProductRow.key). */
  key: string;
  name: string;
  quantity: number;
  /** key = ProductRubroRow.key */
  rubros: Array<{ key: string; rubro: RubroId; labor: RubroLabor; lines: BudgetLineInput[]; total: number }>;
  total: number;
}

export interface CalculatorResult {
  input: QuoteInput;
  rubros: RubroResult[];
  /** Muebles válidos con su costo (la mano de obra presupuestada es la suma de estos). */
  products: ProductResult[];
  /** Primer problema de los productos cargados (null = bien). */
  productsError: string | null;
  schedule: WorkSchedule;
  /** Horas extra de mano de obra de todos los rubros (0 si los días de trabajo entran). */
  overtimeHours: number;
  /** Todas las líneas del costo presupuestado (rubros + ajustes + gasto financiero). */
  lines: BudgetLineInput[];
  total: number;
  /** Desglose del resumen (panel, Resultado y "Revisar y crear"). */
  breakdown: QuoteBreakdown;
  /** Tarifas usadas (undefined = no hay tipo de hora de esa categoría). */
  rates: RatesByCategory;
  /** Aprendizaje de proyectos anteriores (vacío con menos de 3 comparables, salvo en la demo). */
  insights: LearningInsight[];
  hasContent: boolean;
  /** N del cálculo de atraso: el equipo más grande previsto (máximo de operarios de un rubro). */
  crewSize: number;
  /** ¿Qué pasa si el proyecto se alarga? null sin precio de venta o sin costo. */
  delay: DelayResult | null;
}

/** Todo lo derivado de la cotización en un solo lugar (el Cotizador y Nuevo proyecto usan el mismo resultado). */
export function computeCalculator(state: CalcState, projectType: string, ctx: CalculatorContext): CalculatorResult {
  const input = calcStateToInput(state, ctx);
  const rates = ratesByCategory(ctx.rates);
  const schedule = workSchedule(input.rubros, input.hoursPerDay, input.deadlineDays);
  const quoted = input.rubros.map((r) => {
    const labor =
      rubroDef(r.rubro).kind === "full"
        ? rubroLabor(r, {
            normalShare: schedule.normalShare,
            laborRate: rates.labor?.hourlyRate ?? 0,
            designRate: rates.design?.hourlyRate ?? 0,
            adminRate: rates.admin?.hourlyRate ?? 0,
            overtimeMultiplier: input.overtimeMultiplier,
          })
        : null;
    const lines = rubroLines(r, labor, { rates, overtimeMultiplier: input.overtimeMultiplier, hoursPerDay: input.hoursPerDay });
    return { rubro: r.rubro, labor, lines, total: totalOfLines(lines) };
  });
  // Primero los rubros del proyecto (importes); después cada rubro de cada mueble, en el mismo orden que la cotización.
  const rubros: RubroResult[] = state.rubros.map((row, i) => ({ key: row.key, ...quoted[i] }));
  const parts = productQuoteRubros(state);
  const products: ProductResult[] = validRows(state).map(({ row, index }) => {
    const mine = parts.flatMap((x, j) => {
      if (x.productKey !== row.key) return [];
      const q = quoted[state.rubros.length + j];
      return [{ key: x.rubroKey, rubro: x.quote.rubro, labor: q.labor as RubroLabor, lines: q.lines, total: q.total }];
    });
    const input = toProductInput(row, index);
    return { key: row.key, name: input.name, quantity: input.quantity, rubros: mine, total: round2(mine.reduce((s, r) => s + r.total, 0)) };
  });
  const rubroLinesAll = quoted.flatMap((r) => r.lines);
  const withAdjustments = [...rubroLinesAll, ...adjustmentLines(rubroLinesAll, toAdjustments(state.safetyMargins))];
  const financial = financialLine(input.financialPct, ctx.salesPrice);
  const lines = financial ? [...withAdjustments, financial] : withAdjustments;
  const total = totalOfLines(lines);
  const breakdown = quoteBreakdown(lines, input, ctx.salesPrice);
  const suggestedMargin = breakdown.suggestedPrice !== null ? quoteBreakdown(lines, input, breakdown.suggestedPrice).margin : null;
  const crewSize = Math.max(0, ...input.rubros.map((r) => r.workers));
  const floor = state.delayFloorPct.trim() ? parseDecimal(state.delayFloorPct) : NaN; // vacío = rentabilidad del precio sugerido
  const delay = delayAnalysis({
    price: ctx.salesPrice,
    cost: total,
    workers: crewSize,
    hoursPerDay: input.hoursPerDay,
    laborRate: rates.labor?.hourlyRate ?? 0,
    dailyPenalty: n(state.delayPenalty),
    floorPct: Number.isFinite(floor) ? floor : (suggestedMargin ?? 0),
    workDays: schedule.workDays,
  });
  return {
    input,
    rubros,
    products,
    productsError: productsError(state),
    schedule,
    overtimeHours: round2(quoted.reduce((s, r) => s + (r.labor?.overtimeHours ?? 0), 0)),
    lines,
    total,
    breakdown,
    rates,
    insights: learningInsights(benchmarksForType(ctx.projects, projectType), { isDemo: ctx.isDemo }),
    hasContent: withAdjustments.length > 0,
    crewSize,
    delay,
  };
}

export interface FurnitureSubtotal {
  /** ProductRow.key */
  key: string;
  name: string;
  quantity: number;
  /** Costo directo del mueble: mano de obra, materiales, diseño y administración de sus rubros. */
  direct: number;
  /** Parte del precio de venta, proporcional al costo directo (null sin precio o sin costo directo). */
  price: number | null;
  /** price / cantidad. */
  unitPrice: number | null;
}

export interface FurnitureSubtotals {
  rows: FurnitureSubtotal[];
  /** Costos que no son de un mueble: transporte, imprevistos, márgenes de seguridad y gasto financiero. */
  shared: number;
  /** Igual al costo total de la cotización (Σ directos + compartidos). */
  total: number;
}

/**
 * Subtotales por mueble de una cotización. No cambia ningún cálculo: reparte el mismo costo total entre muebles y
 * costos compartidos, y reparte el precio de venta en proporción al costo directo de cada mueble (la suma da el precio
 * exacto: el redondeo se ajusta en el último).
 */
export function furnitureSubtotals(result: CalculatorResult, salesPrice: number): FurnitureSubtotals {
  const base = result.products.map((p) => ({ key: p.key, name: p.name, quantity: p.quantity, direct: p.total }));
  const direct = round2(base.reduce((s, r) => s + r.direct, 0));
  const canSplit = salesPrice > 0 && direct > 0;
  let assigned = 0;
  const rows = base.map((r, i) => {
    let price: number | null = null;
    if (canSplit) {
      price = i === base.length - 1 ? round2(salesPrice - assigned) : round2((salesPrice * r.direct) / direct);
      assigned = round2(assigned + price);
    }
    return { ...r, price, unitPrice: price !== null && r.quantity > 0 ? round2(price / r.quantity) : null };
  });
  return { rows, shared: round2(result.total - direct), total: result.total };
}

/** "Mano de obra $ 19.000/h · Diseño $ 27.000/h · Administración $ 27.000/h": las tarifas que usa la cotización. */
export function ratesText(rates: RatesByCategory): string {
  return HOUR_CATEGORIES.map((c) => `${rates[c]?.name ?? CATEGORY_LABELS[c]} ${formatCurrency(rates[c]?.hourlyRate ?? 0)}/h`).join(" · ");
}

/** Avisos del paso de revisión, en un solo lugar. */
export function reviewWarnings(calc: CalculatorResult, salesPrice: number): string[] {
  const out: string[] = [];
  const { schedule, breakdown, rates } = calc;
  if (!calc.hasContent) out.push("Falta cargar el costo: no hay materiales, horas ni importes.");
  if (!(salesPrice > 0)) out.push("Falta el precio de venta.");
  const missingRates = HOUR_CATEGORIES.filter((c) => !rates[c]?.hourlyRate);
  if (missingRates.length > 0) out.push("Falta la tarifa de algún tipo de hora: cargala en Configuración para que esas horas sumen al costo.");
  if (schedule.fits === false) {
    out.push(
      `Los días de trabajo estimados (${formatWorkingDays(schedule.workDays)}) no entran en el plazo (${formatWorkingDays(schedule.availableDays ?? 0)}): ` +
        `${formatNumber(calc.overtimeHours, 1)} h se calculan como horas extra.`,
    );
  }
  if (breakdown.priceSource === "chosen" && breakdown.suggestedPrice !== null && !breakdown.usesSuggested) {
    out.push(`El precio fue escrito a mano (el sugerido es ${formatCurrency(breakdown.suggestedPrice)}): la venta por materiales y mano de obra solo aplica al precio sugerido.`);
  }
  return out;
}

/**
 * Por qué todavía no se puede seguir (crear el proyecto o continuar). null = se puede.
 * Nuevo proyecto pide al menos un producto: de ahí salen la mano de obra y lo que el Jefe de planta asigna.
 */
export function quoteActionBlocker(calc: CalculatorResult, salesPrice: number, opts: { requireProducts?: boolean } = {}): string | null {
  if (calc.productsError) return calc.productsError;
  if (opts.requireProducts && calc.products.length === 0) return "Cargá al menos un mueble con sus horas por rubro.";
  if (!calc.hasContent) return "Cargá al menos un costo.";
  if (!(salesPrice > 0)) return "Definí el precio de venta (podés usar el sugerido).";
  return null;
}
