// ─────────────────────────────────────────────────────────────
// Necesidades de Compras (y materiales de Planta) desde el BOM PUBLICADO de cada mueble (modo demostración).
// Se arma una vista del proyecto donde las líneas de materiales son las del BOM vigente:
//   · una línea del BOM que viene de una línea cotizada conserva su id (las órdenes ya emitidas siguen neteando);
//   · una línea agregada en el BOM tiene un id estable por mueble + material (republicar no la duplica);
//   · un mueble sin BOM publicado no genera necesidades (Compras todavía no tiene qué pedir).
// Republicar no toca órdenes ni consumos: solo cambia lo necesario y, con eso, lo que falta pedir.
// ─────────────────────────────────────────────────────────────
import type { BudgetLine, Ledger, Project } from "@/types";
import { normalizeName } from "./directory";
import { publishedBom } from "./ledger";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Legacy name-based ID: used only to resolve existing references, never to identify new needs. */
export function bomLineId(itemId: string, material: string): string {
  return `bom-${itemId}-${normalizeName(material).replace(/[^a-z0-9]+/g, "-")}`;
}

/** El proyecto con sus líneas de materiales reemplazadas por las del BOM publicado de cada mueble. */
export function withPublishedBom(project: Project, ledger: Pick<Ledger, "boms">): Project {
  const quoted = new Map(project.budgetLines.map((l) => [l.id, l]));
  const materials: BudgetLine[] = [];
  for (const item of project.items) {
    const bom = publishedBom(ledger, project.id, item.id);
    if (!bom) continue;
    for (const line of bom.lines) {
      const base = line.budgetLineId ? quoted.get(line.budgetLineId) : undefined;
      const unitCost = base?.unitCost ?? 0;
      const sameMaterial = (candidate: typeof line) => candidate.unit === line.unit && (line.materialId
        ? candidate.materialId === line.materialId
        : !candidate.materialId && (candidate.id === line.id || normalizeName(candidate.material) === normalizeName(line.material)));
      const originalMatches = base && base.unit === line.unit && (line.materialId && base.materialId
        ? line.materialId === base.materialId
        : normalizeName(line.material) === normalizeName(base.description) || (!line.materialId && !base.materialId && ledger.boms.some((b) =>
          b.projectId === project.id && b.itemId === item.id && b.status === "published" && b.lines.some((old) => old.id === line.id && old.budgetLineId === base.id && old.unit === line.unit && normalizeName(old.material) === normalizeName(base.description)))));
      // Stable catalog identity survives regenerated legacy line IDs; uncatalogued lines keep their own ID.
      const id = originalMatches ? base.id : `bom-${item.id}-${encodeURIComponent(line.materialId ?? line.id)}-${encodeURIComponent(line.unit)}`;
      const historicalNeedIds = [...new Set([
        ...(originalMatches ? [base.id] : []),
        ...ledger.boms.filter((b) => b.projectId === project.id && b.itemId === item.id && b.status === "published")
          .flatMap((b) => b.lines.filter(sameMaterial).map((old) => bomLineId(item.id, old.material))),
      ])];
      const existing = materials.find((m) => m.id === id);
      if (existing) {
        existing.quantity = round2((existing.quantity ?? 0) + line.quantity);
        existing.total = round2((existing.quantity ?? 0) * existing.unitCost);
        continue;
      }
      materials.push({
        ...(base ?? { id, category: "materials" as const, createdAt: bom.createdAt, updatedAt: bom.createdAt }),
        id,
        historicalNeedIds,
        description: line.material,
        materialId: line.materialId ?? base?.materialId,
        unit: line.unit,
        quantity: line.quantity,
        unitCost,
        total: round2(line.quantity * unitCost),
        notes: `${item.name} · BOM v${bom.version}`,
      } as BudgetLine);
    }
  }
  return { ...project, budgetLines: [...project.budgetLines.filter((l) => l.category !== "materials"), ...materials] };
}

/** Muebles de proyectos en ejecución que todavía no tienen BOM publicado. */
export function itemsWithoutBom(projects: Project[], ledger: Pick<Ledger, "boms">): Array<{ project: Project; itemName: string }> {
  return projects
    .filter((p) => !p.isClosed && p.status !== "quotation")
    .flatMap((p) => p.items.filter((i) => !publishedBom(ledger, p.id, i.id)).map((i) => ({ project: p, itemName: i.name })));
}
