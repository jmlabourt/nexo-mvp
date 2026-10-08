// ─────────────────────────────────────────────────────────────
// Insights determinísticos (reglas explícitas, sin IA).
// Cada texto se deriva de números visibles en la UI → sin caja negra.
// ─────────────────────────────────────────────────────────────
import type { Project } from "@/types";
import { CATEGORY_LABELS, CATEGORY_ORDER, STATUS_LABELS } from "./constants";
import {
  actualByCategory,
  budgetByCategory,
  materialWasteCost,
  projectEconomics,
  reusedMaterialValue,
} from "./calculations";
import { materialRows } from "./material-reconciliation";
import { projectMaterialFlow } from "./material-flow";
import type { StockState } from "./stock";
import {
  formatCurrency,
  formatMarginPoints,
  formatNumber,
  formatPercent,
  formatQty,
  pluralizeUnit,
} from "./formatting";

export interface Insight {
  tone: "negative" | "positive" | "neutral";
  text: string;
}

/** Título de la tarjeta de lectura rápida: en los finalizados cuenta el cierre. */
export function insightsTitle(project: Pick<Project, "status">): string {
  return project.status === "completed" ? "Cierre: qué pasó" : "Lectura rápida";
}

export function projectInsights(project: Project): Insight[] {
  const econ = projectEconomics(project);
  if (project.status === "completed") return closingInsights(project);
  if (!econ.hasExecutionData) {
    return [
      {
        tone: "neutral",
        text:
          project.status === "quotation" || project.status === "approved"
            ? `El proyecto está en la etapa ${STATUS_LABELS[project.status]}: todavía no hay consumos ni costos registrados. Por ahora solo hay margen esperado.`
            : "Todavía no hay consumos ni costos registrados. Cuando el taller registre, acá vas a ver cómo viene el margen.",
      },
    ];
  }
  const out: Insight[] = [];
  const over = econ.categories
    .filter((c) => c.actual > c.budget)
    .sort((a, b) => b.actual - b.budget - (a.actual - a.budget));

  for (const c of over.slice(0, 3)) {
    const label = CATEGORY_LABELS[c.category];
    const amount = c.actual - c.budget;
    if (c.budget === 0) {
      out.push({ tone: "negative", text: `${label} registra ${formatCurrency(amount)} sin costo presupuestado.` });
    } else if (c === over[0]) {
      out.push({ tone: "negative", text: `${label} está ${formatCurrency(amount)} por encima de lo presupuestado.` });
    } else {
      out.push({
        tone: "negative",
        text: `${label} acumula un desvío del ${formatPercent((amount / c.budget) * 100, 0)}.`,
      });
    }
  }

  if (econ.marginDeltaPp !== null) {
    const d = econ.marginDeltaPp;
    if (d < -0.05) {
      out.push({
        tone: "negative",
        text: `Con los costos registrados hasta hoy, el margen proyectado cayó ${formatMarginPoints(-d)}.`,
      });
    } else {
      out.push({ tone: "positive", text: "Con los costos registrados hasta hoy, el margen proyectado se mantiene." });
    }
  } else if (!econ.hasSalesPrice) {
    out.push({ tone: "neutral", text: "El proyecto no tiene precio de venta: no se puede calcular ganancia ni margen." });
  }

  const pending = econ.categories.filter((c) => c.actual < c.budget && c.budget > 0);
  if (pending.length > 0) {
    const remaining = pending.reduce((s, c) => s + (c.budget - c.actual), 0);
    out.push({
      tone: "neutral",
      text: `Quedan ${formatCurrency(remaining)} del costo presupuestado por gastar (${pending
        .map((c) => CATEGORY_LABELS[c.category])
        .join(", ")}). El margen proyectado asume que se van a gastar.`,
    });
  }
  return out;
}

