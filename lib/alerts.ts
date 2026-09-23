// ─────────────────────────────────────────────────────────────
// Motor de alertas — derivado 100% de los datos, sin estado propio.
// Las únicas entradas son: proyecto, umbrales configurables y fecha de hoy.
// ─────────────────────────────────────────────────────────────
import type { Alert, AlertLevel, AlertSettings, EconomicHealth, Project } from "@/types";
import { projectEconomics, lastRecordDate } from "./calculations";
import { reconciliationSummary } from "./material-reconciliation";
import { CATEGORY_IS_PLURAL, CATEGORY_LABELS } from "./constants";
import { daysBetween, formatCurrency, formatNumber, formatPercent, formatQty, formatSignedCurrency, pluralizeUnit } from "./formatting";

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

function base(project: Project) {
  return { projectId: project.id, projectCode: project.code, projectName: project.name };
}

export function projectAlerts(project: Project, settings: AlertSettings, today: string): Alert[] {
  if (project.status === "completed" || project.status === "quotation") return [];
  const econ = projectEconomics(project);
  const alerts: Alert[] = [];

  // 1. Categorías por encima del presupuesto
  for (const row of econ.categories) {
    const over = row.actual - row.budget;
    if (over <= 0) continue;
    const label = CATEGORY_LABELS[row.category];
    const pl = CATEGORY_IS_PLURAL[row.category];
    if (row.budget === 0) {
      alerts.push({
        ...base(project),
        id: `${project.id}:category:${row.category}:warning`,
        kind: "category",
        level: "warning",
        title: `${label}: costo no presupuestado`,
        message: `${label} registra ${formatSignedCurrency(over)} sin presupuesto asignado.`,
        impactAmount: over,
        expectedMargin: econ.expectedMargin ?? undefined,
        projectedMargin: econ.projectedMargin ?? undefined,
      });
      continue;
    }
    const pct = (over / row.budget) * 100;
    const level = categoryAlertLevel(pct, settings);
    alerts.push({
      ...base(project),
      id: `${project.id}:category:${row.category}:${level}`,
      kind: "category",
      level,
      title: `${label} ${pl ? "superaron" : "superó"} el presupuesto en ${formatPercent(pct, 0)}`,
      message: `${label} ${pl ? "están" : "está"} ${formatCurrency(over)} por encima de lo presupuestado.`,
      impactAmount: over,
      expectedMargin: econ.expectedMargin ?? undefined,
      projectedMargin: econ.projectedMargin ?? undefined,
    });
  }

  // 2. Caída de margen proyectado
  if (econ.marginDeltaPp !== null && econ.marginDeltaPp < -0.05) {
    const drop = -econ.marginDeltaPp;
    const level = marginAlertLevel(drop, settings);
    alerts.push({
      ...base(project),
      id: `${project.id}:margin:${level}`,
      kind: "margin",
      level,
      title: `El margen proyectado cayó ${formatNumber(drop, 1)} puntos`,
      message: `Con los costos registrados hasta hoy, el margen pasó de ${formatPercent(econ.expectedMargin)} a ${formatPercent(econ.projectedMargin)}.`,
      impactAmount: econ.costOverrun,
      expectedMargin: econ.expectedMargin ?? undefined,
      projectedMargin: econ.projectedMargin ?? undefined,
    });
  }

  // 3. Producción sin registros
  if (project.status === "production") {
    const last = lastRecordDate(project) ?? project.startDate;
    const days = daysBetween(last, today);
    if (days >= settings.daysWithoutRecords) {
      alerts.push({
        ...base(project),
        id: `${project.id}:stale:${last}:warning`,
        kind: "stale",
        level: "warning",
        title: "Sin registros recientes",
        message: `Hace ${days} días que no se registran consumos o costos en este proyecto.`,
      });
    }
  }

  // 4. Entrega próxima con poco avance
  const daysLeft = daysBetween(today, project.dueDate);
  if (daysLeft <= settings.dueSoonDays && project.progressPercent < settings.dueSoonProgressPct) {
    alerts.push({
      ...base(project),
      id: `${project.id}:due:${project.dueDate}:warning`,
      kind: "due",
      level: "warning",
      title: daysLeft < 0 ? "Entrega vencida" : "Entrega próxima",
      message:
        daysLeft < 0
          ? `La entrega venció hace ${Math.abs(daysLeft)} días y el avance es ${project.progressPercent}%.`
          : `Faltan ${daysLeft} días para la entrega y el avance es ${project.progressPercent}%.`,
    });
  }

  // 5. Reconciliación de materiales.
  // En producción, lo comprado y aún no usado es normal → info.
  // En instalación la fabricación terminó → lo no explicado pasa a warning.
  if (project.status === "production" || project.status === "installation") {
    const fabricationDone = project.status === "installation";
    for (const row of reconciliationSummary(project).pending) {
      const qty = Math.abs(row.unexplainedQty);
      const missing = row.unexplainedQty > 0;
      const q = formatQty(qty, row.unit);
      alerts.push({
        ...base(project),
        id: `${project.id}:reconciliation:${row.key}:${row.unexplainedQty}`,
        kind: "reconciliation",
        level: missing && fabricationDone ? "warning" : "info",
        title: `Reconciliar ${row.name}`,
        message: !missing
          ? `Se registró uso de ${formatNumber(qty)} ${pluralizeUnit(row.unit, qty)} de ${row.name} como “comprado para el proyecto” por encima de lo comprado.`
          : fabricationDone
            ? `Falta reconciliar ${q} de ${row.name}.`
            : `Falta reconciliar ${q} de ${row.name}: se compraron pero todavía no tienen consumo, desperdicio ni sobrante registrado.`,
      });
    }
  }

  return sortAlerts(alerts);
}

export function sortAlerts(alerts: Alert[]): Alert[] {
  return [...alerts].sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level]);
}

export function allAlerts(projects: Project[], settings: AlertSettings, today: string): Alert[] {
  return sortAlerts(projects.flatMap((p) => projectAlerts(p, settings, today)));
}

/**
 * Estado económico: se basa SOLO en alertas económicas (categoría y margen).
 * Fechas o reconciliación pendiente se muestran aparte, no cambian la salud económica.
 */
export function economicHealth(project: Project, settings: AlertSettings, today: string): EconomicHealth {
  const econ = projectAlerts(project, settings, today).filter((a) => a.kind === "category" || a.kind === "margin");
  if (econ.some((a) => a.level === "critical")) return "risk";
  if (econ.some((a) => a.level === "warning")) return "attention";
  return "healthy";
}

/** Estado económico para proyectos finalizados, según margen real vs. esperado. */
export function closedHealth(dropPp: number | null, settings: AlertSettings): EconomicHealth {
  if (dropPp === null || dropPp < settings.marginWarningPp) return "healthy";
  if (dropPp > settings.marginCriticalPp) return "risk";
  return "attention";
}
