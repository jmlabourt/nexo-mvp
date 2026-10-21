// Circuito entre sesiones (lib/circuit.ts): subestados comerciales, etapa del circuito, cambios de materiales de
// Diseño (cotizado → real), desvío de materiales por cantidad y por precio, alerta única y pendientes por sesión.
import { describe, expect, it } from "vitest";
import type { ProjectItem, PurchaseEntry, ValueCorrection } from "@/types";
import { DEFAULT_HOUR_RATES } from "@/lib/constants";
import {
  allUnitsDone,
  changeText,
  circuitPending,
  circuitStage,
  commercialState,
  deliveryDecision,
  designChangeAlerts,
  lineFurniture,
  materialChanges,
  materialDeviationSplit,
  portfolioMaterialSplit,
  recordDeliveryDecision,
  recordRejection,
  recordRenegotiation,
} from "@/lib/circuit";
import { computeCalculator, initialCalcState, newMaterialRow, newProductRow } from "@/components/budget/calculator-state";
import { line, project } from "./helpers";

const ctx = { actor: "Admin", now: "2026-10-20T12:00:00Z" };
const later = { actor: "Admin", now: "2026-10-21T12:00:00Z" };
const item = (extra: Partial<ProjectItem> = {}): ProjectItem => ({ id: "it1", name: "Mesa", quantity: 10, completedUnits: 0, rubros: [], ...extra }) as ProjectItem;

describe("subestados comerciales (dentro de En cotización)", () => {
  it("renegociación: cambia el precio, queda en cotización y el anterior queda en el historial", () => {
    const p = project({ status: "quotation", salesPrice: 1_000_000 });
    const r = recordRenegotiation(p, 900_000, "El cliente pidió un descuento", ctx);
    expect(r.salesPrice).toBe(900_000);
    expect(r.status).toBe("quotation");
    expect(r.activity[0].kind).toBe("negotiation");
    expect(r.activity[0].message).toBe("Renegociación de precio: $ 1.000.000 → $ 900.000. Motivo: El cliente pidió un descuento");
    expect(commercialState(r)).toBe("negotiation");
    expect(circuitStage(r)).toBe("negotiation");
  });

  it("no aprobado: termina ahí con el motivo; pide motivo y solo vale en cotización", () => {
    const p = project({ status: "quotation" });
    const r = recordRejection(p, "Eligió otro proveedor", ctx);
    expect(commercialState(r)).toBe("rejected");
    expect(circuitStage(r)).toBe("rejected");
    expect(r.activity[0].message).toMatch(/Motivo: Eligió otro proveedor/);
    expect(() => recordRejection(p, "", ctx)).toThrow(/motivo/);
    expect(() => recordRejection(project({ status: "approved" }), "x motivo", ctx)).toThrow();
    expect(() => recordRenegotiation(p, p.salesPrice, "mismo", ctx)).toThrow(/igual/);
  });

  it("un cambio de etapa posterior deja atrás la negociación", () => {
    const neg = recordRenegotiation(project({ status: "quotation", salesPrice: 100 }), 90, "descuento", ctx);
    const back = { ...neg, activity: [{ id: "s", at: later.now, actor: "A", kind: "status" as const, message: "Corrección" }, ...neg.activity] };
    expect(commercialState(back)).toBe("quoted");
  });
});

describe("etapa del circuito", () => {
  it("sigue el camino por defecto con las etapas que ya existen", () => {
    expect(circuitStage(project({ status: "quotation" }))).toBe("quotation");
    expect(circuitStage(project({ status: "approved" }))).toBe("design");
    expect(circuitStage(project({ status: "purchasing" }))).toBe("purchasing");
    expect(circuitStage(project({ status: "production", items: [item({ completedUnits: 3 })] }))).toBe("production");
    const done = project({ status: "production", items: [item({ completedUnits: 10 })] });
    expect(allUnitsDone(done)).toBe(true);
    expect(circuitStage(done)).toBe("ready");
    const decided = recordDeliveryDecision(done, "finish", ctx);
    expect(deliveryDecision(decided)).toBe("finish");
    expect(circuitStage(decided)).toBe("delivery");
    expect(circuitStage({ ...decided, isClosed: true, status: "completed" })).toBe("closed");
    expect(circuitStage(project({ status: "installation" }))).toBe("ready");
  });
});

