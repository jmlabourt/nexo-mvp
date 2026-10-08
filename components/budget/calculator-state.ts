// Estado de la calculadora de presupuesto (campos como texto para permitir vacíos) y su conversión a números.
import type { BudgetCategory, Operator, Project } from "@/types";
import { buildBudgetLines, EMPTY_DIRECT, totalOfLines, type CalcAdjustment, type CalculatorInput } from "@/lib/budget-calculator";
import { planLabor, type LaborPlan } from "@/lib/capacity";
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
  hours: string;
  /** Operarios activos de ese rol elegidos para hacer las horas (el costo por hora sale de cada uno). */
  operatorIds: string[];
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
export const newLaborRow = (): LaborRow => ({ key: rowKey(), role: "", hours: "", operatorIds: [] });
export const newMachineRow = (): MachineRow => ({ key: rowKey(), name: "", hours: "", hourlyCost: "" });

export function initialCalcState(): CalcState {
  return {
    materials: [newMaterialRow()],
    labor: [newLaborRow()],
    machines: [],
    outsourcing: "",
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

/** Lo que la calculadora necesita además de lo que se tipea: operarios, otros proyectos, plazo y multiplicador. */
export interface CalculatorContext {
  operators: Operator[];
  projects: Project[];
  /** Plazo de entrega (opcional). Sin plazo no se calculan horas extra. */
  deadline: string;
  overtimeMultiplier: number;
  today: string;
  excludeProjectId?: string;
}

export function laborPlanFor(s: CalcState, startDate: string, ctx: CalculatorContext): LaborPlan {
  return planLabor(
    s.labor.map((l) => ({ role: l.role.trim(), hours: n(l.hours), operatorIds: l.operatorIds })),
    {
      operators: ctx.operators,
      projects: ctx.projects,
      startDate,
      deadline: ctx.deadline || null,
      installationDays: n(s.installationDays),
      hoursPerDay: n(s.hoursPerDay),
      overtimeMultiplier: ctx.overtimeMultiplier,
      today: ctx.today,
      excludeProjectId: ctx.excludeProjectId,
    },
  );
}

export function calcStateToInput(s: CalcState, startDate: string, plan: LaborPlan, overtimeMultiplier: number): CalculatorInput {
  return {
    materials: s.materials.map((m) => ({
      materialId: MATERIAL_CATALOG.find((c) => c.name.toLowerCase() === m.name.trim().toLowerCase())?.id,
      name: m.name,
      unit: m.unit,
      quantity: n(m.quantity),
      unitCost: n(m.unitCost),
      wastePct: n(m.wastePct),
    })),
    labor: plan.roles.map((r) => ({
      role: r.role,
      hours: r.hours,
      assignments: r.operators.map((o) => ({
        operatorId: o.operatorId,
        operatorName: o.name,
        hourlyCost: o.hourlyCost,
        normalHours: o.normalHours,
        overtimeHours: o.overtimeHours,
      })),
    })),
    machines: s.machines.map((m) => ({ name: m.name, hours: n(m.hours), hourlyCost: n(m.hourlyCost) })),
    direct: { ...EMPTY_DIRECT, outsourcing: n(s.outsourcing), logistics: n(s.logistics), installation: n(s.installation) },
    contingencyPct: n(s.contingencyPct),
    hoursPerDay: n(s.hoursPerDay),
    installationDays: n(s.installationDays),
    targetMarginPct: n(s.targetMarginPct),
    startDate,
    overtimeMultiplier,
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
  labor: LaborPlan;
  lines: BudgetLineInput[];
  total: number;
  benchmarks: TypeBenchmarks;
  suggestions: CategoryBenchmark[];
  hasContent: boolean;
}

/** Todo lo derivado de la calculadora en un solo lugar (el wizard y el panel usan el mismo resultado). */
export function computeCalculator(state: CalcState, startDate: string, projectType: string, ctx: CalculatorContext): CalculatorResult {
  const labor = laborPlanFor(state, startDate, ctx);
  const input = calcStateToInput(state, startDate, labor, ctx.overtimeMultiplier);
  const benchmarks = benchmarksForType(ctx.projects, projectType);
  const suggestions = suggestedAdjustments(benchmarks);
  const lines = buildBudgetLines(input, toAdjustments(state.appliedAdjustments, suggestions, projectType));
  return { input, labor, lines, total: totalOfLines(lines), benchmarks, suggestions, hasContent: lines.length > 0 };
}
