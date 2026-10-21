// ─────────────────────────────────────────────────────────────
// Registros de la demo integral (facturas, cobros, pagos a proveedores, contrato vigente, condiciones de pago, BOM
// versionado, entregas al cliente, horas internas, catálogo de rubros, tarifas, clientes y proveedores).
// Funciones puras: reciben el ledger y devuelven uno nuevo. El store las aplica y la demo las guarda en el navegador.
// ─────────────────────────────────────────────────────────────
import type { Ledger } from "@/types";
import type {
  BomVersion,
  BomVersionLine,
  ClientEntry,
  ClientHandover,
  Collection,
  ContractRevision,
  InternalHours,
  PaymentTerms,
  Project,
  PurchaseOrder,
  RateRecord,
  RubroCatalogEntry,
  SalesInvoice,
  ScheduledPayment,
  SupplierEntry,
  SupplierPayment,
} from "@/types";
import { createId } from "./activity";
import { DomainError } from "./project-operations";
import { normalizeName } from "./directory";
import { DEFAULT_FINANCIAL_PCT } from "./constants";

export const EMPTY_LEDGER: Ledger = {
  salesInvoices: [],
  collections: [],
  supplierPayments: [],
  contractRevisions: [],
  paymentTerms: [],
  boms: [],
  handovers: [],
  internalHours: [],
  closures: [],
  generalCosts: [],
  rubroCatalog: [],
  rates: [],
  clients: [],
  suppliers: [],
  financialMonthlyRatePct: DEFAULT_FINANCIAL_PCT,
};

/** Completa un ledger guardado (versiones anteriores pueden no traer todas las listas). */
export function normalizeLedger(raw: Partial<Ledger> | null | undefined): Ledger {
  return { ...EMPTY_LEDGER, ...(raw ?? {}) };
}


