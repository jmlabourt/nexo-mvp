// Presupuesto por producto (Auditoría UX · P0-7): la mano de obra presupuestada es la suma de los productos y las
// horas se cargan una sola vez. Los totales de los proyectos existentes (demo y guardados) no cambian.
import { describe, expect, it } from "vitest";
import { buildSeed } from "@/lib/seed-data";
import { DEFAULT_HOUR_RATES } from "@/lib/constants";
import { budgetTotal, projectEconomics } from "@/lib/calculations";
import { productLaborRubros, rubroLabor, rubroLines, rubroTable, ratesByCategory, workSchedule } from "@/lib/budget-calculator";
import { budgetLaborHours, laborHoursGaps, legacyProductProposal, productHoursByRubro } from "@/lib/production";
import { createProject } from "@/lib/project-operations";
import {
  computeCalculator,
  initialCalcState,
  newProductRow,
  productInputs,
  quoteActionBlocker,
  type CalcState,
  type ProductRow,
} from "@/components/budget/calculator-state";
import { line, project } from "./helpers";

const ctx = { projects: [], rates: DEFAULT_HOUR_RATES, overtimeMultiplier: 2, hoursPerDay: 9.5, salesPrice: 10_000_000, isDemo: false };
const RATE = DEFAULT_HOUR_RATES.find((r) => r.category === "labor")!.hourlyRate;
const prod = (name: string, qty: string, rubros: Array<[ProductRow["rubros"][number]["rubro"], string, string]>): ProductRow => ({
  ...newProductRow(name),
  quantity: qty,
  rubros: rubros.map(([rubro, hours, workers], i) => ({ key: `${name}-${i}`, rubro, hours, workers })),
});
const state = (products: ProductRow[]): CalcState => ({ ...initialCalcState(5), rubros: [], products });
const calc = (s: CalcState) => computeCalculator(s, "", ctx);

describe("mano de obra presupuestada = suma de los productos", () => {
  const s = state([
    prod("Mesa de comedor", "10", [["carpinteria_madera", "60", "1"], ["carpinteria_metalica", "40", "1"]]),
    prod("Silla", "100", [["carpinteria_madera", "220", "2"], ["embalaje", "26", "1"]]),
  ]);
  it("una línea por producto + rubro, con el producto en la descripción, y el total es la suma", () => {
    const c = calc(s);
    const labor = c.lines.filter((l) => l.category === "labor");
    expect(labor).toHaveLength(4);
    expect(labor[0].description).toBe("Mesa de comedor × 10 · Carpintería madera: mano de obra (1 operario × 60 h)");
    expect(labor.reduce((x, l) => x + (l.quantity ?? 0), 0)).toBe(346);
    expect(c.breakdown.labor.operators).toBe(346 * RATE);
    expect(c.products.map((p) => p.total)).toEqual([100 * RATE, 246 * RATE]);
    // La tabla por rubro suma los productos dentro de cada rubro.
    expect(rubroTable(c.lines).rows.find((r) => r.rubro === "carpinteria_madera")?.labor).toBe(280 * RATE);
  });
  it("las horas son exactas aunque no se dividan justo entre los operarios (100 h con 3 operarios)", () => {
    const c = calc(state([prod("Estantería", "3", [["carpinteria_madera", "100", "3"]])]));
    expect(c.lines.find((l) => l.category === "labor")?.quantity).toBe(100);
  });
  it("los valores derivados cambian cuando cambian los datos (horas, operarios, plazo)", () => {
    const base = calc(s).total;
    expect(calc(state([prod("Mesa de comedor", "10", [["carpinteria_madera", "70", "1"]])])).total).toBeGreaterThan(
      calc(state([prod("Mesa de comedor", "10", [["carpinteria_madera", "60", "1"]])])).total,
    );
    expect(calc(state([...s.products, prod("Banco", "4", [["carpinteria_madera", "10", "1"]])])).total).toBe(base + 10 * RATE);
    // Días: producto detrás de producto (mismo supuesto conservador que los rubros); con plazo corto hay horas extra.
    const short = computeCalculator({ ...s, deadlineDays: "10" }, "", ctx);
    expect(short.schedule.fits).toBe(false);
    expect(short.overtimeHours).toBeGreaterThan(0);
    expect(short.total).toBeGreaterThan(base);
  });
  it("es lo mismo que la cotización anterior por rubro: 2 operarios × 40 h = producto de 80 h con 2 operarios", () => {
    const legacy = { rubro: "carpinteria_madera" as const, materials: [], workers: 2, hoursPerWorker: 40, designHours: 0, adminHours: 0, amount: 0 };
    const [byProduct] = productLaborRubros([{ name: "Mueble", quantity: 1, rubros: [{ rubro: "carpinteria_madera", hours: 80, workers: 2 }] }]);
    for (const deadline of [null, 3]) {
      const a = workSchedule([legacy], 8, deadline);
      const b = workSchedule([byProduct], 8, deadline);
      expect(b).toEqual(a);
      const p = { normalShare: a.normalShare, laborRate: RATE, designRate: 0, adminRate: 0, overtimeMultiplier: 2 };
      const la = rubroLabor(legacy, p);
      const lb = rubroLabor(byProduct, p);
      expect(lb.total).toBe(la.total);
      const assumptions = { rates: ratesByCategory(DEFAULT_HOUR_RATES), overtimeMultiplier: 2, hoursPerDay: 8 };
      const sum = (ls: ReturnType<typeof rubroLines>) => ls.map((l) => [l.quantity, l.unitCost, l.hourType]);
      expect(sum(rubroLines(byProduct, lb, assumptions))).toEqual(sum(rubroLines(legacy, la, assumptions)));
    }
  });
});

