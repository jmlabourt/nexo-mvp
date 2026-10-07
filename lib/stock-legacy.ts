// ─────────────────────────────────────────────────────────────
// Migración de datos históricos al ledger de stock.
// Los proyectos existentes tienen compras, usos y un pool de sobrantes en el modelo
// anterior. Esta función los traduce a lotes y movimientos SIN modificar ni borrar
// nada de lo original: sólo agrega el ledger. Es determinística (mismos ids siempre).
// ─────────────────────────────────────────────────────────────
import type { Project, ReusableMaterial, StockLot, StockMovement } from "@/types";
import { materialKey } from "./material-reconciliation";
import {
  EMPTY_STOCK,
  EPS,
  applyChange,
  assignToProject,
  markLeftover,
  projectHoldings,
  receiveStock,
  consumeMaterial,
  warehouseHoldings,
  writeOff,
  r3,
  type StockCtx,
  type StockState,
} from "./stock";

interface Event {
  at: string;
  order: number;
  project: Project;
  kind: "purchase" | "usage";
  index: number;
}

/** Ids estables: lot-1, lot-2…, mov-1, mov-2… según el orden de creación. */
function renumber(state: StockState): StockState {
  const lotIds = new Map(state.lots.map((l, i) => [l.id, `lg-lot-${i + 1}`]));
  const lots: StockLot[] = state.lots.map((l) => ({
    ...l,
    id: lotIds.get(l.id) ?? l.id,
    parentLotId: l.parentLotId ? lotIds.get(l.parentLotId) : undefined,
  }));
  const groupIds = new Map<string, string>();
  const movements: StockMovement[] = state.movements.map((m, i) => {
    let groupId = m.groupId;
    if (groupId) {
      if (!groupIds.has(groupId)) groupIds.set(groupId, `lg-grp-${groupIds.size + 1}`);
      groupId = groupIds.get(groupId);
    }
    return {
      ...m,
      id: `lg-mov-${i + 1}`,
      lotId: lotIds.get(m.lotId) ?? m.lotId,
      intoLotId: m.intoLotId ? lotIds.get(m.intoLotId) : undefined,
      groupId,
    };
  });
  return { lots, movements };
}

