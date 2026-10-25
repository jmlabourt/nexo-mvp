// ─────────────────────────────────────────────────────────────
// Blerp · núcleo de dominio del modo demostración (esquema 3).
//
// Un solo estado (CoreWorld) para las cinco sesiones. Cada registro tiene un id estable y se relaciona por ids
// (proyecto, mueble, rubro, material, empleado, lote, OC), nunca por nombres. Todo lo que se muestra se deriva con
// funciones puras de lib/core/*.ts. Importes en ARS sin IVA; fechas yyyy-mm-dd.
//
// Es el contrato del frontend para el equipo de backend (PENDIENTES_BACKEND.md §8): hoy vive en el navegador (modo
// demostración); la base real todavía no tiene estas tablas y nada de esto se escribe en Supabase.
// ─────────────────────────────────────────────────────────────
import type { SessionKey } from "@/lib/permissions";

export type ISODate = string;
export type ISODateTime = string;

/** Estados del proyecto. No hay "Instalación": montaje y flete son rubros o costos. */
export type CoreStatus = "quotation" | "approved" | "purchasing" | "production" | "closed";

/** Subestado comercial mientras está En cotización. */
export type QuoteState = "draft" | "sent" | "negotiating" | "rejected";

// ── Catálogos únicos ──────────────────────────────────────────

export interface Client {
  id: string;
  name: string;
  taxId?: string;
  contact?: string;
  phone?: string;
  email?: string;
  address?: string;
  active: boolean;
  createdAt: ISODateTime;
}

export interface SupplierLink {
  label: string;
  url: string;
}

export interface Supplier {
  id: string;
  name: string;
  contact?: string;
  phone?: string;
  email?: string;
  /** Listas de precios o catálogos web. */
  links: SupplierLink[];
  active: boolean;
  createdAt: ISODateTime;
}

/** Rubro operativo (Carpintería, Pintura…): lo trabajan los obreros habilitados. Diseño y Administración NO son rubros. */
export interface Rubro {
  id: string;
  name: string;
  active: boolean;
}

export interface Material {
  id: string;
  name: string;
  unit: string;
  /** Rubro donde se usa normalmente (orienta el cotizador y el BOM). */
  rubroId: string;
  /** Costo de referencia para cotizar. No es el costo real: el real sale del lote. */
  referenceCost: number;
  active: boolean;
}

/** Categoría de empleado. Solo las de obrero (isWorker) llevan rubros habilitados. */
export interface EmployeeCategory {
  id: string;
  name: string;
  isWorker: boolean;
  active: boolean;
}

export interface Employee {
  id: string;
  name: string;
  categoryId: string;
  hireDate: ISODate;
  active: boolean;
  /** Días laborables habituales (0 = domingo … 6 = sábado). Los define Gerencia. */
  workDays: number[];
  /** Jornada contractual en horas por día laborable. La define Gerencia. */
  dailyHours: number;
  /** Rubros habilitados: solo obreros. */
  rubroIds: string[];
  /** Sesiones que puede abrir (Usuarios y permisos; en la demo es una simulación visual). */
  sessions: SessionKey[];
}

/**
 * Valor con vigencia. Un cambio es un registro nuevo (el historial solo crece): las horas ya trabajadas conservan el
 * costo vigente en su fecha.
 *  · employee_cost: costo por hora de la empresa para una persona (subjectId = empleado).
 *  · category_cost: costo por hora para cotizar horas de una categoría no obrera (Diseño, Administración…).
 *  · rubro_cost: costo por hora para cotizar un rubro operativo.
 *  · overtime_cost: multiplicador de la hora extra que paga la empresa (subjectId = "all").
 *  · overtime_sale: multiplicador con el que se cotiza la hora extra al cliente (subjectId = "all").
 */
export type RateKind = "employee_cost" | "category_cost" | "rubro_cost" | "overtime_cost" | "overtime_sale";

export interface RateRecord {
  id: string;
  kind: RateKind;
  subjectId: string;
  value: number;
  validFrom: ISODate;
  createdBy: string;
  createdAt: ISODateTime;
}

