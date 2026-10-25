// ─────────────────────────────────────────────────────────────
// Alertas por sesión: SOLO hechos comprobables, derivadas de los registros. Una alerta desaparece cuando cambia el
// dato que la causa (no hay "marcar como resuelta"). Un mismo hecho genera una sola alerta por sesión.
// ─────────────────────────────────────────────────────────────
import type { CoreWorld, ISODate, Project } from "./types";
import { capacityRows } from "./capacity";
import { closeCheck, handoverOf, pendingMaterials } from "./closing";
import { pendingAt, scheduleStatus } from "./contract";
import { economics } from "./economics";
import { isWorker, materialName, rubroName, employeeName, itemName } from "./lookup";
import { budgetLinesOf, needRows, publishedBom } from "./needs";
import { linePending, lineReceived } from "./orders";
import { allItemsDone, assignmentHoursByDay, pendingToAssign, releaseBalance, releaseLastActivity, staleReleases } from "./plant";
import { addDays, EPS, money, r2, sumBy } from "./util";
import { formatCurrency as $, formatNumber } from "@/lib/formatting";

export type AlertLevel = "warning" | "critical" | "info";

export interface CoreAlert {
  /** Clave determinística del hecho (tipo + registro). */
  id: string;
  kind: string;
  level: AlertLevel;
  title: string;
  detail: string;
  projectId?: string;
  orderId?: string;
  materialId?: string;
  /** Registros que la causan (trazabilidad). */
  records: string[];
}

const ACTIVE: Project["status"][] = ["approved", "purchasing", "production"];

// ── Gerencia ──

export function gerenciaAlerts(w: CoreWorld, today: ISODate): CoreAlert[] {
  const a: CoreAlert[] = [];
  const th = w.config.alerts;
  for (const p of w.projects.filter((x) => x.baseline && x.status !== "quotation")) {
    const e = economics(w, p, today);
    // 1. Rentabilidad baja.
    if (e.marginPct !== null && e.quotedMarginPct !== null && e.quotedMarginPct - e.marginPct > th.lowMarginPoints) {
      a.push({
        id: `low_margin:${p.id}`,
        kind: "low_margin",
        level: "critical",
        title: `${p.ot}: rentabilidad ${p.status === "closed" ? "final" : "hasta hoy"} ${e.marginPct.toFixed(1)} % (cotizada ${e.quotedMarginPct.toFixed(1)} %)`,
        detail: p.status === "closed" ? "Quedó por debajo de lo cotizado." : "Aun con los costos registrados hasta hoy ya está por debajo de lo cotizado.",
        projectId: p.id,
        records: [p.id],
      });
    }
    if (p.status === "closed") {
      // 8. Entregado con saldo pendiente (también para cerradas).
      const pend = pendingAt(w, p, today);
      if (pend > EPS) a.push({ id: `delivered_balance:${p.id}`, kind: "delivered_balance", level: "warning", title: `${p.ot}: entregado con saldo pendiente`, detail: `Falta cobrar ${$(pend)}.`, projectId: p.id, records: [p.id] });
      continue;
    }
    // 2. Sobrecostos.
    const lines = budgetLinesOf(w, p);
    const budgetMat = money(sumBy(lines.filter((l) => l.kind === "material"), (l) => l.quantity * l.unitCost));
    const budgetHours = r2(sumBy(lines.filter((l) => l.kind === "labor"), (l) => l.quantity));
    const contingency = money(sumBy(p.baseline?.generalCosts ?? [], (g) => g.amount));
    const over: string[] = [];
    if (budgetMat > 0 && e.materials > budgetMat * (1 + th.overcostPct / 100)) over.push(`materiales ${$(e.materials)} vs ${$(budgetMat)} presupuestado`);
    if (budgetHours > 0 && e.laborHours > budgetHours * (1 + th.overcostPct / 100)) over.push(`horas ${formatNumber(e.laborHours)} vs ${formatNumber(budgetHours)} cotizadas`);
    if (e.other > contingency + EPS) over.push(`otros costos ${$(e.other)} vs ${$(contingency)} de provisión`);
    if (over.length) a.push({ id: `overcost:${p.id}`, kind: "overcost", level: "warning", title: `${p.ot}: sobrecosto`, detail: over.join(" · "), projectId: p.id, records: [p.id] });
    // 3. Atrasado.
    if (p.dueDate < today && !handoverOf(w, p.id)) a.push({ id: `late:${p.id}`, kind: "late", level: "critical", title: `${p.ot}: entrega vencida el ${p.dueDate.split("-").reverse().join("/")}`, detail: "Todavía no se registró la entrega al cliente.", projectId: p.id, records: [p.id] });
    // 4. Cobros vencidos.
    const overdue = scheduleStatus(w, p, today).filter((s) => s.overdue);
    if (overdue.length) {
      a.push({
        id: `overdue:${p.id}`,
        kind: "overdue",
        level: "warning",
        title: `${p.ot}: cobro vencido`,
        detail: overdue.map((s) => `${s.payment.label} (vencida ${s.payment.date.split("-").reverse().join("/")}): faltan ${$(s.pending)}`).join(" · "),
        projectId: p.id,
        records: overdue.map((s) => s.payment.id),
      });
    }
    // 8. Entregado con saldo pendiente.
    if (handoverOf(w, p.id) && pendingAt(w, p, today) > EPS) a.push({ id: `delivered_balance:${p.id}`, kind: "delivered_balance", level: "warning", title: `${p.ot}: entregado con saldo pendiente`, detail: `Falta cobrar ${$(pendingAt(w, p, today))}.`, projectId: p.id, records: [p.id] });
    // 9. Lista para revisar cierre.
    if (p.status === "production" && allItemsDone(p)) {
      const c = closeCheck(w, p);
      a.push({
        id: `ready_close:${p.id}`,
        kind: "ready_close",
        level: c.canClose ? "info" : "warning",
        title: `${p.ot}: muebles terminados, ${c.canClose ? "lista para cerrar" : "cierre bloqueado"}`,
        detail: c.canClose ? "Revisá los números y cerrala." : c.blockers.join(" "),
        projectId: p.id,
        records: [p.id],
      });
    }
  }
  // 5. Falta de capacidad futura.
  const horizon = addDays(today, th.capacityWeeks * 7 - 1);
  for (const r of capacityRows(w, today, horizon, today).filter((x) => x.balance < -EPS)) {
    a.push({ id: `capacity:${r.rubroId}`, kind: "capacity", level: "warning", title: `${rubroName(w, r.rubroId)}: falta capacidad`, detail: `Próximas ${th.capacityWeeks} semanas: ${formatNumber(r.capacity)} h laborables y ${formatNumber(r.committed)} h comprometidas.`, records: [r.rubroId] });
  }
  // 6. Materiales faltantes.
  a.push(...missingMaterialAlerts(w, "gerencia"));
  // 7. Datos incompletos exigibles.
  a.push(...incompleteDataAlerts(w, today));
  return a;
}

