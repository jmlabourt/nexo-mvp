// ─────────────────────────────────────────────────────────────
// Blerp — Modelo de dominio
// Estas entidades son independientes de la UI y de la persistencia.
// Hoy se guardan en localStorage (Zustand persist); el mismo modelo
// puede servirse luego desde una API/base de datos.
// ─────────────────────────────────────────────────────────────

export type ProjectStatus =
  | "quotation"
  | "approved"
  | "purchasing"
  | "production"
  | "installation"
  | "completed";

/**
 * Categorías de reporte (Lote 4). Se derivan de los rubros de la cotización y son las mismas en todas las pantallas.
 * Las siete anteriores se normalizan al leer (ver normalizeCategory).
 */
export type BudgetCategory = "materials" | "labor" | "design" | "admin" | "transport" | "financial" | "contingency";

/** Rubros (sectores) del catálogo cerrado de la cotización. */
export type RubroId =
  | "carpinteria_madera"
  | "carpinteria_metalica"
  | "plasticos"
  | "vidrios"
  | "instalacion_electrica"
  | "pintura"
  | "herrajes"
  | "graficas"
  | "insumos"
  | "transporte"
  | "embalaje"
  | "montaje"
  | "imprevistos";

/**
 * Tipo de un costo real (no material). Los valores coinciden con la base de datos.
 * "finishing" y el uso de máquinas ("other" con categoría Máquinas) solo existen en registros viejos.
 */
export type ActualEntryType =
  | "labor"
  | "outsourcing"
  | "finishing"
  | "logistics"
  | "installation"
  | "unexpected"
  | "other";

export type MaterialSource = "purchased_for_project" | "existing_stock" | "reused_leftover";

/** Cómo se determinó el costo unitario de un consumo (trazabilidad, evita caja negra). */
export type UnitCostOrigin = "manual" | "purchase" | "budget" | "catalog" | "reusable_pool";

export type AlertLevel = "info" | "warning" | "critical";

/**
 * Salud de un proyecto en curso (los finalizados no llevan chip):
 * risk = al menos una alerta Crítica abierta · attention = alertas de Atención y ninguna Crítica
 * · healthy = hay datos y no hay alertas · no_data = todavía no hay consumos ni costos.
 */
export type EconomicHealth = "no_data" | "healthy" | "attention" | "risk";

export interface BudgetLine {
  id: string;
  category: BudgetCategory;
  description: string;
  /** Solo para líneas de materiales: vincula con el catálogo para reconciliar. */
  materialId?: string;
  /** null = monto directo (no aplica cantidad). */
  quantity: number | null;
  unit: string;
  /** Si quantity es null, unitCost representa el monto directo. */
  unitCost: number;
  total: number;
  notes?: string;
  /** Rubro de la cotización. Vacío solo en líneas anteriores al Lote 4 sin rubro reconocible. */
  rubro?: RubroId;
  /** Horas: tipo de hora cuya tarifa se usó. La tarifa queda congelada en unitCost. */
  hourRateId?: string;
  /** Operario asignado. El Cotizador ya no lo usa (Lote 4); queda para que el jefe de planta asigne (Lote 5). */
  operatorId?: string;
  /** "overtime" = horas extra: unitCost ya es tarifa × multiplicador. */
  hourType?: "normal" | "overtime";
  /** Mano de obra: jornada (horas por día) usada al cotizar, congelada con la tarifa. */
  hoursPerDay?: number;
  /** Multiplicador usado en las horas extra (trazabilidad del importe). */
  overtimeMultiplier?: number;
  /** Mano de obra: cuántos operarios pidió el Cotizador para el rubro (Lote 5B). */
  workers?: number;
}

/**
 * Cómo se valúan las horas reales: con el costo de cada operario o con la tarifa general de Mano de obra.
 * Hipótesis a confirmar con el cliente: el modelo admite las dos (por defecto, la del operario, como hasta ahora).
 */
export type LaborValuation = "operator" | "general";

/** Costos de la empresa que solo ve Administrativo (el resto de los roles nunca los recibe). */
export interface CostSettings {
  /** Horas extra = tarifa por hora × este multiplicador. */
  overtimeMultiplier: number;
  /** Gasto financiero: % sobre el precio de venta (a confirmar con el cliente). */
  financialPct: number;
  /** Jornada del operario, en horas por día (Configuración). */
  hoursPerDay: number;
  laborValuation: LaborValuation;
}