/** "Cierre: qué pasó" — solo para finalizados: costo real final vs. presupuestado y margen real final. */
export function closingInsights(project: Project): Insight[] {
  const econ = projectEconomics(project);
  const { costText, causeText } = closingSummary(project);
  const out: Insight[] = [{ tone: "neutral", text: costText }];
  if (causeText) out.push({ tone: "neutral", text: causeText });
  if (econ.expectedMargin !== null && econ.finalMargin !== null) {
    const d = econ.finalMargin - econ.expectedMargin;
    out.push({
      tone: d < -0.05 ? "negative" : "positive",
      text:
        Math.abs(d) < 0.05
          ? `El margen real final fue ${formatPercent(econ.finalMargin)}, igual al esperado.`
          : `El margen real final fue ${formatPercent(econ.finalMargin)}: ${formatMarginPoints(Math.abs(d))} ${d < 0 ? "menos" : "más"} que el esperado (${formatPercent(econ.expectedMargin)}).`,
    });
  } else if (!econ.hasSalesPrice) {
    out.push({ tone: "neutral", text: "El proyecto no tenía precio de venta: no hay margen real final." });
  }
  return out;
}

export function materialInsights(project: Project, stock?: StockState): Insight[] {
  const out: Insight[] = [];
  const rows = materialRows(project);
  const flow = stock ? projectMaterialFlow(stock, project.id) : null;
  for (const r of rows) {
    const line = flow?.lines.find((l) => l.key === r.key);
    const bought = line ? line.purchased.qty : r.purchasedQty;
    const extraPurchase = bought - r.budgetQty;
    const recovered = line ? line.recovered.qty + line.transferredOut.qty : r.leftoverQty;
    if (r.budgetQty > 0 && extraPurchase > 0.001 && recovered > 0) {
      out.push({
        tone: "neutral",
        text: `Compraste ${formatQty(extraPurchase, r.unit)} más de ${r.name} que lo presupuestado, pero ${formatQty(
          recovered,
          r.unit,
        )} no se usaron en este proyecto (volvieron al stock o pasaron a otro): no son costo.`,
      });
    }
    if (r.budgetQty > 0 && r.usedQty > r.budgetQty + 0.001) {
      const pct = ((r.usedQty - r.budgetQty) / r.budgetQty) * 100;
      out.push({
        tone: "negative",
        text: `Se usó ${formatPercent(pct, 0)} más ${r.name} de lo presupuestado (${formatNumber(r.usedQty)} vs ${formatNumber(
          r.budgetQty,
        )} ${pluralizeUnit(r.unit, r.budgetQty)}).`,
      });
    }
    if (r.budgetQty === 0 && r.imputedCost > 0) {
      out.push({ tone: "negative", text: `${r.name} no estaba presupuestado y ya imputa ${formatCurrency(r.imputedCost)}.` });
    }
  }
  const waste = materialWasteCost(project.materialUsages);
  if (waste > 0) out.push({ tone: "negative", text: `El desperdicio representa ${formatCurrency(waste)}.` });
  const reused = reusedMaterialValue(project.materialUsages);
  if (reused > 0) {
    out.push({ tone: "positive", text: `Este proyecto utilizó ${formatCurrency(reused)} de material reutilizado.` });
  }
  if (flow && flow.totals.held > 0 && project.status !== "completed") {
    out.push({
      tone: "neutral",
      text: `Hay ${formatCurrency(flow.totals.held)} en material asignado al proyecto que todavía no se consumió. Antes de cerrar hay que darle destino.`,
    });
  }
  return out;
}

/** Textos del cierre: “Este proyecto costó 17,4% más de lo presupuestado.” */
export function closingSummary(project: Project): { costText: string; causeText: string | null } {
  const econ = projectEconomics(project);
  const actual = econ.actualCostToDate;
  const pct = econ.budgetTotal ? ((actual - econ.budgetTotal) / econ.budgetTotal) * 100 : null;
  let costText: string;
  if (pct === null) costText = "El proyecto no tenía costo presupuestado cargado.";
  else if (Math.abs(pct) < 0.05) costText = "El costo real final fue igual al costo presupuestado.";
  else if (pct > 0) costText = `El costo real final fue ${formatPercent(pct)} mayor que el costo presupuestado.`;
  else costText = `El costo real final fue ${formatPercent(-pct)} menor que el costo presupuestado.`;

  const b = budgetByCategory(project.budgetLines);
  const a = actualByCategory(project);
  let worst: { cat: string; amount: number } | null = null;
  for (const c of CATEGORY_ORDER) {
    const d = a[c] - b[c];
    if (d > 0 && (!worst || d > worst.amount)) worst = { cat: CATEGORY_LABELS[c], amount: d };
  }
  return { costText, causeText: worst ? `Principal causa: ${worst.cat.toLowerCase()}.` : null };
}

