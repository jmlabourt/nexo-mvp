// ─────────────────────────────────────────────────────────────
// Insights determinísticos (reglas explícitas, sin IA).
// Cada texto se deriva de números visibles en la UI → sin caja negra.
// ─────────────────────────────────────────────────────────────
import type { Project } from "@/types";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "./constants";
import {
  actualByCategory,
  budgetByCategory,
  materialWasteCost,
  projectEconomics,
  reusedMaterialValue,
} from "./calculations";
import { materialRows } from "./material-reconciliation";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  formatQty,
  pluralizeUnit,
} from "./formatting";

export interface Insight {
  tone: "negative" | "positive" | "neutral";
  text: string;
}

export function projectInsights(project: Project): Insight[] {
  const econ = projectEconomics(project);
  const out: Insight[] = [];
  const over = econ.categories
    .filter((c) => c.actual > c.budget)
    .sort((a, b) => b.actual - b.budget - (a.actual - a.budget));

  for (const c of over.slice(0, 3)) {
    const label = CATEGORY_LABELS[c.category];
    const amount = c.actual - c.budget;
    if (c.budget === 0) {
      out.push({ tone: "negative", text: `${label} registra ${formatCurrency(amount)} sin presupuesto asignado.` });
    } else if (c === over[0]) {
      out.push({ tone: "negative", text: `${label} está ${formatCurrency(amount)} por encima de lo presupuestado.` });
    } else {
      out.push({
        tone: "negative",
        text: `${label} acumula un desvío del ${formatPercent((amount / c.budget) * 100, 0)}.`,
      });
    }
  }

  if (econ.marginDeltaPp !== null && project.status !== "completed") {
    const d = econ.marginDeltaPp;
    if (d < -0.05) {
      out.push({
        tone: "negative",
        text: `Con los costos registrados hasta hoy, el margen proyectado cayó ${formatNumber(-d, 1)} puntos.`,
      });
    } else {
      out.push({ tone: "positive", text: "Con los costos registrados hasta hoy, el margen proyectado se mantiene." });
    }
  }

  const pending = econ.categories.filter((c) => c.actual < c.budget && c.budget > 0);
  if (pending.length > 0 && project.status !== "completed") {
    const remaining = pending.reduce((s, c) => s + (c.budget - c.actual), 0);
    out.push({
      tone: "neutral",
      text: `Quedan ${formatCurrency(remaining)} de presupuesto por ejecutar (${pending
        .map((c) => CATEGORY_LABELS[c.category])
        .join(", ")}). El margen proyectado asume que se consumirán.`,
    });
  }
  return out;
}

export function materialInsights(project: Project): Insight[] {
  const out: Insight[] = [];
  const rows = materialRows(project);
  for (const r of rows) {
    const extraPurchase = r.purchasedQty - r.budgetQty;
    if (r.budgetQty > 0 && extraPurchase > 0.001 && r.leftoverQty > 0) {
      out.push({
        tone: "neutral",
        text: `Compraste ${formatQty(extraPurchase, r.unit)} más de ${r.name} que lo presupuestado, pero ${formatQty(
          r.leftoverQty,
          r.unit,
        )} ${r.leftoverQty === 1 ? "quedó disponible" : "quedaron disponibles"} para futuros proyectos.`,
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
  return out;
}

/** Textos del cierre: “Este proyecto costó 17,4% más de lo presupuestado.” */
export function closingSummary(project: Project): { costText: string; causeText: string | null } {
  const econ = projectEconomics(project);
  const actual = econ.actualCostToDate;
  const pct = econ.budgetTotal ? ((actual - econ.budgetTotal) / econ.budgetTotal) * 100 : null;
  let costText: string;
  if (pct === null) costText = "El proyecto no tenía presupuesto cargado.";
  else if (Math.abs(pct) < 0.05) costText = "Este proyecto costó lo presupuestado.";
  else if (pct > 0) costText = `Este proyecto costó ${formatPercent(pct)} más de lo presupuestado.`;
  else costText = `Este proyecto costó ${formatPercent(-pct)} menos de lo presupuestado.`;

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
      } del presupuesto.`,
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
