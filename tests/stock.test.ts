import { describe, expect, it } from "vitest";
import {
  EMPTY_STOCK,
  StockError,
  applyChange,
  assignToProject,
  availableToProject,
  leftoverRows,
  lotTrail,
  markLeftover,
  receiveStock,
  releaseToWarehouse,
  returnToSupplier,
  stockRows,
  transferBetweenProjects,
  consumeMaterial,
  type StockCtx,
  type StockState,
} from "@/lib/stock";
import { projectMaterialFlow, projectMaterialPosition, unresolvedMaterial } from "@/lib/material-flow";
import { line, project } from "./helpers";

const ctx: StockCtx = { actor: "Laura", now: "2026-10-01T10:00:00.000Z" };
const PLATE = { materialId: "mel-blanca-18", materialName: "Melamina blanca 18 mm", unit: "placa" };

function buy(state: StockState, projectId: string, quantity: number, unitCost: number): StockState {
  return applyChange(
    state,
    receiveStock({ ...PLATE, quantity, unitCost, date: "2026-10-01", destination: { projectId, projectName: projectId } }, ctx),
  );
}

describe("stock — ejemplo de las 20 placas", () => {
  // Compra 20 placas a $100.000 para A ($2.000.000): usa 12, desperdicia 1, vuelven 7 al stock.
  function scenario() {
    let s = buy(EMPTY_STOCK, "A", 20, 100_000);
    s = applyChange(s, consumeMaterial(s, { projectId: "A", materialId: PLATE.materialId, consumed: 12, waste: 1 }, ctx));
    s = applyChange(s, releaseToWarehouse(s, { projectId: "A", materialId: PLATE.materialId, quantity: 7 }, ctx));
    return s;
  }

  it("el costo imputable es consumido + desperdicio, no lo comprado", () => {
    const flow = projectMaterialFlow(scenario(), "A");
    expect(flow.totals.purchased).toBe(2_000_000);
    expect(flow.totals.consumed).toBe(1_200_000);
    expect(flow.totals.wasted).toBe(100_000);
    expect(flow.totals.recovered).toBe(700_000);
    expect(flow.attributableCost).toBe(1_300_000);
    expect(flow.totals.held).toBe(0);
  });

  it("lo recuperado queda en el stock con su costo", () => {
    const rows = stockRows(scenario());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ physical: 7, available: 7, assigned: 0, unitCost: 100_000, value: 700_000 });
  });

  it("la cuenta cierra: ingresó = salió + lo que sigue asignado", () => {
    const l = projectMaterialFlow(scenario(), "A").lines[0];
    const inQty = l.purchased.qty + l.fromStock.qty + l.transferredIn.qty;
    const outQty = l.consumed.qty + l.wasted.qty + l.recovered.qty + l.transferredOut.qty + l.returned.qty + l.adjusted.qty + l.held.qty;
    expect(inQty).toBe(outQty);
  });
});

describe("stock — requerido vs. disponible", () => {
  it("requiere 10, hay 3 en stock: asigna 3 y faltan 7", () => {
    let s = applyChange(
      EMPTY_STOCK,
      receiveStock({ ...PLATE, quantity: 3, unitCost: 90_000, date: "2026-09-01", destination: "warehouse", kind: "opening" }, ctx),
    );
    const p = project({ id: "A", budgetLines: [line("materials", 10, 100_000, { materialId: PLATE.materialId, description: PLATE.materialName, unit: "placa" })] });
    let row = projectMaterialPosition(p, s)[0];
    expect(row).toMatchObject({ required: 10, availableInStock: 3, assigned: 0, missing: 10 });

    s = applyChange(s, assignToProject(s, { projectId: "A", materialId: PLATE.materialId, quantity: 3 }, ctx));
    row = projectMaterialPosition(p, s)[0];
    expect(row).toMatchObject({ required: 10, availableInStock: 0, assigned: 3, missing: 7 });
  });

  it("no se puede consumir lo que el proyecto no tiene asignado", () => {
    const s = buy(EMPTY_STOCK, "A", 3, 100_000);
    expect(() => consumeMaterial(s, { projectId: "A", materialId: PLATE.materialId, consumed: 4, waste: 0 }, ctx)).toThrow(StockError);
    // Stock libre de otro lado tampoco cuenta: hay que asignarlo antes.
    const s2 = applyChange(s, receiveStock({ ...PLATE, quantity: 10, unitCost: 100_000, date: "2026-10-01", destination: "warehouse", kind: "opening" }, ctx));
    expect(() => consumeMaterial(s2, { projectId: "A", materialId: PLATE.materialId, consumed: 5, waste: 0 }, ctx)).toThrow(/Solo hay 3/);
  });

  it("no se puede asignar más de lo que hay libre", () => {
    const s = applyChange(EMPTY_STOCK, receiveStock({ ...PLATE, quantity: 3, unitCost: 1, date: "2026-10-01", destination: "warehouse", kind: "opening" }, ctx));
    expect(() => assignToProject(s, { projectId: "A", materialId: PLATE.materialId, quantity: 4 }, ctx)).toThrow(StockError);
  });
});