function missingMaterialAlerts(w: CoreWorld, prefix: string): CoreAlert[] {
  const out: CoreAlert[] = [];
  const rows = needRows(w).filter((n) => n.uncovered > EPS && w.projects.find((p) => p.id === n.projectId)?.status === "production");
  for (const p of w.projects) {
    const mine = rows.filter((n) => n.projectId === p.id);
    if (!mine.length) continue;
    out.push({
      id: `${prefix}:missing:${p.id}`,
      kind: "missing_material",
      level: "warning",
      title: `${p.ot}: en Producción con material faltante`,
      detail: mine.map((n) => `${materialName(w, n.materialId)}: faltan ${n.uncovered}${n.pendingReceipt > EPS ? ` (${n.pendingReceipt} pedido sin recibir)` : ""}`).join(" · "),
      projectId: p.id,
      records: mine.map((n) => `${n.projectId}|${n.materialId}`),
    });
  }
  return out;
}

/** Horas asignadas en días pasados sin ningún registro de esa persona en esa tarea. */
export function assignedWithoutHours(w: CoreWorld, today: ISODate): Array<{ assignmentId: string; employeeId: string; projectId: string; date: ISODate; hours: number }> {
  const out: Array<{ assignmentId: string; employeeId: string; projectId: string; date: ISODate; hours: number }> = [];
  for (const a of w.assignments) {
    for (const [d, h] of assignmentHoursByDay(w, a)) {
      if (d >= today) continue;
      const any = w.timeEntries.some((t) => t.employeeId === a.employeeId && t.date === d);
      if (!any) out.push({ assignmentId: a.id, employeeId: a.employeeId, projectId: a.projectId, date: d, hours: h });
    }
  }
  return out;
}

export const unreviewedEntries = (w: CoreWorld, before: ISODate) =>
  w.timeEntries.filter((t) => !t.review && t.date < before && isWorker(w, w.employees.find((e) => e.id === t.employeeId)));

