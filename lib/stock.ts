// ─────────────────────────────────────────────────────────────
// Stock — libro de movimientos (ledger) de materiales.
//
// Un LOTE es una compra (o un sobrante) con su costo unitario. Cada
// MOVIMIENTO mueve una cantidad de un lote entre "lugares":
//   proveedor → depósito / proyecto → consumido / desperdicio
// El saldo de cada lugar se DERIVA de los movimientos (nunca se edita), así
// que Gestión, Taller, Stock y el detalle del proyecto leen la misma verdad.
//
// Reglas del producto que viven acá:
//   · comprar ≠ consumir: la compra sólo deja el material "asignado" al proyecto;
//   · sólo consumo y desperdicio son costo del proyecto;
//   · un sobrante conserva su valor y vuelve al stock (no es pérdida);
//   · el lote conserva su costo aunque se use meses después en otro proyecto;
//   · jamás se consume más de lo que el proyecto tiene asignado.
// Todo son funciones puras: reciben el estado y devuelven los movimientos nuevos.
// ─────────────────────────────────────────────────────────────
import type { LeftoverDims, MovementKind, Place, StockLot, StockMovement } from "@/types";
import { createId } from "./activity";

export const EPS = 1e-6;
const r2 = (n: number) => Math.round(n * 100) / 100;
export const r3 = (n: number) => Math.round(n * 1000) / 1000;

export class StockError extends Error {}

export interface StockState {
  lots: StockLot[];
  movements: StockMovement[];
}

export const EMPTY_STOCK: StockState = { lots: [], movements: [] };

export interface StockCtx {
  actor: string;
  now: string; // ISO datetime
}

/** Lo que agrega una operación. El ledger sólo crece: nunca se edita ni borra un movimiento. */
export interface StockChange {
  lots: StockLot[];
  movements: StockMovement[];
}

export function applyChange(state: StockState, change: StockChange): StockState {
  if (change.lots.length === 0 && change.movements.length === 0) return state;
  return { lots: [...state.lots, ...change.lots], movements: [...state.movements, ...change.movements] };
}

// ── Saldos ────────────────────────────────────────────────────

export interface LotBalance {
  lotId: string;
  /** En el depósito, libre. */
  warehouse: number;
  /** Asignado a un proyecto y todavía físicamente ahí (sin consumir). */
  held: Record<string, number>;
  consumed: Record<string, number>;
  waste: Record<string, number>;
  /** Devuelto a proveedor. */
  returned: number;
}

function emptyBalance(lotId: string): LotBalance {
  return { lotId, warehouse: 0, held: {}, consumed: {}, waste: {}, returned: 0 };
}

function bump(b: LotBalance, place: Place, delta: number) {
  switch (place.type) {
    case "warehouse":
      b.warehouse += delta;
      break;
    case "project":
      b.held[place.projectId] = (b.held[place.projectId] ?? 0) + delta;
      break;
    case "consumed":
      b.consumed[place.projectId] = (b.consumed[place.projectId] ?? 0) + delta;
      break;
    case "waste":
      b.waste[place.projectId] = (b.waste[place.projectId] ?? 0) + delta;
      break;
    case "supplier":
      b.returned += delta;
      break;
    case "converted":
      break;
  }
}

/** Saldo de cada lote a partir de sus movimientos. */
export function computeBalances(movements: StockMovement[]): Map<string, LotBalance> {
  const out = new Map<string, LotBalance>();
  for (const m of movements) {
    let b = out.get(m.lotId);
    if (!b) {
      b = emptyBalance(m.lotId);
      out.set(m.lotId, b);
    }
    // El proveedor como origen no es un saldo real; como destino sí (devolución).
    if (m.from.type !== "supplier") bump(b, m.from, -m.quantity);
    bump(b, m.to, m.quantity);
  }
  return out;
}

export interface Holding {
  lot: StockLot;
  quantity: number;
}

function lotMap(state: StockState): Map<string, StockLot> {
  return new Map(state.lots.map((l) => [l.id, l]));
}

export function warehouseHoldings(state: StockState): Holding[] {
  const lots = lotMap(state);
  const out: Holding[] = [];
  for (const b of computeBalances(state.movements).values()) {
    const lot = lots.get(b.lotId);
    if (lot && b.warehouse > EPS) out.push({ lot, quantity: r3(b.warehouse) });
  }
  return out.sort(byLotDate);
}

