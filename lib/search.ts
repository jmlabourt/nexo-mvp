// ─────────────────────────────────────────────────────────────
// Búsqueda global. Cada resultado indica su tipo y lleva al elemento exacto
// (no sólo al proyecto): un sobrante abre el sobrante, una compra abre esa compra.
// ─────────────────────────────────────────────────────────────
import type { Operator, Project } from "@/types";
import { MATERIAL_CATALOG } from "./constants";
import { materialKey } from "./material-reconciliation";
import { leftoverRows, stockRows, warehouseHoldings, type StockState } from "./stock";
import { formatCurrency, formatQty } from "./formatting";

export type SearchKind = "project" | "material" | "stock" | "leftover" | "operator" | "purchase";

export const SEARCH_KIND_LABELS: Record<SearchKind, string> = {
  project: "Proyecto",
  material: "Material",
  stock: "Stock",
  leftover: "Sobrante",
  operator: "Operario",
  purchase: "Compra",
};

export interface SearchResult {
  id: string;
  kind: SearchKind;
  title: string;
  subtitle: string;
  href: string;
}

export interface SearchSources {
  projects: Project[];
  stock: StockState;
  operators: Operator[];
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

const KIND_ORDER: SearchKind[] = ["project", "material", "stock", "leftover", "purchase", "operator"];

export function buildSearchIndex({ projects, stock, operators }: SearchSources): SearchResult[] {
  const out: SearchResult[] = [];
  const projectLabel = (id: string | null | undefined) => {
    const p = projects.find((x) => x.id === id);
    return p ? `${p.code} · ${p.name}` : "";
  };

  for (const p of projects) {
    out.push({
      id: `project:${p.id}`,
      kind: "project",
      title: p.name,
      subtitle: `${p.code} · ${p.client}`,
      href: `/projects/${p.id}`,
    });
    for (const e of p.purchaseEntries) {
      out.push({
        id: `purchase:${e.id}`,
        kind: "purchase",
        title: `${e.materialName} — ${formatQty(e.quantity, e.unit)}`,
        subtitle: `Compra · ${p.code} · ${formatCurrency(e.total)}${e.supplier ? ` · ${e.supplier}` : ""}`,
        href: `/projects/${p.id}?tab=materials&purchase=${e.id}`,
      });
    }
  }

  // Materiales: catálogo + todo lo que aparece en lotes o presupuestos.
  const materials = new Map<string, string>();
  for (const m of MATERIAL_CATALOG) materials.set(m.id, m.name);
  for (const l of stock.lots) materials.set(l.materialId, l.materialName);
  for (const p of projects) {
    for (const l of p.budgetLines) {
      if (l.category === "materials") materials.set(materialKey(l.materialId, l.description), l.description);
    }
  }
  const rows = new Map(stockRows(stock).map((r) => [r.key, r]));
  for (const [key, name] of materials) {
    const r = rows.get(key);
    out.push({
      id: `material:${key}`,
      kind: "material",
      title: name,
      subtitle: r ? `En stock: ${formatQty(r.physical, r.unit)}` : "Sin stock",
      href: `/stock?material=${encodeURIComponent(key)}`,
    });
  }

  // Lotes con saldo libre (no sobrantes) y sobrantes.
  for (const h of warehouseHoldings(stock)) {
    if (h.lot.kind === "leftover") continue;
    out.push({
      id: `stock:${h.lot.id}`,
      kind: "stock",
      title: `${h.lot.materialName} — ${formatQty(h.quantity, h.lot.unit)}`,
      subtitle: `Stock libre · ${formatCurrency(h.lot.unitCost)} c/u${h.lot.location ? ` · ${h.lot.location}` : ""}`,
      href: `/stock?lot=${h.lot.id}`,
    });
  }
  for (const l of leftoverRows(stock)) {
    const origin = l.lot.originProjectId ? projectLabel(l.lot.originProjectId) : "";
    out.push({
      id: `leftover:${l.lot.id}:${l.assignedProjectId ?? "libre"}`,
      kind: "leftover",
      title: `${l.lot.materialName} — ${formatQty(l.quantity, l.lot.unit)}`,
      subtitle: `Sobrante${origin ? ` de ${origin}` : ""}${l.assignedProjectId ? ` · asignado a ${projectLabel(l.assignedProjectId)}` : ""}`,
      href: `/stock?lot=${l.lot.id}`,
    });
  }

  for (const o of operators) {
    out.push({
      id: `operator:${o.id}`,
      kind: "operator",
      title: o.name,
      subtitle: `${o.role}${o.active ? "" : " · inactivo"}`,
      href: `/operators?op=${o.id}`,
    });
  }
  return out;
}

export function searchAll(index: SearchResult[], query: string, limit = 24): SearchResult[] {
  const q = norm(query.trim());
  if (q.length < 2) return [];
  const terms = q.split(/\s+/);
  const scored = index
    .map((r) => {
      const hay = norm(`${r.title} ${r.subtitle}`);
      if (!terms.every((t) => hay.includes(t))) return null;
      const starts = norm(r.title).startsWith(q) ? 0 : 1;
      return { r, score: starts * 10 + KIND_ORDER.indexOf(r.kind) };
    })
    .filter((x): x is { r: SearchResult; score: number } => x !== null)
    .sort((a, b) => a.score - b.score);
  return scored.slice(0, limit).map((x) => x.r);
}
