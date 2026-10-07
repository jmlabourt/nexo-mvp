// Estado de la calculadora de presupuesto (campos como texto para permitir vacíos) y su conversión a números.
import type { BudgetCategory, Project } from "@/types";
import { buildBudgetLines, EMPTY_DIRECT, totalOfLines, type CalcAdjustment, type CalculatorInput } from "@/lib/budget-calculator";
import { benchmarksForType, suggestedAdjustments, type CategoryBenchmark, type TypeBenchmarks } from "@/lib/historical-benchmarks";
import type { BudgetLineInput } from "@/lib/project-operations";
import { MATERIAL_CATALOG } from "@/lib/constants";
import { parseDecimal } from "@/lib/schemas";

export interface MaterialRow {
  key: string;
  name: string;
  unit: string;
  quantity: string;
  unitCost: string;
  wastePct: string;
}
export interface LaborRow {
  key: string;
  role: string;
  workers: string;
  hours: string;
  hourlyCost: string;
}
export interface MachineRow {
  key: string;
  name: string;
  hours: string;
  hourlyCost: string;
}

export interface CalcState {
  materials: MaterialRow[];
  labor: LaborRow[];
  machines: MachineRow[];
  outsourcing: string;
  finishing: string;
  logistics: string;
  installation: string;
  contingencyPct: string;
  hoursPerDay: string;
  installationDays: string;
  targetMarginPct: string;
  /** Categorías cuyo ajuste por historial el usuario decidió aplicar. */
  appliedAdjustments: BudgetCategory[];
}

let seq = 0;
export const rowKey = () => `r${Date.now()}${(seq += 1)}`;

export const newMaterialRow = (): MaterialRow => ({ key: rowKey(), name: "", unit: "placa", quantity: "", unitCost: "", wastePct: "10" });
export const newLaborRow = (): LaborRow => ({ key: rowKey(), role: "", workers: "1", hours: "", hourlyCost: "" });
export const newMachineRow = (): MachineRow => ({ key: rowKey(), name: "", hours: "", hourlyCost: "" });

export function initialCalcState(): CalcState {
  return {
    materials: [newMaterialRow()],
    labor: [newLaborRow()],
    machines: [],
    outsourcing: "",
    finishing: "",
    logistics: "",
    installation: "",
    contingencyPct: "5",
    hoursPerDay: "8",
    installationDays: "0",
    targetMarginPct: "30",
    appliedAdjustments: [],
  };
}

const n = (s: string) => {
  const v = parseDecimal(s);
  return Number.isFinite(v) && v > 0 ? v : 0;
};

export function calcStateToInput(s: CalcState, startDate: string): CalculatorInput {
  return {
    materials: s.materials.map((m) => ({
      materialId: MATERIAL_CATALOG.find((c) => c.name.toLowerCase() === m.name.trim().toLowerCase())?.id,
      name: m.name,
      unit: m.unit,
      quantity: n(m.quantity),
      unitCost: n(m.unitCost),
      wastePct: n(m.wastePct),
    })),
    labor: s.labor.map((l) => ({ role: l.role, workers: Math.max(1, Math.round(n(l.workers))), hours: n(l.hours), hourlyCost: n(l.hourlyCost) })),
    machines: s.machines.map((m) => ({ name: m.name, hours: n(m.hours), hourlyCost: n(m.hourlyCost) })),
    direct: { ...EMPTY_DIRECT, outsourcing: n(s.outsourcing), finishing: n(s.finishing), logistics: n(s.logistics), installation: n(s.installation) },
    contingencyPct: n(s.contingencyPct),
    hoursPerDay: n(s.hoursPerDay),
    installationDays: n(s.installationDays),
    targetMarginPct: n(s.targetMarginPct),
    startDate,
  };
}

export function toAdjustments(
  applied: BudgetCategory[],
  suggestions: { category: BudgetCategory; avgOverrunPct: number; sampleSize: number }[],
  projectType: string,
): CalcAdjustment[] {
  return suggestions
    .filter((s) => applied.includes(s.category))
    .map((s) => ({ category: s.category, pct: Math.round(s.avgOverrunPct * 10) / 10, sampleSize: s.sampleSize, projectType }));
}

export interface CalculatorResult {
  input: CalculatorInput;
  lines: BudgetLineInput[];
  total: number;
  benchmarks: TypeBenchmarks;
  suggestions: CategoryBenchmark[];
  hasContent: boolean;
}

/** Todo lo derivado de la calculadora en un solo lugar (el wizard y el panel usan el mismo resultado). */
export function computeCalculator(state: CalcState, startDate: string, projectType: string, projects: Project[]): CalculatorResult {
  const input = calcStateToInput(state, startDate);
  const benchmarks = benchmarksForType(projects, projectType);
  const suggestions = suggestedAdjustments(benchmarks);
  const lines = buildBudgetLines(input, toAdjustments(state.appliedAdjustments, suggestions, projectType));
  return { input, lines, total: totalOfLines(lines), benchmarks, suggestions, hasContent: lines.length > 0 };
}