function incompleteDataAlerts(w: CoreWorld, today: ISODate): CoreAlert[] {
  const out: CoreAlert[] = [];
  const th = w.config.alerts;
  for (const p of w.projects.filter((x) => x.status === "production")) {
    const missing = assignedWithoutHours(w, today).filter((x) => x.projectId === p.id);
    const stale = staleReleases(w, today, th.renditionDays, p.id);
    const unrev = unreviewedEntries(w, addDays(today, -th.reviewDays + 1)).filter((t) => t.projectId === p.id);
    const parts = [
      missing.length ? `${missing.length} jornada${missing.length === 1 ? "" : "s"} asignada${missing.length === 1 ? "" : "s"} sin horas registradas` : "",
      stale.length ? `${stale.length} entrega${stale.length === 1 ? "" : "s"} de material sin novedades de rendición` : "",
      unrev.length ? `${unrev.length} registro${unrev.length === 1 ? "" : "s"} de horas sin revisar` : "",
    ].filter(Boolean);
    if (parts.length) out.push({ id: `incomplete:${p.id}`, kind: "incomplete", level: "info", title: `${p.ot}: datos pendientes de Planta`, detail: parts.join(" · "), projectId: p.id, records: [...missing.map((m) => m.assignmentId), ...stale.map((s) => s.id), ...unrev.map((t) => t.id)] });
  }
  return out;
}

// ── Compras ──

export function comprasAlerts(w: CoreWorld, today: ISODate): CoreAlert[] {
  const a: CoreAlert[] = [];
  const th = w.config.alerts;
  const limit = addDays(today, th.urgentPurchaseDays);
  for (const n of needRows(w).filter((x) => x.toRegister > EPS && x.startDate <= limit)) {
    const p = w.projects.find((x) => x.id === n.projectId) as Project;
    a.push({
      id: `urgent:${n.projectId}:${n.materialId}`,
      kind: "urgent_purchase",
      level: n.startDate <= today ? "critical" : "warning",
      title: `${p.ot}: falta registrar OC de ${materialName(w, n.materialId)}`,
      detail: `Faltan ${n.toRegister}. Inicio de la OT: ${n.startDate}.`,
      projectId: n.projectId,
      materialId: n.materialId,
      records: [`${n.projectId}|${n.materialId}`],
    });
  }
  for (const o of w.orders) {
    const pending = o.lines.filter((l) => linePending(w, l) > EPS);
    if (!pending.length) continue;
    const partial = o.lines.some((l) => lineReceived(w, l.id) > EPS);
    const late = !!o.expectedDate && o.expectedDate < today;
    if (late) {
      a.push({ id: `late_order:${o.id}`, kind: "late_order", level: "warning", title: `${o.number}: atrasada`, detail: `Llegada comprometida ${o.expectedDate}${partial ? " · recibida en parte" : " · sin recibir"}.`, orderId: o.id, records: pending.map((l) => l.id) });
    } else if (partial) {
      a.push({ id: `partial:${o.id}`, kind: "partial_receipt", level: "info", title: `${o.number}: entrega incompleta`, detail: pending.map((l) => `${materialName(w, l.materialId)}: faltan ${linePending(w, l)}`).join(" · "), orderId: o.id, records: pending.map((l) => l.id) });
    }
  }
  a.push(...missingMaterialAlerts(w, "compras"));
  return a;
}

// ── Jefe de planta ──

