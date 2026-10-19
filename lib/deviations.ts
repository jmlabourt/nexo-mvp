// Desvíos detectados (Auditoría UX · P0-1 opción b). Funciones puras.
//
// Lo que el taller y Compras ya saben y todavía no entra en el Margen proyectado:
//  - Horas de más por producto + rubro × el costo por hora de esas mismas horas cargadas.
//  - Facturas por encima del costo unitario estimado del material en el proyecto.
//
// NO cambia el cálculo del Margen proyectado: se muestra AL LADO, como "Desvíos detectados aún no proyectados",
// y nunca se mezcla con Margen esperado, Margen proyectado ni Margen real final.
//
// "Aún no proyectado" = lo detectado que el proyectado de su categoría todavía no cubre:
//   max(0, detectado − desvío proyectado de la categoría). Así nada se cuenta dos veces.
import type { Alert, Project, RubroId, WorkAssignment } from "@/types";
import { keyed } from "./alerts";
import { formatCurrency, formatMarginPoints } from "./formatting";
import { categoryBreakdown } from "./calculations";
import { productRubroHours, type Threshold } from "./plant";
import { overBudgetPurchases, type OverBudgetPurchase } from "./purchasing";
import { rubroLabel } from "./rubros";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Horas de más de un producto + rubro, valorizadas con el costo por hora de lo cargado ahí. */
export interface HoursOverrun {
  projectId: string;
  itemId: string;
  itemName: string;
  rubro: RubroId;
  estimated: number;
  actual: number;
  over: number;
  /** Costo por hora promedio de las horas cargadas en ese producto + rubro (monto ÷ horas). */
  hourlyCost: number;
  cost: number;
}

/** Sin umbral: toda hora por encima de lo estimado cuesta plata (el umbral es para alertar, no para sumar). */
const NO_THRESHOLD: Threshold = { pct: 0, hours: 0 };

export function hoursOverruns(project: Project, assignments: WorkAssignment[], today: string): HoursOverrun[] {
  return productRubroHours(project, assignments, NO_THRESHOLD, today)
    .filter((r) => r.over > 0)
    .map((r) => {
      const entries = project.actualEntries.filter((e) => e.type === "labor" && e.itemId === r.itemId && e.rubro === r.rubro);
      const hours = entries.reduce((s, e) => s + (e.labor?.hours ?? 0), 0);
      const amount = entries.reduce((s, e) => s + e.amount, 0);
      const hourlyCost = hours > 0 ? round2(amount / hours) : 0;
      return {
        projectId: project.id,
        itemId: r.itemId,
        itemName: r.itemName,
        rubro: r.rubro,
        estimated: r.estimated,
        actual: r.actual,
        over: r.over,
        hourlyCost,
        cost: round2(r.over * hourlyCost),
      };
    });
}

export interface DetectedDeviations {
  hours: HoursOverrun[];
  invoices: OverBudgetPurchase[];
  hoursCost: number;
  invoicesCost: number;
  /** Lo detectado que el Margen proyectado todavía no incluye (por categoría, sin contar dos veces). */
  notProjected: { labor: number; materials: number; total: number };
  /** notProjected.total en puntos de margen sobre el precio de venta. null sin precio de venta. */
  points: number | null;
}

/** Mano de obra, Diseño y Administración son horas: su desvío proyectado cubre las horas de más. */
const HOUR_CATEGORIES = ["labor", "design", "admin"] as const;

export function detectedDeviations(project: Project, assignments: WorkAssignment[], today: string): DetectedDeviations {
  const empty = { hours: [], invoices: [], hoursCost: 0, invoicesCost: 0, notProjected: { labor: 0, materials: 0, total: 0 }, points: null };
  if (project.isClosed || project.status === "completed" || project.status === "quotation") return empty;
  const hours = hoursOverruns(project, assignments, today);
  const invoices = overBudgetPurchases([project]);
  const hoursCost = round2(hours.reduce((s, h) => s + h.cost, 0));
  const invoicesCost = round2(invoices.reduce((s, i) => s + i.overBy, 0));
  const rows = categoryBreakdown(project);
  const projectedOver = (cats: readonly string[]) =>
    rows.filter((r) => cats.includes(r.category)).reduce((s, r) => s + Math.max(0, r.projectedVariance.amount), 0);
  const labor = round2(Math.max(0, hoursCost - projectedOver(HOUR_CATEGORIES)));
  const materials = round2(Math.max(0, invoicesCost - projectedOver(["materials"])));
  const total = round2(labor + materials);
  return {
    hours,
    invoices,
    hoursCost,
    invoicesCost,
    notProjected: { labor, materials, total },
    points: project.salesPrice > 0 ? (total / project.salesPrice) * 100 : null,
  };
}

/** "Mesa de comedor · Carpintería madera: 14 h de más × $ 15.000/h". Texto para "De dónde sale". */
export function hoursOverrunLabel(h: HoursOverrun): string {
  return `${h.itemName} · ${rubroLabel(h.rubro)}: ${h.over} h de más`;
}

/**
 * Alertas del Administrativo con su costo: a las de horas de más les suma cuánto cuestan (horas de más × costo por
 * hora de esas horas) y a todas las que tienen importe, los puntos de margen sobre el precio de venta.
 * El Jefe de planta usa las mismas alertas SIN pasar por acá: nunca ve importes.
 */
export function withEconomicImpact(alerts: Alert[], projects: Project[], assignments: WorkAssignment[], today: string): Alert[] {
  const byId = new Map(projects.map((p) => [p.id, p]));
  const overruns = new Map<string, HoursOverrun[]>();
  const overrunsOf = (p: Project) => {
    if (!overruns.has(p.id)) overruns.set(p.id, hoursOverruns(p, assignments, today));
    return overruns.get(p.id)!;
  };
  return alerts.map((a) => {
    const p = byId.get(a.projectId);
    if (!p) return a;
    let next: Omit<Alert, "resolutionKey"> = a;
    if (a.kind === "hours") {
      const h = overrunsOf(p).find((x) => a.id.startsWith(`${p.id}:hours:${x.itemId}:${x.rubro}:`));
      if (h && h.cost > 0) {
        next = {
          ...a,
          impactAmount: h.cost,
          // El monto lo muestra la línea "Cuesta"; acá solo de dónde sale, para no repetirlo.
          message: `${a.message} Se valoriza ${h.over} h × ${formatCurrency(h.hourlyCost)} por hora cargada.`,
        };
      }
    }
    if (next.impactAmount !== undefined && next.impactAmount > 0 && p.salesPrice > 0) {
      next = { ...next, impactPoints: (next.impactAmount / p.salesPrice) * 100 };
    }
    return next === a ? a : keyed(next);
  });
}

/** "$ 720.000 (≈ 4,5 puntos de margen)". */
export function costWithPoints(amount: number, points: number | null | undefined): string {
  return points === null || points === undefined ? formatCurrency(amount) : `${formatCurrency(amount)} (≈ ${formatMarginPoints(points)})`;
}
