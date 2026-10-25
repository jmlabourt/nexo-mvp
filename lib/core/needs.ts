// ─────────────────────────────────────────────────────────────
// BOM y necesidades de compra ("Por comprar"). Puras.
//
// La demanda nace SOLO del BOM publicado vigente (última versión publicada) más los pedidos adicionales activos de
// Planta. Por OT y material:
//   usado            = consumido + desperdiciado (ya imputado a la OT)
//   físico en la OT  = asignado sin liberar + liberado a producción sin rendir
//   pendiente recibir= Σ (cantidad − recibido neto) de las líneas de OC de esa OT y ese material
//   faltante físico  = max(0, demanda − usado − físico en la OT)
//   por registrar    = max(0, faltante físico − pendiente recibir)        ← "Por comprar"
// Una línea de OC recibida ya está en "físico en la OT" (asignada): no cuenta además como pedida.
// El desperdicio rendido cuenta como usado: no se recompra solo; si hace falta más, Planta lo pide como adicional.
// Un mueble finalizado deja de demandar: su parte de la demanda es lo que usó (como máximo lo del BOM).
// ─────────────────────────────────────────────────────────────
import type { BomLine, BomVersion, CoreWorld, MaterialRequest, Project, QuoteLine } from "./types";
import { lineReceived } from "./orders";
import { FREE, projectPhysical, qtyAt } from "./stock";
import { EPS, qty, sumBy } from "./util";

const versionsOf = (w: Pick<CoreWorld, "boms">, projectId: string) => w.boms.filter((b) => b.projectId === projectId).sort((a, b) => a.version - b.version);

export const publishedBom = (w: Pick<CoreWorld, "boms">, projectId: string): BomVersion | undefined =>
  versionsOf(w, projectId).filter((b) => b.status === "published").at(-1);
export const draftBom = (w: Pick<CoreWorld, "boms">, projectId: string): BomVersion | undefined => versionsOf(w, projectId).find((b) => b.status === "draft");
export const bomVersions = versionsOf;

/** Líneas cotizadas vigentes de un mueble: las de la cotización aprobada más las de los adicionales. */
export function budgetLinesOf(w: Pick<CoreWorld, "additionals">, p: Project): QuoteLine[] {
  const base = p.baseline?.lines ?? p.quote.lines;
  return [...base, ...w.additionals.filter((a) => a.projectId === p.id).flatMap((a) => a.lines)];
}

/** Rubros habilitados de un mueble: los cotizados más los adicionales aprobados por Administración. */
export function enabledRubros(w: Pick<CoreWorld, "additionals">, p: Project, itemId: string): string[] {
  return [...new Set(budgetLinesOf(w, p).filter((l) => l.itemId === itemId).map((l) => l.rubroId))];
}

/** Borrador inicial del BOM: las líneas de materiales cotizadas de cada mueble (con su rubro y material). */
export function bomFromBudget(w: Pick<CoreWorld, "additionals">, p: Project): Array<Omit<BomLine, "id">> {
  return budgetLinesOf(w, p)
    .filter((l) => l.kind === "material" && l.materialId)
    .map((l) => ({ itemId: l.itemId, rubroId: l.rubroId, materialId: l.materialId as string, quantity: l.quantity }));
}

export interface BomDiff {
  itemId: string;
  rubroId: string;
  materialId: string;
  before: number;
  after: number;
}

/** Diferencias entre dos listas de líneas (por mueble + rubro + material). */
export function bomDiff(before: Array<Omit<BomLine, "id">>, after: Array<Omit<BomLine, "id">>): BomDiff[] {
  const key = (l: Omit<BomLine, "id">) => `${l.itemId}|${l.rubroId}|${l.materialId}`;
  const a = new Map<string, number>();
  const b = new Map<string, number>();
  for (const l of before) a.set(key(l), (a.get(key(l)) ?? 0) + l.quantity);
  for (const l of after) b.set(key(l), (b.get(key(l)) ?? 0) + l.quantity);
  return [...new Set([...a.keys(), ...b.keys()])]
    .map((k) => {
      const [itemId, rubroId, materialId] = k.split("|");
      return { itemId, rubroId, materialId, before: qty(a.get(k) ?? 0), after: qty(b.get(k) ?? 0) };
    })
    .filter((d) => Math.abs(d.after - d.before) > EPS);
}