// Cotización: 4 placas × $25.000 en Mesa. Diseño: se necesitan 6. Compras: se compraron 6 a $27.000.
const placas = line("materials", 6, 25_000, { id: "pl", description: "Placa MDF 18 mm", unit: "placa", rubro: "carpinteria_madera", notes: "Mueble: Mesa × 10" });
const baseline = { capturedAt: "2026-10-01", capturedBy: "A", salesPrice: 1_000_000, dueDate: "2026-12-01", budgetTotal: 100_000, lines: [{ ...placas, quantity: 4, total: 100_000 }] };
const correction: ValueCorrection = {
  id: "c1", projectId: "p", target: "budget_line", lineId: "pl", field: "quantity", description: "Placa MDF 18 mm", oldValue: 4, newValue: 6,
  reason: "Diseño: con los planos finales se necesitan 6", correctedBy: "Diseño", correctedAt: "2026-10-10T10:00:00Z",
};
const purchase = (quantity: number, unitCost: number): PurchaseEntry => ({
  id: `pe${quantity}${unitCost}`, projectId: "p", materialName: "Placa MDF 18 mm", quantity, unit: "placa", unitCost, total: quantity * unitCost, date: "2026-10-12", createdBy: "C", createdAt: "2026-10-12T10:00:00Z",
});
const designed = project({ status: "purchasing", budgetLines: [placas], baseline });

describe("Diseño aumenta materiales: cotizado → real", () => {
  it("muestra cotizado, real, diferencia, motivo, quién y el mueble", () => {
    const [c] = materialChanges(designed, [correction]);
    expect(c).toMatchObject({ quotedQty: 4, realQty: 6, diff: 2, furniture: "Mesa", reason: correction.reason, changedBy: "Diseño", amount: 50_000 });
    expect(changeText(c)).toBe("cotizado 4 → real 6 (+2)");
  });

  it("sin presupuesto base, lo cotizado sale de la primera corrección; sin cambios no hay nada", () => {
    expect(materialChanges({ ...designed, baseline: undefined }, [correction])[0].quotedQty).toBe(4);
    expect(materialChanges({ ...designed, budgetLines: [{ ...placas, quantity: 4 }] }, [])).toEqual([]);
  });

  it("la cotización por mueble deja el mueble en las notas de la línea de materiales", () => {
    const mesa = { ...newProductRow("Mesa"), quantity: "10" };
    mesa.rubros = [{ ...mesa.rubros[0], hours: "60", materials: [{ ...newMaterialRow(), name: "Placa MDF 18 mm", unit: "placa", quantity: "4", unitCost: "25000" }] }];
    const calc = computeCalculator({ ...initialCalcState(5), products: [mesa] }, "", { projects: [], rates: DEFAULT_HOUR_RATES, overtimeMultiplier: 2, hoursPerDay: 9, salesPrice: 0, isDemo: false });
    const mat = calc.lines.find((l) => l.category === "materials")!;
    expect(lineFurniture(mat)).toBe("Mesa");
    expect(lineFurniture({ notes: "Incluye 10% de desperdicio" })).toBeNull();
  });
});

