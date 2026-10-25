// ─────────────────────────────────────────────────────────────
// Stock físico por lote: los saldos se derivan SIEMPRE de los movimientos (nunca se guardan).
// Una cantidad está en un solo lugar: libre, asignada a una OT, en producción (por entrega), consumida o desperdiciada.
// El costo de cada lote viaja con el material (consumos en otra OT se valorizan con su costo de origen).
// ─────────────────────────────────────────────────────────────
import type { CoreWorld, ISODate, Lot, Movement, MovementKind, OpCtx, PlaceKey } from "./types";
import { CoreError, EPS, nextId, qty } from "./util";
import { materialName } from "./lookup";

export const FREE: PlaceKey = "free";
export const SUPPLIER: PlaceKey = "supplier";
export const asg = (projectId: string): PlaceKey => `asg:${projectId}`;
export const prod = (releaseId: string): PlaceKey => `prod:${releaseId}`;
export const cons = (projectId: string): PlaceKey => `cons:${projectId}`;
export const waste = (projectId: string): PlaceKey => `waste:${projectId}`;

/** Saldo de cada lote en cada lugar (hasta una fecha, opcional). */
export function lotBalances(w: Pick<CoreWorld, "movements">, until?: ISODate): Map<string, Map<PlaceKey, number>> {
  const out = new Map<string, Map<PlaceKey, number>>();
  for (const m of w.movements) {
    if (until && m.date > until) continue;
    const b = out.get(m.lotId) ?? new Map<PlaceKey, number>();
    b.set(m.from, qty((b.get(m.from) ?? 0) - m.quantity));
    b.set(m.to, qty((b.get(m.to) ?? 0) + m.quantity));
    out.set(m.lotId, b);
  }
  return out;
}

export interface Holding {
  lot: Lot;
  quantity: number;
}

/** Lotes con saldo en un lugar, del más viejo al más nuevo (FIFO). */
export function holdingsAt(w: Pick<CoreWorld, "movements" | "lots">, place: PlaceKey, materialId?: string): Holding[] {
  const bal = lotBalances(w);
  return w.lots
    .filter((l) => !materialId || l.materialId === materialId)
    .map((lot) => ({ lot, quantity: bal.get(lot.id)?.get(place) ?? 0 }))
    .filter((h) => h.quantity > EPS)
    .sort((a, b) => a.lot.date.localeCompare(b.lot.date) || a.lot.id.localeCompare(b.lot.id));
}

export const qtyAt = (w: Pick<CoreWorld, "movements" | "lots">, place: PlaceKey, materialId?: string) =>
  qty(holdingsAt(w, place, materialId).reduce((s, h) => s + h.quantity, 0));

export const valueAt = (w: Pick<CoreWorld, "movements" | "lots">, place: PlaceKey, materialId?: string) =>
  Math.round(holdingsAt(w, place, materialId).reduce((s, h) => s + h.quantity * h.lot.unitCost, 0) * 100) / 100;

/** Toma `quantity` de un lugar por FIFO. Error claro si no alcanza. */
export function pickFifo(w: CoreWorld, place: PlaceKey, materialId: string, quantity: number): Array<{ lotId: string; quantity: number }> {
  const available = qtyAt(w, place, materialId);
  if (quantity - available > EPS) throw new CoreError(`No alcanza: hay ${available} de ${materialName(w, materialId)} y pediste ${qty(quantity)}.`);
  const out: Array<{ lotId: string; quantity: number }> = [];
  let left = quantity;
  for (const h of holdingsAt(w, place, materialId)) {
    if (left <= EPS) break;
    const take = qty(Math.min(left, h.quantity));
    out.push({ lotId: h.lot.id, quantity: take });
    left = qty(left - take);
  }
  return out;
}

/** Agrega un movimiento (valida que el lote tenga saldo en el origen, salvo desde el proveedor). */
export function addMovement(
  w: CoreWorld,
  m: { lotId: string; quantity: number; from: PlaceKey; to: PlaceKey; kind: MovementKind; date: ISODate; ref?: string },
  ctx: Pick<OpCtx, "actor" | "now">,
): CoreWorld {
  if (!(m.quantity > EPS)) throw new CoreError("La cantidad tiene que ser mayor a cero.");
  if (m.from !== SUPPLIER) {
    const have = lotBalances(w).get(m.lotId)?.get(m.from) ?? 0;
    if (m.quantity - have > EPS) throw new CoreError("Ese lote no tiene saldo suficiente en ese lugar.");
  }
  const [id, w2] = nextId(w, "mov");
  const mov: Movement = { id, ...m, quantity: qty(m.quantity), createdBy: ctx.actor, createdAt: ctx.now };
  return { ...w2, movements: [...w2.movements, mov] };
}