describe("stock — transferencias entre proyectos", () => {
  // 20 placas compradas para A, 8 consumidas, 12 sobran: 5 pasan a B y 7 quedan disponibles.
  function scenario() {
    let s = buy(EMPTY_STOCK, "A", 20, 100_000);
    s = applyChange(s, consumeMaterial(s, { projectId: "A", materialId: PLATE.materialId, consumed: 8, waste: 0 }, ctx));
    s = applyChange(s, transferBetweenProjects(s, { fromProjectId: "A", toProjectId: "B", materialId: PLATE.materialId, quantity: 5 }, ctx));
    s = applyChange(s, releaseToWarehouse(s, { projectId: "A", materialId: PLATE.materialId, quantity: 7 }, ctx));
    return s;
  }

  it("lo transferido no es costo de A", () => {
    const a = projectMaterialFlow(scenario(), "A");
    expect(a.attributableCost).toBe(800_000);
    expect(a.totals.transferredOut).toBe(500_000);
    expect(a.totals.recovered).toBe(700_000);
    expect(a.totals.held).toBe(0);
  });

  it("B lo recibe con el costo original y sólo lo que consuma es su costo", () => {
    let s = scenario();
    expect(projectMaterialFlow(s, "B").attributableCost).toBe(0);
    expect(availableToProject(s, "B", PLATE.materialId)).toBe(5);
    const used = consumeMaterial(s, { projectId: "B", materialId: PLATE.materialId, consumed: 5, waste: 0 }, ctx);
    expect(used.parts[0].lot.unitCost).toBe(100_000);
    s = applyChange(s, used);
    expect(projectMaterialFlow(s, "B").attributableCost).toBe(500_000);
    expect(projectMaterialFlow(s, "A").attributableCost).toBe(800_000);
  });

  it("deja la trazabilidad: comprado para A → transferido a B → consumido en B", () => {
    let s = scenario();
    s = applyChange(s, consumeMaterial(s, { projectId: "B", materialId: PLATE.materialId, consumed: 5, waste: 0 }, ctx));
    const kinds = lotTrail(s, s.lots[0].id).map((m) => `${m.kind}:${m.to.type}`);
    expect(kinds).toContain("purchase_in:project");
    expect(kinds).toContain("transfer:project");
    expect(kinds).toContain("consume:consumed");
    expect(s.lots[0].originProjectId).toBe("A");
  });

  it("no transfiere más de lo asignado ni a sí mismo", () => {
    const s = buy(EMPTY_STOCK, "A", 3, 100_000);
    expect(() => transferBetweenProjects(s, { fromProjectId: "A", toProjectId: "B", materialId: PLATE.materialId, quantity: 4 }, ctx)).toThrow(StockError);
    expect(() => transferBetweenProjects(s, { fromProjectId: "A", toProjectId: "A", materialId: PLATE.materialId, quantity: 1 }, ctx)).toThrow(/distinto/);
  });
});

