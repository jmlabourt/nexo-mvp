// ─────────────────────────────────────────────────────────────
// Reconciliación de materiales por proyecto.
// Separa: presupuestado / comprado / stock existente / sobrante reutilizado /
// consumido / desperdicio / sobrante generado / costo imputable.
// ─────────────────────────────────────────────────────────────
import type { MaterialUsageEntry, Project } from "@/types";
import { usageConsumedCost, usageLeftoverValue, usageProjectCost, usageWasteCost } from "./calculations";

const EPS = 1e-6;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const r2 = (n: number) => Math.round(n * 100) / 100;

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Clave estable de material: id de catálogo si existe; si no, derivada del nombre. */
export function materialKey(materialId: string | undefined, materialName: string): string {
  return materialId && materialId.length > 0 ? materialId : `custom:${slugify(materialName)}`;
}

export interface MaterialRow {
  key: string;
  name: string;
  unit: string;
  budgetQty: number;
  budgetCost: number;
  purchasedQty: number;
  purchasedCost: number;
  /** Uso tomado de stock existente (no requiere compra). */
  fromStockQty: number;
  /** Uso proveniente del pool de sobrantes. */
  fromReusedQty: number;
  consumedQty: number;
  wasteQty: number;
  leftoverQty: number;
  consumedCost: number;
  wasteCost: number;
  /** Costo imputable al proyecto = consumido + desperdicio. */
  imputedCost: number;
  leftoverValue: number;
  /** imputado − presupuestado. */
  variance: number;
  /** Cantidad usada (consumo + desperdicio) vs. presupuestada. */
  usedQty: number;
  /** Lo comprado que quedó explicado por consumo, desperdicio o sobrante. */
  purchaseAccountedQty: number;
  /** comprado − explicado. >0: falta reconciliar. <0: se registró más uso "comprado" que compras. */
  unexplainedQty: number;
  reconciled: boolean;
}

function emptyRow(key: string, name: string, unit: string): MaterialRow {
  return {
    key,
    name,
    unit,
    budgetQty: 0,
    budgetCost: 0,
    purchasedQty: 0,
    purchasedCost: 0,
    fromStockQty: 0,
    fromReusedQty: 0,
    consumedQty: 0,
    wasteQty: 0,
    leftoverQty: 0,
    consumedCost: 0,
    wasteCost: 0,
    imputedCost: 0,
    leftoverValue: 0,
    variance: 0,
    usedQty: 0,
    purchaseAccountedQty: 0,
    unexplainedQty: 0,
    reconciled: true,
  };
}

function addUsage(row: MaterialRow, u: MaterialUsageEntry) {
  const used = u.quantityConsumed + u.wasteQuantity;
  row.consumedQty += u.quantityConsumed;
  row.wasteQty += u.wasteQuantity;
  row.leftoverQty += u.reusableLeftoverQuantity;
  row.consumedCost += usageConsumedCost(u);
  row.wasteCost += usageWasteCost(u);
  row.imputedCost += usageProjectCost(u);
  row.leftoverValue += usageLeftoverValue(u);
  if (u.source === "existing_stock") row.fromStockQty += used;
  if (u.source === "reused_leftover") row.fromReusedQty += used;
  if (u.source === "purchased_for_project") {
    row.purchaseAccountedQty += used + u.reusableLeftoverQuantity;
  }
}

export function materialRows(project: Pick<Project, "budgetLines" | "purchaseEntries" | "materialUsages">): MaterialRow[] {
  const rows = new Map<string, MaterialRow>();
  const get = (key: string, name: string, unit: string) => {
    let row = rows.get(key);
    if (!row) {
      row = emptyRow(key, name, unit);
      rows.set(key, row);
    }
    return row;
  };

  for (const l of project.budgetLines) {
    if (l.category !== "materials") continue;
    const row = get(materialKey(l.materialId, l.description), l.description, l.unit);
    row.budgetQty += l.quantity ?? 0;
    row.budgetCost += l.total;
  }
  for (const p of project.purchaseEntries) {
    const row = get(materialKey(p.materialId, p.materialName), p.materialName, p.unit);
    row.purchasedQty += p.quantity;
    row.purchasedCost += p.total;
  }
  for (const u of project.materialUsages) {
    addUsage(get(materialKey(u.materialId, u.materialName), u.materialName, u.unit), u);
  }

  return [...rows.values()].map((row) => {
    const out: MaterialRow = {
      ...row,
      budgetQty: r3(row.budgetQty),
      purchasedQty: r3(row.purchasedQty),
      fromStockQty: r3(row.fromStockQty),
      fromReusedQty: r3(row.fromReusedQty),
      consumedQty: r3(row.consumedQty),
      wasteQty: r3(row.wasteQty),
      leftoverQty: r3(row.leftoverQty),
      consumedCost: r2(row.consumedCost),
      wasteCost: r2(row.wasteCost),
      imputedCost: r2(row.imputedCost),
      leftoverValue: r2(row.leftoverValue),
      purchaseAccountedQty: r3(row.purchaseAccountedQty),
      usedQty: r3(row.consumedQty + row.wasteQty),
    };
    out.variance = r2(out.imputedCost - out.budgetCost);
    out.unexplainedQty = r3(out.purchasedQty - out.purchaseAccountedQty);
    // Solo exigimos reconciliación sobre lo comprado para el proyecto.
    out.reconciled = out.purchasedQty <= EPS || Math.abs(out.unexplainedQty) <= 0.001;
    return out;
  });
}

export interface ReconciliationSummary {
  rows: MaterialRow[];
  pending: MaterialRow[];
  allReconciled: boolean;
}

export function reconciliationSummary(
  project: Pick<Project, "budgetLines" | "purchaseEntries" | "materialUsages">,
): ReconciliationSummary {
  const rows = materialRows(project);
  const pending = rows.filter((r) => !r.reconciled);
  return { rows, pending, allReconciled: pending.length === 0 };
}
