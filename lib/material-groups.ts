// Material asignado a un proyecto, agrupado por material (para elegir qué usar).
import { projectHoldings, r3, type Holding, type StockState } from "./stock";

export interface MaterialGroup {
  materialId: string;
  name: string;
  unit: string;
  quantity: number;
  lots: Holding[];
}

export function materialGroups(stock: StockState, projectId: string): MaterialGroup[] {
  const out = new Map<string, MaterialGroup>();
  for (const h of projectHoldings(stock, projectId)) {
    const g = out.get(h.lot.materialId) ?? { materialId: h.lot.materialId, name: h.lot.materialName, unit: h.lot.unit, quantity: 0, lots: [] };
    g.quantity = r3(g.quantity + h.quantity);
    g.lots.push(h);
    out.set(h.lot.materialId, g);
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
}
