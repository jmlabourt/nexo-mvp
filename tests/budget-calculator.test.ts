import { describe, expect, it } from "vitest";
import {
  addWorkingDays,
  buildBudgetLines,
  dailyCrewCost,
  delayAnalysis,
  EMPTY_DIRECT,
  materialBudgetQuantity,
  productionDays,
  suggestedSalesPrice,
  totalOfLines,
  type CalculatorInput,
} from "@/lib/budget-calculator";
import { benchmarksForType, suggestedAdjustments } from "@/lib/historical-benchmarks";
import { line, project, usage } from "./helpers";

const base: CalculatorInput = {
  materials: [{ materialId: "mel-blanca-18", name: "Melamina blanca 18 mm", unit: "placa", quantity: 10, unitCost: 50_000, wastePct: 10 }],
  labor: [
    {
      role: "Carpintero",
      hours: 80,
      assignments: [
        { operatorId: "op-a", operatorName: "Ana", hourlyCost: 10_000, normalHours: 40, overtimeHours: 0 },
        { operatorId: "op-b", operatorName: "Beto", hourlyCost: 10_000, normalHours: 40, overtimeHours: 0 },
      ],
    },
  ],
  machines: [{ name: "Seccionadora", hours: 5, hourlyCost: 20_000 }],
  direct: { ...EMPTY_DIRECT, logistics: 100_000 },
  contingencyPct: 5,
  hoursPerDay: 8,
  installationDays: 2,
  targetMarginPct: 30,
  startDate: "2026-10-05", // lunes
  overtimeMultiplier: 2,
};