/** Qué valor tiene historial con vigencia. */
export type PriceKind = "hour_rate" | "overtime_multiplier" | "operator_cost" | "material_price";

/**
 * Un valor con "vigente desde" (Lote 5A). Un cambio es un registro nuevo: el historial solo crece.
 * subjectId: tipo de hora (labor/design/admin), "default" (multiplicador), id del operario o id del material.
 */
export interface PriceRecord {
  id: string;
  kind: PriceKind;
  subjectId: string;
  value: number;
  /** yyyy-mm-dd */
  validFrom: string;
  createdAt: string;
  createdBy: string;
}

/** Corrección auditada de un valor congelado (proyecto aprobado o cerrado). */
export interface ValueCorrection {
  id: string;
  projectId: string;
  target: "sales_price" | "budget_line";
  lineId?: string;
  field: "sales_price" | "quantity" | "unit_cost";
  /** "Precio de venta" o la descripción de la línea. */
  description: string;
  oldValue: number | null;
  newValue: number;
  reason: string;
  correctedBy: string;
  correctedAt: string;
}

/** Categorías de reporte que pueden tener horas. */
export type HourCategory = Extract<BudgetCategory, "labor" | "design" | "admin">;

/**
 * Tipo de hora con su tarifa (Configuración). Es una lista: se pueden sumar tipos sin cambiar el modelo.
 * `category` dice en qué categoría de reporte caen sus horas.
 */
export interface HourRate {
  id: string;
  name: string;
  hourlyRate: number;
  category: HourCategory;
}

/** Estado de una orden de compra (Lote 6). Pagada y Recibida van aparte. */
export type OrderStatus = "draft" | "sent" | "invoiced";
export type OrderReceived = "no" | "partial" | "yes";

/** Línea de una orden: un material de una línea del costo presupuestado de un proyecto, con el costo real conseguido. */
export interface PurchaseOrderLine {
  id: string;
  projectId: string;
  /** Línea de materiales del presupuesto que cubre. */
  budgetLineId: string;
  materialId?: string;
  materialName: string;
  unit: string;
  quantity: number;
  /** Costo unitario real conseguido (la negociación queda afuera del sistema). */
  unitCost: number;
  receivedQuantity: number;
  note?: string;
}

/** Orden de compra (registro manual: sin mail ni banco). */
export interface PurchaseOrder {
  id: string;
  /** Correlativo de la empresa: OC-0001. */
  number: string;
  supplier: string;
  date: string;
  status: OrderStatus;
  invoiceNumber?: string;
  invoiceAmount?: number;
  invoiceDate?: string;
  /** Información financiera: no cambia el costo. */
  paid: boolean;
  received: OrderReceived;
  notes?: string;
  lines: PurchaseOrderLine[];
  createdBy: string;
  createdAt: string;
}

export interface PurchaseEntry {
  id: string;
  projectId: string;
  materialId?: string;
  materialName: string;
  quantity: number;
  unit: string;
  unitCost: number;
  total: number;
  supplier?: string;
  date: string; // ISO yyyy-mm-dd
  notes?: string;
  createdBy: string;
  createdAt: string; // ISO datetime
}

export interface MaterialUsageEntry {
  id: string;
  projectId: string;
  materialId: string;
  materialName: string;
  date: string;
  quantityConsumed: number;
  wasteQuantity: number;
  reusableLeftoverQuantity: number;
  unit: string;
  unitCost: number;
  unitCostOrigin: UnitCostOrigin;
  source: MaterialSource;
  /** Si source = reused_leftover, qué ítem del pool se usó. */
  reusableMaterialId?: string;
  /** Lote de stock del que salió el material (ledger). */
  lotId?: string;
  /** Mueble del proyecto al que se imputa (vacío = general del proyecto). */
  itemId?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
}

export interface LaborDetail {
  role: string;
  workerName?: string;
  hours: number;
  /** Se congela al registrar: cambiar la tarifa del operario no altera el historial. */
  hourlyCost: number;
}

