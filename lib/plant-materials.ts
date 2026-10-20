// ─────────────────────────────────────────────────────────────
// Jefe de planta: entrega de materiales y cierre del día (docs/PLANTA_MATERIALES.md). Funciones puras.
//
// Entrega: del depósito (movimiento 'assign', como Stock → Asignar) o de lo ya asignado al proyecto (sin
// movimiento). No es costo. Cierre: por entrega, consumo + desperdicio (costo, con el costo del lote) y sobrante
// reutilizable (vuelve al depósito con su costo); lo que no se cierra sigue en planta. Unidades terminadas: la misma
// validación de siempre (completedUnitsError). Las mismas reglas las vuelve a validar la base.
// ─────────────────────────────────────────────────────────────
import type { Alert, MaterialDelivery, MaterialUsageEntry, Project } from "@/types";
import { activity, createId } from "./activity";
import { alertBase, keyed } from "./alerts";
import { daysBetween, formatCurrency, formatDate, formatQty } from "./formatting";
import { completedUnitsError } from "./production";
import { DomainError, usageOrigin, usageSource } from "./project-operations";
import {
  applyChange,
  assignToProject,
  availableInWarehouse,
  availableToProject,
  consumeMaterial,
  EPS,
  markLeftover,
  projectHoldings,
  r3,
  warehouseHoldings,
  type StockChange,
  type StockCtx,
  type StockState,
} from "./stock";

/** Lo entregado y todavía sin cerrar de un proyecto (sigue en planta). */
export const openDeliveries = (deliveries: MaterialDelivery[], projectId: string) =>
  deliveries.filter((d) => d.projectId === projectId && !d.closedAt);

/** Cantidad entregada y sin cerrar de un material en un proyecto. */
function openDelivered(deliveries: MaterialDelivery[], projectId: string, materialId: string): number {
  return r3(openDeliveries(deliveries, projectId).filter((d) => d.materialId === materialId).reduce((s, d) => s + d.quantity, 0));
}

export interface DeliveryOption {
  materialId: string;
  materialName: string;
  unit: string;
  /** Libre en el depósito. */
  warehouse: number;
  /** Asignado al proyecto y todavía no entregado. */
  project: number;
}

/** Materiales que el Jefe puede entregar a un proyecto, con cantidades (sin costos). */
export function deliveryOptions(stock: StockState, deliveries: MaterialDelivery[], projectId: string): DeliveryOption[] {
  const byMaterial = new Map<string, DeliveryOption>();
  for (const h of [...warehouseHoldings(stock), ...projectHoldings(stock, projectId)]) {
    if (!byMaterial.has(h.lot.materialId)) {
      byMaterial.set(h.lot.materialId, { materialId: h.lot.materialId, materialName: h.lot.materialName, unit: h.lot.unit, warehouse: 0, project: 0 });
    }
  }
  return [...byMaterial.values()]
    .map((o) => ({
      ...o,
      warehouse: availableInWarehouse(stock, o.materialId),
      project: r3(Math.max(0, availableToProject(stock, projectId, o.materialId) - openDelivered(deliveries, projectId, o.materialId))),
    }))
    .filter((o) => o.warehouse > EPS || o.project > EPS)
    .sort((a, b) => a.materialName.localeCompare(b.materialName, "es"));
}

export interface DeliveryInput {
  projectId: string;
  itemId: string;
  operatorId?: string;
  materialId: string;
  quantity: number;
  source: "warehouse" | "project";
  date: string;
}

/** Problema con una entrega (null = bien). Mismos mensajes que la base. */
export function deliveryError(project: Project, stock: StockState, deliveries: MaterialDelivery[], input: DeliveryInput, today: string): string | null {
  if (project.isClosed || !["approved", "purchasing", "production", "installation"].includes(project.status)) {
    return "Solo se entrega material a proyectos entre Aprobado e Instalación.";
  }
  if (!project.items.some((i) => i.id === input.itemId)) return "Elegí un producto del proyecto.";
  if (!(input.quantity > 0)) return "La cantidad tiene que ser mayor a cero.";
  if (!input.date || input.date > today) return "La entrega no puede tener fecha futura.";
  const option = deliveryOptions(stock, deliveries, project.id).find((o) => o.materialId === input.materialId);
  if (!option) return "Elegí un material.";
  const available = input.source === "warehouse" ? option.warehouse : option.project;
  if (input.quantity - available > EPS) {
    return input.source === "warehouse"
      ? `No hay tanto material libre en el depósito (hay ${formatQty(available, option.unit)}).`
      : `El proyecto no tiene tanto material asignado sin entregar (hay ${formatQty(available, option.unit)}).`;
  }
  return null;
}