describe("desvío de materiales: por cantidad y por precio", () => {
  it("las dos partes suman el desvío total", () => {
    const s = materialDeviationSplit({ ...designed, purchaseEntries: [purchase(6, 27_000)] }, [correction]);
    expect(s.quantityDeviation).toBe(50_000); // (6 − 4) × 25.000
    expect(s.priceDeviation).toBe(12_000); // (27.000 − 25.000) × 6
    expect(s.total).toBe(62_000); // 6 × 27.000 − 4 × 25.000
    expect(s.quantityDeviation + s.priceDeviation).toBe(s.total);
    expect(s.rows[0].reason).toBe(correction.reason);
  });

  it("si todavía no se compró, no hay desvío por precio; si se compró más barato, el precio resta", () => {
    expect(materialDeviationSplit(designed, [correction])).toMatchObject({ quantityDeviation: 50_000, priceDeviation: 0, total: 50_000 });
    const cheap = materialDeviationSplit({ ...designed, purchaseEntries: [purchase(2, 20_000), purchase(4, 23_000)] }, [correction]);
    expect(cheap.priceDeviation).toBe(-18_000); // promedio 22.000 → (22.000 − 25.000) × 6
    expect(cheap.total).toBe(32_000);
  });

  it("propiedad: en cualquier combinación, cantidad + precio = real − cotizado", () => {
    for (const [q0, q1, c0, c1] of [[4, 6, 25_000, 27_000], [10, 7, 1_000, 1_500], [3, 3, 800, 650], [5, 9, 1234.5, 999.9]]) {
      const l = { ...placas, quantity: q1, unitCost: c0 };
      const s = materialDeviationSplit(
        project({ status: "production", budgetLines: [l], baseline: { ...baseline, lines: [{ ...l, quantity: q0 }] }, purchaseEntries: [purchase(q1, c1)] }),
        [],
      );
      expect(s.total).toBeCloseTo(q1 * c1 - q0 * c0, 1);
      expect(s.quantityDeviation + s.priceDeviation).toBeCloseTo(s.total, 2);
    }
  });

  it("el Dashboard de Gerencia suma los proyectos (sin cotizaciones)", () => {
    const s = portfolioMaterialSplit([designed, project({ id: "q", status: "quotation", budgetLines: [placas] })], [correction]);
    expect(s.rows.map((r) => r.project.id)).toEqual(["p"]);
    expect(s.total).toBe(50_000);
  });
});

describe("alerta única y pendientes por sesión", () => {
  it("una sola alerta por proyecto, con el impacto en pesos y qué hacer", () => {
    const alerts = designChangeAlerts([designed], [correction]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].title).toBe("Diseño aumentó materiales: +2 placa de Placa MDF 18 mm en Mesa");
    expect(alerts[0].impactAmount).toBe(50_000);
    expect(alerts[0].action).toMatch(/Compras → Necesidades/);
    // Aunque los costos reales todavía no cambiaron, el aumento no queda oculto.
    expect(designed.purchaseEntries).toHaveLength(0);
  });

  it("cada sesión ve lo que le llega del circuito", () => {
    const projects = [
      recordRenegotiation(project({ id: "n", status: "quotation", salesPrice: 100 }), 90, "descuento", ctx),
      project({ id: "d", status: "approved" }),
      designed,
      project({ id: "new", status: "production", items: [item()] }),
      project({ id: "done", status: "production", items: [item({ completedUnits: 10 })] }),
      recordDeliveryDecision(project({ id: "fin", status: "production", items: [item({ completedUnits: 10 })] }), "finish", ctx),
    ];
    const titles = (s: Parameters<typeof circuitPending>[0]) =>
      Object.fromEntries(circuitPending(s, projects, { assignments: [{ projectId: "done" }], corrections: [correction] }).map((g) => [g.title, g.items.map((i) => i.project.id)]));
    expect(titles("administracion")).toEqual({ "En negociación": ["n"], "En Diseño": ["d"], "Proyectos listos: ¿qué se hace?": ["done"] });
    expect(titles("gerencia")).toEqual({ "Listos para cerrar": ["fin"], "Diseño cambió materiales": ["p"] });
    expect(titles("compras")).toEqual({ "Proyectos nuevos para comprar": ["p"], "Diseño cambió materiales": ["p"] });
    expect(titles("jefe_planta")).toEqual({ "Proyectos nuevos para recibir": ["new"], "¿Se terminó este proyecto?": ["done"] });
  });
});
