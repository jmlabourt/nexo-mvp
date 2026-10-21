// ─────────────────────────────────────────────────────────────
// Escenario de prueba de la demostración local ("Datos de ejemplo"). Sale de los mismos proyectos de la demo, así
// las cifras de todas las sesiones son coherentes entre sí: facturas y cobros, condiciones de pago, BOM publicados,
// clientes, proveedores, catálogo de rubros y tarifas. Todo es editable desde la demo y se puede restaurar.
// No son datos reales: nombres e importes son ficticios.
// ─────────────────────────────────────────────────────────────
import type { BomVersion, Collection, ClientEntry, Ledger, PaymentTerms, Project, RateRecord, SalesInvoice, SupplierEntry } from "@/types";
import { DEFAULT_HOUR_RATES } from "../constants";
import { clientsFrom, suppliersFrom } from "../directory";
import { generalState } from "../gerencia";
import { EMPTY_LEDGER } from "../ledger";
import { RUBROS } from "../rubros";
import type { StockState } from "../stock";
import type { PurchaseOrder } from "@/types";
import { exampleClientDetails, exampleInvoices, exampleSupplierDetails } from "./ejemplos";

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const CREATED = "2026-09-01T12:00:00.000Z";
const BY = "Datos de ejemplo";

/**
 * Cada línea de materiales de la cotización va COMPLETA a un mueble (nunca se reparte en partes iguales). En la demo
 * la asignación es un dato de ejemplo: la línea i va al mueble i (en ronda). Queda en las notas ("Mueble: Mesa × 10"),
 * igual que lo hace la cotización por mueble.
 */
function withFurniture(p: Project): Project {
  if (p.items.length === 0) return p;
  let i = 0;
  return {
    ...p,
    budgetLines: p.budgetLines.map((l) => {
      if (l.category !== "materials" || l.quantity === null || l.notes?.startsWith("Mueble: ")) return l;
      const item = p.items[i++ % p.items.length];
      return { ...l, notes: [`Mueble: ${item.name} × ${item.quantity}`, l.notes].filter(Boolean).join(" · ") };
    }),
  };
}

/** BOM publicado de cada mueble de un proyecto aprobado o en curso: sale de los materiales cotizados de ese mueble. */
function publishedBoms(p: Project): BomVersion[] {
  if (p.status === "quotation") return [];
  return p.items.flatMap((item) => {
    const lines = p.budgetLines
      .filter((l) => l.category === "materials" && l.quantity !== null && l.notes?.startsWith(`Mueble: ${item.name} × `))
      .map((l) => ({ id: `bl-${l.id}`, material: l.description, materialId: l.materialId, quantity: l.quantity as number, unit: l.unit, budgetLineId: l.id }));
    if (lines.length === 0) return [];
    return [{ id: `bom-${p.id}-${item.id}-1`, projectId: p.id, itemId: item.id, version: 1, status: "published" as const, lines, createdBy: BY, createdAt: CREATED, publishedAt: CREATED }];
  });
}

/** Facturas emitidas y cobros de ejemplo (de los mismos proyectos): anticipo al inicio, saldo a la entrega. */
function salesRecords(projects: Project[], today: string): { invoices: SalesInvoice[]; collections: Collection[] } {
  const invoices: SalesInvoice[] = [];
  const collections: Collection[] = [];
  for (const x of exampleInvoices(projects, today)) {
    if (x.status !== "issued") continue;
    invoices.push({ id: x.id, projectId: x.projectId, number: x.number ?? x.id, date: x.date, amount: x.amount, notes: x.concept, createdBy: BY, createdAt: CREATED });
    if (x.collectedAt && x.collectedAt <= today) {
      collections.push({ id: `cob-${x.id}`, projectId: x.projectId, invoiceId: x.id, date: x.collectedAt, amount: x.amount, createdBy: BY, createdAt: CREATED });
    }
  }
  return { invoices, collections };
}