/** Material que el proyecto tiene asignado y todavía no consumió. */
export function projectHoldings(state: StockState, projectId: string): Holding[] {
  const lots = lotMap(state);
  const out: Holding[] = [];
  for (const b of computeBalances(state.movements).values()) {
    const lot = lots.get(b.lotId);
    const q = b.held[projectId] ?? 0;
    if (lot && q > EPS) out.push({ lot, quantity: r3(q) });
  }
  return out.sort(byLotDate);
}

function byLotDate(a: Holding, b: Holding) {
  return a.lot.createdAt.localeCompare(b.lot.createdAt) || a.lot.id.localeCompare(b.lot.id);
}

// ── Asignación de cantidades a lotes ──────────────────────────

export interface Allocation {
  lot: StockLot;
  quantity: number;
}

/** Elige de qué lotes sale una cantidad: primero compras (FIFO), los sobrantes al final. */
function allocate(
  holdings: Holding[],
  materialId: string,
  quantity: number,
  lotId?: string,
  lotIds?: string[],
): Allocation[] {
  if (!(quantity > EPS)) throw new StockError("La cantidad debe ser mayor a cero.");
  const only = lotIds ? new Set(lotIds) : null;
  const pool = holdings
    .filter((h) => h.lot.materialId === materialId && (!lotId || h.lot.id === lotId) && (!only || only.has(h.lot.id)))
    .sort((a, b) => Number(a.lot.kind === "leftover") - Number(b.lot.kind === "leftover") || byLotDate(a, b));
  const available = pool.reduce((s, h) => s + h.quantity, 0);
  if (quantity - available > EPS) {
    const unit = pool[0]?.lot.unit ?? "";
    const name = pool[0]?.lot.materialName ?? "ese material";
    throw new StockError(
      available <= EPS
        ? `No hay ${name} disponible para esta operación.`
        : `Solo hay ${r3(available)} ${unit} de ${name} disponibles.`,
    );
  }
  const out: Allocation[] = [];
  let left = quantity;
  for (const h of pool) {
    if (left <= EPS) break;
    const take = Math.min(h.quantity, left);
    out.push({ lot: h.lot, quantity: r3(take) });
    left = r3(left - take);
  }
  return out;
}

export function availableToProject(state: StockState, projectId: string, materialId: string): number {
  return r3(
    projectHoldings(state, projectId)
      .filter((h) => h.lot.materialId === materialId)
      .reduce((s, h) => s + h.quantity, 0),
  );
}

export function availableInWarehouse(state: StockState, materialId: string): number {
  return r3(
    warehouseHoldings(state)
      .filter((h) => h.lot.materialId === materialId)
      .reduce((s, h) => s + h.quantity, 0),
  );
}

// ── Construcción de movimientos ───────────────────────────────

const WAREHOUSE: Place = { type: "warehouse" };
const SUPPLIER: Place = { type: "supplier" };
const inProject = (projectId: string): Place => ({ type: "project", projectId });

interface MoveExtra {
  date?: string;
  projectId?: string;
  itemId?: string;
  intoLotId?: string;
  groupId?: string;
  note?: string;
}

function move(
  ctx: StockCtx,
  kind: MovementKind,
  lotId: string,
  quantity: number,
  from: Place,
  to: Place,
  extra: MoveExtra = {},
): StockMovement {
  return {
    id: createId("mov"),
    lotId,
    kind,
    quantity: r3(quantity),
    from,
    to,
    date: extra.date ?? ctx.now.slice(0, 10),
    projectId: extra.projectId,
    itemId: extra.itemId,
    intoLotId: extra.intoLotId,
    groupId: extra.groupId,
    note: extra.note,
    createdBy: ctx.actor,
    createdAt: ctx.now,
  };
}

// ── Ingreso de material ───────────────────────────────────────

export interface ReceiveInput {
  materialId: string;
  materialName: string;
  unit: string;
  quantity: number;
  unitCost: number;
  supplier?: string;
  date: string;
  /** Dónde queda: asignado a un proyecto o libre en el depósito. */
  destination: { projectId: string; projectName?: string } | "warehouse";
  kind?: "purchase" | "opening";
  purchaseEntryId?: string;
  location?: string;
  notes?: string;
  /** Para ids estables (migración de datos históricos). */
  lotId?: string;
}

