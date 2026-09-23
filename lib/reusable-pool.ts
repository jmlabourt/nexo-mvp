// ─────────────────────────────────────────────────────────────
// Pool simple de sobrantes reutilizables.
// Intencionalmente mínimo: NO es un módulo de inventario (sin depósitos,
// lotes, FIFO, stock mínimo ni transferencias).
// ─────────────────────────────────────────────────────────────
import type { MaterialUsageEntry, Project, ReusableMaterial } from "@/types";

const EPS = 1e-6;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

export class PoolError extends Error {}

/** Agrega el sobrante generado por un registro de uso. Devuelve un nuevo array (inmutable). */
export function addLeftoverToPool(
  pool: ReusableMaterial[],
  usage: MaterialUsageEntry,
  project: Pick<Project, "id" | "code" | "name">,
  newId: string,
): ReusableMaterial[] {
  if (usage.reusableLeftoverQuantity <= EPS) return pool;
  const item: ReusableMaterial = {
    id: newId,
    materialId: usage.materialId,
    materialName: usage.materialName,
    quantity: r3(usage.reusableLeftoverQuantity),
    unit: usage.unit,
    unitCost: usage.unitCost,
    originProjectId: project.id,
    originProjectName: `${project.code} · ${project.name}`,
    createdAt: usage.createdAt,
  };
  return [...pool, item];
}

/** Descuenta cantidad de un ítem del pool. Si queda en 0, lo elimina. Lanza si no alcanza. */
export function consumeFromPool(pool: ReusableMaterial[], itemId: string, quantity: number): ReusableMaterial[] {
  const item = pool.find((p) => p.id === itemId);
  if (!item) throw new PoolError("El sobrante seleccionado ya no está disponible.");
  if (quantity <= 0) return pool;
  if (quantity - item.quantity > EPS) {
    throw new PoolError(`Solo hay ${item.quantity} ${item.unit} disponibles de ${item.materialName}.`);
  }
  const remaining = r3(item.quantity - quantity);
  if (remaining <= EPS) return pool.filter((p) => p.id !== itemId);
  return pool.map((p) => (p.id === itemId ? { ...p, quantity: remaining } : p));
}

export function poolAvailableFor(pool: ReusableMaterial[], materialId: string): ReusableMaterial[] {
  return pool.filter((p) => p.materialId === materialId && p.quantity > EPS);
}

export function poolTotalValue(pool: ReusableMaterial[]): number {
  return Math.round(pool.reduce((s, p) => s + p.quantity * p.unitCost, 0) * 100) / 100;
}

/**
 * Aplica un registro de uso al pool: descuenta lo tomado de sobrantes (consumo + desperdicio)
 * y agrega el sobrante nuevo que haya quedado.
 */
export function applyUsageToPool(
  pool: ReusableMaterial[],
  usage: MaterialUsageEntry,
  project: Pick<Project, "id" | "code" | "name">,
  newId: string,
): ReusableMaterial[] {
  let next = pool;
  if (usage.source === "reused_leftover") {
    if (!usage.reusableMaterialId) throw new PoolError("Falta indicar qué sobrante se utilizó.");
    next = consumeFromPool(next, usage.reusableMaterialId, usage.quantityConsumed + usage.wasteQuantity);
  }
  return addLeftoverToPool(next, usage, project, newId);
}
