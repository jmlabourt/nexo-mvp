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
      const id = base?.id ?? bomLineId(item.id, line.material);
      const existing = materials.find((m) => m.id === id);
      if (existing) {
        existing.quantity = round2((existing.quantity ?? 0) + line.quantity);
        existing.total = round2((existing.quantity ?? 0) * existing.unitCost);
        continue;
      }
      materials.push({
        ...(base ?? { id, category: "materials" as const, createdAt: bom.createdAt, updatedAt: bom.createdAt }),
        id,
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
