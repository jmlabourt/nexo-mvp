// ─────────────────────────────────────────────────────────────
// Motor de alertas — derivado 100% de los datos, sin estado propio.
// Las únicas entradas son: proyecto, umbrales configurables y fecha de hoy.
// ─────────────────────────────────────────────────────────────
import type { Alert, AlertLevel, AlertSettings, EconomicHealth, Project } from "@/types";
import { projectEconomics, lastRecordDate } from "./calculations";
import { projectSchedule } from "./project-rules";
import { CATEGORY_LABELS, STATUS_LABELS } from "./constants";
import { daysBetween, formatCurrency, formatDays, formatMarginPoints, formatPercent, formatSignedCurrency } from "./formatting";

export const LEVEL_RANK: Record<AlertLevel, number> = { info: 0, warning: 1, critical: 2 };

export function categoryAlertLevel(overPercent: number, s: AlertSettings): AlertLevel {
  if (overPercent > s.categoryCriticalPct) return "critical";
  if (overPercent > s.categoryWarningPct) return "warning";
  return "info";
}

/** dropPp = puntos que cayó el margen (positivo = caída). */
export function marginAlertLevel(dropPp: number, s: AlertSettings): AlertLevel {
  if (dropPp > s.marginCriticalPp) return "critical";
  if (dropPp >= s.marginWarningPp) return "warning";
  return "info";
}

/** Proyecto de una alerta (código y nombre para mostrarla). */
export function alertBase(project: Pick<Project, "id" | "code" | "name">) {
  return { projectId: project.id, projectCode: project.code, projectName: project.name };
}

/**
 * Clave de resolución: la alerta y sus datos (título e importe). "Marcar resuelta" dura hasta que cambie el dato
 * (más horas, otro monto, otro estado): ahí la alerta vuelve. Ya no vence al día siguiente (Auditoría UX · P0-4).
 */
export function alertResolutionKey(alert: Pick<Alert, "id" | "title" | "impactAmount">): string {
  return `${alert.id}~${alert.title}~${Math.round(alert.impactAmount ?? 0)}`;
}

/** Completa la clave de resolución de una alerta. */
export const keyed = (a: Omit<Alert, "resolutionKey">): Alert => ({ ...a, resolutionKey: alertResolutionKey(a) });

/** Qué revisar en el proyecto según la categoría que más se desvía. */
const CATEGORY_ACTION: Record<string, string> = {
  materials: "Proyecto → Materiales: facturas por encima de lo estimado y material consumido.",
  labor: "Proyecto → Costos reales, filtrado por Mano de obra: horas por producto y operario.",
  design: "Proyecto → Costos reales, filtrado por Diseño.",
  admin: "Proyecto → Costos reales, filtrado por Administración.",
  transport: "Proyecto → Costos reales, filtrado por Transporte y fletes.",
  financial: "Proyecto → Costos reales, filtrado por Gasto financiero.",
  unexpected: "Proyecto → Costos reales, filtrado por Imprevistos.",
};

