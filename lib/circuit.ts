// ─────────────────────────────────────────────────────────────
// Circuito entre sesiones — funciones puras.
// Camino por defecto de un proyecto: Administración cotiza → el cliente aprueba, renegocia o no aprueba → Diseño
// (corrige materiales y adjunta planos) → Compras → Jefe de planta → listo → Administración define la entrega →
// Gerencia cierra. Usa las etapas que ya guarda la base (Cotización, Aprobado, Compras, Producción, Instalación,
// Finalizado): "en negociación" y "no aprobado" son subestados de Cotización y quedan en el historial del proyecto;
// los cambios de cantidades de Diseño son correcciones auditadas de la línea del costo presupuestado.
// ─────────────────────────────────────────────────────────────
import type { ActivityEvent, Alert, BudgetLine, Project, ValueCorrection } from "@/types";
import { activity } from "./activity";
import { alertBase, keyed } from "./alerts";
import { formatCurrency, formatNumber } from "./formatting";
import { DomainError, type Ctx } from "./project-operations";

const round2 = (v: number) => Math.round(v * 100) / 100;

// ── Subestados comerciales (dentro de En cotización) ──

export type CommercialState = "quoted" | "negotiation" | "rejected";

/** El último evento comercial manda: una renegociación, un "no aprobado" o un cambio de etapa (que lo deja atrás). */
export function commercialState(project: Pick<Project, "status" | "activity">): CommercialState {
  if (project.status !== "quotation") return "quoted";
  const last = [...project.activity]
    .filter((e) => e.kind === "negotiation" || e.kind === "rejected" || e.kind === "status")
    .sort((a, b) => b.at.localeCompare(a.at))[0];
  return last?.kind === "negotiation" ? "negotiation" : last?.kind === "rejected" ? "rejected" : "quoted";
}

const reasonError = (reason: string) => (reason.trim().length < 3 ? "Escribí el motivo." : null);

function withEvent(project: Project, event: ActivityEvent, patch: Partial<Project> = {}): Project {
  return { ...project, ...patch, updatedAt: event.at, activity: [event, ...project.activity] };
}

/** No aprobado: termina ahí, con el motivo guardado en el historial. Sigue En cotización (subestado). */
export function recordRejection(project: Project, reason: string, ctx: Ctx): Project {
  if (project.status !== "quotation") throw new DomainError("Solo un proyecto en cotización puede quedar como no aprobado.");
  const error = reasonError(reason);
  if (error) throw new DomainError(error);
  return withEvent(project, activity("rejected", ctx.actor, `No aprobado por el cliente. Motivo: ${reason.trim()}`, ctx.now));
}

/** Renegociación de precio: vuelve a cotización con el precio nuevo; el anterior queda en el historial. */
export function recordRenegotiation(project: Project, newPrice: number, reason: string, ctx: Ctx): Project {
  if (project.status !== "quotation") throw new DomainError("El precio se renegocia mientras el proyecto está en cotización.");
  if (!(newPrice > 0)) throw new DomainError("El precio nuevo tiene que ser mayor a cero.");
  if (newPrice === project.salesPrice) throw new DomainError("El precio nuevo es igual al actual.");
  const error = reasonError(reason);
  if (error) throw new DomainError(error);
  const msg = `Renegociación de precio: ${formatCurrency(project.salesPrice)} → ${formatCurrency(newPrice)}. Motivo: ${reason.trim()}`;
  return withEvent(project, activity("negotiation", ctx.actor, msg, ctx.now), { salesPrice: newPrice });
}

// ── Proyecto listo y entrega ──

/** Todas las unidades de todos los muebles terminadas (las carga el Jefe de planta). */
export function allUnitsDone(project: Pick<Project, "items">): boolean {
  return project.items.length > 0 && project.items.every((i) => i.completedUnits >= i.quantity);
}

export type DeliveryChoice = "pickup" | "freight" | "finish";