/** Excepción o ausencia de un día (la carga Planta o Gerencia): horas disponibles ese día (0 = ausente). */
export interface DayException {
  id: string;
  employeeId: string;
  date: ISODate;
  availableHours: number;
  note?: string;
  createdBy: string;
  createdAt: ISODateTime;
}

// ── Proyecto (OT) y cotización ────────────────────────────────

/** Mueble del proyecto. El estado (En proceso / Finalizado) se deriva de completedUnits sobre quantity. */
export interface ProjectItem {
  id: string;
  name: string;
  quantity: number;
  /** Solo lo carga Planta. */
  completedUnits: number;
}

/**
 * Línea cotizada de un mueble y un rubro. `quantity` es el TOTAL de la línea para todas las unidades del mueble (nunca
 * se vuelve a multiplicar por la cantidad del mueble). Mano de obra: quantity = horas, unitCost = costo por hora.
 */
export interface QuoteLine {
  id: string;
  itemId: string;
  rubroId: string;
  kind: "material" | "labor";
  materialId?: string;
  quantity: number;
  unit: string;
  unitCost: number;
}

/** Horas cotizadas de personal no obrero (Diseño, Administración…). No son rubros ni se asignan a operarios. */
export interface StaffLine {
  id: string;
  categoryId: string;
  hours: number;
  hourlyCost: number;
}

/** Costo general optativo de cotización (p. ej. provisión para imprevistos). No es un gasto real ni se financia. */
export interface QuoteGeneralCost {
  id: string;
  name: string;
  /** pct = % sobre el costo directo cotizado · amount = importe fijo. */
  mode: "pct" | "amount";
  value: number;
}

/** Cobro previsto en la cotización: porcentaje del precio final y fecha prevista. */
export interface PlannedCollection {
  id: string;
  label: string;
  pct: number;
  date: ISODate;
}

export interface Quote {
  state: QuoteState;
  lines: QuoteLine[];
  staffLines: StaffLine[];
  /** Rentabilidad objetivo = margen sobre el precio de venta (no markup). Precio = costo / (1 − m). */
  marginMaterialsPct: number;
  marginLaborPct: number;
  generalCosts: QuoteGeneralCost[];
  plan: PlannedCollection[];
  /** Precio de lista escrito a mano (si no, se usa el sugerido redondeado). */
  listPriceOverride?: number;
  /** Descuento en pesos sobre el precio de lista. */
  discount: number;
  sentAt?: ISODate;
  rejectedReason?: string;
}

/** Cobro previsto ya con importe (contrato y pagos). */
export interface ScheduledPayment {
  id: string;
  label: string;
  amount: number;
  date: ISODate;
}

/** Tramo del costo financiero: capital inmovilizado constante entre dos fechas. */
export interface FinancialTramo {
  from: ISODate;
  to: ISODate;
  days: number;
  capital: number;
  amount: number;
}

/** Foto congelada de la cotización aprobada. Nunca se pisa: los cambios posteriores quedan aparte. */
export interface Baseline {
  approvedAt: ISODate;
  approvedBy: string;
  items: Array<Pick<ProjectItem, "id" | "name" | "quantity">>;
  lines: QuoteLine[];
  staffLines: StaffLine[];
  generalCosts: Array<QuoteGeneralCost & { amount: number }>;
  marginMaterialsPct: number;
  marginLaborPct: number;
  startDate: ISODate;
  dueDate: ISODate;
  costs: { materials: number; labor: number; staff: number; general: number; financial: number; total: number };
  suggestedPrice: number;
  listPrice: number;
  discount: number;
  agreedPrice: number;
  /** (precio acordado − costo total cotizado) / precio acordado × 100. */
  quotedMarginPct: number;
  plan: ScheduledPayment[];
  financialRatePct: number;
  financialTramos: FinancialTramo[];
}

/** Historial del proyecto (el mismo para transiciones automáticas y manuales). */
export interface ActivityEntry {
  id: string;
  at: ISODateTime;
  date: ISODate;
  by: string;
  kind: "created" | "status" | "quote" | "bom" | "contract" | "plan" | "units" | "handover" | "closure" | "additional" | "note" | "document" | "stock";
  text: string;
  auto?: boolean;
  from?: CoreStatus;
  to?: CoreStatus;
}

