// Mensajes de actividad (quién, qué, cuándo). Compartido por el store y el seed.
import type { ActivityEvent, ActivityKind, ActualEntry, MaterialUsageEntry, PurchaseEntry } from "@/types";
import { ACTUAL_TYPE_LABELS } from "./constants";
import { formatCurrency, formatNumber, formatQty } from "./formatting";

let counter = 0;
export function createId(prefix: string): string {
  const rnd =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  counter += 1;
  return `${prefix}_${rnd}${counter.toString(36)}`;
}

export function activity(kind: ActivityKind, actor: string, message: string, at: string, id?: string): ActivityEvent {
  return { id: id ?? createId("act"), kind, actor, message, at };
}

export function usageMessage(u: MaterialUsageEntry): string {
  const parts = [`${u.createdBy} registró ${formatQty(u.quantityConsumed, u.unit)} de ${u.materialName}`];
  if (u.wasteQuantity > 0) parts.push(`${formatNumber(u.wasteQuantity)} de desperdicio`);
  if (u.reusableLeftoverQuantity > 0) parts.push(`${formatNumber(u.reusableLeftoverQuantity)} reutilizable`);
  const origin =
    u.source === "existing_stock" ? " (stock existente)" : u.source === "reused_leftover" ? " (sobrante reutilizado)" : "";
  return `${parts.join(", ")}${origin}.`;
}

export function leftoverMessage(u: MaterialUsageEntry): string {
  return `Se generaron ${formatQty(u.reusableLeftoverQuantity, u.unit)} reutilizables de ${u.materialName}.`;
}

export function purchaseMessage(p: PurchaseEntry): string {
  return `${p.createdBy} registró la compra de ${formatQty(p.quantity, p.unit)} de ${p.materialName}${
    p.supplier ? ` a ${p.supplier}` : ""
  } (${formatCurrency(p.total)}). No afecta el costo imputable hasta que se registre su consumo.`;
}

export function actualMessage(e: ActualEntry): string {
  if (e.type === "labor" && e.labor) {
    return `${e.createdBy} registró ${formatNumber(e.labor.hours, 1)} horas de ${e.labor.role}${
      e.labor.workerName ? ` (${e.labor.workerName})` : ""
    }.`;
  }
  return `${e.createdBy} registró ${ACTUAL_TYPE_LABELS[e.type].toLowerCase()}: ${e.description} (${formatCurrency(e.amount)}).`;
}