describe("validación del formulario de productos", () => {
  it("un producto vacío no cuenta; uno a medio cargar bloquea con un mensaje claro y no se valoriza", () => {
    expect(calc(state([newProductRow()])).productsError).toBeNull();
    const half = calc(state([prod("Mesa", "10", [["carpinteria_madera", "", "1"]])]));
    expect(half.productsError).toBe("Mueble 1 (Mesa): Indicá las horas estimadas de Carpintería madera.");
    expect(half.products).toHaveLength(0);
    expect(quoteActionBlocker(half, 1)).toBe(half.productsError);
    expect(calc(state([prod("Mesa", "0", [["carpinteria_madera", "5", "1"]])])).productsError).toMatch(/cantidad/);
    expect(calc(state([prod("Mesa", "2", [["carpinteria_madera", "5", ""]])])).productsError).toMatch(/operarios/);
    expect(calc(state([prod("Mesa", "2", [["carpinteria_madera", "5", "1"], ["carpinteria_madera", "3", "1"]])])).productsError).toMatch(/repetido/);
  });
  it("Nuevo proyecto pide al menos un producto", () => {
    const onlyMaterials = computeCalculator(
      { ...initialCalcState(5), products: [newProductRow()] },
      "",
      ctx,
    );
    const withProduct = calc(state([prod("Mesa", "1", [["carpinteria_madera", "5", "1"]])]));
    expect(quoteActionBlocker(withProduct, 1, { requireProducts: true })).toBeNull();
    expect(quoteActionBlocker({ ...onlyMaterials, hasContent: true }, 1, { requireProducts: true })).toBe("Cargá al menos un mueble con sus horas por rubro.");
  });
});

describe("al crear el proyecto, los productos se guardan con sus horas (las usa la planta)", () => {
  const s = state([prod("Mesa de comedor", "10", [["carpinteria_madera", "60", "1"]]), prod("Silla", "100", [["carpinteria_madera", "220", "2"]])]);
  const c = calc(s);
  const p = createProject(
    { code: "P-2000", name: "Test", client: "C", projectType: "", description: "", startDate: "2026-10-20", dueDate: "2026-11-20", owner: "x", salesPrice: 10_000_000, budgetLines: c.lines, items: productInputs(s) },
    { actor: "Admin", now: "2026-10-19T12:00:00Z", role: "owner" },
  );
  it("los productos quedan como project_items y sus horas coinciden con la mano de obra presupuestada", () => {
    expect(p.items.map((i) => [i.name, i.quantity, i.completedUnits])).toEqual([["Mesa de comedor", 10, 0], ["Silla", 100, 0]]);
    expect(productHoursByRubro(p)).toEqual(budgetLaborHours(p));
    expect(laborHoursGaps(p)).toEqual([]);
  });
  it("un producto inválido no se crea", () => {
    expect(() =>
      createProject(
        { code: "P-2001", name: "T", client: "C", projectType: "", description: "", startDate: "2026-10-20", dueDate: "2026-11-20", owner: "x", salesPrice: 1, budgetLines: [], items: [{ name: "M", quantity: 1, rubros: [] }] },
        { actor: "Admin", now: "2026-10-19T12:00:00Z", role: "owner" },
      ),
    ).toThrow(/nombre/);
  });
  it("si después se editan las horas de un producto, se avisa la diferencia (el presupuesto no cambia solo)", () => {
    const edited = { ...p, items: p.items.map((i, k) => (k === 0 ? { ...i, rubros: [{ ...i.rubros[0], hours: 70 }] } : i)) };
    expect(laborHoursGaps(edited)).toEqual([{ rubro: "carpinteria_madera", budget: 280, products: 290 }]);
    expect(budgetTotal(edited.budgetLines)).toBe(budgetTotal(p.budgetLines));
  });
});