/** Mueve por FIFO de un lugar a otro, un movimiento por lote. */
export function moveFifo(
  w: CoreWorld,
  input: { materialId: string; quantity: number; from: PlaceKey; to: PlaceKey; kind: MovementKind; date: ISODate; ref?: string },
  ctx: Pick<OpCtx, "actor" | "now">,
): CoreWorld {
  let next = w;
  for (const part of pickFifo(w, input.from, input.materialId, input.quantity)) {
    next = addMovement(next, { lotId: part.lotId, quantity: part.quantity, from: input.from, to: input.to, kind: input.kind, date: input.date, ref: input.ref }, ctx);
  }
  return next;
}

/** Movimientos de un registro (recepción, entrega, rendición…). */
export const movementsOf = (w: Pick<CoreWorld, "movements">, ref: string) => w.movements.filter((m) => m.ref === ref);

/** Valor de un conjunto de movimientos con el costo de cada lote. */
export function movementsValue(w: Pick<CoreWorld, "lots">, movs: Movement[]): number {
  return Math.round(movs.reduce((s, m) => s + m.quantity * (w.lots.find((l) => l.id === m.lotId)?.unitCost ?? 0), 0) * 100) / 100;
}

export interface MaterialStockRow {
  materialId: string;
  free: number;
  assigned: number;
  inProduction: number;
  freeValue: number;
  assignedValue: number;
  inProductionValue: number;
  /** OCs de origen de los lotes con saldo libre o asignado. */
  orderIds: string[];
}

/** Tabla de stock por material (cantidades y valores con el costo de cada lote). */
export function stockRows(w: CoreWorld): MaterialStockRow[] {
  const bal = lotBalances(w);
  const rows = new Map<string, MaterialStockRow>();
  for (const lot of w.lots) {
    const b = bal.get(lot.id);
    if (!b) continue;
    const row = rows.get(lot.materialId) ?? { materialId: lot.materialId, free: 0, assigned: 0, inProduction: 0, freeValue: 0, assignedValue: 0, inProductionValue: 0, orderIds: [] };
    for (const [place, q] of b) {
      if (q <= EPS) continue;
      const v = q * lot.unitCost;
      if (place === FREE) {
        row.free = qty(row.free + q);
        row.freeValue += v;
      } else if (place.startsWith("asg:")) {
        row.assigned = qty(row.assigned + q);
        row.assignedValue += v;
      } else if (place.startsWith("prod:")) {
        row.inProduction = qty(row.inProduction + q);
        row.inProductionValue += v;
      } else continue;
      if ((place === FREE || place.startsWith("asg:")) && lot.orderId && !row.orderIds.includes(lot.orderId)) row.orderIds.push(lot.orderId);
    }
    rows.set(lot.materialId, row);
  }
  return [...rows.values()]
    .map((r) => ({ ...r, freeValue: Math.round(r.freeValue * 100) / 100, assignedValue: Math.round(r.assignedValue * 100) / 100, inProductionValue: Math.round(r.inProductionValue * 100) / 100 }))
    .filter((r) => r.free > EPS || r.assigned > EPS || r.inProduction > EPS)
    .sort((a, b) => materialName(w, a.materialId).localeCompare(materialName(w, b.materialId)));
}

/** Cantidad de un material asignada a una OT o en producción en sus entregas. */
export function projectPhysical(w: CoreWorld, projectId: string, materialId: string): { assigned: number; inProduction: number; consumed: number; waste: number } {
  const releaseIds = new Set(w.releases.filter((r) => r.projectId === projectId && r.materialId === materialId).map((r) => r.id));
  const bal = lotBalances(w);
  let assigned = 0;
  let inProduction = 0;
  let consumed = 0;
  let wasted = 0;
  for (const lot of w.lots.filter((l) => l.materialId === materialId)) {
    const b = bal.get(lot.id);
    if (!b) continue;
    assigned += b.get(asg(projectId)) ?? 0;
    consumed += b.get(cons(projectId)) ?? 0;
    wasted += b.get(waste(projectId)) ?? 0;
    for (const id of releaseIds) inProduction += b.get(prod(id)) ?? 0;
  }
  return { assigned: qty(assigned), inProduction: qty(inProduction), consumed: qty(consumed), waste: qty(wasted) };
}

/** Lugar que corresponde a una OT (asignado, en producción de sus entregas, consumido o desperdiciado). */
export function placeProject(w: Pick<CoreWorld, "releases">, place: PlaceKey): string | null {
  if (place.startsWith("asg:") || place.startsWith("cons:") || place.startsWith("waste:")) return place.slice(place.indexOf(":") + 1);
  if (place.startsWith("prod:")) return w.releases.find((r) => r.id === place.slice(5))?.projectId ?? null;
  return null;
}