export interface DeliveryResult {
  delivery: MaterialDelivery;
  /** Movimientos nuevos (solo si sale del depósito). */
  change: StockChange;
  stock: StockState;
}

export function deliverMaterial(
  project: Project,
  stock: StockState,
  deliveries: MaterialDelivery[],
  input: DeliveryInput,
  ctx: StockCtx & { today: string },
): DeliveryResult {
  const error = deliveryError(project, stock, deliveries, input, ctx.today);
  if (error) throw new DomainError(error);
  const option = deliveryOptions(stock, deliveries, project.id).find((o) => o.materialId === input.materialId)!;
  const id = createId("del");
  const change: StockChange =
    input.source === "warehouse"
      ? assignToProject(stock, { projectId: project.id, materialId: input.materialId, quantity: input.quantity, date: input.date, note: `Entrega ${id}` }, ctx)
      : { lots: [], movements: [] };
  return {
    delivery: {
      id,
      projectId: project.id,
      itemId: input.itemId,
      operatorId: input.operatorId,
      materialId: input.materialId,
      materialName: option.materialName,
      unit: option.unit,
      quantity: r3(input.quantity),
      source: input.source,
      date: input.date,
      createdBy: ctx.actor,
      createdAt: ctx.now,
    },
    change,
    stock: applyChange(stock, { lots: change.lots, movements: change.movements.map((m) => ({ ...m, itemId: input.itemId })) }),
  };
}

export interface CloseDeliveryInput {
  id: string;
  consumed: number;
  waste: number;
  leftover: number;
}

export interface CloseDayInput {
  projectId: string;
  date: string;
  /** Unidades terminadas por producto (solo las que cambian). */
  units: Array<{ itemId: string; units: number }>;
  deliveries: CloseDeliveryInput[];
}

/** Problema con un cierre (null = bien). */
export function closeDayError(project: Project, deliveries: MaterialDelivery[], input: CloseDayInput, today: string): string | null {
  if (!input.date || input.date > today) return "El cierre no puede tener fecha futura.";
  for (const u of input.units) {
    const item = project.items.find((i) => i.id === u.itemId);
    if (!item) return "Producto no encontrado.";
    const error = completedUnitsError(item, u.units);
    if (error) return error;
  }
  for (const c of input.deliveries) {
    const d = deliveries.find((x) => x.id === c.id && x.projectId === project.id);
    if (!d) return "Entrega no encontrada en este proyecto.";
    if (d.closedAt) return `La entrega de ${d.materialName} ya está cerrada.`;
    if (!(c.consumed >= 0) || !(c.waste >= 0) || !(c.leftover >= 0)) return "Las cantidades no pueden ser negativas.";
    if (c.consumed + c.waste + c.leftover - d.quantity > EPS) {
      return `De ${d.materialName} se entregaron ${formatQty(d.quantity, d.unit)}: consumo, desperdicio y sobrante no pueden sumar más.`;
    }
  }
  if (input.units.length === 0 && input.deliveries.length === 0) return "No hay nada para cerrar.";
  return null;
}

export interface CloseDayResult {
  closeId: string;
  project: Project;
  stock: StockState;
  deliveries: MaterialDelivery[];
  /** Lo que se agregó (para mandar a la base). */
  change: StockChange;
  usages: MaterialUsageEntry[];
}

/**
 * Cierre del día: unidades terminadas y, por entrega, consumo y desperdicio (usos de material con el costo del lote) y
 * sobrante reutilizable (lote sobrante en el depósito, mismo costo). Lo no cerrado sigue asignado al proyecto.
 */
