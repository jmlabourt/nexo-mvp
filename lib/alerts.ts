// ─────────────────────────────────────────────────────────────
// Motor de alertas — derivado 100% de los datos, sin estado propio.
// Las únicas entradas son: proyecto, umbrales configurables y fecha de hoy.
// ─────────────────────────────────────────────────────────────
import type { Alert, AlertLevel, AlertSettings, EconomicHealth, Project } from "@/types";
import { projectEconomics, lastRecordDate } from "./calculations";
import { projectSchedule } from "./project-rules";
import { projectHoldings, type StockState } from "./stock";
import { CATEGORY_IS_PLURAL, CATEGORY_LABELS, STATUS_LABELS } from "./constants";
import { daysBetween, formatCurrency, formatNumber, formatPercent, formatQty, formatSignedCurrency } from "./formatting";

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

export function projectAlerts(project: Project, settings: AlertSettings, today: string, stock?: StockState): Alert[] {
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

  // 4. Plazo + etapa (el plazo es tiempo transcurrido, no avance de obra)
  const sched = projectSchedule(project, today);
  const preProduction = project.status === "approved" || project.status === "purchasing";
  if (sched.overdue) {
    alerts.push({
      ...base(project),
      id: `${project.id}:due:${project.dueDate}:critical`,
      kind: "due",
      level: "critical",
      title: "Entrega vencida",
      message: `La entrega venció hace ${Math.abs(sched.remainingDays)} días y el proyecto sigue en ${STATUS_LABELS[project.status]}.`,
    });
  } else if (preProduction && sched.remainingDays <= settings.dueSoonDays) {
    alerts.push({
      ...base(project),
      id: `${project.id}:due:${project.dueDate}:warning`,
      kind: "due",
      level: "warning",
      title: `Entrega próxima y todavía en ${STATUS_LABELS[project.status]}`,
      message: `Faltan ${sched.remainingDays} días para la entrega y el proyecto aún no pasó a Producción.`,
    });
  } else if (preProduction && sched.elapsedPct >= settings.deadlineNoProductionPct) {
    alerts.push({
      ...base(project),
      id: `${project.id}:deadline:${settings.deadlineNoProductionPct}:warning`,
      kind: "due",
      level: "warning",
      title: "Mucho plazo consumido sin empezar a producir",
      message: `Pasó el ${sched.elapsedPct}% del plazo y el proyecto sigue en ${STATUS_LABELS[project.status]}.`,
    });
  }

  // 5. Material asignado y sin consumir (sin destino). En producción es normal → info;
  // en instalación la fabricación terminó → hay que darle destino.
  if (stock && (project.status === "production" || project.status === "installation")) {
    const fabricationDone = project.status === "installation";
    const byMaterial = new Map<string, { name: string; unit: string; qty: number; value: number }>();
    for (const h of projectHoldings(stock, project.id)) {
      const cur = byMaterial.get(h.lot.materialId) ?? { name: h.lot.materialName, unit: h.lot.unit, qty: 0, value: 0 };
      cur.qty += h.quantity;
      cur.value += h.quantity * h.lot.unitCost;
      byMaterial.set(h.lot.materialId, cur);
    }
    for (const [key, m] of byMaterial) {
      const q = formatQty(m.qty, m.unit);
      alerts.push({
        ...base(project),
        id: `${project.id}:reconciliation:${key}:${Math.round(m.qty * 1000)}`,
        kind: "reconciliation",
        level: fabricationDone ? "warning" : "info",
        title: `${m.name} sin consumir`,
        message: fabricationDone
          ? `Quedan ${q} asignados al proyecto sin usar. Devolvelos al stock, transferilos, marcalos como sobrante o desperdicio antes de cerrar.`
          : `Hay ${q} de ${m.name} asignados al proyecto que todavía no tienen consumo registrado.`,
        impactAmount: Math.round(m.value),
      });
    }
  }

  return sortAlerts(alerts);
}

export function sortAlerts(alerts: Alert[]): Alert[] {
  return [...alerts].sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level]);
}

export function allAlerts(projects: Project[], settings: AlertSettings, today: string, stock?: StockState): Alert[] {
  return sortAlerts(projects.flatMap((p) => projectAlerts(p, settings, today, stock)));
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