export interface ProjectNote {
  id: string;
  date: ISODate;
  text: string;
  by: string;
}

/** Documento: en la demo se registra nombre y referencia (no se sube el archivo). */
export interface ProjectDocument {
  id: string;
  date: ISODate;
  name: string;
  reference?: string;
  by: string;
}

export interface Project {
  id: string;
  /** Correlativo de la empresa (nunca se reutiliza). */
  otNumber: number;
  /** OT pública generada con el nomenclador al crear; estable aunque cambie el nombre comercial. */
  ot: string;
  clientId: string;
  description: string;
  status: CoreStatus;
  startDate: ISODate;
  dueDate: ISODate;
  createdAt: ISODateTime;
  createdBy: string;
  items: ProjectItem[];
  quote: Quote;
  baseline?: Baseline;
  /** Cobros previstos vigentes (desde la aprobación; los edita Administración). */
  schedule: ScheduledPayment[];
  clientPo?: string;
  notes: ProjectNote[];
  documents: ProjectDocument[];
  activity: ActivityEntry[];
}

/** Trabajo adicional aprobado por Administración (rubro nuevo o más horas/materiales). No altera la cotización original. */
export interface Additional {
  id: string;
  projectId: string;
  itemId: string;
  rubroId: string;
  lines: QuoteLine[];
  /** Precio adicional acordado (si hay, sube el contrato vigente con una revisión). */
  price?: number;
  requestId?: string;
  note?: string;
  createdBy: string;
  createdAt: ISODateTime;
  date: ISODate;
}

/** Pedido de Planta de un rubro no cotizado: pasa por Administración. */
export interface RubroRequest {
  id: string;
  projectId: string;
  itemId: string;
  rubroId: string;
  hours: number;
  note?: string;
  status: "open" | "approved" | "rejected";
  createdBy: string;
  createdAt: ISODateTime;
  date: ISODate;
  resolvedBy?: string;
  resolvedAt?: ISODateTime;
  additionalId?: string;
}

// ── BOM ───────────────────────────────────────────────────────

/** Línea del BOM: cantidad total del mueble (todas sus unidades), en la unidad del material. */
export interface BomLine {
  id: string;
  itemId: string;
  rubroId: string;
  materialId: string;
  quantity: number;
}

/** BOM del proyecto, versionado. Solo la última versión publicada genera necesidades; las anteriores quedan visibles. */
export interface BomVersion {
  id: string;
  projectId: string;
  version: number;
  status: "draft" | "published";
  lines: BomLine[];
  createdBy: string;
  createdAt: ISODateTime;
  publishedBy?: string;
  publishedAt?: ISODateTime;
  publishedDate?: ISODate;
}

/** Pedido adicional de material de Planta (material ya permitido): va directo a "Por comprar". */
export interface MaterialRequest {
  id: string;
  projectId: string;
  itemId: string;
  rubroId: string;
  materialId: string;
  quantity: number;
  note?: string;
  status: "active" | "cancelled";
  createdBy: string;
  createdAt: ISODateTime;
  date: ISODate;
  changes: Array<{ at: ISODateTime; by: string; text: string }>;
}

// ── Compras ───────────────────────────────────────────────────

export interface OrderLine {
  id: string;
  /** OT a la que va la línea. Vacío = compra para stock libre. */
  projectId?: string;
  itemId?: string;
  rubroId?: string;
  materialId: string;
  quantity: number;
  /** Precio unitario real de la OC (sin IVA). */
  unitPrice: number;
}

/** Orden de compra REGISTRADA en Blerp: no se crea ni se envía al proveedor desde acá. */
export interface PurchaseOrder {
  id: string;
  number: string;
  supplierId: string;
  date: ISODate;
  /** Fecha comprometida de llegada (sin fecha no hay alerta de atraso). */
  expectedDate?: ISODate;
  lines: OrderLine[];
  /** Comprobante del proveedor (solo dato informativo). */
  invoice?: { number: string; date: ISODate; amount: number };
  notes?: string;
  createdBy: string;
  createdAt: ISODateTime;
}