export interface ActualEntry {
  id: string;
  projectId: string;
  date: string;
  type: ActualEntryType;
  category: BudgetCategory;
  description: string;
  amount: number;
  supplier?: string;
  labor?: LaborDetail;
  /** Operario (tabla de operarios) que hizo las horas. */
  operatorId?: string;
  /** Etapa en la que se trabajó. */
  stage?: ProjectStatus;
  /** Mueble del proyecto al que se imputa (vacío = general del proyecto). */
  itemId?: string;
  /** Horas: rubro del proyecto en el que se trabajó (Lote 5B). */
  rubro?: RubroId;
  /** Horas: asignación del jefe de planta que se confirmó o corrigió. */
  assignmentId?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
}

/**
 * Asignación del Jefe de planta (Lote 5B): qué operario trabaja en qué proyecto y rubro un día, y cuántas horas
 * se prevén. Sin importes.
 */
export interface WorkAssignment {
  hourKind?: "labor" | "design" | "admin";
  id: string;
  projectId: string;
  /** Producto del proyecto (Lote 6). Solo las asignaciones anteriores pueden no tenerlo. */
  itemId?: string;
  rubro: RubroId;
  operatorId: string;
  /** yyyy-mm-dd */
  date: string;
  plannedHours: number;
  notes?: string;
  createdBy: string;
  createdAt: string;
}

export type ActivityKind =
  | "created"
  | "status"
  | "budget"
  | "purchase"
  | "usage"
  | "cost"
  | "leftover"
  | "deviation"
  | "progress"
  | "stock"
  | "stage"
  | "closed"
  /** Circuito comercial (subestados de En cotización): renegociación de precio y no aprobado, con su motivo. */
  | "negotiation"
  | "rejected"
  /** Administración define la entrega de un proyecto listo (retiro, flete e instalación o finalizar). */
  | "delivery";

export interface ActivityEvent {
  id: string;
  at: string;
  actor: string;
  kind: ActivityKind;
  message: string;
}

export interface Project {
  id: string;
  code: string;
  name: string;
  client: string;
  projectType: string;
  description: string;
  status: ProjectStatus;
  startDate: string;
  dueDate: string;
  createdAt: string;
  updatedAt: string;
  salesPrice: number;
  owner: string;
  budgetLines: BudgetLine[];
  actualEntries: ActualEntry[];
  materialUsages: MaterialUsageEntry[];
  purchaseEntries: PurchaseEntry[];
  activity: ActivityEvent[];
  isClosed: boolean;
  closedAt?: string;
  /** Operarios asignados al proyecto (ids de la tabla de operarios). */
  assignedOperatorIds: string[];
  /** Muebles / ítems del proyecto. Vacío = proyecto de un solo bloque. */
  items: ProjectItem[];
  /** Bitácora por etapa (compras, producción, instalación). */
  stageLogs: StageLog[];
  /** Archivos adjuntos (proyecto, mueble o etapa). */
  attachments: Attachment[];
  /** Presupuesto aprobado original. Se captura una sola vez y no se pisa. */
  baseline?: ProjectBaseline;
  /**
   * Estado de materiales calculado por la base (Lote 6). Solo lo trae el Jefe de planta, que no recibe costos ni órdenes;
   * los demás roles lo derivan de las necesidades (materialsState).
   */
  materialsState?: "none" | "on_the_way" | "complete" | null;
}

/** Rubro que necesita un producto (Lote 6): horas estimadas para toda la cantidad y operarios que pide (sin nombre). */
export interface ProductRubro {
  rubro: RubroId;
  hours: number;
  workers: number;
}

/** Producto del proyecto (ej. "Mesa × 10"). Antes "mueble": es el mismo registro (project_items). */
export interface ProjectItem {
  id: string;
  name: string;
  description?: string;
  quantity: number;
  /** Rubros que necesita, con horas estimadas y operarios pedidos (los define el Administrativo). */
  rubros: ProductRubro[];
  /** Unidades terminadas: las carga SOLO el Jefe de planta (o un Administrativo). */
  completedUnits: number;
}

/** Estado de un producto (y, derivado de sus productos, el de producción del proyecto). */
export type ProductionStatus = "pending" | "in_production" | "done";

export interface ProjectBaseline {
  capturedAt: string;
  capturedBy: string;
  salesPrice: number;
  dueDate: string;
  budgetTotal: number;
  lines: BudgetLine[];
}

export type StageKey = "purchasing" | "production" | "installation";