export const DELIVERY_LABELS: Record<DeliveryChoice, string> = {
  pickup: "Se queda en planta para retiro",
  freight: "Va con flete e instalación",
  finish: "Se finaliza",
};

const DELIVERY_PREFIX = "Entrega definida: ";

/** Decisión de entrega de Administración (la última manda), o null si todavía no se definió. */
export function deliveryDecision(project: Pick<Project, "activity">): DeliveryChoice | null {
  const last = [...project.activity].filter((e) => e.kind === "delivery").sort((a, b) => b.at.localeCompare(a.at))[0];
  if (!last) return null;
  const found = (Object.keys(DELIVERY_LABELS) as DeliveryChoice[]).find((k) => last.message.startsWith(`${DELIVERY_PREFIX}${DELIVERY_LABELS[k]}`));
  return found ?? null;
}

/** Administración define qué se hace con el proyecto listo. "Flete e instalación" además pasa a la etapa Instalación. */
export function recordDeliveryDecision(project: Project, choice: DeliveryChoice, ctx: Ctx, note = ""): Project {
  if (project.isClosed) throw new DomainError("El proyecto ya está cerrado.");
  const msg = `${DELIVERY_PREFIX}${DELIVERY_LABELS[choice]}.${note.trim() ? ` ${note.trim()}` : ""}${choice === "finish" ? " Gerencia lo cierra." : ""}`;
  return withEvent(project, activity("delivery", ctx.actor, msg, ctx.now));
}

// ── Etapa del circuito (lo que ve cada sesión) ──

export type CircuitStage = "quotation" | "negotiation" | "rejected" | "design" | "purchasing" | "production" | "ready" | "delivery" | "closed";

export const CIRCUIT_LABELS: Record<CircuitStage, string> = {
  quotation: "En cotización",
  negotiation: "En negociación",
  rejected: "No aprobado",
  design: "Aprobado · en Diseño",
  purchasing: "En proceso · Compras",
  production: "En proceso · Planta",
  ready: "Listo para definir entrega",
  delivery: "Entrega definida",
  closed: "Finalizado",
};

export function circuitStage(project: Pick<Project, "status" | "isClosed" | "activity" | "items">): CircuitStage {
  if (project.isClosed || project.status === "completed") return "closed";
  if (project.status === "quotation") {
    const c = commercialState(project);
    return c === "quoted" ? "quotation" : c;
  }
  if (project.status === "approved") return "design";
  if (project.status === "purchasing") return "purchasing";
  if (deliveryDecision(project)) return "delivery";
  if (project.status === "installation" || allUnitsDone(project)) return "ready";
  return "production";
}

// ── Cambios de materiales de Diseño (cotizado → real) ──

export interface MaterialChange {
  projectId: string;
  lineId: string;
  description: string;
  unit: string;
  /** Mueble de la línea (de las notas de la cotización), o null en líneas sin mueble. */
  furniture: string | null;
  quotedQty: number;
  realQty: number;
  /** realQty − quotedQty (positivo = aumentó). */
  diff: number;
  /** Costo unitario cotizado de la línea. */
  unitCost: number;
  /** diff × costo unitario cotizado: lo que cuesta el cambio de cantidad. */
  amount: number;
  reason: string | null;
  changedBy: string | null;
  changedAt: string | null;
}

const FURNITURE_NOTE = /^Mueble: (.+?) × \d+(?:[.,]\d+)?(?: · |$)/;

/** Mueble de una línea de materiales: la cotización por mueble lo deja en las notas ("Mueble: Mesa × 10"). */
export function lineFurniture(line: Pick<BudgetLine, "notes">): string | null {
  return line.notes?.match(FURNITURE_NOTE)?.[1] ?? null;
}

const quantityCorrections = (corrections: readonly ValueCorrection[], projectId: string, lineId: string) =>
  corrections
    .filter((c) => c.projectId === projectId && c.target === "budget_line" && c.lineId === lineId && c.field === "quantity")
    .sort((a, b) => a.correctedAt.localeCompare(b.correctedAt));

