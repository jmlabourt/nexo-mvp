// Condiciones de cierre de una OT (lo cierra solo Gerencia) y material pendiente de rendición. Puras.
import type { CoreWorld, Project } from "./types";
import { materialName } from "./lookup";
import { allItemsDone, openReleases, releaseBalance } from "./plant";
import { asg, holdingsAt } from "./stock";
import { EPS, qty, sumBy } from "./util";
import { isWorker } from "./lookup";

export interface PendingMaterial {
  materialId: string;
  /** Asignado a la OT y nunca liberado a producción. */
  assigned: number;
  /** Liberado a producción y sin rendir. */
  inProduction: number;
  releaseIds: string[];
}

/** Material de la OT que Planta todavía tiene que rendir (devolver, desperdiciar, consumir o seguir investigando). */
export function pendingMaterials(w: CoreWorld, projectId: string): PendingMaterial[] {
  const out = new Map<string, PendingMaterial>();
  const get = (materialId: string) => out.get(materialId) ?? { materialId, assigned: 0, inProduction: 0, releaseIds: [] };
  for (const h of holdingsAt(w, asg(projectId))) {
    const r = get(h.lot.materialId);
    r.assigned = qty(r.assigned + h.quantity);
    out.set(h.lot.materialId, r);
  }
  for (const rel of openReleases(w, projectId)) {
    const r = get(rel.materialId);
    r.inProduction = qty(r.inProduction + releaseBalance(w, rel).inProduction);
    r.releaseIds.push(rel.id);
    out.set(rel.materialId, r);
  }
  return [...out.values()].filter((r) => r.assigned > EPS || r.inProduction > EPS);
}

export const handoverOf = (w: Pick<CoreWorld, "handovers">, projectId: string) => w.handovers.filter((h) => h.projectId === projectId).at(-1);

export interface CloseCheck {
  canClose: boolean;
  blockers: string[];
  allItemsDone: boolean;
}

export function closeCheck(w: CoreWorld, p: Project): CloseCheck {
  const blockers: string[] = [];
  if (p.status === "closed") return { canClose: false, blockers: ["La OT ya está cerrada."], allItemsDone: true };
  if (p.status !== "production") blockers.push("La OT no está en Producción.");
  const done = allItemsDone(p);
  for (const i of p.items) if (i.completedUnits < i.quantity) blockers.push(`${i.name}: ${i.completedUnits}/${i.quantity} unidades terminadas.`);
  const pend = pendingMaterials(w, p.id);
  for (const m of pend) {
    const parts = [m.assigned > EPS ? `${m.assigned} asignado sin usar` : "", m.inProduction > EPS ? `${m.inProduction} en producción sin rendir` : ""].filter(Boolean);
    blockers.push(`Planta tiene que rendir ${materialName(w, m.materialId)}: ${parts.join(" y ")}.`);
  }
  if (!handoverOf(w, p.id)) blockers.push("Falta que Planta registre la entrega al cliente.");
  const unreviewed = w.timeEntries.filter((t) => t.projectId === p.id && !t.review && isWorker(w, w.employees.find((e) => e.id === t.employeeId)));
  if (unreviewed.length) blockers.push(`Planta tiene ${unreviewed.length} registro${unreviewed.length === 1 ? "" : "s"} de horas sin revisar en esta OT (${sumBy(unreviewed, (t) => t.hours)} h).`);
  return { canClose: blockers.length === 0, blockers, allItemsDone: done };
}