/** Condiciones de pago: seña del 50 % al inicio y saldo a 30 días de la entrega. */
function terms(p: Project): PaymentTerms {
  if (!(p.salesPrice > 0) || generalState(p) === "quotation") return { projectId: p.id, daysAfterDelivery: 30, schedule: [] };
  const half = Math.round(p.salesPrice / 2);
  return {
    projectId: p.id,
    daysAfterDelivery: 30,
    schedule: [
      { id: `cuota-${p.id}-1`, label: "Seña 50 %", amount: half, date: p.startDate },
      { id: `cuota-${p.id}-2`, label: "Saldo", amount: p.salesPrice - half, date: addDays(p.dueDate, 30) },
    ],
  };
}

/**
 * Segunda cotización abierta del escenario (el prompt pide dos en cotización): una copia de la primera con otro
 * cliente, otro código y otro nombre. Es un dato de ejemplo independiente (ids propios).
 */
function secondQuote(projects: Project[]): Project[] {
  const quotes = projects.filter((p) => p.status === "quotation");
  if (quotes.length >= 2 || quotes.length === 0) return projects;
  const base = quotes[0];
  const suffix = "q2";
  const copy: Project = {
    ...base,
    id: `p-1059`,
    code: "P-1059",
    name: "Exhibidores para feria de diseño",
    client: "Galería Norte",
    salesPrice: Math.round(base.salesPrice * 0.6),
    budgetLines: base.budgetLines.map((l) => ({ ...l, id: `${l.id}-${suffix}`, quantity: l.quantity, total: Math.round(l.total * 0.6 * 100) / 100, unitCost: l.quantity ? Math.round(((l.total * 0.6) / l.quantity) * 100) / 100 : Math.round(l.unitCost * 0.6 * 100) / 100 })),
    items: base.items.map((i) => ({ ...i, id: `${i.id}-${suffix}`, name: "Exhibidor modular", quantity: 4, completedUnits: 0 })),
    activity: [],
    actualEntries: [],
    materialUsages: [],
    purchaseEntries: [],
    stageLogs: [],
    attachments: [],
    assignedOperatorIds: [],
    baseline: undefined,
  };
  return [...projects, copy];
}

export function demoScenario(input: { projects: Project[]; stock: StockState; orders: PurchaseOrder[]; today?: string }): { projects: Project[]; ledger: Ledger } {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const projects = secondQuote(input.projects).map(withFurniture);
  const { invoices, collections } = salesRecords(projects, today);
  const clients: ClientEntry[] = clientsFrom(projects).map((c, i) => ({ id: `cli-${i + 1}`, name: c.name, active: true, createdAt: CREATED, ...exampleClientDetails(c.name, i) }));
  const suppliers: SupplierEntry[] = suppliersFrom(projects, input.stock, input.orders).map((s, i) => ({
    id: `prov-${i + 1}`,
    name: s.name,
    active: true,
    createdAt: CREATED,
    ...exampleSupplierDetails(s.name, i),
  }));
  const labor = DEFAULT_HOUR_RATES.find((r) => r.category === "labor")?.hourlyRate ?? 0;
  const rates: RateRecord[] = RUBROS.filter((r) => r.kind === "full").map((r) => ({
    id: `tarifa-${r.id}`,
    scope: "rubro" as const,
    subjectId: r.id,
    hourlyRate: labor,
    validFrom: "2026-01-01",
    createdBy: BY,
    createdAt: CREATED,
  }));
  return {
    projects,
    ledger: {
      ...EMPTY_LEDGER,
      salesInvoices: invoices,
      collections,
      paymentTerms: projects.map(terms),
      boms: projects.flatMap(publishedBoms),
      rubroCatalog: RUBROS.filter((r) => r.kind === "full").map((r) => ({ id: r.id, name: r.label, active: true })),
      rates,
      clients,
      suppliers,
    },
  };
}
