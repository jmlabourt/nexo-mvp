import type { Project } from "@/types";
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