/** Estados en los que una OT tiene necesidades de compra (BOM publicado). */
export const BUYING_STATUSES: Project["status"][] = ["purchasing", "production"];

export interface NeedRow {
  projectId: string;
  materialId: string;
  bom: number;
  extra: number;
  demand: number;
  used: number;
  assigned: number;
  inProduction: number;
  pendingReceipt: number;
  ordered: number;
  uncovered: number;
  toRegister: number;
  excess: number;
  freeStock: number;
  requests: MaterialRequest[];
  startDate: string;
  dueDate: string;
}

export function needRowsOf(w: CoreWorld, p: Project): NeedRow[] {
  const bom = publishedBom(w, p.id);
  if (!bom || !BUYING_STATUSES.includes(p.status)) return [];
  const requests = w.materialRequests.filter((r) => r.projectId === p.id && r.status === "active");
  const lines = w.orders.flatMap((o) => o.lines.filter((l) => l.projectId === p.id));
  const materials = [...new Set([...bom.lines.map((l) => l.materialId), ...requests.map((r) => r.materialId), ...lines.map((l) => l.materialId)])];
  const done = new Set(p.items.filter((i) => i.completedUnits >= i.quantity).map((i) => i.id));
  const usedItem = (itemId: string, materialId: string) => {
    let total = 0;
    for (const rel of w.releases.filter((r) => r.projectId === p.id && r.itemId === itemId && r.materialId === materialId))
      for (const rd of w.renditions.filter((x) => x.releaseId === rel.id)) total += rd.consumed + rd.waste;
    return qty(total);
  };
  return materials.map((materialId) => {
    // Un mueble finalizado ya no demanda más: su demanda pasa a ser lo que realmente usó.
    const bomQty = qty(
      sumBy(bom.lines.filter((l) => l.materialId === materialId), (l) => (done.has(l.itemId) ? Math.min(l.quantity, usedItem(l.itemId, materialId)) : l.quantity)),
    );
    const reqs = requests.filter((r) => r.materialId === materialId && !done.has(r.itemId));
    const extra = qty(sumBy(reqs, (r) => r.quantity));
    const demand = qty(bomQty + extra);
    const ph = projectPhysical(w, p.id, materialId);
    const used = qty(ph.consumed + ph.waste);
    const matLines = lines.filter((l) => l.materialId === materialId);
    const ordered = qty(sumBy(matLines, (l) => l.quantity));
    const pendingReceipt = qty(sumBy(matLines, (l) => Math.max(0, l.quantity - lineReceived(w, l.id))));
    const uncovered = qty(Math.max(0, demand - used - ph.assigned - ph.inProduction));
    const toRegister = qty(Math.max(0, uncovered - pendingReceipt));
    const excess = qty(Math.max(0, used + ph.assigned + ph.inProduction + pendingReceipt - demand));
    return {
      projectId: p.id,
      materialId,
      bom: bomQty,
      extra,
      demand,
      used,
      assigned: ph.assigned,
      inProduction: ph.inProduction,
      pendingReceipt,
      ordered,
      uncovered,
      toRegister,
      excess,
      freeStock: qtyAt(w, FREE, materialId),
      requests: reqs,
      startDate: p.startDate,
      dueDate: p.dueDate,
    };
  });
}

/** Todas las necesidades abiertas, ordenadas por fecha de necesidad (= inicio de la OT). */
export function needRows(w: CoreWorld): NeedRow[] {
  return w.projects
    .flatMap((p) => needRowsOf(w, p))
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.projectId.localeCompare(b.projectId) || a.materialId.localeCompare(b.materialId));
}

export const toBuyRows = (w: CoreWorld) => needRows(w).filter((n) => n.toRegister > EPS);