describe("proyectos existentes: los totales no cambian", () => {
  const seed = buildSeed(new Date("2026-10-19T12:00:00"));
  it("demo: en todos los proyectos, las horas de los productos son las de la mano de obra presupuestada", () => {
    for (const p of seed.projects) expect(laborHoursGaps(p), p.code).toEqual([]);
  });
  it("demo: rearmar la mano de obra desde los productos, con la tarifa guardada en cada proyecto, da el mismo importe", () => {
    for (const p of seed.projects) {
      const hourLines = p.budgetLines.filter((l) => l.category === "labor" && l.unit === "h" && l.quantity !== null);
      if (hourLines.length === 0) continue;
      const rate = hourLines[0].unitCost;
      if (!hourLines.every((l) => l.unitCost === rate)) continue; // horas extra: otra tarifa (no hay en la demo)
      const stored = hourLines.reduce((s, l) => s + l.total, 0);
      const rebuilt = productLaborRubros(p.items.map((i) => ({ name: i.name, quantity: i.quantity, rubros: i.rubros }))).reduce(
        (s, r) => s + (r.totalHours ?? 0) * rate,
        0,
      );
      expect(rebuilt, p.code).toBeCloseTo(stored, 2);
    }
  });
  it("los proyectos guardados no se recalculan: su costo presupuestado y su margen quedan iguales", () => {
    const before = seed.projects.map((p) => [p.code, budgetTotal(p.budgetLines), projectEconomics(p).projectedMargin]);
    const again = buildSeed(new Date("2026-10-19T12:00:00")).projects.map((p) => [p.code, budgetTotal(p.budgetLines), projectEconomics(p).projectedMargin]);
    expect(again).toEqual(before);
    // Ni el alta por producto ni el aviso tocan líneas existentes.
    for (const p of seed.projects) expect(laborHoursGaps(p)).toEqual([]);
  });
});

describe("proyectos anteriores sin productos: propuesta de migración (no se aplica sola)", () => {
  it("propone un producto 'Trabajo general × 1' con las horas y operarios de sus líneas de mano de obra", () => {
    const legacy = project({
      items: [],
      budgetLines: [
        line("labor", 80, 19_000, { rubro: "carpinteria_madera", unit: "h", workers: 2 }),
        line("labor", 10, 38_000, { rubro: "carpinteria_madera", unit: "h", workers: 2, hourType: "overtime" }),
        line("labor", 12, 19_000, { rubro: "pintura", unit: "h", workers: 1 }),
        line("labor", null, 50_000, { rubro: "montaje", unit: "global" }),
      ],
    });
    expect(legacyProductProposal(legacy)).toEqual({
      name: "Trabajo general",
      quantity: 1,
      rubros: [
        { rubro: "carpinteria_madera", hours: 90, workers: 2 },
        { rubro: "pintura", hours: 12, workers: 1 },
      ],
    });
    const migrated = { ...legacy, items: [{ id: "i", name: "Trabajo general", quantity: 1, completedUnits: 0, rubros: legacyProductProposal(legacy)!.rubros }] };
    expect(laborHoursGaps(migrated)).toEqual([]);
    expect(budgetTotal(migrated.budgetLines)).toBe(budgetTotal(legacy.budgetLines));
  });
  it("un proyecto con productos o sin horas no necesita migración", () => {
    const seed = buildSeed(new Date("2026-10-19T12:00:00"));
    expect(seed.projects.every((p) => legacyProductProposal(p) === null)).toBe(true);
    expect(legacyProductProposal(project({ items: [], budgetLines: [line("materials", 1, 10)] }))).toBeNull();
  });
});
