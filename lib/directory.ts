// Clientes y proveedores (Administración y Compras) — funciones puras.
// Mientras la base no los devuelva como entidades editables (PENDIENTES_BACKEND.md), salen de lo que ya está cargado:
// los clientes, del campo cliente de los proyectos; los proveedores, de las órdenes de compra y las compras. Así no se
// inventa nadie y no se duplican nombres (se agrupan sin acentos ni mayúsculas).
import type { Project, PurchaseOrder } from "@/types";
import { purchaseHistory, supplierPrices, NO_SUPPLIER, type PurchaseRecord } from "./purchasing";
import type { StockState } from "./stock";

/** "Café Tostado " y "cafe tostado" son el mismo cliente. */
export const normalizeName = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

export interface ClientSummary {
  id: string;
  name: string;
  projects: Project[];
  activeProjects: number;
}

export function clientsFrom(projects: Project[]): ClientSummary[] {
  const map = new Map<string, ClientSummary>();
  for (const p of projects) {
    const name = p.client.trim();
    if (!name) continue;
    const id = normalizeName(name);
    const cur = map.get(id) ?? { id, name, projects: [], activeProjects: 0 };
    cur.projects.push(p);
    if (!p.isClosed) cur.activeProjects += 1;
    map.set(id, cur);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export interface SupplierMaterial {
  materialName: string;
  unit: string;
  lastPrice: number;
  lastDate: string;
  purchases: number;
  /** Compras de ese material a este proveedor, de la más nueva a la más vieja. */
  history: PurchaseRecord[];
}

export interface SupplierSummary {
  id: string;
  name: string;
  materials: SupplierMaterial[];
  orders: number;
  lastPurchase: string | null;
}

/** Proveedores de las compras y órdenes registradas, con el último precio de cada material y su historial. */
export function suppliersFrom(projects: Project[], stock: StockState, orders: PurchaseOrder[]): SupplierSummary[] {
  const history = purchaseHistory(projects, stock).filter((r) => r.supplier !== NO_SUPPLIER);
  const prices = supplierPrices(history);
  const names = new Map<string, string>();
  for (const r of history) names.set(normalizeName(r.supplier), r.supplier);
  for (const o of orders) if (o.supplier.trim()) names.set(normalizeName(o.supplier), names.get(normalizeName(o.supplier)) ?? o.supplier.trim());
  return [...names.entries()]
    .map(([id, name]): SupplierSummary => {
      const materials = prices.flatMap((m) =>
        m.suppliers
          .filter((s) => normalizeName(s.supplier) === id)
          .map((s) => ({
            materialName: m.materialName,
            unit: m.unit,
            lastPrice: s.lastPrice,
            lastDate: s.lastDate,
            purchases: s.purchases,
            history: history.filter((r) => r.key === m.key && normalizeName(r.supplier) === id),
          })),
      );
      const mine = history.filter((r) => normalizeName(r.supplier) === id);
      return {
        id,
        name,
        materials: materials.sort((a, b) => a.materialName.localeCompare(b.materialName, "es")),
        orders: orders.filter((o) => normalizeName(o.supplier) === id).length,
        lastPurchase: mine.length ? mine.reduce((m, r) => (r.date > m ? r.date : m), mine[0].date) : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}
