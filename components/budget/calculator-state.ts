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
  type QuoteProduct,
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
 * Un rubro en edición: materiales, horas de diseño y de administración (o un importe). La mano de obra NO va acá:
 * sale de los productos (Auditoría UX · P0-7), así las horas se cargan una sola vez.
 */
export interface RubroRow {
  key: string;
  rubro: RubroId;
  materials: MaterialRow[];
  designHours: string;
  adminHours: string;
  /** Solo rubros de importe (Transporte / Fletes, Imprevistos). */
  amount: string;
  /**
   * Mueble al que pertenece (ProductRow.key). Sin mueble = costo general del proyecto. Solo agrupa: el costo total y
   * las líneas del presupuesto son las mismas con o sin mueble.
   */
  productKey?: string;
}

/** Un rubro de un producto: horas estimadas para toda la cantidad y cuántos operarios pide. */
export interface ProductRubroRow {
  key: string;
  rubro: RubroId;
  hours: string;
  workers: string;
}

/** Un producto en edición ("Mesa de comedor × 10"). De sus horas sale la mano de obra presupuestada. */
export interface ProductRow {
  key: string;
  name: string;
  quantity: string;
  rubros: ProductRubroRow[];
}

export interface CalcState {
  /** Productos: la mano de obra presupuestada es la suma de sus horas por rubro. */
  products: ProductRow[];
  rubros: RubroRow[];
  /** Plazo en días hábiles (opcional). Sin plazo no hay horas extra. */
  deadlineDays: string;
  materialsTargetPct: string;
  laborTargetPct: string;
  financialPct: string;
  /** Márgenes de seguridad aplicados desde el aprendizaje (% editable). */
  safetyMargins: SafetyMarginRow[];
  /** Atraso: multa o costo por día (opcional). */
  delayPenalty: string;
  /** Atraso: piso de rentabilidad en % ("" = la rentabilidad total del precio sugerido). */
  delayFloorPct: string;
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

export function newRubroRow(rubro: RubroId, productKey?: string): RubroRow {
  const full = rubroDef(rubro).kind === "full";
  return { key: rowKey(), rubro, materials: full ? [newMaterialRow()] : [], designHours: "", adminHours: "", amount: "", ...(productKey ? { productKey } : {}) };
}

export const newProductRubroRow = (rubro: RubroId): ProductRubroRow => ({ key: rowKey(), rubro, hours: "", workers: "1" });

export const newProductRow = (name = ""): ProductRow => ({ key: rowKey(), name, quantity: "1", rubros: [newProductRubroRow("carpinteria_madera")] });

export function initialCalcState(financialPct = DEFAULT_FINANCIAL_PCT): CalcState {
  return {
    products: [newProductRow()],
    rubros: [newRubroRow("carpinteria_madera")],
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

/** Un producto vacío (sin nombre ni horas) no cuenta: es la fila que la pantalla ofrece para empezar. */
const isBlankProduct = (p: ProductRow) => !p.name.trim() && p.rubros.every((r) => !r.hours.trim());

/** Fila de producto → lo que se valida y se guarda. Cantidad y operarios vacíos quedan en NaN (no válidos). */
const toProductInput = (p: ProductRow): ProductInput => ({
  name: p.name.trim(),
  quantity: p.quantity.trim() ? Number(p.quantity.trim().replace(",", ".")) : NaN,
  rubros: p.rubros.map((r) => ({ rubro: r.rubro, hours: n(r.hours), workers: r.workers.trim() ? Number(r.workers.trim()) : NaN })),
});

/** Problema de una fila de producto (null = bien o vacía). La pantalla lo muestra al lado del producto. */
export function productRowError(p: ProductRow): string | null {
  return isBlankProduct(p) ? null : productInputError(toProductInput(p));
}

/** Productos cargados → lo que guarda el proyecto (project_items) y lo que valoriza la calculadora. */
export function productInputs(s: Pick<CalcState, "products">): ProductInput[] {
  return s.products.filter((p) => !isBlankProduct(p)).map(toProductInput);
}

/** Primer problema de los productos ("Producto 2 (Silla): …"), o null si están bien. */
export function productsError(s: Pick<CalcState, "products">): string | null {
  for (const [i, p] of s.products.entries()) {
    const error = productRowError(p);
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

/** Solo los productos válidos suman mano de obra: uno a medio cargar no se valoriza a medias. */
const validRows = (s: Pick<CalcState, "products">) => s.products.filter((p) => !isBlankProduct(p) && productRowError(p) === null);
const validProducts = (s: CalcState): QuoteProduct[] => validRows(s).map(toProductInput);

function calcStateToInput(s: CalcState, ctx: Pick<CalculatorContext, "rates" | "overtimeMultiplier" | "hoursPerDay">): QuoteInput {
  return {
    rubros: [...s.rubros.map(rubroRowToQuote), ...productLaborRubros(validProducts(s))],
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

/** Mano de obra de un producto: una entrada por rubro, con sus líneas. */
export interface ProductResult {
  /** Fila de la pantalla (ProductRow.key). */
  key: string;
  name: string;
  quantity: number;
  rubros: Array<{ rubro: RubroId; labor: RubroLabor; lines: BudgetLineInput[]; total: number }>;
  total: number;
}

export interface CalculatorResult {
  input: QuoteInput;
  rubros: RubroResult[];
  /** Productos válidos con su mano de obra (la mano de obra presupuestada es la suma de estos). */
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
  // Primero los rubros de la pantalla (materiales, diseño, administración, importes); después la mano de obra por producto.
  const rubros: RubroResult[] = state.rubros.map((row, i) => ({ key: row.key, ...quoted[i] }));
  let next = state.rubros.length;
  const rows = validRows(state);
  const products: ProductResult[] = validProducts(state).map((p, i) => {
    const mine = p.rubros.map((r) => {
      const q = quoted[next++];
      return { rubro: r.rubro, labor: q.labor as RubroLabor, lines: q.lines, total: q.total };
    });
    return { key: rows[i].key, name: p.name, quantity: p.quantity, rubros: mine, total: round2(mine.reduce((s, r) => s + r.total, 0)) };
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
  /** Mano de obra del mueble (sus horas por rubro). */
  labor: number;
  /** Materiales, diseño y administración de los rubros asignados a este mueble. */
  rubros: number;
  /** labor + rubros: lo que se le puede atribuir directamente. */
  direct: number;
  /** Parte del precio de venta, proporcional al costo directo (null sin precio o sin costo directo). */
  price: number | null;
  /** price / cantidad. */
  unitPrice: number | null;
}

export interface FurnitureSubtotals {
  rows: FurnitureSubtotal[];
  /** Costos que no son de un mueble: rubros generales, márgenes de seguridad y gasto financiero. */
  shared: number;
  /** Igual al costo total de la cotización (Σ directos + compartidos). */
  total: number;
}

/**
 * Subtotales por mueble de una cotización. No cambia ningún cálculo: reparte el mismo costo total entre muebles y
 * costos compartidos, y reparte el precio de venta en proporción al costo directo de cada mueble (la suma da el precio
 * exacto: el redondeo se ajusta en el último).
 */
export function furnitureSubtotals(state: CalcState, result: CalculatorResult, salesPrice: number): FurnitureSubtotals {
  const furniture = state.products.filter((p) => !isBlankProduct(p));
  const base = furniture.map((p) => {
    const labor = result.products.find((x) => x.key === p.key)?.total ?? 0;
    const rubros = round2(result.rubros.filter((r) => state.rubros.find((x) => x.key === r.key)?.productKey === p.key).reduce((s, r) => s + r.total, 0));
    const qty = Number(p.quantity.trim().replace(",", "."));
    return { key: p.key, name: p.name.trim(), quantity: Number.isFinite(qty) && qty > 0 ? qty : 0, labor, rubros, direct: round2(labor + rubros) };
  });
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
  // Un rubro de un mueble que ya no está queda en los compartidos (no coincide con ninguna fila).
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
