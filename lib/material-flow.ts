// ─────────────────────────────────────────────────────────────
// Flujo de materiales por proyecto — derivado del ledger de stock.
//
//   Comprado · Consumido · Desperdiciado · Recuperado · Transferido
//   costo imputable de materiales = consumido + desperdiciado
//
// Comprar o recibir material NO es costo. Lo que vuelve al stock, queda como
// sobrante o se transfiere a otro proyecto tampoco: el valor sigue existiendo.
// ─────────────────────────────────────────────────────────────
import type { Project, StockLot } from "@/types";
import { materialKey } from "./material-reconciliation";
import { computeBalances, EPS, r3, availableInWarehouse, projectHoldings, type StockState } from "./stock";

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface QtyValue {
  qty: number;
  value: number;
}

const zero = (): QtyValue => ({ qty: 0, value: 0 });

export interface MaterialFlowLine {
  key: string;
  name: string;
  unit: string;
  /** Comprado para este proyecto (no es costo). */
  purchased: QtyValue;
  /** Recibido del stock libre. */
  fromStock: QtyValue;
  /** Recibido por transferencia de otro proyecto. */
  transferredIn: QtyValue;
  /** Consumido: costo del proyecto. */
  consumed: QtyValue;
  /** Desperdicio: costo del proyecto. */
  wasted: QtyValue;
  /** Volvió al stock libre o quedó como sobrante reutilizable. */
  recovered: QtyValue;
  /** Pasó a otros proyectos. */
  transferredOut: QtyValue;
  /** Devuelto al proveedor. */
  returned: QtyValue;
  /** Ajustes históricos sin destino registrado. */
  adjusted: QtyValue;
  /** Todavía asignado al proyecto, sin consumir. */
  held: QtyValue;
}

export interface MaterialFlow {
  lines: MaterialFlowLine[];
  /** Totales en $ (las cantidades de materiales distintos no se suman). */
  totals: Record<FlowField, number>;
  /** Costo de materiales imputable al proyecto = consumido + desperdiciado. */
  attributableCost: number;
}

function emptyLine(lot: StockLot): MaterialFlowLine {
  return {
    key: lot.materialId,
    name: lot.materialName,
    unit: lot.unit,
    purchased: zero(),
    fromStock: zero(),
    transferredIn: zero(),
    consumed: zero(),
    wasted: zero(),
    recovered: zero(),
    transferredOut: zero(),
    returned: zero(),
    adjusted: zero(),
    held: zero(),
  };
}

function add(t: QtyValue, qty: number, unitCost: number) {
  t.qty += qty;
  t.value += qty * unitCost;
}

function round(t: QtyValue): QtyValue {
  return { qty: r3(t.qty), value: r2(t.value) };
}

export type FlowField =
  | "purchased"
  | "fromStock"
  | "transferredIn"
  | "consumed"
  | "wasted"
  | "recovered"
  | "transferredOut"
  | "returned"
  | "adjusted"
  | "held";

const FIELDS: FlowField[] = [
  "purchased",
  "fromStock",
  "transferredIn",
  "consumed",
  "wasted",
  "recovered",
  "transferredOut",
  "returned",
  "adjusted",
  "held",
];