export function plantaAlerts(w: CoreWorld, today: ISODate): CoreAlert[] {
  const a: CoreAlert[] = [];
  const th = w.config.alerts;
  const week = addDays(today, 7);
  // 1. Trabajos sin operario (próximos 7 días).
  const pend = pendingToAssign(w, today).filter((x) => x.date <= week);
  for (const p of w.projects) {
    const mine = pend.filter((x) => x.projectId === p.id);
    if (mine.length)
      a.push({
        id: `unassigned:${p.id}`,
        kind: "unassigned",
        level: "warning",
        title: `${p.ot}: trabajo planificado sin operario`,
        detail: mine.map((x) => `${x.date} · ${itemName(p, x.itemId)} · ${rubroName(w, x.rubroId)}: ${x.pending} h`).join(" · "),
        projectId: p.id,
        records: mine.map((x) => `${x.projectId}|${x.itemId}|${x.rubroId}|${x.date}`),
      });
  }
  // 2. Materiales faltantes para trabajos planificados.
  const needs = needRows(w).filter((n) => n.uncovered > EPS);
  for (const p of w.projects.filter((x) => x.status === "production")) {
    const bom = publishedBom(w, p.id);
    const planned = w.plans.filter((x) => x.projectId === p.id && x.date >= today && x.date <= week);
    const missing = new Set<string>();
    for (const pl of planned) for (const l of bom?.lines.filter((x) => x.itemId === pl.itemId && x.rubroId === pl.rubroId) ?? []) if (needs.some((n) => n.projectId === p.id && n.materialId === l.materialId)) missing.add(l.materialId);
    if (missing.size)
      a.push({ id: `plan_missing:${p.id}`, kind: "plan_missing", level: "warning", title: `${p.ot}: falta material para trabajos planificados`, detail: [...missing].map((m) => materialName(w, m)).join(", "), projectId: p.id, records: [...missing] });
  }
  // 3. Horas pendientes de revisión o de registro.
  const unrev = unreviewedEntries(w, today);
  const noHours = assignedWithoutHours(w, today);
  if (unrev.length || noHours.length) {
    const people = [...new Set([...unrev.map((t) => t.employeeId), ...noHours.map((x) => x.employeeId)])];
    a.push({
      id: `hours_review`,
      kind: "hours_review",
      level: "info",
      title: "Horas pendientes de revisión o de registro",
      detail: `${unrev.length} registro${unrev.length === 1 ? "" : "s"} sin revisar · ${noHours.length} jornada${noHours.length === 1 ? "" : "s"} asignada${noHours.length === 1 ? "" : "s"} sin horas · ${people.map((id) => employeeName(w, id)).join(", ")}`,
      records: [...unrev.map((t) => t.id), ...noHours.map((x) => `${x.assignmentId}|${x.date}`)],
    });
  }
  // 4. Materiales pendientes de rendición.
  for (const p of w.projects.filter((x) => x.status === "production")) {
    const stale = staleReleases(w, today, th.renditionDays, p.id);
    const finished = allItemsDone(p) ? pendingMaterials(w, p.id) : [];
    if (stale.length || finished.length) {
      const parts = [
        ...stale.map((r) => `${materialName(w, r.materialId)}: ${releaseBalance(w, r).inProduction} en producción sin novedades desde ${releaseLastActivity(w, r)}`),
        ...finished.filter((m) => m.assigned > EPS).map((m) => `${materialName(w, m.materialId)}: ${m.assigned} asignado sin usar`),
      ];
      a.push({ id: `rendition:${p.id}`, kind: "rendition", level: allItemsDone(p) ? "critical" : "warning", title: `${p.ot}: material pendiente de rendición`, detail: [...new Set(parts)].join(" · "), projectId: p.id, records: stale.map((r) => r.id) });
    }
  }
  // 5. Atrasos: entrega vencida con producción incompleta.
  for (const p of w.projects.filter((x) => x.status === "production" && x.dueDate < today)) {
    const c = closeCheck(w, p);
    if (!allItemsDone(p) || !handoverOf(w, p.id) || pendingMaterials(w, p.id).length)
      a.push({ id: `plant_late:${p.id}`, kind: "plant_late", level: "critical", title: `${p.ot}: entrega vencida el ${p.dueDate.split("-").reverse().join("/")}`, detail: c.blockers.filter((b) => !b.includes("sin revisar")).join(" "), projectId: p.id, records: [p.id] });
  }
  return a;
}

// ── Administración: "Pendientes" (solo estos cuatro tipos) ──

export interface AdminPending {
  quotes: Project[];
  bom: Project[];
  incomplete: Array<{ project: Project; missing: string[] }>;
  deliveries: Array<{ project: Project; late: boolean; done: number; total: number }>;
}

export function adminPending(w: CoreWorld, today: ISODate): AdminPending {
  const quotes = w.projects.filter((p) => p.status === "quotation" && (p.quote.state === "sent" || p.quote.state === "negotiating"));
  const bom = w.projects.filter((p) => p.status === "approved");
  const incomplete = w.projects
    .filter((p) => ACTIVE.includes(p.status) || (p.status === "quotation" && (p.quote.state === "sent" || p.quote.state === "negotiating")))
    .map((p) => {
      const missing: string[] = [];
      if (!p.startDate) missing.push("fecha de inicio");
      if (!p.dueDate) missing.push("fecha de entrega");
      if (p.items.length === 0) missing.push("muebles");
      if (p.status === "quotation" && p.quote.plan.length === 0) missing.push("seña y cuotas");
      if (p.status !== "quotation" && p.schedule.length === 0) missing.push("cobros previstos");
      for (const i of p.items) if (!(p.baseline?.lines ?? p.quote.lines).some((l) => l.itemId === i.id)) missing.push(`rubros de ${i.name}`);
      return { project: p, missing };
    })
    .filter((x) => x.missing.length);
  const soon = addDays(today, w.config.alerts.dueSoonDays);
  const deliveries = w.projects
    .filter((p) => ACTIVE.includes(p.status) && !handoverOf(w, p.id) && p.dueDate <= soon)
    .map((p) => ({ project: p, late: p.dueDate < today, done: sumBy(p.items, (i) => i.completedUnits), total: sumBy(p.items, (i) => i.quantity) }))
    .sort((a, b) => a.project.dueDate.localeCompare(b.project.dueDate));
  return { quotes, bom, incomplete, deliveries };
}