export interface StageLog {
  id: string;
  projectId: string;
  stage: StageKey;
  date: string;
  kind: "note" | "incident";
  text: string;
  responsible?: string;
  itemId?: string;
  createdBy: string;
  createdAt: string;
}

export interface Attachment {
  id: string;
  projectId: string;
  itemId?: string;
  stage?: StageKey;
  stageLogId?: string;
  name: string;
  mimeType: string;
  size: number;
  /** Ruta dentro del bucket de Supabase Storage. */
  storagePath: string;
  uploadedBy: string;
  uploadedAt: string;
}

export interface Operator {
  id: string;
  name: string;
  role: string;
  hourlyCost: number;
  /** false = dado de baja (baja lógica). Sus horas y costos se conservan. */
  active: boolean;
  /** Fecha de la baja. Vacío si está activo. */
  deactivatedAt?: string;
  /** Usuario (auth) vinculado, si el operario entra al sistema. */
  userId?: string;
  email?: string;
  createdAt: string;
  /** Días de la semana que trabaja (0 = domingo … 6 = sábado). Sin dato: lunes a viernes (Lote 6 · Fase 3). */
  workDays?: number[];
}

/** Excepción de un día puntual: "trabaja este sábado (4 h)" o "no viene el viernes". La edita el Jefe de planta. */
export interface DayException {
  operatorId: string;
  date: string;
  works: boolean;
  /** Si trabaja: horas de ese día. Sin dato: la jornada de Configuración. */
  hours?: number;
  note?: string;
  createdBy: string;
  createdAt: string;
}

/**
 * Entrega de material del Jefe de planta a un producto (y un operario): solo cantidades (docs/PLANTA_MATERIALES.md).
 * No es costo: lo es lo que el cierre del día registra como consumo o desperdicio.
 */
export interface MaterialDelivery {
  id: string;
  projectId: string;
  itemId?: string;
  operatorId?: string;
  materialId: string;
  materialName: string;
  unit: string;
  quantity: number;
  /** De dónde salió: el depósito (stock libre) o lo ya asignado al proyecto. */
  source: "warehouse" | "project";
  date: string;
  /** Cierre del día que la cerró (sin cerrar = sigue en planta). */
  closedAt?: string;
  closeId?: string;
  consumed?: number;
  waste?: number;
  leftover?: number;
  createdBy: string;
  createdAt: string;
}

