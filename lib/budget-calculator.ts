// ─────────────────────────────────────────────────────────────
// Calculadora de presupuesto — funciones puras, sin UI ni estado.
//
// Convierte supuestos del usuario (materiales, operarios, máquinas,
// costos directos) en líneas de presupuesto + duración + precio sugerido
// + sensibilidad al atraso. Todo es una ESTIMACIÓN basada en lo que el
// usuario carga: no hay datos ocultos ni automatismos.
// ─────────────────────────────────────────────────────────────
import type { BudgetCategory } from "@/types";
import type { BudgetLineInput } from "./project-operations";

const round2 = (n: number) => Math.round(n * 100) / 100;
const finite = (n: number) => (Number.isFinite(n) ? n : 0);

export interface CalcMaterial {
  /** Id de catálogo si corresponde (permite reconciliar compras y consumos). */
  materialId?: string;
  name: string;
  unit: string;
  quantity: number;
  unitCost: number;
  /** % extra de desperdicio esperado, se suma a la cantidad presupuestada. */
  wastePct: number;
}

export interface CalcLabor {
  role: string;
  workers: number;
  /** Horas totales de trabajo de ese rol (sumando a todos los operarios). */
  hours: number;
  hourlyCost: number;
}

export interface CalcMachine {
  name: string;
  hours: number;
  hourlyCost: number;
}

export interface CalcDirectCosts {
  outsourcing: number;
  finishing: number;
  logistics: number;
  installation: number;
}

export interface CalculatorInput {
  materials: CalcMaterial[];
  labor: CalcLabor[];
  machines: CalcMachine[];
  direct: CalcDirectCosts;
  /** Imprevistos como % del subtotal. */
  contingencyPct: number;
  hoursPerDay: number;
  installationDays: number;
  targetMarginPct: number;
  startDate: string;
}

/** Ajuste por historial: % extra sobre una categoría, con su fundamento (muestra). */
export interface CalcAdjustment {
  category: BudgetCategory;
  pct: number;
  sampleSize: number;
  projectType: string;
}

export const EMPTY_DIRECT: CalcDirectCosts = { outsourcing: 0, finishing: 0, logistics: 0, installation: 0 };

// ── Cantidades y costos ───────────────────────────────────────

export function materialBudgetQuantity(m: Pick<CalcMaterial, "quantity" | "wastePct">): number {
  return round2(finite(m.quantity) * (1 + Math.max(0, finite(m.wastePct)) / 100));
}

export function materialCost(m: CalcMaterial): number {
  return round2(materialBudgetQuantity(m) * finite(m.unitCost));
}

export const laborCost = (l: CalcLabor): number => round2(finite(l.hours) * finite(l.hourlyCost));
export const machineCost = (m: CalcMachine): number => round2(finite(m.hours) * finite(m.hourlyCost));

/** Costo por día laboral de tener a todo el equipo asignado (base de la sensibilidad al atraso). */
export function dailyCrewCost(labor: CalcLabor[], hoursPerDay: number): number {
  return round2(labor.reduce((s, l) => s + finite(l.workers) * finite(hoursPerDay) * finite(l.hourlyCost), 0));
}

// ── Líneas de presupuesto ─────────────────────────────────────

/**
 * Genera las líneas de presupuesto. Cada línea es trazable a un supuesto cargado;
 * los ajustes por historial y los imprevistos van como líneas separadas y explícitas.
 */
export function buildBudgetLines(input: CalculatorInput, adjustments: CalcAdjustment[] = []): BudgetLineInput[] {
  const lines: BudgetLineInput[] = [];

  for (const m of input.materials) {
    if (!m.name.trim() || !(m.quantity > 0)) continue;
    lines.push({
      category: "materials",
      description: m.name.trim(),
      materialId: m.materialId,
      quantity: materialBudgetQuantity(m),
      unit: m.unit.trim() || "u",
      unitCost: finite(m.unitCost),
      notes: m.wastePct > 0 ? `Incluye ${m.wastePct}% de desperdicio esperado sobre ${m.quantity} ${m.unit}.` : undefined,
    });
  }
  for (const l of input.labor) {
    if (!l.role.trim() || !(l.hours > 0)) continue;
    lines.push({
      category: "labor",
      description: `${l.role.trim()} (${l.workers} ${l.workers === 1 ? "operario" : "operarios"})`,
      quantity: finite(l.hours),
      unit: "h",
      unitCost: finite(l.hourlyCost),
    });
  }
  for (const m of input.machines) {
    if (!m.name.trim() || !(m.hours > 0)) continue;
    lines.push({
      category: "other",
      description: `Máquina: ${m.name.trim()}`,
      quantity: finite(m.hours),
      unit: "h",
      unitCost: finite(m.hourlyCost),
    });
  }
  const directs: [keyof CalcDirectCosts, BudgetCategory, string][] = [
    ["outsourcing", "outsourcing", "Tercerizaciones"],
    ["finishing", "finishing", "Terminaciones"],
    ["logistics", "logistics", "Logística"],
    ["installation", "installation", "Instalación"],
  ];
  for (const [key, category, label] of directs) {
    const amount = finite(input.direct[key]);
    if (amount > 0) lines.push({ category, description: label, quantity: null, unit: "global", unitCost: amount });
  }

  // Ajustes por historial: línea explícita dentro de la misma categoría.
  const subtotalByCat = new Map<BudgetCategory, number>();
  for (const l of lines) subtotalByCat.set(l.category, (subtotalByCat.get(l.category) ?? 0) + (l.quantity === null ? l.unitCost : l.quantity * l.unitCost));
  for (const a of adjustments) {
    const base = subtotalByCat.get(a.category) ?? 0;
    const amount = round2((base * a.pct) / 100);
    if (amount <= 0) continue;
    lines.push({
      category: a.category,
      description: `Ajuste por historial (+${round2(a.pct)}%)`,
      quantity: null,
      unit: "global",
      unitCost: amount,
      notes: `Proyectos "${a.projectType}" finalizados (${a.sampleSize}) cerraron en promedio ${round2(a.pct)}% sobre lo presupuestado en esta categoría.`,
    });
  }

  const subtotal = round2(lines.reduce((s, l) => s + (l.quantity === null ? l.unitCost : l.quantity * l.unitCost), 0));
  const contingency = round2((subtotal * Math.max(0, finite(input.contingencyPct))) / 100);
  if (contingency > 0) {
    lines.push({
      category: "contingency",
      description: `Imprevistos (${input.contingencyPct}%)`,
      quantity: null,
      unit: "global",
      unitCost: contingency,
    });
  }
  return lines;
}