export interface LedgerCtx {
  actor: string;
  now: string;
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const sum = (xs: number[]) => round2(xs.reduce((s, x) => s + x, 0));

// ── Contrato vigente (Administración, con motivo; el original aprobado no se pisa) ──

/** Monto contratado original: el precio aprobado (presupuesto base) o, sin aprobar, el precio actual. */
export function originalContract(p: Pick<Project, "salesPrice" | "baseline">): number {
  return p.baseline?.salesPrice ?? p.salesPrice;
}

/** Monto contratado vigente: la última revisión, o el original. */
export function currentContract(p: Pick<Project, "id" | "salesPrice" | "baseline">, ledger: Pick<Ledger, "contractRevisions">): number {
  const last = ledger.contractRevisions.filter((r) => r.projectId === p.id).sort((a, b) => a.at.localeCompare(b.at)).at(-1);
  return last ? last.next : originalContract(p);
}

export function reviseContract(ledger: Ledger, p: Project, next: number, reason: string, ctx: LedgerCtx): Ledger {
  if (p.status === "quotation") throw new DomainError("En cotización se cambia el precio de la cotización; el contrato existe desde que se aprueba.");
  if (!(next > 0)) throw new DomainError("El monto contratado tiene que ser mayor a cero.");
  if (reason.trim().length < 3) throw new DomainError("Escribí el motivo del cambio.");
  const previous = currentContract(p, ledger);
  if (round2(next) === round2(previous)) throw new DomainError("Es el mismo monto contratado vigente.");
  const rev: ContractRevision = { id: createId("ctr"), projectId: p.id, previous, next: round2(next), reason: reason.trim(), by: ctx.actor, at: ctx.now };
  return { ...ledger, contractRevisions: [...ledger.contractRevisions, rev] };
}

// ── Condiciones de pago ──

export function termsOf(ledger: Pick<Ledger, "paymentTerms">, projectId: string): PaymentTerms {
  return ledger.paymentTerms.find((t) => t.projectId === projectId) ?? { projectId, daysAfterDelivery: 0, schedule: [] };
}

export function termsError(t: Pick<PaymentTerms, "daysAfterDelivery" | "schedule">): string | null {
  if (!Number.isInteger(t.daysAfterDelivery) || t.daysAfterDelivery < 0) return "Los días para pagar después de la entrega van de 0 en adelante.";
  for (const s of t.schedule) {
    if (!(s.amount > 0)) return "Cada cobro previsto necesita un importe mayor a cero.";
    if (!isDate(s.date)) return "Cada cobro previsto necesita una fecha.";
  }
  return null;
}

export function setPaymentTerms(ledger: Ledger, terms: PaymentTerms): Ledger {
  const error = termsError(terms);
  if (error) throw new DomainError(error);
  const schedule: ScheduledPayment[] = terms.schedule.map((s) => ({ ...s, id: s.id || createId("cuota"), amount: round2(s.amount) }));
  return { ...ledger, paymentTerms: [...ledger.paymentTerms.filter((t) => t.projectId !== terms.projectId), { ...terms, schedule }] };
}

// ── Facturación y cobros de ventas (Gerencia). Cotizado ≠ contratado ≠ facturado ≠ cobrado ──

export interface SalesInvoiceInput {
  number: string;
  date: string;
  amount: number;
  notes?: string;
}

export function salesInvoiceError(ledger: Pick<Ledger, "salesInvoices">, p: Pick<Project, "id" | "status">, i: SalesInvoiceInput): string | null {
  if (p.status === "quotation") return "Una cotización no se factura: primero se aprueba.";
  if (!i.number.trim()) return "Indicá el número o la referencia de la factura.";
  if (ledger.salesInvoices.some((x) => x.number.trim().toLowerCase() === i.number.trim().toLowerCase())) return "Ya hay una factura con ese número.";
  if (!isDate(i.date)) return "Indicá la fecha de emisión.";
  if (!(i.amount > 0)) return "Indicá el importe sin IVA.";
  return null;
}

export function registerSalesInvoice(ledger: Ledger, p: Project, i: SalesInvoiceInput, ctx: LedgerCtx): Ledger {
  const error = salesInvoiceError(ledger, p, i);
  if (error) throw new DomainError(error);
  const inv: SalesInvoice = { id: createId("fv"), projectId: p.id, number: i.number.trim(), date: i.date, amount: round2(i.amount), notes: i.notes?.trim() || undefined, createdBy: ctx.actor, createdAt: ctx.now };
  return { ...ledger, salesInvoices: [...ledger.salesInvoices, inv] };
}

export interface CollectionInput {
  /** Vacío = anticipo / seña sin factura todavía. */
  invoiceId?: string;
  date: string;
  amount: number;
  notes?: string;
}

/** Lo que falta cobrar de una factura (importe − cobros aplicados). */
export function invoiceBalance(ledger: Pick<Ledger, "collections" | "salesInvoices">, invoiceId: string): number {
  const inv = ledger.salesInvoices.find((x) => x.id === invoiceId);
  if (!inv) return 0;
  return round2(inv.amount - sum(ledger.collections.filter((c) => c.invoiceId === invoiceId).map((c) => c.amount)));
}

export function collectionError(ledger: Pick<Ledger, "collections" | "salesInvoices">, p: Pick<Project, "id" | "status">, c: CollectionInput): string | null {
  if (p.status === "quotation") return "Una cotización no tiene cobros.";
  if (!isDate(c.date)) return "Indicá la fecha de ingreso.";
  if (!(c.amount > 0)) return "Indicá el monto cobrado.";
  if (c.invoiceId) {
    const inv = ledger.salesInvoices.find((x) => x.id === c.invoiceId);
    if (!inv || inv.projectId !== p.id) return "La factura no es de este proyecto.";
    if (c.amount - invoiceBalance(ledger, c.invoiceId) > 0.005) return `Esa factura tiene ${invoiceBalance(ledger, c.invoiceId).toFixed(2)} pendientes: el cobro no puede superarlo.`;
  }
  return null;
}

export function registerCollection(ledger: Ledger, p: Project, c: CollectionInput, ctx: LedgerCtx): Ledger {
  const error = collectionError(ledger, p, c);
  if (error) throw new DomainError(error);
  const col: Collection = { id: createId("cob"), projectId: p.id, invoiceId: c.invoiceId || undefined, date: c.date, amount: round2(c.amount), notes: c.notes?.trim() || undefined, createdBy: ctx.actor, createdAt: ctx.now };
  return { ...ledger, collections: [...ledger.collections, col] };
}

/** Aplica un anticipo (cobro sin factura) a una factura: el mismo dinero, sin contarlo dos veces. */
export function applyAdvance(ledger: Ledger, collectionId: string, invoiceId: string): Ledger {
  const col = ledger.collections.find((c) => c.id === collectionId);
  if (!col || col.invoiceId) throw new DomainError("Ese cobro ya está aplicado a una factura.");
  const inv = ledger.salesInvoices.find((x) => x.id === invoiceId);
  if (!inv || inv.projectId !== col.projectId) throw new DomainError("La factura no es del mismo proyecto.");
  if (col.amount - invoiceBalance(ledger, invoiceId) > 0.005) throw new DomainError("El anticipo supera lo pendiente de esa factura.");
  return { ...ledger, collections: ledger.collections.map((c) => (c.id === collectionId ? { ...c, invoiceId } : c)) };
}

export interface BillingStatus {
  /** Monto contratado vigente (0 en cotización: una cotización nunca es venta). */
  contracted: number;
  /** Previsto de facturar según las condiciones de pago (cobros previstos). */
  planned: number;
  invoiced: number;
  collected: number;
  /** Cobros sin factura todavía (señas, anticipos). Están dentro de `collected`. */
  advances: number;
  pendingToInvoice: number;
  /** Facturado y todavía no cobrado (no cuenta anticipos sin aplicar). */
  invoicedUncollected: number;
  /** Facturado por encima del contrato vigente (aviso; no cambia el contrato). */
  overInvoiced: number;
  status: "sin_facturar" | "facturado_parcial" | "facturado" | "cobrado_parcial" | "cobrado";
}

/** Estado de facturación y cobranza de un proyecto, derivado de los registros (nunca se marca a mano). */
export function billingStatus(p: Project, ledger: Ledger): BillingStatus {
  const contracted = p.status === "quotation" ? 0 : currentContract(p, ledger);
  const invoices = ledger.salesInvoices.filter((i) => i.projectId === p.id);
  const cols = ledger.collections.filter((c) => c.projectId === p.id);
  const invoiced = sum(invoices.map((i) => i.amount));
  const collected = sum(cols.map((c) => c.amount));
  const advances = sum(cols.filter((c) => !c.invoiceId).map((c) => c.amount));
  const appliedToInvoices = round2(collected - advances);
  const planned = p.status === "quotation" ? 0 : sum(termsOf(ledger, p.id).schedule.map((s) => s.amount));
  const status: BillingStatus["status"] =
    collected > 0 && collected + 0.005 >= contracted && contracted > 0
      ? "cobrado"
      : collected > 0
        ? "cobrado_parcial"
        : invoiced > 0 && invoiced + 0.005 >= contracted
          ? "facturado"
          : invoiced > 0
            ? "facturado_parcial"
            : "sin_facturar";
  return {
    contracted,
    planned,
    invoiced,
    collected,
    advances,
    pendingToInvoice: round2(Math.max(0, contracted - invoiced)),
    invoicedUncollected: round2(Math.max(0, invoiced - appliedToInvoices)),
    overInvoiced: round2(Math.max(0, invoiced - contracted)),
    status,
  };
}

export const BILLING_STATUS_LABELS: Record<BillingStatus["status"], string> = {
  sin_facturar: "Sin facturar",
  facturado_parcial: "Facturado en parte",
  facturado: "Facturado",
  cobrado_parcial: "Cobrado en parte",
  cobrado: "Cobrado",
};

// ── Pagos a proveedores (Gerencia confirma sobre la factura de la OC) ──

export interface SupplierPaymentInput {
  date: string;
  amount: number;
  reference: string;
}

export function supplierPaymentError(order: Pick<PurchaseOrder, "status" | "invoiceAmount">, i: SupplierPaymentInput): string | null {
  if (order.status !== "invoiced" || !(order.invoiceAmount && order.invoiceAmount > 0)) return "Primero Compras carga la factura del proveedor.";
  if (!isDate(i.date)) return "Indicá la fecha del pago.";
  if (!(i.amount > 0)) return "Indicá el monto pagado.";
  if (!i.reference.trim()) return "Indicá la referencia del pago (transferencia, cheque…).";
  return null;
}

export function confirmSupplierPayment(ledger: Ledger, order: PurchaseOrder, i: SupplierPaymentInput, ctx: LedgerCtx): Ledger {
  const error = supplierPaymentError(order, i);
  if (error) throw new DomainError(error);
  const pay: SupplierPayment = { id: createId("pago"), orderId: order.id, date: i.date, amount: round2(i.amount), reference: i.reference.trim(), by: ctx.actor, at: ctx.now };
  return { ...ledger, supplierPayments: [...ledger.supplierPayments, pay] };
}

export function paidOf(ledger: Pick<Ledger, "supplierPayments">, orderId: string): number {
  return sum(ledger.supplierPayments.filter((x) => x.orderId === orderId).map((x) => x.amount));
}

// ── BOM versionado por mueble: borrador → publicado. Solo el publicado alimenta Compras y Planta ──

const bomsOf = (ledger: Pick<Ledger, "boms">, projectId: string, itemId: string) =>
  ledger.boms.filter((b) => b.projectId === projectId && b.itemId === itemId).sort((a, b) => a.version - b.version);

/** Versión publicada vigente (la de número más alto publicada), o null. */
export function publishedBom(ledger: Pick<Ledger, "boms">, projectId: string, itemId: string): BomVersion | null {
  return bomsOf(ledger, projectId, itemId).filter((b) => b.status === "published").at(-1) ?? null;
}

/** Borrador en curso (si hay). */
export function draftBom(ledger: Pick<Ledger, "boms">, projectId: string, itemId: string): BomVersion | null {
  return bomsOf(ledger, projectId, itemId).find((b) => b.status === "draft") ?? null;
}

/** Materiales cotizados de un mueble (líneas con "Mueble: <nombre> ×" en las notas). Sin mueble = pendiente de asignación. */
export function quotedMaterialsOf(p: Pick<Project, "budgetLines">, itemName: string): BomVersionLine[] {
  return p.budgetLines
    .filter((l) => l.category === "materials" && l.quantity !== null && l.notes?.startsWith(`Mueble: ${itemName} × `))
    .map((l) => ({ id: `bl-${l.id}`, material: l.description, materialId: l.materialId, quantity: l.quantity as number, unit: l.unit, budgetLineId: l.id }));
}

/** Materiales cotizados que no están en ningún mueble ("Pendiente de asignación": nunca se reparten solos). */
export function unassignedMaterials(p: Pick<Project, "budgetLines">): Project["budgetLines"] {
  return p.budgetLines.filter((l) => l.category === "materials" && l.quantity !== null && !l.notes?.startsWith("Mueble: "));
}

/** Abre un borrador: copia de la última publicada o, la primera vez, los materiales cotizados del mismo mueble. */
export function startBomDraft(ledger: Ledger, p: Project, itemId: string, ctx: LedgerCtx): Ledger {
  if (p.status === "quotation") throw new DomainError("El BOM se arma cuando el proyecto está aprobado.");
  const item = p.items.find((i) => i.id === itemId);
  if (!item) throw new DomainError("Mueble no encontrado.");
  if (draftBom(ledger, p.id, itemId)) return ledger;
  const last = publishedBom(ledger, p.id, itemId);
  const version = (bomsOf(ledger, p.id, itemId).at(-1)?.version ?? 0) + 1;
  const lines = (last?.lines ?? quotedMaterialsOf(p, item.name)).map((l) => ({ ...l, id: createId("bomL") }));
  const draft: BomVersion = { id: createId("bom"), projectId: p.id, itemId, version, status: "draft", lines, createdBy: ctx.actor, createdAt: ctx.now };
  return { ...ledger, boms: [...ledger.boms, draft] };
}

export function bomLinesError(lines: BomVersionLine[]): string | null {
  for (const l of lines) {
    if (!l.material.trim()) return "Cada línea necesita el material.";
    if (!(l.quantity > 0)) return `Indicá la cantidad de ${l.material.trim() || "cada material"}.`;
    if (!l.unit.trim()) return `Indicá la unidad de ${l.material.trim()}.`;
  }
  return null;
}

/** Guarda el borrador ("Guardar borrador"): Compras y Planta todavía no lo ven. */
export function saveBomDraft(ledger: Ledger, bomId: string, lines: BomVersionLine[], notes?: string): Ledger {
  const bom = ledger.boms.find((b) => b.id === bomId);
  if (!bom || bom.status !== "draft") throw new DomainError("Solo se edita un borrador.");
  const error = bomLinesError(lines);
  if (error) throw new DomainError(error);
  return { ...ledger, boms: ledger.boms.map((b) => (b.id === bomId ? { ...b, lines: lines.map((l) => ({ ...l, material: l.material.trim(), unit: l.unit.trim() })), notes } : b)) };
}

/** "Finalizar y enviar BOM": publica la versión. Las anteriores quedan en el historial; nada emitido se modifica. */
export function publishBom(ledger: Ledger, bomId: string, ctx: LedgerCtx): Ledger {
  const bom = ledger.boms.find((b) => b.id === bomId);
  if (!bom || bom.status !== "draft") throw new DomainError("Solo se publica un borrador.");
  if (bom.lines.length === 0) throw new DomainError("El BOM no tiene materiales.");
  const error = bomLinesError(bom.lines);
  if (error) throw new DomainError(error);
  return { ...ledger, boms: ledger.boms.map((b) => (b.id === bomId ? { ...b, status: "published", publishedAt: ctx.now } : b)) };
}

export interface BomChange {
  material: string;
  unit: string;
  before: number;
  after: number;
}

/** Qué cambió entre la versión publicada anterior y la vigente (para el aviso a Compras y Planta). */
export function bomChanges(ledger: Pick<Ledger, "boms">, projectId: string, itemId: string): BomChange[] {
  const published = bomsOf(ledger, projectId, itemId).filter((b) => b.status === "published");
  if (published.length < 2) return [];
  const [prev, cur] = published.slice(-2);
  const key = (l: BomVersionLine) => `${normalizeName(l.material)}|${l.unit}`;
  const before = new Map(prev.lines.map((l) => [key(l), l]));
  const after = new Map(cur.lines.map((l) => [key(l), l]));
  return [...new Set([...before.keys(), ...after.keys()])]
    .map((k) => ({ material: (after.get(k) ?? before.get(k))!.material, unit: (after.get(k) ?? before.get(k))!.unit, before: before.get(k)?.quantity ?? 0, after: after.get(k)?.quantity ?? 0 }))
    .filter((c) => Math.abs(c.after - c.before) > 1e-9);
}

// ── Entrega real al cliente (Jefe de planta) ──

export function handoverOf(ledger: Pick<Ledger, "handovers">, projectId: string): ClientHandover | null {
  return ledger.handovers.filter((h) => h.projectId === projectId).sort((a, b) => a.date.localeCompare(b.date)).at(-1) ?? null;
}

export function confirmHandover(ledger: Ledger, p: Project, input: { date: string; notes?: string }, ctx: LedgerCtx): Ledger {
  if (p.isClosed) throw new DomainError("El proyecto ya está cerrado.");
  if (p.items.length === 0 || p.items.some((i) => i.completedUnits < i.quantity)) throw new DomainError("Para confirmar la entrega tienen que estar terminadas todas las unidades.");
  if (!isDate(input.date)) throw new DomainError("Indicá la fecha de entrega.");
  if (handoverOf(ledger, p.id)) throw new DomainError("La entrega ya está confirmada.");
  const h: ClientHandover = { id: createId("ent"), projectId: p.id, date: input.date, by: ctx.actor, notes: input.notes?.trim() || undefined };
  return { ...ledger, handovers: [...ledger.handovers, h] };
}

// ── Horas internas (sin proyecto): no se imputan a ninguna OT ──

export function registerInternalHours(
  ledger: Ledger,
  input: { employeeId: string; date: string; hours: number; task: string; projectId?: string; hourlyCost?: number },
  ctx: LedgerCtx,
): Ledger {
  if (!input.employeeId) throw new DomainError("Elegí la persona.");
  if (!isDate(input.date)) throw new DomainError("Indicá la fecha.");
  if (!(input.hours > 0) || input.hours > 24) throw new DomainError("Las horas van de más de 0 a 24.");
  if (input.task.trim().length < 2) throw new DomainError("Contá brevemente en qué trabajaste.");
  const h: InternalHours = {
    id: createId("hint"),
    employeeId: input.employeeId,
    projectId: input.projectId || undefined,
    date: input.date,
    hours: round2(input.hours),
    task: input.task.trim(),
    hourlyCost: input.projectId ? round2(input.hourlyCost ?? 0) : undefined,
    createdAt: ctx.now,
  };
  return { ...ledger, internalHours: [...ledger.internalHours, h] };
}

/** Costo de las horas propias (Administración, Compras, Jefe) imputadas a un proyecto. */
export function staffHoursCost(ledger: Pick<Ledger, "internalHours">, projectId: string): number {
  return sum(ledger.internalHours.filter((h) => h.projectId === projectId).map((h) => h.hours * (h.hourlyCost ?? 0)));
}

// ── Catálogo de rubros (Gerencia: texto libre, sin lista cerrada) ──

export function addRubro(ledger: Ledger, name: string): Ledger {
  const n = name.trim();
  if (n.length < 2) throw new DomainError("Escribí el nombre del rubro.");
  if (ledger.rubroCatalog.some((r) => normalizeName(r.name) === normalizeName(n))) throw new DomainError("Ese rubro ya existe.");
  const entry: RubroCatalogEntry = { id: `rubro_${normalizeName(n).replace(/[^a-z0-9]+/g, "_")}`, name: n, active: true };
  return { ...ledger, rubroCatalog: [...ledger.rubroCatalog, entry] };
}

export function renameRubro(ledger: Ledger, id: string, name: string): Ledger {
  const n = name.trim();
  if (n.length < 2) throw new DomainError("Escribí el nombre del rubro.");
  if (ledger.rubroCatalog.some((r) => r.id !== id && normalizeName(r.name) === normalizeName(n))) throw new DomainError("Ya hay otro rubro con ese nombre.");
  return { ...ledger, rubroCatalog: ledger.rubroCatalog.map((r) => (r.id === id ? { ...r, name: n } : r)) };
}

export function setRubroActive(ledger: Ledger, id: string, active: boolean): Ledger {
  return { ...ledger, rubroCatalog: ledger.rubroCatalog.map((r) => (r.id === id ? { ...r, active } : r)) };
}

// ── Tarifas por rubro con excepción por persona (la excepción prevalece; vigencia: no revaloriza el pasado) ──

export function addRate(ledger: Ledger, input: Omit<RateRecord, "id" | "createdAt" | "createdBy">, ctx: LedgerCtx): Ledger {
  if (!(input.hourlyRate > 0)) throw new DomainError("La tarifa tiene que ser mayor a cero.");
  if (!isDate(input.validFrom)) throw new DomainError("Indicá desde cuándo vale.");
  const rec: RateRecord = { ...input, hourlyRate: round2(input.hourlyRate), id: createId("tar"), createdBy: ctx.actor, createdAt: ctx.now };
  return { ...ledger, rates: [...ledger.rates, rec] };
}

/** Tarifa vigente a una fecha: la última con validFrom ≤ fecha. */
function rateAt(records: RateRecord[], date: string): number | null {
  const r = records.filter((x) => x.validFrom <= date).sort((a, b) => a.validFrom.localeCompare(b.validFrom) || a.createdAt.localeCompare(b.createdAt)).at(-1);
  return r ? r.hourlyRate : null;
}

/** Costo de una hora de una persona en un rubro a una fecha: excepción de la persona, si no la del rubro, si no `fallback`. */
export function hourlyCostAt(ledger: Pick<Ledger, "rates">, input: { employeeId?: string; rubroId?: string; date: string }, fallback: number): number {
  const own = input.employeeId ? rateAt(ledger.rates.filter((r) => r.scope === "employee" && r.subjectId === input.employeeId), input.date) : null;
  if (own !== null) return own;
  const rubro = input.rubroId ? rateAt(ledger.rates.filter((r) => r.scope === "rubro" && r.subjectId === input.rubroId), input.date) : null;
  return rubro ?? fallback;
}

// ── Directorios: clientes y proveedores (deduplicación por nombre) ──

export function upsertClient(ledger: Ledger, c: Omit<ClientEntry, "id" | "createdAt"> & { id?: string }, ctx: LedgerCtx): Ledger {
  if (c.name.trim().length < 2) throw new DomainError("Escribí el nombre del cliente.");
  if (ledger.clients.some((x) => x.id !== c.id && normalizeName(x.name) === normalizeName(c.name))) throw new DomainError("Ya hay un cliente con ese nombre.");
  if (c.id) return { ...ledger, clients: ledger.clients.map((x) => (x.id === c.id ? { ...x, ...c, name: c.name.trim() } : x)) };
  return { ...ledger, clients: [...ledger.clients, { ...c, name: c.name.trim(), id: createId("cli"), createdAt: ctx.now }] };
}

export function upsertSupplier(ledger: Ledger, s: Omit<SupplierEntry, "id" | "createdAt"> & { id?: string }, ctx: LedgerCtx): Ledger {
  if (s.name.trim().length < 2) throw new DomainError("Escribí el nombre del proveedor.");
  if (ledger.suppliers.some((x) => x.id !== s.id && normalizeName(x.name) === normalizeName(s.name))) throw new DomainError("Ya hay un proveedor con ese nombre.");
  if (s.id) return { ...ledger, suppliers: ledger.suppliers.map((x) => (x.id === s.id ? { ...x, ...s, name: s.name.trim() } : x)) };
  return { ...ledger, suppliers: [...ledger.suppliers, { ...s, name: s.name.trim(), id: createId("prov"), createdAt: ctx.now }] };
}

// ── Gasto financiero ──

export function setFinancialRate(ledger: Ledger, pct: number): Ledger {
  if (!(pct >= 0) || pct > 50) throw new DomainError("La tasa mensual va de 0 a 50 %.");
  return { ...ledger, financialMonthlyRatePct: round2(pct) };
}

// ── Otros costos generales (informativos) ──

export function addGeneralCost(ledger: Ledger, name: string, monthlyAmount: number): Ledger {
  if (name.trim().length < 2) throw new DomainError("Escribí el concepto.");
  if (!(monthlyAmount > 0)) throw new DomainError("Indicá el monto mensual.");
  return { ...ledger, generalCosts: [...ledger.generalCosts, { id: createId("cg"), name: name.trim(), monthlyAmount: round2(monthlyAmount) }] };
}

export function removeGeneralCost(ledger: Ledger, id: string): Ledger {
  return { ...ledger, generalCosts: ledger.generalCosts.filter((c) => c.id !== id) };
}

// ── Gasto financiero actualizado (atrasos de entrega y de cobro, cobros parciales reales) ──

/**
 * Cobros para la estimación ACTUALIZADA del gasto financiero: los cobros reales con su fecha de ingreso y, para lo que
 * falta cobrar, lo previsto (cuotas y saldo) llevado a hoy si ya venció. La entrega es la real (o hoy, si está
 * atrasada). Así se financia solo el saldo pendiente y los días realmente transcurridos, sin duplicar anticipos.
 */
export function updatedFinancialInput(
  p: Pick<Project, "id" | "startDate" | "dueDate" | "salesPrice" | "baseline" | "status">,
  ledger: Ledger,
  today: string,
): { price: number; monthlyRatePct: number; startDate: string; deliveryDate: string; daysAfterDelivery: number; schedule: Array<{ amount: number; date: string }> } {
  const price = currentContract(p, ledger);
  const terms = termsOf(ledger, p.id);
  const handover = handoverOf(ledger, p.id);
  const deliveryDate = handover?.date ?? (p.dueDate < today ? today : p.dueDate);
  const real = ledger.collections.filter((c) => c.projectId === p.id).map((c) => ({ amount: c.amount, date: c.date }));
  let collected = sum(real.map((c) => c.amount));
  const pending: Array<{ amount: number; date: string }> = [];
  // Lo previsto se cubre en orden con lo ya cobrado; lo que queda se espera en su fecha (o hoy, si venció).
  for (const s of [...terms.schedule].sort((a, b) => a.date.localeCompare(b.date))) {
    const covered = Math.min(collected, s.amount);
    collected = round2(collected - covered);
    const left = round2(s.amount - covered);
    if (left > 0) pending.push({ amount: left, date: s.date < today ? today : s.date });
  }
  const scheduled = sum([...real, ...pending].map((x) => x.amount));
  const schedule = [...real, ...pending].filter((x) => x.amount > 0);
  // El saldo que no cubre ninguna cuota se cobra a los días pactados de la entrega (o hoy, si ya pasó).
  const finalDate = (() => {
    const d = new Date(`${deliveryDate}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + terms.daysAfterDelivery);
    const iso = d.toISOString().slice(0, 10);
    return iso < today ? today : iso;
  })();
  if (price - scheduled > 0.005) schedule.push({ amount: round2(price - scheduled), date: finalDate });
  // daysAfterDelivery = 0: el saldo ya está en el cronograma con su fecha.
  return { price, monthlyRatePct: ledger.financialMonthlyRatePct, startDate: p.startDate, deliveryDate, daysAfterDelivery: 0, schedule: trimTo(schedule, price) };
}

/** Si lo cobrado supera el contrato (facturado de más), no se financia saldo negativo. */
function trimTo(schedule: Array<{ amount: number; date: string }>, price: number) {
  let left = price;
  return [...schedule]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((x) => {
      const amount = round2(Math.max(0, Math.min(x.amount, left)));
      left = round2(left - amount);
      return { ...x, amount };
    })
    .filter((x) => x.amount > 0);
}