export function receiveStock(
  input: ReceiveInput,
  ctx: StockCtx,
  opts: { allowZeroCost?: boolean } = {},
): StockChange & { lot: StockLot } {
  if (!(input.quantity > EPS)) throw new StockError("La cantidad debe ser mayor a cero.");
  if (!opts.allowZeroCost && !(input.unitCost > 0)) throw new StockError("Indicá el costo unitario: el material tiene que tener valor.");
  const kind = input.kind ?? "purchase";
  const dest = input.destination;
  const lot: StockLot = {
    id: input.lotId ?? createId("lot"),
    materialId: input.materialId,
    materialName: input.materialName,
    unit: input.unit,
    unitCost: input.unitCost,
    kind,
    supplier: input.supplier,
    purchaseEntryId: input.purchaseEntryId,
    originProjectId: dest === "warehouse" ? undefined : dest.projectId,
    originProjectName: dest === "warehouse" ? undefined : dest.projectName,
    location: input.location,
    notes: input.notes,
    createdBy: ctx.actor,
    createdAt: ctx.now,
  };
  const to = dest === "warehouse" ? WAREHOUSE : inProject(dest.projectId);
  const movement = move(ctx, kind === "opening" ? "opening" : "purchase_in", lot.id, input.quantity, SUPPLIER, to, {
    date: input.date,
  });
  return { lots: [lot], movements: [movement], lot };
}

// ── Movimientos entre lugares ─────────────────────────────────

export interface MoveInput {
  materialId: string;
  quantity: number;
  /** Lote puntual (ej.: un sobrante concreto). Si falta se elige solo. */
  lotId?: string;
  date?: string;
  note?: string;
}

/** Del depósito a un proyecto (reservar / asignar). */
export function assignToProject(
  state: StockState,
  input: MoveInput & { projectId: string },
  ctx: StockCtx,
): StockChange {
  const parts = allocate(warehouseHoldings(state), input.materialId, input.quantity, input.lotId);
  return {
    lots: [],
    movements: parts.map((a) =>
      move(ctx, "assign", a.lot.id, a.quantity, WAREHOUSE, inProject(input.projectId), {
        date: input.date,
        note: input.note,
      }),
    ),
  };
}

/** De un proyecto de vuelta al depósito (queda libre para otros proyectos). */
export function releaseToWarehouse(
  state: StockState,
  input: MoveInput & { projectId: string },
  ctx: StockCtx,
): StockChange {
  const parts = allocate(projectHoldings(state, input.projectId), input.materialId, input.quantity, input.lotId);
  return {
    lots: [],
    movements: parts.map((a) =>
      move(ctx, "release", a.lot.id, a.quantity, inProject(input.projectId), WAREHOUSE, {
        date: input.date,
        note: input.note,
      }),
    ),
  };
}

/** De un proyecto a otro, parcial o total, sin pasar por el depósito. */
export function transferBetweenProjects(
  state: StockState,
  input: MoveInput & { fromProjectId: string; toProjectId: string },
  ctx: StockCtx,
): StockChange {
  if (input.fromProjectId === input.toProjectId) throw new StockError("Elegí un proyecto de destino distinto.");
  const parts = allocate(projectHoldings(state, input.fromProjectId), input.materialId, input.quantity, input.lotId);
  const groupId = createId("grp");
  return {
    lots: [],
    movements: parts.map((a) =>
      move(ctx, "transfer", a.lot.id, a.quantity, inProject(input.fromProjectId), inProject(input.toProjectId), {
        date: input.date,
        note: input.note,
        groupId,
      }),
    ),
  };
}

/** Devolución al proveedor, desde un proyecto o desde el depósito. */
export function returnToSupplier(
  state: StockState,
  input: MoveInput & { from: "warehouse" | { projectId: string } },
  ctx: StockCtx,
): StockChange {
  const fromPlace: Place = input.from === "warehouse" ? WAREHOUSE : inProject(input.from.projectId);
  const holdings = input.from === "warehouse" ? warehouseHoldings(state) : projectHoldings(state, input.from.projectId);
  const parts = allocate(holdings, input.materialId, input.quantity, input.lotId);
  return {
    lots: [],
    movements: parts.map((a) =>
      move(ctx, "supplier_return", a.lot.id, a.quantity, fromPlace, SUPPLIER, {
        date: input.date,
        note: input.note,
        projectId: input.from === "warehouse" ? undefined : input.from.projectId,
      }),
    ),
  };
}

// ── Sobrante reutilizable ─────────────────────────────────────

export interface LeftoverInput extends MoveInput {
  projectId: string;
  lotIds?: string[];
  dims?: LeftoverDims;
  location?: string;
  /** Adónde va: depósito (libre) o directo a otro proyecto. */
  destination?: "warehouse" | { projectId: string };
}

/**
 * Convierte material asignado a un proyecto en un sobrante reutilizable.
 * Crea un lote hijo con el MISMO costo unitario: el valor se conserva, no es pérdida.
 */