describe("calculadora de presupuesto", () => {
  it("suma el desperdicio esperado a la cantidad de materiales", () => {
    expect(materialBudgetQuantity(base.materials[0])).toBe(11);
  });

  it("arma líneas trazables y el total cambia cuando cambian los supuestos", () => {
    const lines = buildBudgetLines(base);
    // 11×50.000 + 80×10.000 + 5×20.000 + 100.000 = 1.550.000 · +5% imprevistos
    expect(totalOfLines(lines)).toBeCloseTo(1_627_500, 2);
    expect(lines.find((l) => l.category === "contingency")?.unitCost).toBeCloseTo(77_500, 2);
    const more = buildBudgetLines({ ...base, materials: [{ ...base.materials[0], quantity: 20 }] });
    expect(totalOfLines(more)).toBeGreaterThan(totalOfLines(lines));
  });

  it("mano de obra: una línea por operario, con su id, rol y horas normales; las extra van aparte con el costo recargado", () => {
    const lines = buildBudgetLines({
      ...base,
      labor: [
        {
          role: "Carpintero",
          hours: 50,
          assignments: [{ operatorId: "op-a", operatorName: "Ana", hourlyCost: 10_000, normalHours: 40, overtimeHours: 10 }],
        },
      ],
      overtimeMultiplier: 1.5,
    }).filter((l) => l.category === "labor");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ operatorId: "op-a", laborRole: "Carpintero", hourType: "normal", quantity: 40, unitCost: 10_000 });
    expect(lines[1]).toMatchObject({ operatorId: "op-a", hourType: "overtime", quantity: 10, unitCost: 15_000, overtimeMultiplier: 1.5 });
    expect(lines[1].description).toBe("Carpintero: Ana · horas extra (×1,5)");
    expect(totalOfLines(lines)).toBe(550_000);
  });

  it("conserva materialId para poder reconciliar compras y consumos", () => {
    expect(buildBudgetLines(base)[0].materialId).toBe("mel-blanca-18");
  });

  it("ignora filas vacías o con cantidad 0", () => {
    const lines = buildBudgetLines({ ...base, materials: [{ name: "", unit: "u", quantity: 0, unitCost: 0, wastePct: 0 }], machines: [] });
    expect(lines.some((l) => l.category === "materials")).toBe(false);
  });

  it("agrega el ajuste por historial como línea explícita en su categoría", () => {
    const lines = buildBudgetLines({ ...base, contingencyPct: 0 }, [{ category: "materials", pct: 8, sampleSize: 3, projectType: "Local comercial" }]);
    const adj = lines.find((l) => l.description.startsWith("Ajuste por historial"));
    expect(adj?.category).toBe("materials");
    expect(adj?.unitCost).toBeCloseTo(44_000, 2); // 8% de 550.000
    expect(adj?.notes).toContain("3");
  });

  it("precio sugerido para un margen objetivo", () => {
    expect(suggestedSalesPrice(700, 30)).toBe(1000);
    expect(suggestedSalesPrice(0, 30)).toBeNull();
    expect(suggestedSalesPrice(700, 100)).toBeNull();
  });

  it("duración: el rol más largo marca el plazo y se suman los días de instalación", () => {
    expect(productionDays(base.labor, 8)).toBe(5); // 80 h / (2×8)
    expect(productionDays([...base.labor, { role: "Pintor", hours: 80, assignments: [{ operatorId: "op-c", operatorName: "Ceci", hourlyCost: 1, normalHours: 80, overtimeHours: 0 }] }], 8)).toBe(10);
    expect(productionDays([], 8)).toBe(0);
  });

  it("fecha de entrega salta fines de semana", () => {
    expect(addWorkingDays("2026-10-05", 5)).toBe("2026-10-12"); // lun + 5 laborales = lun
    expect(addWorkingDays("2026-10-09", 1)).toBe("2026-10-12"); // viernes → lunes
    expect(addWorkingDays("2026-10-05", 0)).toBe("2026-10-05");
  });

  it("sensibilidad al atraso: el margen baja con cada día extra", () => {
    const daily = dailyCrewCost(base.labor, 8);
    expect(daily).toBe(160_000);
    const a = delayAnalysis({ baseCost: 700_000, salesPrice: 1_000_000, dailyCost: daily, targetMarginPct: 30 });
    expect(a.points[0].margin).toBeCloseTo(30);
    expect(a.points[1].margin).toBeCloseTo(14);
    expect(a.extraDaysBeforeTarget).toBe(0);
    expect(a.extraDaysToBreakEven).toBe(1);
  });

  it("si el precio deja colchón sobre el objetivo, informa cuántos días se pueden absorber", () => {
    const a = delayAnalysis({ baseCost: 500_000, salesPrice: 1_000_000, dailyCost: 50_000, targetMarginPct: 30 });
    expect(a.extraDaysBeforeTarget).toBe(4); // costo admitido 700.000 → 200.000 / 50.000
    expect(a.belowTargetAtBase).toBe(false);
  });

  it("si ya con el plazo base no llega al objetivo, lo marca", () => {
    const a = delayAnalysis({ baseCost: 800_000, salesPrice: 1_000_000, dailyCost: 50_000, targetMarginPct: 30 });
    expect(a.belowTargetAtBase).toBe(true);
    expect(a.extraDaysBeforeTarget).toBe(0);
  });

  it("sin precio o sin costo diario no inventa resultados", () => {
    const a = delayAnalysis({ baseCost: 500_000, salesPrice: 0, dailyCost: 50_000, targetMarginPct: 30 });
    expect(a.extraDaysBeforeTarget).toBeNull();
  });
});

describe("benchmarks de proyectos anteriores", () => {
  const done = (type: string, budget: number, actual: number) =>
    project({
      status: "completed",
      projectType: type,
      budgetLines: [line("materials", null, budget)],
      materialUsages: [usage({ quantityConsumed: actual / 50_000, unitCost: 50_000 })],
    });

  it("promedia el desvío por categoría solo de proyectos finalizados del mismo tipo", () => {
    const b = benchmarksForType(
      [done("Local comercial", 100_000, 110_000), done("Local comercial", 100_000, 106_000), done("Stand", 100_000, 200_000), project({ projectType: "Local comercial" })],
      "Local comercial",
    );
    expect(b.sampleSize).toBe(2);
    const mat = b.byCategory.find((c) => c.category === "materials");
    expect(mat?.sampleSize).toBe(2);
    expect(mat?.avgOverrunPct).toBeCloseTo(8);
    expect(suggestedAdjustments(b)).toHaveLength(1);
  });

  it("sin historial no sugiere nada", () => {
    const b = benchmarksForType([], "Stand");
    expect(b.sampleSize).toBe(0);
    expect(suggestedAdjustments(b)).toEqual([]);
  });
});