export interface MaterialRequest {
  id: string;
  projectId: string;
  materialId: string;
  materialName: string;
  quantity: number;
  unit: string;
  note?: string;
  requestedBy: string;
  status: "open" | "resolved" | "cancelled";
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

// ── Stock (ledger) ────────────────────────────────────────────

/** Dónde está físicamente (o contablemente) una cantidad de material. */
export type Place =
  | { type: "supplier" }
  | { type: "warehouse" }
  | { type: "project"; projectId: string }
  | { type: "consumed"; projectId: string }
  | { type: "waste"; projectId: string }
  | { type: "converted" };

export type MovementKind =
  | "purchase_in"
  | "opening"
  | "assign"
  | "release"
  | "transfer"
  | "consume"
  | "waste"
  | "to_leftover"
  | "leftover_in"
  | "supplier_return"
  | "adjustment";

/** Medidas opcionales de un sobrante (solo se piden según el tipo de material). */
export interface LeftoverDims {
  lengthMm?: number;
  widthMm?: number;
  thicknessMm?: number;
  finish?: string;
}

export interface StockLot {
  id: string;
  materialId: string;
  materialName: string;
  unit: string;
  /** Costo unitario del lote: viaja con el material aunque se use en otro proyecto. */
  unitCost: number;
  kind: "purchase" | "leftover" | "opening";
  supplier?: string;
  purchaseEntryId?: string;
  /** Proyecto para el que se compró / del que sobró. */
  originProjectId?: string;
  originProjectName?: string;
  parentLotId?: string;
  location?: string;
  dims?: LeftoverDims;
  notes?: string;
  createdBy: string;
  createdAt: string;
}

export interface StockMovement {
  id: string;
  lotId: string;
  kind: MovementKind;
  quantity: number;
  from: Place;
  to: Place;
  date: string;
  /** Proyecto al que se imputa (consumo / desperdicio). */
  projectId?: string;
  itemId?: string;
  /** En to_leftover: lote hijo que recibe la cantidad. */
  intoLotId?: string;
  /** Agrupa los movimientos de una misma acción (ej.: las dos patas de un sobrante). */
  groupId?: string;
  note?: string;
  createdBy: string;
  createdAt: string;
}

export interface ReusableMaterial {
  id: string;
  materialId: string;
  materialName: string;
  quantity: number;
  unit: string;
  unitCost: number;
  originProjectId: string;
  originProjectName: string;
  createdAt: string;
}

export interface CatalogMaterial {
  id: string;
  name: string;
  unit: string;
  /** Costo de referencia (último conocido). Solo se usa si no hay compra ni presupuesto. */
  referenceCost: number;
  /** Rubro al que pertenece normalmente. */
  rubro: RubroId;
}

export interface AlertSettings {
  categoryWarningPct: number;
  categoryCriticalPct: number;
  marginWarningPp: number;
  marginCriticalPp: number;
  daysWithoutRecords: number;
  dueSoonDays: number;
  /** Alerta si pasó este % del plazo y el proyecto todavía no llegó a Producción. */
  deadlineNoProductionPct: number;
  /** Desvío de horas (Lote 5B, supuesto a ajustar): alerta si las horas reales superan las previstas en este %… */
  hoursDeviationPct: number;
  /** …o en estas horas, lo que ocurra primero. */
  hoursDeviationHours: number;
  /** Compras (Lote 5C, supuesto a ajustar): avisa el material sin comprar que se necesita en estos días o menos. */
  purchaseLeadDays: number;
}

export type AlertKind =
  | "category"
  | "margin"
  | "stale"
  | "due"
  | "reconciliation"
  | "staffing"
  | "hours"
  | "overload"
  | "unassigned"
  | "purchase_due"
  | "purchase_cost"
  /** Compras/Administrativo: pedido en una orden y sin recibir, para una obra que arranca pronto o ya arrancó. */
  | "material_arrival"
  /** Jefe de planta (sin importes): la obra arranca pronto o ya arrancó y el material no está completo. */
  | "material_missing"
  /** Administrativo: material entregado en planta y sin cierre del día (no se sabe cuánto se consumió). */
  | "delivery_open"
  /** Administrativo: resumen con costo de un cierre del día del Jefe de planta. */
  | "day_close"
  /** Compras y Gerencia: Diseño cambió la cantidad de materiales respecto de la cotización. */
  | "design_change";

export interface Alert {
  /** Determinístico: permite marcarla como resuelta. Incluye el nivel para que un agravamiento reaparezca. */
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  kind: AlertKind;
  level: AlertLevel;
  title: string;
  message: string;
  /** Cuánto cuesta, en pesos (solo Administrativo y Compras; nunca Jefe de planta ni Operario). */
  impactAmount?: number;
  /** El costo en puntos de margen sobre el precio de venta (solo Administrativo). */
  impactPoints?: number;
  expectedMargin?: number;
  projectedMargin?: number;
  /** Qué revisar: dónde se resuelve. */
  action?: string;
  /** De dónde sale (registros de horas, asignaciones): la alerta se puede rastrear hasta ellos. */
  records?: string[];
  /**
   * Clave con la que se marca como resuelta: alerta + sus datos (título e importe).
   * Queda resuelta hasta que cambie el dato: si cambia (más horas, otro monto), la alerta vuelve.
   */
  resolutionKey: string;
}

export interface DemoUser {
  name: string;
  role: string;
}

/** Rol del usuario dentro de la empresa. owner/member = Gestión; operator = Taller. */
/**
 * Rol de la cuenta en la base. owner/member = Administrativo (owner es quien creó la empresa),
 * compras = Compras, jefe_planta = Jefe de planta, operator = Operario. Ver lib/permissions.ts.
 */
export type AppRole = "owner" | "member" | "compras" | "jefe_planta" | "operator";

// ─────────────────────────────────────────────────────────────
// Contratos de las cinco sesiones que TODAVÍA NO TIENEN persistencia en la base (ver PENDIENTES_BACKEND.md).
// La interfaz los usa con "Datos de ejemplo" (marcados) o sin datos; nunca simula un guardado.
// ─────────────────────────────────────────────────────────────

/** Factura al cliente (o cuota prevista). Facturación ≠ precio de venta ≠ cobro. */
export interface ClientInvoice {
  id: string;
  projectId: string;
  /** "issued" = facturada · "planned" = prevista (todavía no se facturó). */
  status: "issued" | "planned";
  /** Fecha de la factura (o la prevista). */
  date: string;
  /** Importe sin IVA (la misma base que el precio de venta). */
  amount: number;
  number?: string;
  /** Vencimiento del cobro. */
  dueDate?: string;
  /** Fecha en que se cobró (sin dato = no se cobró). */
  collectedAt?: string;
  concept?: string;
}

/** Cómo va la negociación de una cotización. */
export type NegotiationStatus = "sent" | "negotiating" | "waiting_client";

/** Información comercial de una cotización (o de una oportunidad sin proyecto todavía). */
export interface Opportunity {
  id: string;
  /** Proyecto en Cotización, si existe. */
  projectId?: string;
  ref: string;
  client: string;
  name: string;
  /** Importe cotizado (sin IVA). */
  amount: number;
  expectedApprovalDate?: string;
  startDate?: string;
  dueDate?: string;
  /** 0 a 100. null = sin estimar (nunca se inventa). */
  probability: number | null;
  negotiation: NegotiationStatus;
  /** Horas presupuestadas por rubro de trabajo (nombre del rubro → horas). */
  hoursByRubro: Record<string, number>;
}

/** Capacidad de un rubro de trabajo (Configuración de Gerencia). */
export interface RubroCapacity {
  rubro: string;
  employees: number;
  hoursPerDay: number;
  /** Días de la semana (0 = domingo … 6 = sábado). */
  workDays: number[];
}

/** Parámetros de Gerencia sin persistencia todavía. */
export interface ManagementParams {
  /** Inflación mensual estimada, en %. */
  inflationMonthlyPct: number;
  /** Formato del código de proyecto: {prefijo}{numero}_{cliente}_{nombre}. */
  projectCodePattern: string;
  projectCodePrefix: string;
  /** Rubros de trabajo de la empresa (texto libre). */
  workRubros: Array<{ name: string; active: boolean }>;
  /** Puesto del operario → rubro de trabajo (para no contar dos veces a quien trabaja en varios rubros). */
  roleToRubro: Record<string, string>;
}

/** Cliente (la tabla existe en la base; su lectura y edición desde la app están pendientes). */
export interface ClientRecord {
  id: string;
  name: string;
  contact?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  active: boolean;
}

/** Proveedor (directorio compartido Administración ↔ Compras). */
export interface SupplierRecord {
  id: string;
  name: string;
  contact?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  catalogUrl?: string;
}

/** Estado de los planos de un mueble (Diseño). No reemplaza las etapas del mueble. */
export type DesignStatus = "preparing" | "sent" | "waiting_approval" | "approved";

/** Etapas de un mueble: pueden estar varias activas a la vez. */
export type FurnitureStage = "design" | "purchasing" | "production" | "installation" | "done";

/** Línea de la lista de materiales (BOM) de un mueble. */
export interface BomLine {
  material: string;
  spec?: string;
  quantity: number;
  unit: string;
  notes?: string;
}

/** Lo que Diseño agrega a cada mueble (sin persistencia todavía). */
export interface FurnitureDesign {
  itemId: string;
  designStatus: DesignStatus;
  stages: FurnitureStage[];
  bom: BomLine[];
  bomStatus: "draft" | "ready";
  notes?: string;
}

/** Rechazo comercial de una cotización: queda el motivo; no es un estado más del proyecto. */
export interface CommercialRejection {
  projectId: string;
  date: string;
  reason: string;
}

// ─────────────────────────────────────────────────────────────
// Registros de la demo integral (contratos del frontend). En el modo demostración se guardan en el navegador; la
// persistencia real en la base es del equipo de backend (PENDIENTES_BACKEND.md). Todos los importes son sin IVA.
// ─────────────────────────────────────────────────────────────

/** Factura de venta emitida al cliente (la registra Gerencia). Facturado ≠ cobrado. */
export interface SalesInvoice {
  id: string;
  projectId: string;
  number: string;
  /** Fecha de emisión: define el mes de facturación. */
  date: string;
  amount: number;
  notes?: string;
  createdBy: string;
  createdAt: string;
}

/** Cobro real (fecha de ingreso). Sin factura = anticipo/seña; después se puede aplicar a una factura sin duplicarse. */
export interface Collection {
  id: string;
  projectId: string;
  /** Factura a la que se aplica; vacío = anticipo todavía sin factura. */
  invoiceId?: string;
  date: string;
  amount: number;
  notes?: string;
  createdBy: string;
  createdAt: string;
}

/**
 * Pago a un proveedor, confirmado por Gerencia sobre la factura que Compras cargó en la orden de compra.
 * Un pago no es ingreso ni un costo nuevo: el costo del material ya está en el proyecto.
 */
export interface SupplierPayment {
  id: string;
  orderId: string;
  date: string;
  amount: number;
  reference: string;
  by: string;
  at: string;
}

/** Cambio del monto contratado vigente (Administración, con motivo). El monto original aprobado no se pisa. */
export interface ContractRevision {
  id: string;
  projectId: string;
  previous: number;
  next: number;
  reason: string;
  by: string;
  at: string;
}

/** Un cobro previsto (seña, cuota o saldo). */
export interface ScheduledPayment {
  id: string;
  label: string;
  amount: number;
  /** Fecha prevista de cobro. */
  date: string;
}

/** Condiciones de pago pactadas en la cotización (se usan para el gasto financiero y lo previsto de facturar). */
export interface PaymentTerms {
  projectId: string;
  /** Días después de la entrega en que paga el cliente (pago único). */
  daysAfterDelivery: number;
  /** Seña / cuotas con importe y fecha. Vacío = pago único del total a `daysAfterDelivery` de la entrega. */
  schedule: ScheduledPayment[];
}

/** Línea de un BOM versionado. `budgetLineId` la vincula con la línea de materiales cotizada del mismo mueble. */
export interface BomVersionLine {
  id: string;
  material: string;
  materialId?: string;
  spec?: string;
  quantity: number;
  unit: string;
  budgetLineId?: string;
}

/** BOM de un mueble. Solo la versión publicada alimenta Compras y Planta; publicar otra no pisa lo anterior. */
export interface BomVersion {
  id: string;
  projectId: string;
  itemId: string;
  version: number;
  status: "draft" | "published";
  lines: BomVersionLine[];
  notes?: string;
  createdBy: string;
  createdAt: string;
  publishedAt?: string;
}

/** Entrega real al cliente (la confirma el Jefe de planta). Distinta de la entrega interna de materiales. */
export interface ClientHandover {
  id: string;
  projectId: string;
  date: string;
  by: string;
  notes?: string;
}

/** Horas propias sin proyecto ("Trabajo interno"): no se imputan a ninguna OT. */
export interface InternalHours {
  id: string;
  employeeId: string;
  date: string;
  hours: number;
  task: string;
  createdAt: string;
}

/** Rubro del catálogo de la empresa (Gerencia lo crea, renombra o desactiva; los demás lo eligen). */
export interface RubroCatalogEntry {
  id: string;
  name: string;
  active: boolean;
}

/** Tarifa con vigencia: por rubro, o excepción de una persona (la excepción prevalece). */
export interface RateRecord {
  id: string;
  /** "rubro" + id del rubro, o "employee" + id del empleado. */
  scope: "rubro" | "employee";
  subjectId: string;
  hourlyRate: number;
  validFrom: string;
  createdBy: string;
  createdAt: string;
}

/** Cliente del directorio (alta y edición en la demo). */
export interface ClientEntry extends ClientRecord {
  createdAt: string;
}

/** Proveedor del directorio compartido (alta y edición en la demo). */
export interface SupplierEntry extends SupplierRecord {
  website?: string;
  active: boolean;
  createdAt: string;
}

/** Todos los registros nuevos de la demo integral, en un solo lugar. */
export interface Ledger {
  salesInvoices: SalesInvoice[];
  collections: Collection[];
  supplierPayments: SupplierPayment[];
  contractRevisions: ContractRevision[];
  paymentTerms: PaymentTerms[];
  boms: BomVersion[];
  handovers: ClientHandover[];
  internalHours: InternalHours[];
  rubroCatalog: RubroCatalogEntry[];
  rates: RateRecord[];
  clients: ClientEntry[];
  suppliers: SupplierEntry[];
  /** Tasa mensual de gasto financiero (%), editable por Gerencia. Interés simple, mes de 30 días. */
  financialMonthlyRatePct: number;
}