export function markLeftover(state: StockState, input: LeftoverInput, ctx: StockCtx): StockChange {
  const parts = allocate(projectHoldings(state, input.projectId), input.materialId, input.quantity, input.lotId, input.lotIds);
  const dest = input.destination ?? "warehouse";
  const to = dest === "warehouse" ? WAREHOUSE : inProject(dest.projectId);
  const lots: StockLot[] = [];
  const movements: StockMovement[] = [];
  for (const a of parts) {
    const groupId = createId("grp");
    const child: StockLot = {
      id: createId("lot"),
      materialId: a.lot.materialId,
      materialName: a.lot.materialName,
      unit: a.lot.unit,
      unitCost: a.lot.unitCost,
      kind: "leftover",
      supplier: a.lot.supplier,
      originProjectId: input.projectId,
      originProjectName: a.lot.originProjectId === input.projectId ? a.lot.originProjectName : undefined,
      parentLotId: a.lot.id,
      location: input.location,
      dims: input.dims,
      createdBy: ctx.actor,
      createdAt: ctx.now,
    };
    lots.push(child);
    movements.push(
      move(ctx, "to_leftover", a.lot.id, a.quantity, inProject(input.projectId), { type: "converted" }, {
        date: input.date,
        projectId: input.projectId,
        intoLotId: child.id,
        groupId,
        note: input.note,
      }),
      move(ctx, "leftover_in", child.id, a.quantity, { type: "converted" }, to, {
        date: input.date,
        projectId: input.projectId,
        groupId,
      }),
    );
  }
  return { lots, movements };
}

/**
 * Baja de stock sin costo para ningún proyecto (ajuste). Se usa para datos históricos sin destino
 * registrado: deja el material fuera del saldo pero visible en el historial del lote.
 */
export function writeOff(
  state: StockState,
  input: MoveInput & { from: "warehouse" | { projectId: string }; lotIds?: string[] },
  ctx: StockCtx,
): StockChange {
  const fromPlace: Place = input.from === "warehouse" ? WAREHOUSE : inProject(input.from.projectId);
  const holdings = input.from === "warehouse" ? warehouseHoldings(state) : projectHoldings(state, input.from.projectId);
  const parts = allocate(holdings, input.materialId, input.quantity, input.lotId, input.lotIds);
  return {
    lots: [],
    movements: parts.map((a) =>
      move(ctx, "adjustment", a.lot.id, a.quantity, fromPlace, { type: "converted" }, {
        date: input.date,
        note: input.note,
        projectId: input.from === "warehouse" ? undefined : input.from.projectId,
      }),
    ),
  };
}

// ── Consumo y desperdicio (único costo del proyecto) ──────────

export interface UseInput {
  projectId: string;
  materialId: string;
  consumed: number;
  waste: number;
  lotId?: string;
  /** Restringe a estos lotes (uso interno: migración de datos históricos). */
  lotIds?: string[];
  itemId?: string;
  date?: string;
  note?: string;
}

/** Un tramo del uso, por lote (cada lote tiene su costo). */
export interface UsagePart {
  lot: StockLot;
  consumed: number;
  waste: number;
}

/**
 * Registra consumo y desperdicio de material que el proyecto TIENE asignado.
 * Si no alcanza, lanza StockError: no se puede consumir lo que no está físicamente.
 */
export function consumeMaterial(
  state: StockState,
  input: UseInput,
  ctx: StockCtx,
): StockChange & { parts: UsagePart[] } {
  if (input.consumed < 0 || input.waste < 0) throw new StockError("Las cantidades no pueden ser negativas.");
  const total = r3(input.consumed + input.waste);
  if (!(total > EPS)) throw new StockError("Indicá cuánto material se utilizó.");
  const allocations = allocate(projectHoldings(state, input.projectId), input.materialId, total, input.lotId, input.lotIds);
  const movements: StockMovement[] = [];
  const parts: UsagePart[] = [];
  let consumedLeft = r3(input.consumed);
  for (const a of allocations) {
    const c = Math.min(a.quantity, consumedLeft);
    const w = r3(a.quantity - c);
    consumedLeft = r3(consumedLeft - c);
    const base = { date: input.date, projectId: input.projectId, itemId: input.itemId, note: input.note };
    if (c > EPS) {
      movements.push(
        move(ctx, "consume", a.lot.id, c, inProject(input.projectId), { type: "consumed", projectId: input.projectId }, base),
      );
    }
    if (w > EPS) {
      movements.push(
        move(ctx, "waste", a.lot.id, w, inProject(input.projectId), { type: "waste", projectId: input.projectId }, base),
      );
    }
    parts.push({ lot: a.lot, consumed: r3(c), waste: w });
  }
  return { lots: [], movements, parts };
}