/** Principal causa de desvío (para tablas). */
export function mainCauseLabel(project: Project): string {
  const econ = projectEconomics(project);
  const row = econ.mainDeviation;
  return row ? CATEGORY_LABELS[row.category] : "—";
}

// ── Aprendizajes del historial ────────────────────────────────

function laborHours(project: Project): { budget: number; actual: number } {
  const budget = project.budgetLines
    .filter((l) => l.category === "labor" && l.unit === "h" && l.quantity !== null)
    .reduce((s, l) => s + (l.quantity ?? 0), 0);
  const actual = project.actualEntries.reduce((s, e) => s + (e.labor?.hours ?? 0), 0);
  return { budget, actual };
}

export function historyLearnings(completed: Project[]): Insight[] {
  const n = completed.length;
  if (n === 0) return [];
  const out: Insight[] = [];

  // Materiales agregados
  let bm = 0;
  let am = 0;
  for (const p of completed) {
    bm += budgetByCategory(p.budgetLines).materials;
    am += actualByCategory(p).materials;
  }
  if (bm > 0) {
    const pct = ((am - bm) / bm) * 100;
    out.push({
      tone: pct > 0 ? "negative" : "positive",
      text: `En los últimos ${n} proyectos, los materiales terminaron ${formatPercent(Math.abs(pct))} ${
        pct >= 0 ? "por encima" : "por debajo"
      } del costo presupuestado.`,
    });
  }

  // Horas
  const withHours = completed.map(laborHours).filter((h) => h.budget > 0);
  if (withHours.length > 0) {
    const exceeded = withHours.filter((h) => h.actual > h.budget).length;
    out.push({
      tone: exceeded > withHours.length / 2 ? "negative" : "neutral",
      text: `${exceeded} de ${withHours.length} proyectos superaron las horas estimadas.`,
    });
  }

  // Categoría con mayor desvío promedio
  let worst: { cat: string; avg: number } | null = null;
  for (const c of CATEGORY_ORDER) {
    const pcts: number[] = [];
    for (const p of completed) {
      const b = budgetByCategory(p.budgetLines)[c];
      if (b > 0) pcts.push(((actualByCategory(p)[c] - b) / b) * 100);
    }
    if (pcts.length === 0) continue;
    const avg = pcts.reduce((s, x) => s + x, 0) / pcts.length;
    if (!worst || avg > worst.avg) worst = { cat: CATEGORY_LABELS[c], avg };
  }
  if (worst && worst.avg > 0) {
    out.push({
      tone: "negative",
      text: `${worst.cat} fue la categoría con mayor desvío promedio (${formatPercent(worst.avg)}).`,
    });
  }

  // Por tipo de proyecto
  const byType = new Map<string, { b: number; a: number; count: number }>();
  for (const p of completed) {
    const t = byType.get(p.projectType) ?? { b: 0, a: 0, count: 0 };
    t.b += budgetByCategory(p.budgetLines).materials;
    t.a += actualByCategory(p).materials;
    t.count += 1;
    byType.set(p.projectType, t);
  }
  for (const [type, t] of byType) {
    if (t.b <= 0) continue;
    const pct = ((t.a - t.b) / t.b) * 100;
    if (Math.abs(pct) < 1) continue;
    out.push({
      tone: pct > 0 ? "negative" : "positive",
      text: `Los proyectos de tipo ${type} utilizaron en promedio ${formatPercent(Math.abs(pct), 0)} ${
        pct > 0 ? "más" : "menos"
      } material de lo presupuestado (${t.count} ${t.count === 1 ? "proyecto" : "proyectos"}).`,
    });
  }
  return out;
}