/** "Materiales recibidos": llegada física de una línea. Se puede revertir (queda la historia). */
export interface Receipt {
  id: string;
  orderId: string;
  lineId: string;
  date: ISODate;
  quantity: number;
  lotId: string;
  createdBy: string;
  createdAt: ISODateTime;
  reversal?: { date: ISODate; at: ISODateTime; by: string; reason?: string };
}

/** Pago real a un proveedor (Gerencia). Sin `projectId` se reparte entre las OTs según el valor de sus líneas. */
export interface SupplierPayment {
  id: string;
  orderId: string;
  date: ISODate;
  amount: number;
  projectId?: string;
  reference?: string;
  createdBy: string;
  createdAt: ISODateTime;
}

// ── Stock físico por lote ─────────────────────────────────────

/** Lote: conserva el costo unitario de origen aunque el material pase a otra OT. */
export interface Lot {
  id: string;
  materialId: string;
  unitCost: number;
  date: ISODate;
  source: "opening" | "receipt";
  orderId?: string;
  receiptId?: string;
  /** OT para la que entró (si entró por una OC con OT). */
  projectId?: string;
}

/**
 * Lugar físico de una cantidad (clave de texto):
 *  supplier · free · asg:<proyecto> (asignado a la OT) · prod:<entrega> (liberado a producción) ·
 *  cons:<proyecto> (consumido) · waste:<proyecto> (desperdiciado).
 */
export type PlaceKey = string;

export type MovementKind =
  | "opening"
  | "receipt"
  | "receipt_reversal"
  | "assign"
  | "transfer"
  | "unassign"
  | "release"
  | "consume"
  | "waste"
  | "return";

export interface Movement {
  id: string;
  lotId: string;
  date: ISODate;
  quantity: number;
  from: PlaceKey;
  to: PlaceKey;
  kind: MovementKind;
  /** Registro que originó el movimiento (recepción, entrega a producción, rendición, asignación…). */
  ref?: string;
  createdBy: string;
  createdAt: ISODateTime;
}

// ── Planta ────────────────────────────────────────────────────

/** Entrega de material asignado a producción para un mueble y rubro. */
export interface Release {
  id: string;
  projectId: string;
  itemId: string;
  rubroId: string;
  materialId: string;
  quantity: number;
  date: ISODate;
  createdBy: string;
  createdAt: ISODateTime;
}

/** Rendición de una entrega: consumido + desperdiciado + devuelto (el resto sigue en producción). */
export interface Rendition {
  id: string;
  releaseId: string;
  date: ISODate;
  consumed: number;
  waste: number;
  returned: number;
  createdBy: string;
  createdAt: ISODateTime;
}

/** Planificación del Jefe de planta: horas previstas por fecha, OT, mueble y rubro (fuente única de horas previstas). */
export interface PlanEntry {
  id: string;
  projectId: string;
  itemId: string;
  rubroId: string;
  date: ISODate;
  hours: number;
  createdBy: string;
  createdAt: ISODateTime;
}

/** Asignación de trabajo a un operario: de `from` a `to`, `hoursPerDay` en sus días laborables. */
export interface Assignment {
  id: string;
  projectId: string;
  itemId: string;
  rubroId: string;
  employeeId: string;
  from: ISODate;
  to: ISODate;
  hoursPerDay: number;
  createdBy: string;
  createdAt: ISODateTime;
}

export interface TimeEntryTarget {
  /** Sin proyecto = Trabajo interno (no se imputa a ninguna OT). */
  projectId?: string;
  itemId?: string;
  /** Solo obreros. */
  rubroId?: string;
  hours: number;
}

/** Horas trabajadas (todas las personas). Las correcciones modifican el mismo registro y quedan auditadas. */
export interface TimeEntry extends TimeEntryTarget {
  id: string;
  employeeId: string;
  date: ISODate;
  note?: string;
  createdBy: string;
  createdAt: ISODateTime;
  review?: { status: "confirmed" | "corrected"; by: string; at: ISODateTime };
  corrections: Array<{ at: ISODateTime; by: string; before: TimeEntryTarget; after: TimeEntryTarget }>;
}

export interface Handover {
  id: string;
  projectId: string;
  date: ISODate;
  note?: string;
  createdBy: string;
  createdAt: ISODateTime;
}

// ── Gerencia: dinero ──────────────────────────────────────────