/**
 * Cantidad cotizada de una línea: la del presupuesto base (se congela al aprobar); si no hay base, el valor anterior a
 * la primera corrección de cantidad; si tampoco, la cantidad actual (no cambió).
 */
function quotedQuantity(project: Pick<Project, "id" | "baseline">, line: BudgetLine, corrections: readonly ValueCorrection[]): number | null {
  const base = project.baseline?.lines.find((l) => l.id === line.id);
  if (base) return base.quantity;
  const first = quantityCorrections(corrections, project.id, line.id)[0];
  return first ? first.oldValue : line.quantity;
}

/** Materiales cuya cantidad real (corregida por Diseño) difiere de la cotizada, con el motivo y quién lo cambió. */
export function materialChanges(project: Pick<Project, "id" | "baseline" | "budgetLines">, corrections: readonly ValueCorrection[]): MaterialChange[] {
  return project.budgetLines.flatMap((line) => {
    if (line.category !== "materials" || line.quantity === null) return [];
    const quoted = quotedQuantity(project, line, corrections);
    if (quoted === null || Math.abs(quoted - line.quantity) < 1e-9) return [];
    const last = quantityCorrections(corrections, project.id, line.id).at(-1);
    const diff = round2(line.quantity - quoted);
    return [
      {
        projectId: project.id,
        lineId: line.id,
        description: line.description,
        unit: line.unit,
        furniture: lineFurniture(line),
        quotedQty: quoted,
        realQty: line.quantity,
        diff,
        unitCost: line.unitCost,
        amount: round2(diff * line.unitCost),
        reason: last?.reason ?? null,
        changedBy: last?.correctedBy ?? null,
        changedAt: last?.correctedAt ?? null,
      },
    ];
  });
}

/** "cotizado 4 → real 6 (+2)" */
export function changeText(c: Pick<MaterialChange, "quotedQty" | "realQty" | "diff">): string {
  return `cotizado ${formatNumber(c.quotedQty)} → real ${formatNumber(c.realQty)} (${c.diff > 0 ? "+" : ""}${formatNumber(c.diff)})`;
}

// ── Desvío de materiales: por cantidad y por precio ──

export interface MaterialSplitRow {
  lineId: string;
  description: string;
  unit: string;
  quotedQty: number;
  quotedUnitCost: number;
  realQty: number;
  /** Costo unitario real: promedio de lo comprado para el proyecto; si todavía no se compró, el cotizado. */
  realUnitCost: number;
  /** Se necesitó más (o menos) material: (real − cotizado) × costo cotizado. */
  quantityDeviation: number;
  /** El material salió más caro (o más barato): (costo real − cotizado) × cantidad real. */
  priceDeviation: number;
  /** Real (cantidad real × costo real) − cotizado (cantidad cotizada × costo cotizado) = cantidad + precio. */
  total: number;
  reason: string | null;
}

export interface MaterialSplit {
  rows: MaterialSplitRow[];
  quantityDeviation: number;
  priceDeviation: number;
  total: number;
}

const sameMaterial = (line: Pick<BudgetLine, "materialId" | "description">, p: { materialId?: string; materialName: string }) =>
  line.materialId && p.materialId ? line.materialId === p.materialId : line.description.trim().toLowerCase() === p.materialName.trim().toLowerCase();

/**
 * Desvío de materiales separado en dos partes que suman el total: por CANTIDAD (Diseño cambió lo que se necesita,
 * con su motivo) y por PRECIO (lo comprado costó distinto de lo cotizado). Cotizado = presupuesto base; real =
 * cantidad actual × costo unitario promedio de lo comprado (o el cotizado si todavía no se compró).
 */