export function deriveLedgerFromLegacy(projects: Project[], pool: ReusableMaterial[]): StockState {
  let state: StockState = EMPTY_STOCK;
  const events: Event[] = [];
  let order = 0;
  for (const project of projects) {
    project.purchaseEntries.forEach((p, index) =>
      events.push({ at: p.createdAt, order: order++, project, kind: "purchase", index }),
    );
    project.materialUsages.forEach((u, index) =>
      events.push({ at: u.createdAt, order: order++, project, kind: "usage", index }),
    );
  }
  events.sort((a, b) => a.at.localeCompare(b.at) || a.order - b.order);

  for (const ev of events) {
    const p = ev.project;
    if (ev.kind === "purchase") {
      const e = p.purchaseEntries[ev.index];
      const ctx: StockCtx = { actor: e.createdBy, now: e.createdAt };
      const r = receiveStock(
        {
          materialId: materialKey(e.materialId, e.materialName),
          materialName: e.materialName,
          unit: e.unit,
          quantity: e.quantity,
          unitCost: e.unitCost,
          supplier: e.supplier,
          date: e.date,
          destination: { projectId: p.id, projectName: `${p.code} · ${p.name}` },
          purchaseEntryId: e.id,
        },
        ctx,
        { allowZeroCost: true },
      );
      state = applyChange(state, r);
      continue;
    }

    const u = p.materialUsages[ev.index];
    const ctx: StockCtx = { actor: u.createdBy, now: u.createdAt };
    const key = materialKey(u.materialId, u.materialName);
    const total = r3(u.quantityConsumed + u.wasteQuantity);
    const base = { materialId: key, materialName: u.materialName, unit: u.unit, unitCost: u.unitCost, date: u.date };
    const projectDest = { projectId: p.id, projectName: `${p.code} · ${p.name}` };
    let lotIds: string[] | undefined;

    // 1) Que el proyecto tenga asignado el material que usó.
    if (u.source === "purchased_for_project") {
      const held = projectHoldings(state, p.id)
        .filter((h) => h.lot.materialId === key)
        .reduce((s, h) => s + h.quantity, 0);
      const need = r3(total + u.reusableLeftoverQuantity - held);
      if (need > EPS) {
        const r = receiveStock({ ...base, quantity: need, kind: "opening", destination: projectDest }, ctx, { allowZeroCost: true });
        state = applyChange(state, r);
      }
    } else {
      const supplied: string[] = [];
      let left = total;
      if (u.source === "reused_leftover") {
        for (const h of warehouseHoldings(state).filter((x) => x.lot.materialId === key && x.lot.kind === "leftover")) {
          if (left <= EPS) break;
          const take = Math.min(h.quantity, left);
          state = applyChange(state, assignToProject(state, { projectId: p.id, materialId: key, quantity: take, lotId: h.lot.id, date: u.date }, ctx));
          supplied.push(h.lot.id);
          left = r3(left - take);
        }
      }
      if (left > EPS) {
        const r = receiveStock({ ...base, quantity: left, kind: "opening", destination: "warehouse" }, ctx, { allowZeroCost: true });
        state = applyChange(state, r);
        state = applyChange(state, assignToProject(state, { projectId: p.id, materialId: key, quantity: left, lotId: r.lot.id, date: u.date }, ctx));
        supplied.push(r.lot.id);
      }
      lotIds = supplied;
    }

    // 2) Consumo y desperdicio.
    if (total > EPS) {
      state = applyChange(
        state,
        consumeMaterial(state, { projectId: p.id, materialId: key, consumed: u.quantityConsumed, waste: u.wasteQuantity, lotIds, date: u.date }, ctx),
      );
    }

    // 3) Sobrante generado (queda libre en el depósito, con su valor).
    if (u.reusableLeftoverQuantity > EPS) {
      let leftoverLots: string[] | undefined;
      if (u.source !== "purchased_for_project") {
        // En el modelo anterior el sobrante de un uso "de stock" se sumaba al pool sin descontar nada.
        const r = receiveStock(
          { ...base, quantity: u.reusableLeftoverQuantity, kind: "opening", destination: projectDest },
          ctx,
          { allowZeroCost: true },
        );
        state = applyChange(state, r);
        leftoverLots = [r.lot.id];
      }
      state = applyChange(
        state,
        markLeftover(state, { projectId: p.id, materialId: key, quantity: u.reusableLeftoverQuantity, lotIds: leftoverLots, date: u.date }, ctx),
      );
    }
  }

  // 4) El pool actual es la verdad de lo que queda como sobrante: se ajusta la diferencia.
  const sysCtx: StockCtx = { actor: "Migración", now: new Date(0).toISOString() };
  const keys = new Set<string>([
    ...pool.map((x) => materialKey(x.materialId, x.materialName)),
    ...warehouseHoldings(state).filter((h) => h.lot.kind === "leftover").map((h) => h.lot.materialId),
  ]);
  for (const key of [...keys].sort()) {
    const derived = warehouseHoldings(state)
      .filter((h) => h.lot.materialId === key && h.lot.kind === "leftover")
      .reduce((s, h) => s + h.quantity, 0);
    const actual = pool.filter((x) => materialKey(x.materialId, x.materialName) === key).reduce((s, x) => s + x.quantity, 0);
    const diff = r3(derived - actual);
    if (diff > EPS) {
      const lotIds = warehouseHoldings(state).filter((h) => h.lot.materialId === key && h.lot.kind === "leftover").map((h) => h.lot.id);
      state = applyChange(
        state,
        writeOff(state, { from: "warehouse", materialId: key, quantity: diff, lotIds, note: "Ajuste histórico: sobrante utilizado fuera de un proyecto." }, sysCtx),
      );
    } else if (diff < -EPS) {
      const sample = pool.find((x) => materialKey(x.materialId, x.materialName) === key);
      if (sample) {
        const r = receiveStock(
          { materialId: key, materialName: sample.materialName, unit: sample.unit, unitCost: sample.unitCost, quantity: -diff, kind: "opening", destination: "warehouse", date: sample.createdAt.slice(0, 10) },
          { actor: "Migración", now: sample.createdAt },
          { allowZeroCost: true },
        );
        state = applyChange(state, { lots: [{ ...r.lot, kind: "leftover", originProjectId: sample.originProjectId, originProjectName: sample.originProjectName }], movements: r.movements });
      }
    }
  }

  // 5) Proyectos cerrados no pueden dejar material "en el aire": lo histórico sin destino se ajusta.
  for (const p of projects.filter((x) => x.isClosed)) {
    for (const h of projectHoldings(state, p.id)) {
      state = applyChange(
        state,
        writeOff(state, { from: { projectId: p.id }, materialId: h.lot.materialId, quantity: h.quantity, lotId: h.lot.id, note: "Histórico: el proyecto se cerró sin registrar el destino de este material." }, sysCtx),
      );
    }
  }

  return renumber(state);
}