/** Otro costo real imprevisto de una OT. */
export interface OtherCost {
  id: string;
  projectId: string;
  date: ISODate;
  description: string;
  categoryId: string;
  amount: number;
  createdBy: string;
  createdAt: ISODateTime;
}

/** Dinero que realmente ingresó ("Registrar ingreso"). No hay facturas de venta pendientes en Blerp. */
export interface Income {
  id: string;
  projectId: string;
  date: ISODate;
  amount: number;
  reference?: string;
  createdBy: string;
  createdAt: ISODateTime;
}

/** Cambio del contrato vigente (Administración). El precio aprobado original no se pisa. */
export interface ContractRevision {
  id: string;
  projectId: string;
  date: ISODate;
  previous: number;
  next: number;
  note?: string;
  additionalId?: string;
  createdBy: string;
  createdAt: ISODateTime;
}

/** Cierre de Gerencia: foto final inmutable de los costos operativos al cerrar. */
export interface Closure {
  projectId: string;
  date: ISODate;
  by: string;
  at: ISODateTime;
  snapshot: {
    contract: number;
    materials: number;
    labor: number;
    staff: number;
    other: number;
    operatingCost: number;
    operatingProfit: number;
    operatingMarginPct: number | null;
    collected: number;
    financialAtClose: number;
  };
}

// ── Configuración ─────────────────────────────────────────────

export type OtPart = "number" | "client" | "description";

export interface AlertThresholds {
  /** Compras urgentes: inicio de la OT dentro de estos días y material sin registrar en OC. */
  urgentPurchaseDays: number;
  /** Entregas próximas (Administración). */
  dueSoonDays: number;
  /** Rentabilidad baja: puntos por debajo de la cotizada. */
  lowMarginPoints: number;
  /** Sobrecosto: % por encima de lo presupuestado. */
  overcostPct: number;
  /** Ventana de capacidad futura (semanas) para la alerta. */
  capacityWeeks: number;
  /** Material en producción sin rendir hace más de estos días. */
  renditionDays: number;
  /** Jornadas sin revisar hace más de estos días. */
  reviewDays: number;
}

export interface CoreConfig {
  companyName: string;
  /** Fecha de referencia simulada de la demo: "hoy" no depende del reloj del navegador. */
  asOf: ISODate;
  ot: { prefix: string; parts: OtPart[]; lastNumber: number };
  marginMaterialsPct: number;
  marginLaborPct: number;
  /** Tasa mensual única del costo financiero (interés simple, mes de 30 días). */
  financialMonthlyRatePct: number;
  /** Supuesto para el material sin pago de proveedor cargado: invertido en la fecha de recepción. */
  materialFinancingRule: "receipt";
  quoteGeneralCosts: Array<QuoteGeneralCost & { active: boolean }>;
  otherCostCategories: Array<{ id: string; name: string; active: boolean }>;
  categories: EmployeeCategory[];
  alerts: AlertThresholds;
}

/** Todo el estado de la demo. */
export interface CoreWorld {
  schema: 3;
  /** Contador para ids deterministas. */
  seq: number;
  config: CoreConfig;
  clients: Client[];
  suppliers: Supplier[];
  rubros: Rubro[];
  materials: Material[];
  employees: Employee[];
  rates: RateRecord[];
  exceptions: DayException[];
  projects: Project[];
  additionals: Additional[];
  rubroRequests: RubroRequest[];
  boms: BomVersion[];
  materialRequests: MaterialRequest[];
  orders: PurchaseOrder[];
  receipts: Receipt[];
  supplierPayments: SupplierPayment[];
  lots: Lot[];
  movements: Movement[];
  releases: Release[];
  renditions: Rendition[];
  plans: PlanEntry[];
  assignments: Assignment[];
  timeEntries: TimeEntry[];
  otherCosts: OtherCost[];
  incomes: Income[];
  contractRevisions: ContractRevision[];
  handovers: Handover[];
  closures: Closure[];
}

/** Quién hace una operación y cuándo. `today` = fecha de la demo. */
export interface OpCtx {
  session: SessionKey;
  actor: string;
  actorId?: string;
  now: ISODateTime;
  today: ISODate;
}