export function materialDeviationSplit(
  project: Pick<Project, "id" | "baseline" | "budgetLines" | "purchaseEntries">,
  corrections: readonly ValueCorrection[],
): MaterialSplit {
  const changes = new Map(materialChanges(project, corrections).map((c) => [c.lineId, c]));
  const rows = project.budgetLines.flatMap((line): MaterialSplitRow[] => {
    if (line.category !== "materials" || line.quantity === null) return [];
    const base = project.baseline?.lines.find((l) => l.id === line.id);
    const quotedQty = quotedQuantity(project, line, corrections) ?? line.quantity;
    const quotedUnitCost = base?.unitCost ?? line.unitCost;
    const bought = project.purchaseEntries.filter((p) => sameMaterial(line, p) && p.quantity > 0);
    const boughtQty = bought.reduce((s, p) => s + p.quantity, 0);
    const realUnitCost = boughtQty > 0 ? round2(bought.reduce((s, p) => s + p.quantity * p.unitCost, 0) / boughtQty) : quotedUnitCost;
    const realQty = line.quantity;
    const quantityDeviation = round2((realQty - quotedQty) * quotedUnitCost);
    const priceDeviation = round2((realUnitCost - quotedUnitCost) * realQty);
    return [
      {
        lineId: line.id,
        description: line.description,
        unit: line.unit,
        quotedQty,
        quotedUnitCost,
        realQty,
        realUnitCost,
        quantityDeviation,
        priceDeviation,
        total: round2(quantityDeviation + priceDeviation),
        reason: changes.get(line.id)?.reason ?? null,
      },
    ];
  });
  const sum = (k: "quantityDeviation" | "priceDeviation") => round2(rows.reduce((s, r) => s + r[k], 0));
  const quantityDeviation = sum("quantityDeviation");
  const priceDeviation = sum("priceDeviation");
  return { rows, quantityDeviation, priceDeviation, total: round2(quantityDeviation + priceDeviation) };
}

// ── Alerta única: Diseño cambió materiales ──

/**
 * Una alerta por proyecto cuando Diseño cambió cantidades de materiales respecto de la cotización (Compras y Gerencia).
 * Lleva el impacto en pesos (cambio de cantidad × costo cotizado) y qué hacer. Si el cambio está y los costos reales
 * todavía no lo reflejan, la alerta igual aparece: no queda oculto.
 */
export function designChangeAlerts(projects: readonly Project[], corrections: readonly ValueCorrection[]): Alert[] {
  return projects.flatMap((p) => {
    if (p.isClosed || p.status === "quotation") return [];
    const changes = materialChanges(p, corrections);
    if (changes.length === 0) return [];
    const up = changes.filter((c) => c.diff > 0);
    const first = up[0] ?? changes[0];
    const what = `${first.diff > 0 ? "+" : ""}${formatNumber(first.diff)} ${first.unit} de ${first.description}${first.furniture ? ` en ${first.furniture}` : ""}`;
    const more = changes.length > 1 ? ` y ${changes.length - 1} ${changes.length - 1 === 1 ? "cambio más" : "cambios más"}` : "";
    const impact = round2(changes.reduce((s, c) => s + c.amount, 0));
    return [
      keyed({
        ...alertBase(p),
        id: `design-${p.id}`,
        kind: "design_change",
        level: impact > 0 ? "warning" : "info",
        title: `Diseño ${up.length > 0 ? "aumentó" : "cambió"} materiales: ${what}${more}`,
        message: `${changes.map((c) => `${c.description}: ${changeText(c)} ${c.unit}${c.reason ? ` (${c.reason})` : ""}`).join(" · ")}.`,
        impactAmount: impact,
        action: "Compras → Necesidades: comprar la cantidad real. Gerencia → ficha del proyecto: desvío de materiales por cantidad.",
      }),
    ];
  });
}

// ── Pendientes de cada sesión (avisos entre sesiones en el Dashboard) ──

export type CircuitSession = "gerencia" | "administracion" | "compras" | "jefe_planta";

export interface PendingGroupData {
  title: string;
  hint: string;
  items: Array<{ project: Project; detail?: string }>;
}

const lastEvent = (p: Pick<Project, "activity">, kind: ActivityEvent["kind"]) =>
  [...p.activity].filter((e) => e.kind === kind).sort((a, b) => b.at.localeCompare(a.at))[0];