describe("stock — el costo viaja con el material", () => {
  it("stock comprado hace meses a $50.000 se usa en otro proyecto a $50.000, nunca $0", () => {
    let s = applyChange(
      EMPTY_STOCK,
      receiveStock({ ...PLATE, quantity: 4, unitCost: 50_000, date: "2026-05-01", destination: "warehouse", kind: "opening" }, { ...ctx, now: "2026-05-01T10:00:00.000Z" }),
    );
    s = applyChange(s, assignToProject(s, { projectId: "B", materialId: PLATE.materialId, quantity: 2 }, ctx));
    s = applyChange(s, consumeMaterial(s, { projectId: "B", materialId: PLATE.materialId, consumed: 2, waste: 0 }, ctx));
    expect(projectMaterialFlow(s, "B").attributableCost).toBe(100_000);
  });

  it("rechaza ingresar material sin costo", () => {
    expect(() => receiveStock({ ...PLATE, quantity: 1, unitCost: 0, date: "2026-10-01", destination: "warehouse" }, ctx)).toThrow(/costo/);
  });

  it("con dos compras a distinto precio cada tramo conserva su costo", () => {
    let s = buy(EMPTY_STOCK, "A", 2, 100_000);
    s = applyChange(s, receiveStock({ ...PLATE, quantity: 2, unitCost: 120_000, date: "2026-10-02", destination: { projectId: "A" } }, { ...ctx, now: "2026-10-02T10:00:00.000Z" }));
    const used = consumeMaterial(s, { projectId: "A", materialId: PLATE.materialId, consumed: 3, waste: 0 }, ctx);
    expect(used.parts.map((p) => [p.consumed, p.lot.unitCost])).toEqual([[2, 100_000], [1, 120_000]]);
    expect(projectMaterialFlow(applyChange(s, used), "A").attributableCost).toBe(320_000);
  });
});

describe("stock — sobrante ≠ desperdicio", () => {
  it("el sobrante conserva su valor, no suma costo y queda disponible con sus medidas", () => {
    let s = buy(EMPTY_STOCK, "A", 1, 100_000);
    s = applyChange(s, consumeMaterial(s, { projectId: "A", materialId: PLATE.materialId, consumed: 0.6, waste: 0 }, ctx));
    s = applyChange(
      s,
      markLeftover(s, { projectId: "A", materialId: PLATE.materialId, quantity: 0.4, dims: { lengthMm: 1200, widthMm: 900, thicknessMm: 18, finish: "Blanco" }, location: "Estante 3" }, ctx),
    );
    const flow = projectMaterialFlow(s, "A");
    expect(flow.attributableCost).toBe(60_000);
    expect(flow.totals.recovered).toBe(40_000);
    const left = leftoverRows(s);
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ quantity: 0.4, assignedProjectId: null });
    expect(left[0].lot).toMatchObject({ unitCost: 100_000, kind: "leftover", originProjectId: "A", location: "Estante 3" });
    expect(left[0].lot.dims?.lengthMm).toBe(1200);
  });

  it("el desperdicio es costo y no se puede reutilizar", () => {
    let s = buy(EMPTY_STOCK, "A", 2, 100_000);
    s = applyChange(s, consumeMaterial(s, { projectId: "A", materialId: PLATE.materialId, consumed: 1, waste: 1 }, ctx));
    expect(projectMaterialFlow(s, "A").attributableCost).toBe(200_000);
    expect(stockRows(s)).toHaveLength(0);
    expect(leftoverRows(s)).toHaveLength(0);
  });

  it("un sobrante puede ir directo a otro proyecto", () => {
    let s = buy(EMPTY_STOCK, "A", 1, 100_000);
    s = applyChange(s, markLeftover(s, { projectId: "A", materialId: PLATE.materialId, quantity: 1, destination: { projectId: "B" } }, ctx));
    expect(availableToProject(s, "B", PLATE.materialId)).toBe(1);
    expect(unresolvedMaterial(s, "A")).toHaveLength(0);
    expect(leftoverRows(s)[0].assignedProjectId).toBe("B");
  });
});

describe("stock — material sin destino y devoluciones", () => {
  it("lo comprado y sin consumir queda como material por resolver", () => {
    const s = buy(EMPTY_STOCK, "A", 5, 100_000);
    const open = unresolvedMaterial(s, "A");
    expect(open).toHaveLength(1);
    expect(open[0].quantity).toBe(5);
  });

  it("devolver al proveedor saca el material y no cuenta como costo", () => {
    let s = buy(EMPTY_STOCK, "A", 5, 100_000);
    s = applyChange(s, returnToSupplier(s, { from: { projectId: "A" }, materialId: PLATE.materialId, quantity: 5 }, ctx));
    expect(unresolvedMaterial(s, "A")).toHaveLength(0);
    const flow = projectMaterialFlow(s, "A");
    expect(flow.attributableCost).toBe(0);
    expect(flow.totals.returned).toBe(500_000);
    expect(stockRows(s)).toHaveLength(0);
  });
});