export function totalOfLines(lines: BudgetLineInput[]): number {
  return round2(lines.reduce((s, l) => s + (l.quantity === null ? l.unitCost : l.quantity * l.unitCost), 0));
}

// ── Precio y margen ───────────────────────────────────────────

/** Precio de venta que da `marginPct` sobre ese costo. null si el margen es inválido (≥100%) o no hay costo. */
export function suggestedSalesPrice(cost: number, marginPct: number): number | null {
  if (!(cost > 0) || !Number.isFinite(marginPct) || marginPct < 0 || marginPct >= 100) return null;
  return Math.ceil(cost / (1 - marginPct / 100) - 1e-6);
}

export function marginAt(salesPrice: number, cost: number): number | null {
  if (!(salesPrice > 0)) return null;
  return ((salesPrice - cost) / salesPrice) * 100;
}

// ── Duración ──────────────────────────────────────────────────

/** Días laborales de producción: los roles trabajan en paralelo, el más largo marca el plazo. */
export function productionDays(labor: CalcLabor[], hoursPerDay: number): number {
  if (!(hoursPerDay > 0)) return 0;
  const days = labor
    .filter((l) => l.workers > 0 && l.hours > 0)
    .map((l) => l.hours / (l.workers * hoursPerDay));
  return days.length ? Math.ceil(Math.max(...days)) : 0;
}

export function totalWorkingDays(input: Pick<CalculatorInput, "labor" | "hoursPerDay" | "installationDays">): number {
  return productionDays(input.labor, input.hoursPerDay) + Math.max(0, Math.ceil(finite(input.installationDays)));
}

/** Suma `days` días laborales (lun–vie) a una fecha ISO yyyy-mm-dd. */
export function addWorkingDays(startISO: string, days: number): string {
  const [y, m, d] = startISO.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  let left = Math.max(0, Math.floor(days));
  while (left > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const dow = date.getUTCDay();
    if (dow !== 0 && dow !== 6) left -= 1;
  }
  return date.toISOString().slice(0, 10);
}

// ── Sensibilidad al atraso ────────────────────────────────────

export interface DelayPoint {
  extraDays: number;
  cost: number;
  margin: number | null;
}

export interface DelayAnalysis {
  dailyCost: number;
  points: DelayPoint[];
  /** Días de atraso que se pueden absorber sin bajar del margen objetivo (0 = cualquier atraso ya baja el margen). null si no hay datos. */
  extraDaysBeforeTarget: number | null;
  /** Días de atraso hasta margen 0 (ganancia nula). null si no se pierde plata con atraso o faltan datos. */
  extraDaysToBreakEven: number | null;
  /** true si ya con el plazo base el margen queda por debajo del objetivo. */
  belowTargetAtBase: boolean;
}

/**
 * ¿Cuánto margen se pierde por cada día extra con el equipo asignado?
 * Supuesto explícito: cada día de atraso cuesta lo mismo que un día de equipo completo.
 */
export function delayAnalysis(params: {
  baseCost: number;
  salesPrice: number;
  dailyCost: number;
  targetMarginPct: number;
  maxExtraDays?: number;
}): DelayAnalysis {
  const { baseCost, salesPrice, dailyCost, targetMarginPct } = params;
  const max = params.maxExtraDays ?? 15;
  const points: DelayPoint[] = [];
  for (let d = 0; d <= max; d += 1) {
    const cost = round2(baseCost + d * dailyCost);
    const margin = marginAt(salesPrice, cost);
    points.push({ extraDays: d, cost, margin });
    // No tiene sentido seguir graficando cuando ya se perdió bastante más que la ganancia.
    if (margin !== null && margin < -10) break;
  }
  const baseMargin = marginAt(salesPrice, baseCost);
  if (baseMargin === null || !(dailyCost > 0)) {
    return { dailyCost, points, extraDaysBeforeTarget: null, extraDaysToBreakEven: null, belowTargetAtBase: false };
  }
  const belowTargetAtBase = baseMargin < targetMarginPct - 1e-9;
  const allowedCostForTarget = salesPrice * (1 - targetMarginPct / 100);
  const slackDays = Math.floor((allowedCostForTarget - baseCost + 1e-6) / dailyCost);
  return {
    dailyCost,
    points,
    extraDaysBeforeTarget: belowTargetAtBase ? 0 : Math.max(0, slackDays),
    extraDaysToBreakEven: Math.max(0, Math.floor((salesPrice - baseCost) / dailyCost)),
    belowTargetAtBase,
  };
}
