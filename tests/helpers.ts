import type { BudgetLine, MaterialUsageEntry, Project, RubroId } from "@/types";
import type { ProductRow } from "@/components/budget/calculator-state";
import { budgetLineTotal } from "@/lib/calculations";

let n = 0;
export function line(category: BudgetLine["category"], quantity: number | null, unitCost: number, extra: Partial<BudgetLine> = {}): BudgetLine {
  n += 1;
  return { id: `bl${n}`, category, description: extra.description ?? category, quantity, unit: extra.unit ?? "u", unitCost, total: budgetLineTotal({ quantity, unitCost }), ...extra };
}

export function usage(extra: Partial<MaterialUsageEntry>): MaterialUsageEntry {
  n += 1;
  return {
    id: `u${n}`, projectId: "p", materialId: "mel-blanca-18", materialName: "Melamina blanca 18 mm", date: "2026-01-10",
    quantityConsumed: 0, wasteQuantity: 0, reusableLeftoverQuantity: 0, unit: "placa", unitCost: 50000,
    unitCostOrigin: "purchase", source: "purchased_for_project", createdBy: "t", createdAt: "2026-01-10T10:00:00Z", ...extra,
  };
}

export function project(extra: Partial<Project> = {}): Project {
  return {
    id: "p", code: "P-1", name: "Test", client: "C", projectType: "Local comercial", description: "",
    status: "production", startDate: "2026-01-01", dueDate: "2026-03-01", createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z", salesPrice: 1000, owner: "o",
    budgetLines: [], actualEntries: [], materialUsages: [], purchaseEntries: [], activity: [], isClosed: false,
    assignedOperatorIds: [], items: [], stageLogs: [], attachments: [], ...extra,
  };
}

/**
 * Mano de obra de la calculadora, cargada en un producto (Auditoría UX · P0-7): "2 operarios × 40 h" de un rubro
 * es un producto con 80 h y 2 operarios en ese rubro. Los totales tienen que dar lo mismo que antes.
 */
export function laborProduct(rubro: RubroId, workers: number, hoursPerWorker: number, name = "Mueble"): ProductRow {
  n += 1;
  return { key: `pr${n}`, name, quantity: "1", rubros: [{ key: `prr${n}`, rubro, hours: String(workers * hoursPerWorker).replace(".", ","), workers: String(workers) }] };
}