export function closeDay(
  project: Project,
  stock: StockState,
  deliveries: MaterialDelivery[],
  input: CloseDayInput,
  ctx: StockCtx & { today: string },
): CloseDayResult {
  const error = closeDayError(project, deliveries, input, ctx.today);
  if (error) throw new DomainError(error);
  const closeId = createId("cls");
  let next = stock;
  const change: StockChange = { lots: [], movements: [] };
  const usages: MaterialUsageEntry[] = [];
  const note = `Cierre ${closeId}`;
  for (const c of input.deliveries) {
    const d = deliveries.find((x) => x.id === c.id)!;
    if (c.consumed + c.waste > EPS) {
      const used = consumeMaterial(next, { projectId: project.id, materialId: d.materialId, consumed: c.consumed, waste: c.waste, itemId: d.itemId, date: input.date, note }, ctx);
      next = applyChange(next, used);
      change.movements.push(...used.movements);
      for (const part of used.parts) {
        usages.push({
          id: createId("use"),
          projectId: project.id,
          materialId: d.materialId,
          materialName: d.materialName,
          date: input.date,
          quantityConsumed: part.consumed,
          wasteQuantity: part.waste,
          reusableLeftoverQuantity: 0,
          unit: d.unit,
          unitCost: part.lot.unitCost,
          unitCostOrigin: usageOrigin(part.lot),
          source: usageSource(part.lot, project.id),
          lotId: part.lot.id,
          itemId: d.itemId,
          notes: `Cierre del día ${closeId}`,
          createdBy: ctx.actor,
          createdAt: ctx.now,
        });
      }
    }
    if (c.leftover > EPS) {
      const left = markLeftover(next, { projectId: project.id, materialId: d.materialId, quantity: c.leftover, date: input.date, note }, ctx);
      next = applyChange(next, left);
      change.lots.push(...left.lots);
      change.movements.push(...left.movements);
    }
  }
  const closedIds = new Set(input.deliveries.map((c) => c.id));
  const closed = deliveries.map((d) => {
    const c = input.deliveries.find((x) => x.id === d.id);
    return closedIds.has(d.id) && c ? { ...d, closedAt: ctx.now, closeId, consumed: r3(c.consumed), waste: r3(c.waste), leftover: r3(c.leftover) } : d;
  });
  const items = project.items.map((i) => {
    const u = input.units.find((x) => x.itemId === i.id);
    return u ? { ...i, completedUnits: u.units } : i;
  });
  const updated: Project = {
    ...project,
    items,
    materialUsages: [...project.materialUsages, ...usages],
    updatedAt: ctx.now,
    activity: [...project.activity, activity("usage", ctx.actor, `Cierre del día ${formatDate(input.date)} en planta.`, ctx.now)],
  };
  return { closeId, project: updated, stock: next, deliveries: closed, change, usages };
}

// ── Argumentos de las funciones de la base (sin costos) ─────

/** planta_deliver_material(p). */
export function deliveryPayload(r: DeliveryResult) {
  const d = r.delivery;
  return {
    id: d.id,
    project_id: d.projectId,
    item_id: d.itemId ?? null,
    operator_id: d.operatorId ?? null,
    material_id: d.materialId,
    quantity: d.quantity,
    source: d.source,
    date: d.date,
    movements: r.change.movements.map((m) => ({ id: m.id, kind: m.kind, lot_id: m.lotId, quantity: m.quantity, from_place: m.from, to_place: m.to })),
  };
}

/** planta_close_day(p). El costo de cada uso y de cada sobrante lo pone la base con el lote. */
export function closeDayPayload(input: CloseDayInput, r: CloseDayResult) {
  return {
    id: r.closeId,
    project_id: input.projectId,
    date: input.date,
    units: input.units.map((u) => ({ item_id: u.itemId, units: u.units })),
    deliveries: input.deliveries.map((d) => ({ id: d.id, consumed: d.consumed, waste: d.waste, leftover: d.leftover })),
    movements: r.change.movements.map((m) => ({
      id: m.id,
      kind: m.kind,
      lot_id: m.lotId,
      quantity: m.quantity,
      from_place: m.from,
      to_place: m.to,
      item_id: m.itemId ?? null,
      into_lot_id: m.intoLotId ?? null,
      group_id: m.groupId ?? null,
    })),
    lots: r.change.lots.map((l) => ({ id: l.id, parent_lot_id: l.parentLotId ?? null })),
    usages: r.usages.map((u) => ({ id: u.id, lot_id: u.lotId ?? null, quantity_consumed: u.quantityConsumed, waste_quantity: u.wasteQuantity, item_id: u.itemId ?? null })),
  };
}

// ── Resumen del Administrativo ("Para revisar hoy", con costo) ─

/** Los cierres de más de esta cantidad de días ya no se muestran: lo que pasó está en el costo real. */
export const CLOSE_REVIEW_DAYS = 7;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Costo de lo entregado: los lotes que salieron del depósito para esa entrega, o el costo promedio de lo asignado. */
function deliveryValue(stock: StockState, d: MaterialDelivery): number {
  const cost = new Map(stock.lots.map((l) => [l.id, l.unitCost]));
  const moved = stock.movements.filter((m) => m.kind === "assign" && m.note === `Entrega ${d.id}`);
  if (moved.length > 0) return round2(moved.reduce((s, m) => s + m.quantity * (cost.get(m.lotId) ?? 0), 0));
  const held = projectHoldings(stock, d.projectId).filter((h) => h.lot.materialId === d.materialId);
  const qty = held.reduce((s, h) => s + h.quantity, 0);
  const avg = qty > 0 ? held.reduce((s, h) => s + h.quantity * h.lot.unitCost, 0) / qty : 0;
  return round2(d.quantity * avg);
}