export function projectMaterialFlow(state: StockState, projectId: string): MaterialFlow {
  const lots = new Map(state.lots.map((l) => [l.id, l]));
  const lines = new Map<string, MaterialFlowLine>();
  const line = (lot: StockLot) => {
    let l = lines.get(lot.materialId);
    if (!l) {
      l = emptyLine(lot);
      lines.set(lot.materialId, l);
    }
    return l;
  };

  for (const m of state.movements) {
    const lot = lots.get(m.lotId);
    if (!lot) continue;
    const c = lot.unitCost;
    const fromThis = m.from.type === "project" && m.from.projectId === projectId;
    const toThis = m.to.type === "project" && m.to.projectId === projectId;
    if (!fromThis && !toThis) continue;
    const l = line(lot);
    switch (m.kind) {
      case "purchase_in":
      case "opening":
        if (toThis) add(l.purchased, m.quantity, c);
        break;
      case "assign":
        if (toThis) add(l.fromStock, m.quantity, c);
        break;
      case "transfer":
        if (toThis) add(l.transferredIn, m.quantity, c);
        if (fromThis) add(l.transferredOut, m.quantity, c);
        break;
      case "consume":
        if (fromThis) add(l.consumed, m.quantity, c);
        break;
      case "waste":
        if (fromThis) add(l.wasted, m.quantity, c);
        break;
      case "release":
      case "to_leftover":
        if (fromThis) add(l.recovered, m.quantity, c);
        break;
      case "leftover_in":
        // Sobrante que llega directo a este proyecto (viene de otro).
        if (toThis) add(l.transferredIn, m.quantity, c);
        break;
      case "supplier_return":
        if (fromThis) add(l.returned, m.quantity, c);
        break;
      case "adjustment":
        if (fromThis) add(l.adjusted, m.quantity, c);
        break;
    }
  }

  for (const b of computeBalances(state.movements).values()) {
    const q = b.held[projectId] ?? 0;
    const lot = lots.get(b.lotId);
    if (lot && q > EPS) add(line(lot).held, q, lot.unitCost);
  }

  const out = [...lines.values()].map((l) => {
    const rounded = { ...l };
    for (const f of FIELDS) rounded[f] = round(l[f]);
    return rounded;
  });
  out.sort((a, b) => a.name.localeCompare(b.name, "es"));

  const totals = Object.fromEntries(FIELDS.map((f) => [f, r2(out.reduce((s, l) => s + l[f].value, 0))])) as Record<
    FlowField,
    number
  >;
  return { lines: out, totals, attributableCost: r2(totals.consumed + totals.wasted) };
}

// ── Requerido vs. disponible ──────────────────────────────────

export interface PositionRow {
  key: string;
  name: string;
  unit: string;
  /** Lo que el presupuesto dice que hace falta. */
  required: number;
  /** Libre en el depósito: se podría asignar al proyecto. */
  availableInStock: number;
  /** Asignado al proyecto y todavía sin consumir: lo único que Taller puede consumir. */
  assigned: number;
  consumed: number;
  wasted: number;
  /** Todavía sin cubrir (se puede comprar después). */
  missing: number;
}

export function projectMaterialPosition(
  project: Pick<Project, "id" | "budgetLines">,
  state: StockState,
): PositionRow[] {
  const flow = projectMaterialFlow(state, project.id);
  const rows = new Map<string, PositionRow>();
  const get = (key: string, name: string, unit: string) => {
    let r = rows.get(key);
    if (!r) {
      r = { key, name, unit, required: 0, availableInStock: 0, assigned: 0, consumed: 0, wasted: 0, missing: 0 };
      rows.set(key, r);
    }
    return r;
  };
  for (const l of project.budgetLines) {
    if (l.category !== "materials" || l.quantity === null) continue;
    get(materialKey(l.materialId, l.description), l.description, l.unit).required += l.quantity;
  }
  for (const l of flow.lines) {
    const r = get(l.key, l.name, l.unit);
    r.assigned = l.held.qty;
    r.consumed = l.consumed.qty;
    r.wasted = l.wasted.qty;
  }
  for (const r of rows.values()) {
    r.required = r3(r.required);
    r.availableInStock = availableInWarehouse(state, r.key);
    r.missing = r3(Math.max(0, r.required - r.assigned - r.consumed - r.wasted));
  }
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
}

/** Material asignado que quedó sin consumir: hay que darle destino antes de cerrar. */
export function unresolvedMaterial(state: StockState, projectId: string) {
  return projectHoldings(state, projectId);
}

/** Valor de lo asignado y sin consumir (para alertas y cierre). */
export function unresolvedValue(state: StockState, projectId: string): number {
  return r2(projectHoldings(state, projectId).reduce((s, h) => s + h.quantity * h.lot.unitCost, 0));
}