/** Qué le llega a cada sesión del circuito: listas simples calculadas de los datos (no hay notificaciones). */
export function circuitPending(
  session: CircuitSession,
  projects: readonly Project[],
  ctx: { assignments: ReadonlyArray<{ projectId: string }>; corrections: readonly ValueCorrection[] },
): PendingGroupData[] {
  const at = (stage: CircuitStage) => projects.filter((p) => circuitStage(p) === stage);
  const design = designChangeAlerts(projects, ctx.corrections).map((a) => ({
    project: projects.find((p) => p.id === a.projectId) as Project,
    detail: session === "gerencia" ? `${a.title} · ${a.impactAmount && a.impactAmount > 0 ? "+" : ""}${formatCurrency(a.impactAmount ?? 0)}` : a.title,
  }));
  if (session === "administracion") {
    return [
      { title: "En negociación", hint: "El cliente pidió otro precio: esperar su respuesta y marcar aprobado o no aprobado.", items: at("negotiation").map((p) => ({ project: p, detail: lastEvent(p, "negotiation")?.message })) },
      { title: "En Diseño", hint: "Corregir las cantidades de materiales que de verdad se necesitan, adjuntar los planos y enviar a Compras.", items: at("design").map((p) => ({ project: p })) },
      { title: "Proyectos listos: ¿qué se hace?", hint: "Planta terminó todas las unidades: definir retiro en planta, flete e instalación o finalizar.", items: at("ready").map((p) => ({ project: p })) },
    ];
  }
  if (session === "gerencia") {
    return [
      { title: "Listos para cerrar", hint: "Administración definió la entrega: Gerencia cierra el proyecto.", items: at("delivery").map((p) => ({ project: p, detail: DELIVERY_LABELS[deliveryDecision(p) as DeliveryChoice] })) },
      { title: "Diseño cambió materiales", hint: "Impacto en pesos del cambio de cantidades respecto de la cotización.", items: design },
    ];
  }
  if (session === "compras") {
    return [
      { title: "Proyectos nuevos para comprar", hint: "Diseño terminó: comprar la cantidad real al mejor precio y cargar el precio real (factura).", items: at("purchasing").map((p) => ({ project: p })) },
      { title: "Diseño cambió materiales", hint: "La necesidad ya usa la cantidad real.", items: design },
    ];
  }
  return [
    {
      title: "Proyectos nuevos para recibir",
      hint: "Llegaron con sus muebles, materiales, planos y horas por rubro: distribuir las horas por operario, día y rubro.",
      // Recién llegado: en Producción, sin asignaciones y sin unidades terminadas.
      items: projects
        .filter((p) => !p.isClosed && p.status === "production" && !ctx.assignments.some((a) => a.projectId === p.id) && p.items.every((i) => i.completedUnits === 0))
        .map((p) => ({ project: p })),
    },
    {
      title: "¿Se terminó este proyecto?",
      hint: "Todas las unidades están terminadas.",
      items: projects.filter((p) => !p.isClosed && p.status === "production" && allUnitsDone(p) && !deliveryDecision(p)).map((p) => ({ project: p })),
    },
  ];
}

/** Desvío de materiales por cantidad y por precio de varios proyectos (Dashboard de Gerencia). Sin cotizaciones. */
export function portfolioMaterialSplit(projects: readonly Project[], corrections: readonly ValueCorrection[]) {
  const rows = projects
    .filter((p) => p.status !== "quotation")
    .map((p) => ({ project: p, split: materialDeviationSplit(p, corrections) }))
    .filter((r) => r.split.quantityDeviation !== 0 || r.split.priceDeviation !== 0);
  const sum = (k: "quantityDeviation" | "priceDeviation") => round2(rows.reduce((s, r) => s + r.split[k], 0));
  const quantityDeviation = sum("quantityDeviation");
  const priceDeviation = sum("priceDeviation");
  return { rows, quantityDeviation, priceDeviation, total: round2(quantityDeviation + priceDeviation) };
}
