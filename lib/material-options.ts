import type { Project, StockLot } from "@/types";
import { MATERIAL_CATALOG } from "./constants";
import { materialKey } from "./material-reconciliation";

export interface MaterialOption {
  id: string;
  name: string;
  unit: string;
  inBudget: boolean;
}

/** Materiales del proyecto (presupuestados/comprados) primero, luego el catálogo frecuente. */
export function projectMaterialOptions(project: Pick<Project, "budgetLines" | "purchaseEntries">): MaterialOption[] {
  const map = new Map<string, MaterialOption>();
  for (const l of project.budgetLines) {
    if (l.category !== "materials") continue;
    const id = materialKey(l.materialId, l.description);
    map.set(id, { id, name: l.description, unit: l.unit, inBudget: true });
  }
  for (const p of project.purchaseEntries) {
    const id = materialKey(p.materialId, p.materialName);
    if (!map.has(id)) map.set(id, { id, name: p.materialName, unit: p.unit, inBudget: false });
  }
  for (const m of MATERIAL_CATALOG) {
    if (!map.has(m.id)) map.set(m.id, { id: m.id, name: m.name, unit: m.unit, inBudget: false });
  }
  return [...map.values()].sort((a, b) => Number(b.inBudget) - Number(a.inBudget));
}

/**
 * Costo unitario sugerido para una compra: la última compra del material en la empresa,
 * si no el presupuestado del proyecto, si no el de referencia del catálogo. Es sólo una
 * sugerencia: Gestión lo confirma o lo corrige al registrar la compra.
 */
export function suggestUnitCost(project: Pick<Project, "budgetLines">, lots: StockLot[], materialId: string): number {
  const last = lots
    .filter((l) => l.materialId === materialId && l.kind === "purchase")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (last) return last.unitCost;
  const line = project.budgetLines.find((l) => l.category === "materials" && materialKey(l.materialId, l.description) === materialId && l.quantity !== null);
  if (line) return line.unitCost;
  return MATERIAL_CATALOG.find((m) => m.id === materialId)?.referenceCost ?? 0;
}