// ── Lecturas para la UI ───────────────────────────────────────

export interface StockRow {
  key: string;
  materialId: string;
  name: string;
  unit: string;
  /** Todo lo que existe físicamente: depósito + asignado a proyectos. */
  physical: number;
  /** Libre en el depósito. */
  available: number;
  /** Asignado/reservado a proyectos (no consumido). */
  assigned: number;
  /** Costo unitario promedio ponderado del material físico. */
  unitCost: number;
  value: number;
  /** Sobrantes reutilizables (en depósito o asignados). */
  leftoverQty: number;
  leftoverCount: number;
  locations: string[];
  byProject: Array<{ projectId: string; quantity: number; value: number }>;
}

export function stockRows(state: StockState): StockRow[] {
  const lots = lotMap(state);
  const rows = new Map<string, StockRow>();
  const costNum = new Map<string, number>();
  for (const b of computeBalances(state.movements).values()) {
    const lot = lots.get(b.lotId);
    if (!lot) continue;
    const heldTotal = Object.values(b.held).reduce((s, q) => s + q, 0);
    const physical = b.warehouse + heldTotal;
    if (physical <= EPS) continue;
    let row = rows.get(lot.materialId);
    if (!row) {
      row = {
        key: lot.materialId,
        materialId: lot.materialId,
        name: lot.materialName,
        unit: lot.unit,
        physical: 0,
        available: 0,
        assigned: 0,
        unitCost: 0,
        value: 0,
        leftoverQty: 0,
        leftoverCount: 0,
        locations: [],
        byProject: [],
      };
      rows.set(lot.materialId, row);
    }
    row.physical += physical;
    row.available += Math.max(0, b.warehouse);
    row.assigned += heldTotal;
    row.value += physical * lot.unitCost;
    costNum.set(lot.materialId, (costNum.get(lot.materialId) ?? 0) + physical * lot.unitCost);
    if (lot.kind === "leftover") {
      row.leftoverQty += physical;
      row.leftoverCount += 1;
    }
    if (lot.location && !row.locations.includes(lot.location)) row.locations.push(lot.location);
    for (const [projectId, q] of Object.entries(b.held)) {
      if (q <= EPS) continue;
      const entry = row.byProject.find((x) => x.projectId === projectId);
      if (entry) {
        entry.quantity += q;
        entry.value += q * lot.unitCost;
      } else row.byProject.push({ projectId, quantity: q, value: q * lot.unitCost });
    }
  }
  return [...rows.values()]
    .map((r) => ({
      ...r,
      physical: r3(r.physical),
      available: r3(r.available),
      assigned: r3(r.assigned),
      leftoverQty: r3(r.leftoverQty),
      value: r2(r.value),
      unitCost: r.physical > EPS ? r2((costNum.get(r.key) ?? 0) / r.physical) : 0,
      byProject: r.byProject.map((b) => ({ ...b, quantity: r3(b.quantity), value: r2(b.value) })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export interface LeftoverRow {
  lot: StockLot;
  quantity: number;
  /** null = libre en el depósito; si no, el proyecto que lo tiene asignado. */
  assignedProjectId: string | null;
}

/** Sobrantes reutilizables (lotes hijos) con saldo, en depósito o ya asignados. */
export function leftoverRows(state: StockState): LeftoverRow[] {
  const lots = lotMap(state);
  const out: LeftoverRow[] = [];
  for (const b of computeBalances(state.movements).values()) {
    const lot = lots.get(b.lotId);
    if (!lot || lot.kind !== "leftover") continue;
    if (b.warehouse > EPS) out.push({ lot, quantity: r3(b.warehouse), assignedProjectId: null });
    for (const [projectId, q] of Object.entries(b.held)) {
      if (q > EPS) out.push({ lot, quantity: r3(q), assignedProjectId: projectId });
    }
  }
  return out.sort((a, b) => b.lot.createdAt.localeCompare(a.lot.createdAt));
}

export function stockTotalValue(state: StockState): number {
  return r2(stockRows(state).reduce((s, r) => s + r.value, 0));
}

/** Trazabilidad de un lote: comprado para A → transferido a B → consumido en B. */
export function lotTrail(state: StockState, lotId: string): StockMovement[] {
  const lots = lotMap(state);
  const ids = new Set<string>([lotId]);
  // Incluye el lote padre para seguir la historia de un sobrante.
  let cur = lots.get(lotId);
  while (cur?.parentLotId) {
    ids.add(cur.parentLotId);
    cur = lots.get(cur.parentLotId);
  }
  return state.movements
    .filter((m) => ids.has(m.lotId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}