/**
 * Para el Administrativo (sin pantallas nuevas): material entregado en planta y sin cierre (de días anteriores), y el
 * resumen de cada cierre de los últimos días: consumo y desperdicio (costo del proyecto) y sobrante reutilizable que
 * volvió al depósito (no es costo). Qué pasó, cuánto cuesta y qué revisar.
 */
export function deliveryReviewAlerts(projects: Project[], stock: StockState, deliveries: MaterialDelivery[], today: string): Alert[] {
  const alerts: Alert[] = [];
  const cost = new Map(stock.lots.map((l) => [l.id, l.unitCost]));
  for (const p of projects.filter((x) => !x.isClosed)) {
    const open = openDeliveries(deliveries, p.id).filter((d) => d.date < today);
    if (open.length > 0) {
      const value = round2(open.reduce((s, d) => s + deliveryValue(stock, d), 0));
      const oldest = open.reduce((a, d) => (d.date < a ? d.date : a), open[0].date);
      alerts.push(keyed({
        ...alertBase(p),
        id: `${p.id}:delivery-open:${open.map((d) => d.id).join(",")}`,
        kind: "delivery_open",
        level: "warning",
        title: `Material entregado sin cierre del día desde el ${formatDate(oldest)}`,
        message: `Se entregó ${open.map((d) => `${formatQty(d.quantity, d.unit)} de ${d.materialName}`).join(", ")} y no se registró cuánto se consumió, cuánto fue desperdicio ni si sobró: todavía no entra al costo real.`,
        impactAmount: value,
        records: open.map((d) => `Entrega ${d.id} · ${formatDate(d.date)} · ${formatQty(d.quantity, d.unit)} de ${d.materialName} · ${d.source === "warehouse" ? "del depósito" : "de lo asignado al proyecto"}`),
        action: `Planta → Proyectos → ${p.code}: el Jefe de planta hace el Cierre del día.`,
      }));
    }
    const closes = new Map<string, MaterialDelivery[]>();
    for (const d of deliveries) {
      if (d.projectId !== p.id || !d.closeId || !d.closedAt) continue;
      if (daysBetween(d.closedAt.slice(0, 10), today) > CLOSE_REVIEW_DAYS) continue;
      closes.set(d.closeId, [...(closes.get(d.closeId) ?? []), d]);
    }
    for (const [closeId, list] of closes) {
      const usages = p.materialUsages.filter((u) => u.notes === `Cierre del día ${closeId}`);
      const consumedCost = round2(usages.reduce((s, u) => s + u.quantityConsumed * u.unitCost, 0));
      const wasteCost = round2(usages.reduce((s, u) => s + u.wasteQuantity * u.unitCost, 0));
      const leftoverValue = round2(
        stock.movements.filter((m) => m.kind === "to_leftover" && m.note === `Cierre ${closeId}`).reduce((s, m) => s + m.quantity * (cost.get(m.lotId) ?? 0), 0),
      );
      const sum = (k: "consumed" | "waste" | "leftover") => list.map((d) => (d[k] ? `${formatQty(d[k] ?? 0, d.unit)} de ${d.materialName}` : "")).filter(Boolean).join(", ") || "nada";
      const date = list[0].closedAt!.slice(0, 10);
      alerts.push(keyed({
        ...alertBase(p),
        id: `${p.id}:day-close:${closeId}`,
        kind: "day_close",
        level: wasteCost > 0 ? "warning" : "info",
        title: wasteCost > 0 ? `Cierre del día ${formatDate(date)}: desperdicio ${formatCurrency(wasteCost)}` : `Cierre del día ${formatDate(date)} en planta`,
        message:
          `Consumido: ${sum("consumed")} (${formatCurrency(consumedCost)}). Desperdicio: ${sum("waste")} (${formatCurrency(wasteCost)}). ` +
          `Sobrante reutilizable: ${sum("leftover")}, vuelve al depósito (${formatCurrency(leftoverValue)}, no es costo).`,
        impactAmount: round2(consumedCost + wasteCost),
        records: usages.map((u) => `Uso ${u.id} · lote ${u.lotId ?? "—"} · ${formatQty(u.quantityConsumed + u.wasteQuantity, u.unit)} × ${formatCurrency(u.unitCost)}`),
        action: wasteCost > 0 ? `Proyecto ${p.code} → Materiales: revisar el desperdicio con el Jefe de planta.` : `Proyecto ${p.code} → Materiales: ver los usos del cierre.`,
      }));
    }
  }
  return alerts;
}