export function projectAlerts(project: Project, settings: AlertSettings, today: string): Alert[] {
  if (project.status === "completed" || project.status === "quotation") return [];
  const econ = projectEconomics(project);
  const alerts: Omit<Alert, "resolutionKey">[] = [];

  // 1. Pérdida de margen: UNA alerta por proyecto (qué pasó, cuánto cuesta, qué revisar). Las categorías por encima
  //    del presupuesto son su causa, no alertas aparte (Auditoría UX · P0-3). Sin alerta por debajo del umbral de Atención.
  const over = econ.categories
    .map((row) => ({ row, amount: row.actual - row.budget }))
    .filter((x) => x.amount > 0)
    .sort((x, y) => y.amount - x.amount);
  if (over.length > 0 && econ.marginDeltaPp !== null && econ.expectedMargin !== null && econ.projectedMargin !== null) {
    const drop = Math.max(0, -econ.marginDeltaPp);
    const catLevels = over.map((x) => (x.row.budget === 0 ? ("warning" as AlertLevel) : categoryAlertLevel((x.amount / x.row.budget) * 100, settings)));
    const level = [marginAlertLevel(drop, settings), ...catLevels].reduce((m, l) => (LEVEL_RANK[l] > LEVEL_RANK[m] ? l : m), "info" as AlertLevel);
    if (level !== "info") {
      const main = over[0];
      const describeCat = (x: (typeof over)[number]) =>
        `${CATEGORY_LABELS[x.row.category]} ${formatSignedCurrency(x.amount)}${x.row.budget > 0 ? ` (${formatPercent((x.amount / x.row.budget) * 100, 0)} sobre lo presupuestado)` : " (sin costo presupuestado)"}`;
      const others = over.slice(1).map(describeCat);
      alerts.push({
        ...alertBase(project),
        id: `${project.id}:margin:${level}`,
        kind: "margin",
        level,
        title: `Pierde ${formatMarginPoints(drop)}: ${formatCurrency(econ.costOverrun)}`,
        message:
          `Margen esperado ${formatPercent(econ.expectedMargin)} → Margen proyectado ${formatPercent(econ.projectedMargin)}. ` +
          `Causa principal: ${describeCat(main)}.${others.length ? ` También: ${others.join("; ")}.` : ""}`,
        impactAmount: econ.costOverrun,
        expectedMargin: econ.expectedMargin,
        projectedMargin: econ.projectedMargin,
        action: CATEGORY_ACTION[main.row.category] ?? "Proyecto → Costos reales.",
        records: over.map((x) => `${CATEGORY_LABELS[x.row.category]}: presupuestado ${formatCurrency(x.row.budget)} · real hasta hoy ${formatCurrency(x.row.actual)}`),
      });
    }
  }

  // 3. Producción sin registros
  if (project.status === "production") {
    const last = lastRecordDate(project) ?? project.startDate;
    const days = daysBetween(last, today);
    if (days >= settings.daysWithoutRecords) {
      alerts.push({
        ...alertBase(project),
        id: `${project.id}:stale:${last}:warning`,
        kind: "stale",
        level: "warning",
        title: "Sin registros recientes",
        message: `Hace ${formatDays(days)} que no se registran consumos o costos en este proyecto: el costo real puede estar incompleto.`,
        action: "Preguntar al Jefe de planta si se está trabajando y si se cargan las horas.",
      });
    }
  }

  // 4. Plazo + etapa (el plazo es tiempo transcurrido, no avance de obra)
  const sched = projectSchedule(project, today);
  const preProduction = project.status === "approved" || project.status === "purchasing";
  if (sched.overdue) {
    alerts.push({
      ...alertBase(project),
      id: `${project.id}:due:${project.dueDate}:critical`,
      kind: "due",
      level: "critical",
      title: "Entrega vencida",
      message: `La entrega venció hace ${formatDays(Math.abs(sched.remainingDays))} y el proyecto sigue en la etapa ${STATUS_LABELS[project.status]}. Es plazo, no costo.`,
      action: "Hablar con el cliente y con el Jefe de planta: nueva fecha y qué falta terminar.",
    });
  } else if (preProduction && sched.remainingDays <= settings.dueSoonDays) {
    alerts.push({
      ...alertBase(project),
      id: `${project.id}:due:${project.dueDate}:warning`,
      kind: "due",
      level: "warning",
      title: `Entrega próxima y todavía en ${STATUS_LABELS[project.status]}`,
      message: `Faltan ${formatDays(sched.remainingDays)} para la entrega y el proyecto aún no pasó a la etapa Producción.`,
      action: "Revisar materiales (Compras) y la planificación del Jefe de planta.",
    });
  } else if (preProduction && sched.elapsedPct >= settings.deadlineNoProductionPct) {
    alerts.push({
      ...alertBase(project),
      id: `${project.id}:deadline:${settings.deadlineNoProductionPct}:warning`,
      kind: "due",
      level: "warning",
      title: "Mucho plazo consumido sin empezar a producir",
      message: `Pasó el ${sched.elapsedPct}% del plazo y el proyecto sigue en la etapa ${STATUS_LABELS[project.status]}.`,
      action: "Revisar materiales (Compras) y la planificación del Jefe de planta.",
    });
  }

  // "Proyecto sin operario asignado" ya no es alerta: lo cubre "Pendientes de asignar" del Jefe de planta.
  // "Material sin consumir" ya no es alerta diaria: aparece al cerrar el proyecto, dentro del cierre (Auditoría UX · P0-3).

  return sortAlerts(alerts.map(keyed));
}

/** Primero lo más grave; dentro del mismo nivel, lo que más cuesta (Auditoría UX: lista priorizada por pesos). */
export function sortAlerts(alerts: Alert[]): Alert[] {
  return [...alerts].sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || (b.impactAmount ?? 0) - (a.impactAmount ?? 0));
}

export function allAlerts(projects: Project[], settings: AlertSettings, today: string): Alert[] {
  return sortAlerts(projects.flatMap((p) => projectAlerts(p, settings, today)));
}

/** Separa abiertas y resueltas. Es la ÚNICA cuenta: el globo, la pestaña "Todas" y la salud salen de acá. */
export function splitAlerts(alerts: Alert[], resolvedKeys: readonly string[]): { open: Alert[]; resolved: Alert[] } {
  const set = new Set(resolvedKeys);
  return { open: alerts.filter((a) => !set.has(a.resolutionKey)), resolved: alerts.filter((a) => set.has(a.resolutionKey)) };
}

/** Número del globo de alertas = cantidad de alertas abiertas (la misma lista que la pestaña "Todas"). */
export function openAlertCount(open: readonly Alert[]): number {
  return open.length;
}

/** ¿Hay datos de ejecución? Consumos de material o costos registrados (las compras no cuentan). */
export function hasExecutionData(project: Pick<Project, "materialUsages" | "actualEntries">): boolean {
  return project.materialUsages.length > 0 || project.actualEntries.length > 0;
}

/**
 * Salud del proyecto según sus alertas ABIERTAS (la regla se explica en Configuración). Los finalizados no llevan chip: null.
 * `openAlerts` puede incluir alertas de otros proyectos; se filtran por id.
 */
export function projectHealth(project: Project, openAlerts: readonly Alert[]): EconomicHealth | null {
  if (project.status === "completed") return null;
  const own = openAlerts.filter((a) => a.projectId === project.id);
  if (own.some((a) => a.level === "critical")) return "risk";
  if (own.some((a) => a.level === "warning")) return "attention";
  if (!hasExecutionData(project)) return "no_data";
  return "healthy";
}
