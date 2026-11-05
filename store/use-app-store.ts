"use client";
import { validateBomPublication } from "@/lib/bom-commitments";
import { correctSentOrder, reverseLocalReceipt } from "@/lib/purchasing";
import { reverseAssignment } from "@/lib/stock";
import { employeeCost, personnelViews, savePersonnel, demoOperatorEligible, type EmployeeEdit } from "@/lib/personnel";
import { materialCatalog } from "@/lib/material-options";

// ─────────────────────────────────────────────────────────────
// Store global (Zustand). Los datos viven en Supabase: el store los carga
// al entrar (WorkspaceGate), aplica las operaciones puras de lib/ en memoria
// y encola la escritura de lo que cambió. Las acciones confirmadas esperan
// la persistencia y reconcilian el estado antes de permitir otra operación.
// Todas las pantallas leen SIEMPRE de este mismo estado.
// Sólo el rol elegido en la demo (y el operario simulado) se guarda en localStorage.
// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// Store global (Zustand). Los datos viven en Supabase: el store los carga
// al entrar (WorkspaceGate), aplica las operaciones puras de lib/ en memoria
// y encola la escritura de lo que cambió. Las acciones confirmadas esperan
// la persistencia y reconcilian el estado antes de permitir otra operación.
// Todas las pantallas leen SIEMPRE de este mismo estado.
// Sólo el rol elegido en la demo (y el operario simulado) se guarda en localStorage.
// ─────────────────────────────────────────────────────────────
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { AlertSettings, CostSettings, DayException, HourRate, AppRole, Attachment, MaterialDelivery, MaterialRequest, Operator, PriceRecord, Project, PurchaseOrder, ProjectStatus, RubroId, StockLot, ValueCorrection, WorkAssignment, Ledger } from "@/types";
import { DEFAULT_HOUR_RATES, DEFAULT_SETTINGS, DEMO_USERS } from "@/lib/constants";
import { resolveSession, roleKeyOf, sessionRole, type RoleKey, type SessionKey } from "@/lib/permissions";
import { costSettingsError, hourRatesError } from "@/lib/cost-settings";
import { buildSeed } from "@/lib/seed-data";
import * as ops from "@/lib/project-operations";
import * as circuit from "@/lib/circuit";
import { EMPTY_LEDGER, normalizeLedger, addRate as addEmployeeRate, type LedgerCtx } from "@/lib/ledger";
import { closeCheck } from "@/lib/tablero";
import { setRubroNames } from "@/lib/rubros";
import { afterPublishedBom, afterMaterialArrival, configuredOperators } from "@/lib/frontend-work";
import { executeWork, correctExecution, type ExecutionInput, type ExecutionCorrection } from "@/lib/work-execution";
import { correctHours, type HoursCorrectionInput } from "@/lib/hours-review";
import { demoScenario } from "@/lib/demo/escenario";
import { demoDataChanged, pickDemoData, readDemo, setDemoActive, writeDemo } from "./demo-local";
import type { DeliveryChoice } from "@/lib/circuit";
import * as people from "@/lib/operators";
import { createId } from "@/lib/activity";
import { canQuoteProject, checkHours, isBuyer, isManager, isQuoter } from "@/lib/project-rules";
import { completedUnitsError, type ProductInput } from "@/lib/production";
import { EMPTY_STOCK, applyChange, receiveStock, type StockState } from "@/lib/stock";
import { materialKey } from "@/lib/material-reconciliation";
import { createClient } from "@/lib/supabase/client";
import { lotToRow } from "@/lib/supabase/mappers";
import * as remote from "@/lib/supabase/workspace";
import { recordClosure } from "@/lib/supabase/closures";
import { commitLedger, ledgerDelta, loadLedger } from "@/lib/supabase/ledger";
import { buildClosureSnapshot } from "@/lib/closure-snapshot";
import { DEFAULT_COST_SETTINGS, type ScheduleChange, type Workspace, type WorkspaceData } from "@/lib/supabase/workspace";
import { exceptionError, workDaysError } from "@/lib/schedule";
import { tallerCalls } from "@/lib/supabase/taller";
import { invoiceActivity, invoiceEntries, invoiceError, nextOrderNumber, orderDraftError, receiveOrder as receiveOrderLines, type InvoiceInput, type OrderDraft, type ReceiptInput } from "@/lib/purchasing";
import { todayISO } from "@/lib/formatting";
import { hourRatesAt, OVERTIME_SUBJECT, priceChange, priceChangeError, valueAt } from "@/lib/price-history";
import { applyCorrection, correctionError, type CorrectionInput, type CorrectionReceipt } from "@/lib/corrections";
import { assignmentError, type AssignmentInput } from "@/lib/plant";
import { registerMaterialsLocal, closeDay, closeDayPayload, deliverMaterial, deliveryPayload, directMaterialUsage, type CloseDayInput, type DeliveryInput, type DirectMaterialUsageInput } from "@/lib/plant-materials";

const memoryStorage: Storage = {
  length: 0,
  clear: () => undefined,
  getItem: () => null,
  key: () => null,
  removeItem: () => undefined,
  setItem: () => undefined,
};

function safeLocalStorage(): Storage {
  try {
    if (typeof window === "undefined" || !window.localStorage) return memoryStorage;
    const probe = "blerp-storage-probe";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return memoryStorage;
  }
}

export type Result<T = undefined> = { ok: true; value: T } | { ok: false; error: string };

export type SyncStatus = "idle" | "saving" | "error";

interface AppState {
  reviewedHoursKeys: string[];
  projects: Project[];
  /** Asignaciones del Jefe de planta (Lote 5B). */
  assignments: WorkAssignment[];
  /** Estado de compra de las líneas de materiales (Lote 5C). */
  /** Órdenes de compra (Lote 6). Las ven Administrativo y Compras. */
  orders: PurchaseOrder[];
  /** Excepciones de días laborales (Lote 6 · Fase 3). */
  dayExceptions: DayException[];
  /** Entregas de material del Jefe de planta (docs/PLANTA_MATERIALES.md). Solo cantidades. */
  deliveries: MaterialDelivery[];
  operators: Operator[];
  stock: StockState;
  requests: MaterialRequest[];
  settings: AlertSettings;
  /** Multiplicador de horas extra (solo Gestión). */
  costSettings: CostSettings;
  /** Tipos de hora con la tarifa vigente hoy (solo Administrativo). */
  hourRates: HourRate[];
  /** Historial de precios con vigencia (Administrativo: todo · Compras: precios de materiales). */
  priceHistory: PriceRecord[];
  /** Correcciones auditadas de valores congelados (solo Administrativo). */
  corrections: ValueCorrection[];
  /** La empresa tiene los datos de demostración (solo entonces se ofrece "Restaurar datos demo"). */
  isDemo: boolean;
  /**
   * Modo demostración local: el estado es el escenario de prueba guardado en este navegador (store/demo-local.ts).
   * No hay empresa cargada (organizationId null): nada se escribe en la base.
   */
  demoLocal: boolean;
  /** Registros de la empresa (facturas, cobros, BOM, contrato vigente…). Ver lib/ledger.ts. */
  ledger: Ledger;
  /**
   * La base de la empresa guarda los registros del ledger (migración 20261028120000 aplicada). Con eso, esas pantallas
   * funcionan en una empresa real; sin eso (o en la demo local) ver `ledgerBacked` en store/selectors.ts.
   */
  ledgerReady: boolean;
  /**
   * Sesión elegida (Gerencia, Administración, Compras, Jefe de planta, Operario). En la demo, un Administrativo mira
   * cualquiera de las cinco; en una empresa real, un Administrativo elige entre Gerencia y Administración.
   */
  currentMode: SessionKey;
  resolvedAlertIds: string[];

  /** Empresa y usuario de la sesión (null hasta que carga el workspace). */
  organizationId: string | null;
  organizationName: string;
  userId: string | null;
  userName: string;
  userEmail: string;
  /** Rol real del usuario en la empresa. */
  role: AppRole;
  /** Solo para Administrativo viendo la demo como Operario: con qué operario simular el flujo. */
  actingOperatorId: string | null;
  syncStatus: SyncStatus;
  syncError: string | null;

  loadWorkspace: (ws: Workspace) => void;
  refreshWorkspace: () => Promise<void>;
  confirmOperation: <T>(operation: () => Result<T> | Promise<Result<T>>) => Promise<Result<T>>;
  setMode: (mode: SessionKey) => void;
  setActingOperator: (id: string | null) => void;

  createProject: (input: ops.NewProjectInput) => Result<string>;
  updateProject: (
    id: string,
    patch: Partial<Pick<Project, "name" | "client" | "projectType" | "description" | "dueDate" | "owner" | "salesPrice">>,
  ) => Result;
  operationalStageLocal:(id:string,status:"purchasing"|"production",date:string,reason:string)=>Result;
  renameItemLocal:(id:string,itemId:string,name:string)=>Result;
  changeProjectStatus: (id: string, status: ProjectStatus, opts?: { confirmBack?: boolean }) => Result;
  /** Circuito: el cliente no aprobó (queda el motivo). */
  rejectQuote: (id: string, reason: string) => Result;
  /** Circuito: renegociación de precio (el anterior queda en el historial). */
  renegotiatePrice: (id: string, newPrice: number, reason: string) => Result;
  /** Circuito: Administración define la entrega de un proyecto listo. */
  defineDelivery: (id: string, choice: DeliveryChoice, note?: string) => Result;
  addBudgetLine: (id: string, input: ops.BudgetLineInput) => Result;
  updateBudgetLine: (id: string, lineId: string, input: ops.BudgetLineInput) => Result;
  removeBudgetLine: (id: string, lineId: string) => Result;
  closeProject: (id: string) => Result;

  addPurchaseEntry: (id: string, input: ops.PurchaseInput) => Result;
  registerUsage: (id: string, input: ops.MaterialUsageInput) => Result;
  /** Horas contra una asignación (el Operario, en "Mi día"). */
  logHours: (id: string, input: ops.HoursInput) => Result;
  /**
   * Carga manual del Administrativo: crea la asignación (producto + rubro + operario + día, con esas horas previstas)
   * y carga las horas contra ella. Así toda hora tiene su asignación.
   */
  logHoursManual: (id: string, input: ManualHoursInput) => Result;
  addActualEntry: (id: string, input: ops.ActualInput) => Result;

  assignOperators: (id: string, operatorIds: string[]) => Result;
  addItem: (id: string, input: ProductInput) => Result;
  updateItem: (id: string, itemId: string, input: ProductInput) => Result;
  /** Unidades terminadas de un producto: las carga el Jefe de planta (o un Administrativo). */
  setCompletedUnits: (projectId: string, itemId: string, units: number) => Result;
  /** Entrega de material del Jefe de planta a un producto (del depósito o de lo asignado al proyecto). */
  deliverMaterial: (input: DeliveryInput) => Result;
  /** Registro directo de consumo/desperdicio/sobrante sin entrega previa: reutiliza la entrega + cierre del día mismo. */
  directMaterialUsage: (input: DirectMaterialUsageInput) => Result;
  /** Cierre del día del Jefe de planta: unidades terminadas y consumo / desperdicio / sobrante de lo entregado. */
  closeDay: (input: CloseDayInput) => Result;
  removeItem: (id: string, itemId: string) => Result;
  addStageLog: (id: string, input: ops.StageLogInput) => Result;
  addAttachment: (id: string, attachment: Attachment) => Result;
  removeAttachment: (id: string, attachmentId: string) => Result;

  assignStock: (input: Parameters<typeof ops.assignStockToProject>[2]) => Result;
  reverseAssignmentLocal: (movementId:string,reason:string) => Result;
  releaseStock: (input: Parameters<typeof ops.releaseProjectStock>[2]) => Result;
  transferStock: (input: Parameters<typeof ops.transferProjectStock>[2]) => Result;
  returnStockToSupplier: (input: Parameters<typeof ops.returnProjectStockToSupplier>[2]) => Result;
  markLeftover: (input: Parameters<typeof ops.leftoverFromProject>[2]) => Result;
  addStockLot: (input: {
    materialId?: string;
    materialName: string;
    unit: string;
    quantity: number;
    unitCost: number;
    supplier?: string;
    location?: string;
    date: string;
    /** "purchase" = compra para el depósito (por defecto) · "opening" = inventario inicial (material que ya tenía). */
    kind?: "purchase" | "opening";
  }) => Result<StockLot>;
  updateLotLocation: (lotId: string, location: string) => Result;

  saveEmployeeLocal: (input: EmployeeEdit) => Result<string>;
  createEmployeeLocal: (input:people.OperatorInput, profile:Omit<import("@/types").FrontendPersonnel,"employeeId">) => Result<string>;
  createOperator: (input: people.OperatorInput) => Result<string>;
  /** Un cambio de costo por hora vale desde `validFrom` (hoy por defecto): las horas anteriores no cambian. */
  updateOperator: (id: string, input: people.OperatorInput, validFrom?: string) => Result;
  /**
   * Baja lógica: el operario deja de aparecer en equipos y Taller. Sus horas se conservan.
   * `plan` da destino a cada proyecto no finalizado donde estaba asignado (otro operario o null = "Sin asignar").
   */
  deactivateOperator: (id: string, plan?: people.ReassignmentPlan) => Result;
  reactivateOperator: (id: string) => Result;
  /** Solo si no tiene horas registradas. */
  deleteOperator: (id: string) => Result;
  createMaterialRequest: (input: {
    projectId: string;
    materialId: string;
    materialName: string;
    unit: string;
    quantity: number;
    note?: string;
  }) => Result;
  setRequestStatus: (id: string, status: "resolved" | "cancelled") => Result;

  /** Recibe Alert.resolutionKey: si el problema persiste, la alerta reaparece. */
  resolveAlert: (alertId: string) => void;
  reopenAlert: (alertId: string) => void;
  updateSettings: (patch: Partial<AlertSettings>) => Result;
  /** Un cambio del multiplicador de horas extra vale desde `validFrom` (hoy por defecto). */
  updateCostSettings: (patch: Partial<CostSettings>, validFrom?: string) => Result;
  /**
   * Guarda las tarifas como un cambio con "vigente desde" (hoy por defecto). Lo ya cotizado y las horas
   * ya cargadas conservan su valor; un cambio con fecha futura recién aplica ese día.
   */
  saveHourRates: (rates: HourRate[], validFrom?: string) => Result;
  /** Precios de catálogo de materiales con "vigente desde". Solo afectan cotizaciones nuevas. */
  saveCatalogMaterialLocal: (input:{ id?:string;name:string;unit:string;rubro?:string;price:number;validFrom:string }) => Result;
  setMaterialPrices: (prices: Array<{ materialId: string; value: number; previousValue: number }>, validFrom: string) => Result;
  /** Crea (sin id) o modifica una asignación. La hacen el Jefe de planta y Administrativo. */
  saveAssignment: (input: AssignmentInput & { id?: string }) => Result<string>;
  /** Quita una asignación. */
  removeAssignment: (id: string) => Result;
  /** Días laborales y excepciones de un operario: Jefe de planta o Administrativo. */
  saveSchedule: (operatorId: string, change: ScheduleChange) => Result;
  /** Crea (sin id) o modifica una orden en Borrador. Devuelve el id. Compras o Administrativo. */
  saveOrder: (draft: OrderDraft & { id?: string }) => Result<string>;
  sendOrder: (id: string) => Result;
  correctSentOrderLocal: (id: string, reason: string) => Result;
  reverseReceiptLocal: (id: string, movementId: string, reason: string) => Result;
  /** Facturada: crea las compras reales (desde acá cambia el costo real de materiales del proyecto). */
  invoiceOrder: (id: string, invoice: InvoiceInput) => Result;
  /** Pagada sí/no: información financiera, no cambia costos. */
  setOrderPaid: (id: string, paid: boolean) => Result;
  /** Recibe cantidades: el material entra al proyecto. */
  receiveOrder: (id: string, receipts: ReceiptInput[]) => Result;
  /** Corrige un valor congelado (proyecto aprobado o cerrado) con motivo: queda registrado. */
  correctValue: (projectId: string, input: CorrectionInput) => Promise<Result>;
  /** Reemplaza los datos de la empresa por la demo de Madera Sur. */
  resetDemo: () => Promise<Result>;
  /** Abre el modo demostración local (con lo guardado en este navegador, o el escenario de prueba). */
  enterLocalDemo: () => void;
  /** Vuelve el modo demostración local al escenario de prueba. No toca ninguna empresa real. */
  restoreLocalDemo: () => void;
  /** Sale del modo demostración local; la app vuelve a cargar la empresa real. */
  exitLocalDemo: () => void;
  /**
   * Registra en el ledger (facturas, cobros, contrato vigente, BOM, entregas…) con una operación pura de lib/ledger.ts.
   * Modo demostración: queda en el navegador. Empresa real: se guarda en la base (ledger_commit, que vuelve a validar
   * permiso y reglas); si la base todavía no tiene los registros, es "Pendiente de backend".
   * `sessions` = sesiones que pueden hacerlo.
   */
  recordLedger: (sessions: SessionKey[], fn: (ledger: Ledger, ctx: LedgerCtx, state: AppState) => Ledger) => Result;
  /** Demo: el Jefe confirma que la jornada está bien (en una empresa real, planta_confirm_hours). */
  confirmHoursLocal: (key: string) => Result;
  /** Demo: el Jefe redistribuye horas con motivo (en una empresa real, planta_correct_hours). */
  correctHoursLocal: (input: HoursCorrectionInput) => Result;
  executeWorkLocal: (input: ExecutionInput) => Result;
  correctExecutionLocal: (input: ExecutionCorrection) => Result;
  /** Borra todos los datos de la empresa para empezar de cero. */
  clearData: () => Promise<Result>;
  dismissSyncError: () => void;
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Ocurrió un error inesperado.";
}

/** Demostración local (sin empresa): el mismo registro de la corrección que haría la base, hecho en memoria. */
function localCorrectionReceipt(project: Project, input: CorrectionInput, actor: string): CorrectionReceipt {
  const line = project.budgetLines.find((l) => l.id === input.lineId);
  const description = input.target === "sales_price" ? "Precio de venta" : (line?.description ?? "Línea");
  const oldValue = input.target === "sales_price" ? project.salesPrice : input.field === "quantity" ? (line?.quantity ?? null) : (line?.unitCost ?? null);
  return {
    id: createId("cor"),
    correctedAt: new Date().toISOString(),
    correctedBy: actor,
    oldValue,
    description,
    activityId: createId("act"),
    message: `Corrección de ${description.toLowerCase()}: ${oldValue ?? "—"} → ${input.newValue}. Motivo: ${input.reason.trim()}`,
  };
}

export interface ManualHoursInput {
  categoryId?: string;
  requestId?: string;
  operatorId: string;
  itemId: string;
  rubro: RubroId;
  date: string;
  hours: number;
  comment?: string;
  confirmHighHours?: boolean;
}

/**
 * Escenario de prueba de la demostración local: los datos de la demo más sus registros (ledger), la configuración de
 * costos y las tarifas por defecto. Es editable y se puede restaurar.
 */
/**
 * Datos de ejemplo completos: los de la demo más el escenario (facturas, cobros, BOM, condiciones de pago, rubros,
 * tarifas, clientes y proveedores). Es lo que se carga en una empresa nueva y al "Restaurar datos demo".
 */
export function demoWorkspace(): WorkspaceData & { ledger: Ledger } {
  const data = demoData();
  const scenario = demoScenario({ projects: data.projects, stock: data.stock, orders: data.orders });
  return { ...data, projects: scenario.projects, ledger: scenario.ledger };
}

export function demoFixture(): Record<string, unknown> {
  const { ledger, ...data } = demoWorkspace();
  const nextNumber = Math.max(0, ...data.projects.map((p) => Number(/(\d+)/.exec(p.code)?.[1] ?? 0))) + 1;
  return {
    ...data,
    dayExceptions: data.dayExceptions ?? [],
    deliveries: [],
    reviewedHoursKeys: [],
    costSettings: { ...DEFAULT_COST_SETTINGS },
    hourRates: DEFAULT_HOUR_RATES.map((r) => ({ ...r })),
    priceHistory: [],
    corrections: [],
    ledger: { ...ledger, projectNomenclature: ledger.projectNomenclature ?? { pattern: "{prefijo}{numero}", prefix: "OT", nextNumber } },
  };
}

export function demoData(): WorkspaceData {
  const seed = buildSeed(new Date());
  return {
    projects: seed.projects,
    assignments: seed.assignments,
    orders: seed.orders,
    dayExceptions: seed.dayExceptions,
    operators: seed.operators,
    stock: seed.stock,
    requests: [],
    settings: { ...DEFAULT_SETTINGS },
    resolvedAlertIds: [],
  };
}

const EMPTY_DATA: WorkspaceData = {
  projects: [],
  assignments: [],
  orders: [],
  dayExceptions: [],
  operators: [],
  stock: EMPTY_STOCK,
  requests: [],
  settings: { ...DEFAULT_SETTINGS },
  resolvedAlertIds: [],
};

/**
 * Quién está operando: el rol de la cuenta o, en una empresa demo, el rol elegido por un Administrativo
 * (con su usuario de ejemplo; como Operario, el operario elegido).
 */
export function effectiveIdentity(
  s: Pick<AppState, "role" | "currentMode" | "isDemo" | "operators" | "userId" | "userEmail" | "actingOperatorId" | "userName"> & Partial<Pick<AppState,"ledger" | "demoLocal">>,
): {
  role: AppRole;
  /** Rol de la base con el que se escribe. */
  roleKey: RoleKey;
  /** Sesión de pantalla (qué pestañas y qué datos se muestran). */
  session: SessionKey;
  operator: Operator | undefined;
  actor: string;
} {
  if (s.role === "operator") {
    const operator = people.operatorForUser(s.operators, s.userId, s.userEmail);
    return { role: "operator", roleKey: "operario", session: "operario", operator, actor: operator?.name ?? s.userName };
  }
  const real = roleKeyOf(s.role);
  // Administración (rol propio): una sola sesión; la base le entrega y le acepta solo lo suyo.
  if (real === "comercial") return { role: s.role, roleKey: "comercial", session: "administracion", operator: undefined, actor: s.userName };
  // Demo: un Administrativo mira cualquiera de las cinco sesiones. Empresa real: las de su rol (Gerencia / Administración).
  const view: SessionKey = real === "admin" && s.isDemo && s.currentMode ? s.currentMode : resolveSession(real, s.currentMode);
  const selected = s.demoLocal ? s.operators.find((o) => o.id === s.actingOperatorId && o.active && s.ledger?.personnel?.some((p) => p.employeeId === o.id && p.enabled && personnelViews(p).includes(view))) : undefined;
  if (selected && view !== "operario") return { role:view === "gerencia" || view === "administracion" ? s.role : view,roleKey:sessionRole(view),session:view,operator:selected,actor:selected.name };
  if (view === "operario") {
    // En la demo siempre hay un operario elegido: el que se eligió o, si no, el primero activo.
    const eligible = s.demoLocal ? s.operators.filter((o)=>demoOperatorEligible(s.ledger ?? {},o)) : s.operators.filter((o)=>o.active);
    const operator = eligible.find((o) => o.id === s.actingOperatorId) ?? eligible[0];
    return { role: "operator", roleKey: "operario", session: "operario", operator, actor: operator?.name ?? s.userName };
  }
  if (view === "compras" || view === "jefe_planta") {
    return { role: view, roleKey: view, session: view, operator: undefined, actor: real === "admin" ? DEMO_USERS[view].name : s.userName };
  }
  return { role: s.role, roleKey: sessionRole(view), session: view, operator: undefined, actor: s.userName };
}

export const useAppStore = create<AppState>()(
  persist(
    (rawSet, rawGet) => {
      let transaction: AppState | undefined;
      const get = () => transaction ?? rawGet();
      // Persist the candidate before publishing it to any of the five views. A rejected write leaves
      // both the last durable snapshot and the shared state intact; the form keeps its unsaved input.
      const set = (patch: Partial<AppState>) => {
        if (transaction) { transaction = { ...transaction, ...patch }; return; }
        const previous = get();
        const next = { ...previous, ...patch };
        if (typeof window !== "undefined" && previous.demoLocal && next.demoLocal && demoDataChanged(next as unknown as Record<string, unknown>, previous as unknown as Record<string, unknown>)
          && !writeDemo(pickDemoData(next as unknown as Record<string, unknown>))) {
          throw new ops.DomainError("El cambio no quedó guardado: falló el almacenamiento local. Conservamos los datos anteriores; reintentá cuando haya espacio o el almacenamiento esté habilitado.");
        }
        rawSet(patch);
      };
      const ctx = (): ops.Ctx => {
        const id = effectiveIdentity(get());
        return { actor: id.actor, now: new Date().toISOString(), role: id.role, operatorId: id.operator?.id };
      };

      // Cola de escrituras: se ejecutan en orden para que un proyecto exista antes que sus hijos.
      let queue: Promise<unknown> = Promise.resolve();
      let pending = 0;
      let revision = 0;
      let confirming = false;
      let refreshInFlight: Promise<void> | null = null;
      const refreshWorkspace = (duringConfirmation = false): Promise<void> => {
        if (refreshInFlight) return duringConfirmation ? refreshInFlight.then(() => refreshWorkspace(true)) : refreshInFlight;
        if (!get().organizationId || pending || (confirming && !duringConfirmation)) return Promise.resolve();
        const start = revision;
        const org = get().organizationId;
        refreshInFlight = remote.loadWorkspace(createClient()).then((ws) => {
          if (start === revision && !pending && (!confirming || duringConfirmation) && org === get().organizationId) get().loadWorkspace(ws);
        }).finally(() => { refreshInFlight = null; });
        return refreshInFlight;
      };
      const persistRemote = (write: (db: ReturnType<typeof createClient>, org: string) => Promise<unknown>) => {
        const org = get().organizationId;
        if (!org) return queue;
        revision += 1;
        pending += 1;
        set({ syncStatus: "saving" });
        queue = queue
          .then(() => {
            if (get().syncStatus === "error") throw new Error("Hay un guardado fallido. Actualizá los datos antes de continuar.");
            return write(createClient(), org);
          })
          .then(
            () => {
              pending -= 1;
              if (pending === 0 && get().syncStatus === "saving") set({ syncStatus: "idle" });
            },
            (e: unknown) => {
              pending -= 1;
              set({ syncStatus: "error", syncError: `No se pudo guardar: ${errorMessage(e)}. Recargá la página para ver el estado guardado.` });
            },
          );
        return queue;
      };

      const requirePhysicalWriter = () => {
        if (get().demoLocal && effectiveIdentity(get()).session === "gerencia") throw new ops.DomainError("Gerencia solo consulta materiales. Compras o Planta deben conciliar los movimientos antes del cierre.");
      };

      /** Guarda en memoria lo que cambió y encola su escritura. Todas las vistas leen de acá. */
      const commit = (next: { projects?: Project[]; stock?: StockState; operators?: Operator[]; requests?: MaterialRequest[] }) => {
        const prev = get();
        if (next.stock && next.stock !== prev.stock) requirePhysicalWriter();
        let projects = next.projects ?? prev.projects;
        if (prev.demoLocal && next.stock) {
          const old = new Set(prev.stock.movements.map((m) => m.id));
          const arrived = next.stock.movements.filter((m) => !old.has(m.id) && m.to.type === "project").map((m) => m.to.type === "project" ? m.to.projectId : "");
          projects = afterMaterialArrival(projects,arrived,ctx());
        }
        const stock = next.stock ?? prev.stock;
        const operators = next.operators ?? prev.operators;
        const requests = next.requests ?? prev.requests;
        // Compras escribe solo órdenes de compra (con sus funciones) y el stock es solo consulta; el Jefe de planta, asignaciones.
        if (prev.role === "jefe_planta" || prev.role === "compras") {
          throw new ops.DomainError("Con tu rol no se cargan estos datos en Blerp.");
        }
        set({ projects, stock, operators, requests });
        if (prev.role === "operator") {
          // Taller no escribe tablas: cada registro nuevo va a su función del servidor (que calcula los costos).
          const calls = tallerCalls({ projects: prev.projects, stock: prev.stock, requests: prev.requests }, { projects, stock, requests }, prev.organizationId ?? "");
          void persistRemote((db) => remote.runTallerCalls(db, calls));
          return;
        }
        const writer = prev.role === "comercial" ? remote.commitComercialChange : remote.commitChange;
        void persistRemote((db, org) => writer(db, org, prev, { projects, stock, operators, requests }));
      };

      /** A demo operation publishes and persists one complete candidate, including multi-step legacy actions. */
      const guardResult = <T,>(fn: () => Result<T>): Result<T> => {
        const ownsTransaction = get().demoLocal && !transaction;
        if (ownsTransaction) transaction = rawGet();
        try {
          const result = fn();
          if (ownsTransaction) {
            const next = transaction!;
            transaction = undefined;
            if (result.ok) set(next);
          }
          return result;
        } catch (e) {
          return { ok: false, error: errorMessage(e) };
        } finally { if (ownsTransaction) transaction = undefined; }
      };
      /** Corre una operación y devuelve Result (nunca lanza). */
      const run = <T,>(fn: () => T): Result<T> => guardResult(() => ({ ok: true, value: fn() }));
      const guardVoid = (fn: () => void) => {
        try { fn(); } catch (e) {
          // The rejected data never entered state. Keep the existing global error visible for void actions.
          try { rawSet({ syncStatus: "error", syncError: errorMessage(e) }); } catch { /* UI storage may also be full. */ }
        }
      };

      const find = (id: string): Project => {
        const project = get().projects.find((p) => p.id === id);
        if (!project) throw new ops.DomainError("Proyecto no encontrado.");
        return project;
      };

      const requireManager = (what: string) => {
        if (!isManager(effectiveIdentity(get()).role)) throw new ops.DomainError(`${what} lo hace un usuario Administrativo.`);
      };
      /** Cotizar: Administrativo, o Administración mientras el proyecto está en cotización o aprobado. */
      const requireQuoter = (what: string, project?: Project) => {
        const role = effectiveIdentity(get()).role;
        if (!isQuoter(role)) throw new ops.DomainError(`${what} lo hace un usuario Administrativo o de Administración.`);
        if (project && !canQuoteProject(role, project)) throw new ops.DomainError(`${what}: con el proyecto ya en marcha lo hace Gerencia.`);
      };


      /** Aplica una operación pura sobre un proyecto. */
      const mutate = (id: string, fn: (p: Project) => Project): Result =>
        run(() => {
          const project = find(id);
          const next = fn(project);
          commit({ projects: get().projects.map((p) => (p.id === id ? next : p)) });
          return undefined;
        });

      /** Aplica una operación que toca proyectos y stock a la vez. */
      const mutateStock = (fn: (s: ReturnType<typeof get>) => { projects: Project[]; stock: StockState }): Result =>
        run(() => {
          const res = fn(get());
          commit({ projects: res.projects, stock: res.stock });
          return undefined;
        });

      /** Órdenes de compra: Compras o Administrativo (la base valida lo mismo). */
      const findOrder = (id: string): PurchaseOrder => {
        if (!isBuyer(effectiveIdentity(get()).role)) throw new ops.DomainError("Las órdenes de compra las maneja Compras o un usuario Administrativo.");
        const o = get().orders.find((x) => x.id === id);
        if (!o) throw new ops.DomainError("Orden no encontrada.");
        return o;
      };
      const replaceOrder = (o: PurchaseOrder) => set({ orders: get().orders.map((x) => (x.id === o.id ? o : x)) });

      /** Reemplaza todos los datos de la empresa (reset demo / vaciar). Espera a las escrituras previas. */
      const replaceAll = (data: WorkspaceData, isDemo: boolean): Promise<Result> => {
        const org = get().organizationId;
        if (!org) return Promise.resolve({ ok: false, error: "Todavía no cargó tu empresa." });
        set({ syncStatus: "saving" });
        const run2 = queue.then(async (): Promise<Result> => {
          try {
            await remote.replaceWorkspace(createClient(), org, isDemo ? data : null);
            set({ ...data, dayExceptions: data.dayExceptions ?? [], deliveries: data.deliveries ?? [], ledger: get().ledgerReady ? (data.ledger ?? EMPTY_LEDGER) : EMPTY_LEDGER, isDemo, currentMode: "gerencia", actingOperatorId: null, syncStatus: "idle", syncError: null });
            return { ok: true, value: undefined };
          } catch (e) {
            set({ syncStatus: "error", syncError: `No se pudo guardar: ${errorMessage(e)}` });
            return { ok: false, error: errorMessage(e) };
          }
        });
        queue = run2;
        return run2;
      };

      /** Agrega registros al historial de precios (en memoria y en la base). El historial solo crece. */
      const addHistory = (records: PriceRecord[]) => {
        if (records.length === 0) return;
        set({ priceHistory: [...get().priceHistory, ...records] });
        void persistRemote((db, org) => remote.addPriceRecords(db, org, records));
      };

      /** Registros de un cambio de valor con vigencia. */
      const changeOf = (kind: PriceRecord["kind"], subjectId: string, value: number, previousValue: number, validFrom: string) =>
        priceChange(get().priceHistory, { kind, subjectId, value, validFrom, previousValue, createdBy: effectiveIdentity(get()).actor, now: new Date().toISOString() });

      return {
        ...EMPTY_DATA,
        reviewedHoursKeys: [],
        dayExceptions: [],
        deliveries: [],
        demoLocal: false,
        ledger: EMPTY_LEDGER,
        ledgerReady: false,
        costSettings: { ...DEFAULT_COST_SETTINGS },
        hourRates: DEFAULT_HOUR_RATES.map((r) => ({ ...r })),
        priceHistory: [],
        corrections: [],
        isDemo: false,
        currentMode: "gerencia",
        organizationId: null,
        organizationName: "",
        userId: null,
        userName: "",
        userEmail: "",
        role: "owner",
        actingOperatorId: null,
        syncStatus: "idle",
        syncError: null,

        refreshWorkspace,
        confirmOperation: async (operation) => {
          if (confirming || pending) return { ok: false, error: "Hay un guardado en curso. Esperá un momento." };
          if (get().syncStatus === "error") return { ok: false, error: "Actualizá los datos antes de volver a guardar." };
          confirming = true;
          revision += 1;
          set({ syncStatus: "saving" });
          try {
            const result = await operation();
            await queue;
            const error = get().syncError;
            if (error) {
              await refreshWorkspace(true).catch(() => undefined);
              return { ok: false, error };
            }
            set({ syncStatus: "idle" });
            // Releer también en éxito: costos, IDs y numeración pertenecen al servidor.
            await refreshWorkspace(true).catch(() => {
              set({ syncStatus: "error", syncError: "Guardado confirmado. No pudimos actualizar las vistas; actualizá antes de seguir." });
            });
            return result;
          } catch (e) {
            set({ syncStatus: "error", syncError: "No se pudo verificar el estado guardado. Actualizá antes de reintentar." });
            return { ok: false, error: errorMessage(e) };
          } finally { confirming = false; }
        },
        loadWorkspace: (ws) => {
          set({
            reviewedHoursKeys: ws.reviewedHoursKeys ?? [],
            projects: ws.projects,
            assignments: ws.assignments,
            orders: ws.orders,
            dayExceptions: ws.dayExceptions ?? [],
            deliveries: ws.deliveries ?? [],
            operators: ws.operators,
            stock: ws.stock,
            requests: ws.requests,
            settings: ws.settings,
            costSettings: ws.costSettings,
            hourRates: ws.hourRates,
            priceHistory: ws.priceHistory,
            corrections: ws.corrections,
            isDemo: ws.isDemo,
            // Una empresa real nunca usa los datos de la demostración local.
            demoLocal: false,
            ledger: ws.ledger ?? EMPTY_LEDGER,
            ledgerReady: ws.ledger !== null,
            resolvedAlertIds: ws.resolvedAlertIds,
            organizationId: ws.organizationId,
            organizationName: ws.organizationName,
            userId: ws.userId,
            userName: ws.userName,
            userEmail: ws.userEmail,
            role: ws.role,
            // El rol elegido para mirar la demo solo vale en una empresa demo.
            currentMode: ws.isDemo ? get().currentMode : resolveSession(roleKeyOf(ws.role), get().currentMode),
            syncStatus: "idle",
            syncError: null,
          });
          // Datos del modelo anterior: el ledger derivado se guarda una sola vez.
          if (ws.stockMigrated) void persistRemote((db, org) => remote.syncStock(db, org, EMPTY_STOCK, ws.stock));
        },

        setMode: (mode) => {
          // Como Operario, la demo arranca con el primer operario activo (nunca "elegí un operario").
          const { operators, actingOperatorId } = get();
          const valid = operators.some((o) => o.id === actingOperatorId && o.active);
          set({ currentMode: mode, actingOperatorId: valid ? actingOperatorId : (operators.find((o) => o.active)?.id ?? null) });
        },
        setActingOperator: (id) => set({ actingOperatorId: id }),

        createProject: (input) =>
          run(() => {
            requireQuoter("Crear proyectos");
            const project = ops.createProject(input, ctx());
            commit({ projects: [project, ...get().projects] });
            return project.id;
          }),

        updateProject: (id, patch) =>
          mutate(id, (p) => {
            requireQuoter("Editar el proyecto", p);
            return { ...p, ...patch, updatedAt: new Date().toISOString() };
          }),

        operationalStageLocal:(id,status,date,reason)=>mutate(id,(p)=>{
          const st=get();if(!st.demoLocal || effectiveIdentity(st).session!=="jefe_planta") throw new ops.DomainError("Solo Planta administra el paso operativo entre Compras y Producción en demo local.");
          if(p.isClosed || !["purchasing","production"].includes(p.status) || !st.ledger.boms.some(b=>b.projectId===id && b.status==="published"))throw new ops.DomainError("Se requiere un proyecto abierto con BOM publicado.");
          if(status===p.status && (status!=="production" || p.productionDecision))return p;
          if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>todayISO()||reason.trim().length<3)throw new ops.DomainError("Indicá fecha efectiva no futura y motivo.");
          const who=ctx();return {...p,status,procurementNotifiedAt:p.procurementNotifiedAt??who.now,productionDecision:status==="production" ? p.productionDecision??{date,reason:reason.trim(),by:who.actor,at:who.now}:p.productionDecision,updatedAt:who.now,activity:[...p.activity,{id:createId("stage"),kind:"status",at:who.now,actor:who.actor,message:`Planta: ${status==="production"?"inicio decidido de Producción":"materiales adicionales: vuelve a Compras"} (${date}). ${reason.trim()}`}]};
        }),
        renameItemLocal:(id,itemId,name)=>mutate(id,(p)=>{
          if(!get().demoLocal || effectiveIdentity(get()).session!=="administracion" || p.isClosed)throw new ops.DomainError("Administración renombra muebles de proyectos abiertos en demo local.");
          if(name.trim().length<2 || !p.items.some(i=>i.id===itemId))throw new ops.DomainError("Mueble o nombre inválido.");
          const who=ctx();return {...p,items:p.items.map(i=>i.id===itemId?{...i,quotationName:i.quotationName??i.name,name:name.trim()}:i),updatedAt:who.now,activity:[...p.activity,{id:createId("rename"),kind:"budget",at:who.now,actor:who.actor,message:`Nombre operativo del mueble ${itemId}: ${name.trim()}. Cotización original conservada.`}]};
        }),
        changeProjectStatus: (id, status, opts) => mutate(id, (p) => {
          const st=get();if(st.demoLocal){const session=effectiveIdentity(st).session;const notified=p.procurementNotifiedAt || st.ledger.boms.some(b=>b.projectId===id&&b.status==="published") || ["purchasing","production","installation","completed"].includes(p.status);
          if(!notified && p.status==="approved" && ["purchasing","production"].includes(status))throw new ops.DomainError("Publicá el BOM para comunicar la necesidad a Compras antes de avanzar.");
          if(notified && ["approved","quotation"].includes(status) && status!==p.status)throw new ops.DomainError("La necesidad ya llegó a Compras: retroceso bloqueado.");
          if(notified && status!==p.status && session==="administracion")throw new ops.DomainError("Después de publicar el BOM, Planta administra las etapas operativas.");
          if(["purchasing","production"].includes(p.status)&&["purchasing","production"].includes(status)&&p.status!==status)throw new ops.DomainError("Usá la acción de Planta con fecha y motivo.");}
          return ops.changeStatus(p,status,ctx(),opts);
        }),
        rejectQuote: (id, reason) =>
          isQuoter(effectiveIdentity(get()).role)
            ? mutate(id, (p) => circuit.recordRejection(p, reason, ctx()))
            : { ok: false, error: "Lo registra Administración." },
        renegotiatePrice: (id, newPrice, reason) =>
          isQuoter(effectiveIdentity(get()).role)
            ? mutate(id, (p) => circuit.recordRenegotiation(p, newPrice, reason, ctx()))
            : { ok: false, error: "Lo registra Administración." },
        defineDelivery: (id, choice, note) =>
          isManager(effectiveIdentity(get()).role)
            ? mutate(id, (p) => {
                const decided = circuit.recordDeliveryDecision(p, choice, ctx(), note);
                // Flete e instalación: además pasa a la etapa Instalación (de a una, como siempre).
                return choice === "freight" && p.status === "production" ? ops.changeStatus(decided, "installation", ctx()) : decided;
              })
            : { ok: false, error: "Lo define Administración." },

        addBudgetLine: (id, input) =>
          mutate(id, (p) => {
            if (get().demoLocal && (p.baseline || p.status !== "quotation")) throw new ops.DomainError("La cotización aprobada es inmutable; editá el BOM.");
            requireQuoter("Editar el costo presupuestado", p);
            return ops.addBudgetLine(p, input, ctx());
          }),
        updateBudgetLine: (id, lineId, input) =>
          mutate(id, (p) => {
            if (get().demoLocal && (p.baseline || p.status !== "quotation")) throw new ops.DomainError("La cotización aprobada es inmutable; editá el BOM.");
            requireQuoter("Editar el costo presupuestado", p);
            return ops.updateBudgetLine(p, lineId, input, ctx());
          }),
        removeBudgetLine: (id, lineId) =>
          mutate(id, (p) => {
            if (get().demoLocal && (p.baseline || p.status !== "quotation")) throw new ops.DomainError("La cotización aprobada es inmutable; editá el BOM.");
            requireQuoter("Editar el costo presupuestado", p);
            return ops.removeBudgetLine(p, lineId, ctx());
          }),

        closeProject: (id) =>
          run(() => {
            const project = find(id);
            if (get().demoLocal || get().ledgerReady) {
              // Cierra solo Gerencia, con todo terminado, la entrega real y sin materiales sin rendir.
              if (effectiveIdentity(get()).session !== "gerencia") throw new ops.DomainError("El cierre lo hace Gerencia.");
              const check = closeCheck(project, get().ledger, get().stock, get().orders, get().deliveries, { assignments:get().assignments,operators:get().operators,today:todayISO(),threshold:{ pct:get().settings.hoursDeviationPct,hours:get().settings.hoursDeviationHours },reviewed:get().reviewedHoursKeys });
              if (check.blockers.length) throw new ops.DomainError(check.blockers.join(" "));
              const closed = ops.closeProject(project, get().stock, ctx());
              const closure = { projectId: id, date: ctx().now.slice(0, 10), by: ctx().actor, pendingCosts: check.warnings };
              if (get().demoLocal) {
                set({ projects: get().projects.map((p) => (p.id === id ? closed : p)), ledger: { ...get().ledger, closures: [...get().ledger.closures.filter((c) => c.projectId !== id), closure] } });
                return undefined;
              }
              commit({ projects: get().projects.map((p) => (p.id === id ? closed : p)) });
              set({ ledger: { ...get().ledger, closures: [...get().ledger.closures.filter((c) => c.projectId !== id), closure] } });
              // El cierre congelado lleva quién cerró y los avisos (costos pendientes). Si fallara, se completa en la próxima carga.
              void persistRemote(async (db) => {
                try {
                  await recordClosure(db, buildClosureSnapshot(closed, { closedBy: closure.by, pendingCosts: closure.pendingCosts }));
                } catch (e) {
                  console.warn("No se pudo guardar el historial del cierre:", errorMessage(e));
                }
              });
              return undefined;
            }
            const closed = ops.closeProject(project, get().stock, ctx());
            commit({ projects: get().projects.map((p) => (p.id === id ? closed : p)) });
            // El cierre queda congelado para el historial. Va en la misma cola (después de guardar el cierre) y,
            // si fallara, NO frena la app: se completa en la próxima carga (backfillClosures).
            void persistRemote(async (db) => {
              try {
                await recordClosure(db, buildClosureSnapshot(closed));
              } catch (e) {
                console.warn("No se pudo guardar el historial del cierre:", errorMessage(e));
              }
            });
            return undefined;
          }),

        addPurchaseEntry: (id, input) =>
          run(() => {
            const project = find(id);
            const res = ops.addPurchase(project, get().stock, input, ctx());
            commit({ projects: get().projects.map((p) => (p.id === id ? res.project : p)), stock: res.stock });
            return undefined;
          }),

        registerUsage: (id, input) =>
          run(() => {
            if (effectiveIdentity(get()).session === "administracion") throw new ops.DomainError("El consumo lo registra Planta.");
            if (get().demoLocal && effectiveIdentity(get()).session !== "jefe_planta") throw new ops.DomainError("El consumo lo registra exclusivamente Planta.");
            const project = find(id);
            // El dominio legado exige el rol de escritura general. En demo la sesión se valida arriba;
            // este adaptador reutiliza su valoración y movimientos sin ampliar permisos de otras rutas.
            const localContext = ctx();
            const res = ops.registerUsage(project, get().stock, input, get().settings, get().demoLocal ? { ...localContext, role: "owner" } : localContext);
            commit({ projects: get().projects.map((p) => (p.id === id ? res.project : p)), stock: res.stock });
            return undefined;
          }),

        logHours: (id, input) =>
          mutate(id, (p) => {
            if (effectiveIdentity(get()).session === "administracion") throw new ops.DomainError("Administración solo registra sus propias horas.");
            if (get().demoLocal && input.requestId && p.actualEntries.some((e) => e.id === input.requestId)) return p;
            const assignment = get().assignments.find((a) => a.id === input.assignmentId);
            if (assignment) {
              const check = checkHours(get().projects.flatMap((p) => p.actualEntries), assignment.operatorId, assignment.date, input.hours, todayISO(), get().costSettings.hoursPerDay);
              if (check.level === "block") throw new ops.DomainError(check.message);
            }
            const { costSettings, ledger } = get();
            let categoryId = input.categoryId;
            const costAt = (op: Operator, date: string) => {
              const valued = employeeCost(ledger, op, date, input.categoryId, get().priceHistory);
              if (valued.category && (assignment?.hourKind ?? "labor") !== valued.category) throw new ops.DomainError("La categoría laboral no corresponde al trabajo de la asignación.");
              categoryId = valued.categoryId;
              return valued.hourlyCost;
            };
            const next = ops.logHours(p, get().operators, get().assignments, { ...input, workdayHours: costSettings.hoursPerDay }, get().settings, ctx(), costAt);
            return { ...next, actualEntries: next.actualEntries.map((e) => e === next.actualEntries.at(-1) ? { ...e, categoryId } : e) };
          }),

        logHoursManual: (id, input) => {
          if (effectiveIdentity(get()).session === "administracion") return { ok:false,error:"Administración solo registra sus propias horas no operativas." };
          if (!isManager(effectiveIdentity(get()).role)) return { ok: false, error: "La carga manual de horas la hace un usuario Administrativo." };
          const check = checkHours(get().projects.flatMap((p) => p.actualEntries), input.operatorId, input.date, input.hours, todayISO(), get().costSettings.hoursPerDay);
          if (check.level === "block") return { ok: false, error: check.message ?? "Horas inválidas." };
          if (check.level === "warn" && !input.confirmHighHours) return { ok: false, error: `${check.message} Confirmá para guardarlas.` };
          if (get().organizationId) {
            const requestId = input.requestId ?? createId("act");
            const assignmentId = createId("asg");
            void persistRemote(async (db) => {
              const { error } = await db.rpc("admin_log_hours_manual", { p: {
                id: requestId, assignment: { id: assignmentId, project_id: id, item_id: input.itemId, rubro: input.rubro,
                  operator_id: input.operatorId, date: input.date, planned_hours: input.hours },
                hours: input.hours, notes: input.comment,
              } });
              if (error) throw new Error(error.message);
            });
            return { ok: true, value: undefined };
          }
          return run(() => {
            const state = get();
            const p = find(id);
            if (input.requestId && p.actualEntries.some((e) => e.id === input.requestId)) return undefined;
            const op = state.operators.find((o) => o.id === input.operatorId);
            if (!op) throw new ops.DomainError("Operario no encontrado.");
            const valued = employeeCost(state.ledger, op, input.date, input.categoryId, state.priceHistory);
            if (valued.category && valued.category !== "labor") throw new ops.DomainError("La ejecución productiva requiere una categoría laboral productiva.");
            const draft = { projectId: id, itemId: input.itemId, rubro: input.rubro, operatorId: input.operatorId, date: input.date, plannedHours: input.hours };
            const error = assignmentError(draft, { projects: state.projects, operators: configuredOperators(state.operators, state.ledger) });
            if (error) throw new ops.DomainError(error);
            const a: WorkAssignment = { ...draft, id: createId("asg"), hourKind: "labor", createdBy: ctx().actor, createdAt: ctx().now };
            const assignments = [...state.assignments, a];
            const next = ops.logHours(p, state.operators, assignments, { ...input, assignmentId: a.id, categoryId: valued.categoryId, workdayHours: state.costSettings.hoursPerDay }, state.settings, ctx(), () => valued.hourlyCost);
            set({ assignments, projects: state.projects.map((project) => project.id === id ? { ...next, assignedOperatorIds: [...new Set([...next.assignedOperatorIds, op.id])] } : project) });
            return undefined;
          });
        },

        addActualEntry: (id, input) => mutate(id, (p) => ops.addActual(p, input, get().settings, ctx())),

        assignOperators: (id, operatorIds) => mutate(id, (p) => ops.assignOperators(p, operatorIds, get().operators, ctx())),
        addItem: (id, input) => mutate(id, (p) => { if (get().demoLocal && (p.baseline || p.status !== "quotation")) throw new ops.DomainError("La cotización aprobada es inmutable; editá el BOM de producción."); return ops.addItem(p, input, ctx()); }),
        updateItem: (id, itemId, input) => mutate(id, (p) => { if (get().demoLocal && (p.baseline || p.status !== "quotation")) throw new ops.DomainError("La cotización aprobada es inmutable; editá el BOM de producción."); return ops.updateItem(p, itemId, input, ctx()); }),
        setCompletedUnits: (projectId, itemId, units) =>
          run(() => {
            requirePhysicalWriter();
            if (effectiveIdentity(get()).session === "administracion") throw new ops.DomainError("Esta operación corresponde a Planta.");
            const who = effectiveIdentity(get()).roleKey;
            if (who !== "admin" && who !== "jefe_planta") throw new ops.DomainError("Las unidades terminadas las carga el Jefe de planta.");
            const project = find(projectId);
            if (project.isClosed) throw new ops.DomainError("El proyecto está cerrado: no se puede modificar su avance.");
            const item = project.items.find((i) => i.id === itemId);
            if (!item) throw new ops.DomainError("Producto no encontrado.");
            const unitsError = completedUnitsError(item, units);
            if (unitsError) throw new ops.DomainError(unitsError);
            const now = new Date().toISOString();
            // Ya se guarda con la función de planta: se actualiza la memoria sin volver a escribir el proyecto.
            set({
              projects: get().projects.map((p) =>
                p.id === projectId ? { ...p, updatedAt: now, items: p.items.map((i) => (i.id === itemId ? { ...i, completedUnits: units, ...(get().demoLocal && units !== i.completedUnits ? { unitsHistory:[...(i.unitsHistory ?? []),{ date:todayISO(),previous:i.completedUnits,next:units,by:effectiveIdentity(get()).actor,at:now }] } : {}) } : i)) } : p,
              ),
            });
            void persistRemote((db) => remote.setCompletedUnits(db, projectId, itemId, units));
            return undefined;
          }),
        deliverMaterial: (input) =>
          run(() => {
            requirePhysicalWriter();
            if (effectiveIdentity(get()).session === "administracion") throw new ops.DomainError("Esta operación corresponde a Planta.");
            const who = effectiveIdentity(get()).roleKey;
            if (who !== "admin" && who !== "jefe_planta") throw new ops.DomainError("La entrega de material la registra el Jefe de planta.");
            const r = deliverMaterial(find(input.projectId), get().stock, get().deliveries, input, { ...ctx(), today: todayISO() });
            // Va a su función de la base (valida saldos por lote): no pasa por la escritura general.
            set({ stock: r.stock, deliveries: [...get().deliveries, r.delivery] });
            const p = deliveryPayload(r);
            void persistRemote(async (db) => {
              const { error } = await db.rpc("planta_deliver_material", { p });
              if (error) throw new Error(error.message);
            });
            return undefined;
          }),
        directMaterialUsage: (input) =>
          run(() => {
            requirePhysicalWriter();
            if (effectiveIdentity(get()).session === "administracion") throw new ops.DomainError("Esta operación corresponde a Planta.");
            const who = effectiveIdentity(get()).roleKey;
            if (who !== "admin" && who !== "jefe_planta") throw new ops.DomainError("El registro directo de material lo hace el Jefe de planta.");
            if (get().demoLocal) {
              const r = registerMaterialsLocal(find(input.projectId),get().stock,get().deliveries,input,{ ...ctx(),today:todayISO() });
              set({ projects:get().projects.map((p) => p.id === input.projectId ? r.project : p),stock:r.stock });
              return undefined;
            }
            const r = directMaterialUsage(find(input.projectId), get().stock, get().deliveries, input, { ...ctx(), today: todayISO(), carryOver: get().demoLocal });
            set({ projects: get().projects.map((p) => (p.id === input.projectId ? r.project : p)), stock: r.stock, deliveries: r.deliveries });
            const delivery = deliveryPayload(r.deliveryResult);
            const close = closeDayPayload(r.closeInput, r);
            void persistRemote(async (db) => {
              const deliveryResult = await db.rpc("planta_deliver_material", { p: delivery });
              if (deliveryResult.error) throw new Error(deliveryResult.error.message);
              const closeResult = await db.rpc("planta_close_day", { p: close });
              if (closeResult.error) throw new Error(closeResult.error.message);
            });
            return undefined;
          }),
        closeDay: (input) =>
          run(() => {
            requirePhysicalWriter();
            if (effectiveIdentity(get()).session === "administracion") throw new ops.DomainError("Esta operación corresponde a Planta.");
            const who = effectiveIdentity(get()).roleKey;
            if (who !== "admin" && who !== "jefe_planta") throw new ops.DomainError("El cierre del día lo hace el Jefe de planta.");
            const r = closeDay(find(input.projectId), get().stock, get().deliveries, input, { ...ctx(), today: todayISO(), carryOver: get().demoLocal });
            set({ projects: get().projects.map((p) => (p.id === input.projectId ? r.project : p)), stock: r.stock, deliveries: r.deliveries });
            // El costo de cada uso y de cada sobrante lo pone la base con el lote (el Jefe no lo conoce).
            const p = closeDayPayload(input, r);
            void persistRemote(async (db) => {
              const { error } = await db.rpc("planta_close_day", { p });
              if (error) throw new Error(error.message);
            });
            return undefined;
          }),
        removeItem: (id, itemId) => mutate(id, (p) => { if (get().demoLocal && (p.baseline || p.status !== "quotation")) throw new ops.DomainError("La cotización aprobada es inmutable; editá el BOM de producción."); return ops.removeItem(p, itemId, ctx()); }),
        addStageLog: (id, input) => mutate(id, (p) => ops.addStageLog(p, input, ctx()).project),
        addAttachment: (id, attachment) => mutate(id, (p) => ops.addAttachment(p, attachment, ctx())),
        removeAttachment: (id, attachmentId) => mutate(id, (p) => ops.removeAttachment(p, attachmentId, ctx())),

        assignStock: (input) => mutateStock((s) => {
          const session = effectiveIdentity(s).session;
          if (s.demoLocal && session !== "compras") throw new ops.DomainError("Las asignaciones de stock corresponden exclusivamente a Compras.");
          if (session === "compras" && !s.demoLocal) throw new ops.DomainError("La asignación desde Compras está preparada en frontend local; requiere integración backend.");
          return ops.assignStockToProject(s.projects,s.stock,input,ctx());
        }),
        reverseAssignmentLocal: (movementId,reason) => run(() => {
          const state = get();
          if (!state.demoLocal || effectiveIdentity(state).session !== "compras") throw new ops.DomainError("La reversión local corresponde exclusivamente a Compras.");
          const movement = state.stock.movements.find((m) => m.id === movementId);
          const projectId = movement?.to.type === "project" ? movement.to.projectId : undefined;
          if (!projectId || state.projects.find((p) => p.id === projectId)?.isClosed) throw new ops.DomainError("No se revierte una asignación de un proyecto cerrado.");
          const lot = state.stock.lots.find((l) => l.id === movement?.lotId);
          const committed = state.deliveries.some((d) => d.projectId === projectId && d.materialId === lot?.materialId && !d.closedAt);
          set({ stock:reverseAssignment(state.stock,movementId,reason,ctx(),committed) });
          return undefined;
        }),
        releaseStock: (input) => mutateStock((s) => ops.releaseProjectStock(s.projects, s.stock, input, ctx())),
        transferStock: (input) => mutateStock((s) => {
          const session = effectiveIdentity(s).session;
          if (s.demoLocal && session !== "compras") throw new ops.DomainError("Solo Compras transfiere stock entre proyectos.");
          if (session === "compras" && !s.demoLocal) throw new ops.DomainError("La transferencia desde Compras está preparada en frontend local; requiere integración backend.");
          return ops.transferProjectStock(s.projects,s.stock,input,ctx());
        }),
        returnStockToSupplier: (input) => mutateStock((s) => ops.returnProjectStockToSupplier(s.projects, s.stock, input, ctx())),
        markLeftover: (input) => mutateStock((s) => ops.leftoverFromProject(s.projects, s.stock, input, ctx())),

        addStockLot: (input) =>
          run(() => {
            requireManager("Registrar compras de stock");
            const c = ctx();
            const received = receiveStock(
              {
                materialId: materialKey(input.materialId, input.materialName),
                materialName: input.materialName,
                unit: input.unit,
                quantity: input.quantity,
                unitCost: input.unitCost,
                supplier: input.supplier,
                location: input.location,
                date: input.date,
                destination: "warehouse",
                kind: input.kind ?? "purchase",
              },
              c,
            );
            commit({ stock: applyChange(get().stock, received) });
            return received.lot;
          }),

        updateLotLocation: (lotId, location) =>
          run(() => {
            requireManager("Editar la ubicación");
            const stock = get().stock;
            // La ubicación es un dato del lote, no un movimiento: se reemplaza el lote (el ledger no cambia).
            const next = { ...stock, lots: stock.lots.map((l) => (l.id === lotId ? { ...l, location: location.trim() || undefined } : l)) };
            set({ stock: next });
            const lot = next.lots.find((l) => l.id === lotId);
            if (lot) {
              void persistRemote(async (db, org) => {
                const res = await db.from("stock_lots").upsert(lotToRow(org, lot), { onConflict: "organization_id,id" });
                if (res.error) throw new Error(res.error.message);
              });
            }
            return undefined;
          }),

        saveEmployeeLocal: (input) => run(() => {
          const state = get();
          if (!state.demoLocal || effectiveIdentity(state).session !== "gerencia") throw new ops.DomainError("Los empleados se editan desde Gerencia → Personal.");
          if (input.name.trim().length < 2 || !input.profile.categoryIds?.length) throw new ops.DomainError("Completá nombre y categorías laborales.");
          const productive=state.ledger.staffCategories?.some(c=>input.profile.categoryIds?.includes(c.id)&&c.category==="labor")??false;
          input={...input,profile:{...input.profile,productive,enabledRubros:productive?input.profile.enabledRubros:[]}};
          const previous = state.operators.find((o) => o.id === input.id);
          if (input.id && !previous) throw new ops.DomainError("Persona inexistente.");
          if (previous?.active && !input.active) {
            const error = people.reassignmentPlanError(state.operators,state.projects,previous.id,input.reassignmentPlan ?? {});
            if (error) throw new ops.DomainError(error);
          }
          const now = new Date().toISOString();
          // Keep the legacy field for compatibility; all new hours use employeeCost and explicit category.
          const category = state.ledger.staffCategories?.find((c) => c.id === input.profile.categoryIds![0]);
          if (!category) throw new ops.DomainError("Categoría inexistente.");
          const op: Operator = { ...(previous ?? { id:createId("op"),createdAt:now,role:category.name,hourlyCost:category.hourlyCost }),name:input.name.trim(),email:input.email?.trim().toLowerCase() || undefined,hoursPerDay:input.profile.hoursPerDay,workDays:input.profile.workDays,productive:input.profile.productive,enabledRubros:input.profile.productive ? input.profile.enabledRubros : [],active:input.active,deactivatedAt:input.active ? undefined : previous?.deactivatedAt ?? now };
          const operators = previous ? state.operators.map((o) => o.id === op.id ? op : o) : [...state.operators,op];
          let ledger = savePersonnel(state.ledger,operators,{ ...input.profile,employeeId:op.id,enabledRubros:input.profile.productive ? input.profile.enabledRubros : [] });
          if (input.individualRate) ledger = addEmployeeRate(ledger,{ scope:"employee",subjectId:op.id,hourlyRate:input.individualRate.hourlyCost,validFrom:input.individualRate.validFrom },{ actor:effectiveIdentity(state).actor,now });
          const open = previous?.active && !input.active ? new Set(people.openProjectsOf(state.projects,op.id).map((p)=>p.id)) : new Set<string>();
          const projects = state.projects.map((p)=>open.has(p.id) ? ops.reassignForDeactivation(p,op.id,input.reassignmentPlan?.[p.id] ?? null,state.operators,ctx()) : p);
          set({ operators,ledger,projects }); return op.id;
        }),
        createEmployeeLocal: (input,profile) => run(() => {
          const st = get();
          if (!st.demoLocal || effectiveIdentity(st).session !== "gerencia") throw new ops.DomainError("El alta local se realiza en Gerencia → Personal.");
          const op = people.createOperator(input,new Date().toISOString());
          const operators = [...st.operators,op];
          const ledger = savePersonnel(st.ledger,operators,{ ...profile,employeeId:op.id });
          set({ operators,ledger });return op.id;
        }),
        createOperator: (input) =>
          run(() => {
            if (get().demoLocal && effectiveIdentity(get()).session !== "gerencia") throw new ops.DomainError("Personal se administra exclusivamente desde Gerencia.");
            requireManager("Cargar operarios");
            const operator = people.createOperator(input, new Date().toISOString());
            commit({ operators: [...get().operators, operator] });
            return operator.id;
          }),

        updateOperator: (id, input, validFrom = todayISO()) =>
          run(() => {
            if (get().demoLocal && effectiveIdentity(get()).session !== "gerencia") throw new ops.DomainError("Personal se administra exclusivamente desde Gerencia.");
            requireManager("Editar operarios");
            const current = get().operators.find((o) => o.id === id);
            if (!current) throw new ops.DomainError("Operario no encontrado.");
            const records = input.hourlyCost > 0 ? changeOf("operator_cost", id, input.hourlyCost, current.hourlyCost, validFrom) : [];
            // El costo que se ve es el vigente hoy (un cambio con fecha futura todavía no aplica).
            const hourlyCost = valueAt([...get().priceHistory, ...records], "operator_cost", id, todayISO(), input.hourlyCost);
            const operators = people.updateOperator(get().operators, id, { ...input, hourlyCost: records.length ? hourlyCost : input.hourlyCost });
            addHistory(records);
            commit({ operators });
            return undefined;
          }),

        deactivateOperator: (id, plan = {}) =>
          run(() => {
            if (get().demoLocal && effectiveIdentity(get()).session !== "gerencia") throw new ops.DomainError("Personal se administra exclusivamente desde Gerencia.");
            requireManager("Dar de baja operarios");
            const { operators, projects } = get();
            const planError = people.reassignmentPlanError(operators, projects, id, plan);
            if (planError) throw new ops.DomainError(planError);
            const open = new Set(people.openProjectsOf(projects, id).map((p) => p.id));
            const c = ctx();
            commit({
              projects: projects.map((p) => (open.has(p.id) ? ops.reassignForDeactivation(p, id, plan[p.id] ?? null, operators, c) : p)),
              operators: people.deactivateOperator(operators, id, c.now),
            });
            if (get().actingOperatorId === id) set({ actingOperatorId: null });
            return undefined;
          }),

        reactivateOperator: (id) =>
          run(() => {
            if (get().demoLocal && effectiveIdentity(get()).session !== "gerencia") throw new ops.DomainError("Personal se administra exclusivamente desde Gerencia.");
            requireManager("Reactivar operarios");
            commit({ operators: people.reactivateOperator(get().operators, id) });
            return undefined;
          }),

        deleteOperator: (id) =>
          run(() => {
            if (get().demoLocal && effectiveIdentity(get()).session !== "gerencia") throw new ops.DomainError("Personal se administra exclusivamente desde Gerencia.");
            requireManager("Eliminar operarios");
            const next = people.deleteOperator(get().operators, get().projects, id);
            commit(next);
            if (get().actingOperatorId === id) set({ actingOperatorId: null });
            return undefined;
          }),

        createMaterialRequest: (input) =>
          run(() => {
            const project = find(input.projectId);
            if (!(input.quantity > 0)) throw new ops.DomainError("Indicá cuánto material falta.");
            const identity = effectiveIdentity(get());
            if (identity.role === "operator" && !(identity.operator && project.assignedOperatorIds.includes(identity.operator.id))) {
              throw new ops.DomainError("No estás asignado a este proyecto.");
            }
            const request: MaterialRequest = {
              id: createId("req"),
              projectId: project.id,
              materialId: input.materialId,
              materialName: input.materialName,
              quantity: input.quantity,
              unit: input.unit,
              note: input.note?.trim() || undefined,
              requestedBy: identity.actor,
              status: "open",
              createdAt: new Date().toISOString(),
            };
            commit({ requests: [request, ...get().requests] });
            return undefined;
          }),

        setRequestStatus: (id, status) =>
          run(() => {
            requireManager("Resolver pedidos de material");
            const now = new Date().toISOString();
            const actor = effectiveIdentity(get()).actor;
            commit({
              requests: get().requests.map((q) => (q.id === id ? { ...q, status, resolvedAt: now, resolvedBy: actor } : q)),
            });
            return undefined;
          }),

        resolveAlert: (alertId) => guardVoid(() => {
          if (get().resolvedAlertIds.includes(alertId)) return;
          set({ resolvedAlertIds: [...get().resolvedAlertIds, alertId] });
          void persistRemote((db, org) => remote.setAlertResolved(db, org, alertId, true));
        }),
        reopenAlert: (alertId) => guardVoid(() => {
          set({ resolvedAlertIds: get().resolvedAlertIds.filter((a) => a !== alertId) });
          void persistRemote((db, org) => remote.setAlertResolved(db, org, alertId, false));
        }),

        updateSettings: (patch) => guardResult(() => {
          const settings = { ...get().settings, ...patch };
          set({ settings });
          void persistRemote((db, org) => remote.saveSettings(db, org, settings));
          return { ok: true, value: undefined };
        }),

        updateCostSettings: (patch, validFrom = todayISO()) => guardResult(() => {
          if (!isManager(effectiveIdentity(get()).role)) return { ok: false, error: "Configuración la cambia un usuario Administrativo." };
          const prev = get().costSettings;
          const next = { ...prev, ...patch };
          const error = costSettingsError(next) ?? (patch.overtimeMultiplier !== undefined ? priceChangeError({ value: next.overtimeMultiplier, validFrom }) : null);
          if (error) return { ok: false, error };
          const records = patch.overtimeMultiplier !== undefined ? changeOf("overtime_multiplier", OVERTIME_SUBJECT, next.overtimeMultiplier, prev.overtimeMultiplier, validFrom) : [];
          const history = [...get().priceHistory, ...records];
          // Vigente hoy: un cambio con fecha futura todavía no aplica.
          const costSettings = { ...next, overtimeMultiplier: valueAt(history, "overtime_multiplier", OVERTIME_SUBJECT, todayISO(), next.overtimeMultiplier) };
          addHistory(records);
          set({ costSettings });
          void persistRemote((db, org) => remote.saveCostSettings(db, org, costSettings));
          return { ok: true, value: undefined };
        }),
        saveHourRates: (rates, validFrom = todayISO()) => guardResult(() => {
          if (!isManager(effectiveIdentity(get()).role)) return { ok: false, error: "Las tarifas las cambia un usuario Administrativo." };
          const error = hourRatesError(rates) ?? priceChangeError({ value: 1, validFrom });
          if (error) return { ok: false, error };
          const prev = get().hourRates;
          const records = rates.flatMap((r) => changeOf("hour_rate", r.id, r.hourlyRate, prev.find((p) => p.id === r.id)?.hourlyRate ?? r.hourlyRate, validFrom));
          const hourRates = hourRatesAt(rates, [...get().priceHistory, ...records], todayISO());
          addHistory(records);
          set({ hourRates });
          void persistRemote((db, org) => remote.saveHourRates(db, org, hourRates));
          return { ok: true, value: undefined };
        }),
        saveCatalogMaterialLocal: (input) => run(() => {
          const st = get(); const who = effectiveIdentity(st);
          if (!st.demoLocal || who.session !== "administracion") throw new ops.DomainError("El catálogo se edita en Administración de la demo local.");
          if (input.name.trim().length < 2 || !input.unit.trim() || !Number.isFinite(input.price) || input.price < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(input.validFrom)) throw new ops.DomainError("Completá material, unidad, rubro, precio y vigencia válidos.");
          const all = materialCatalog(st.ledger);
          if (all.some((m) => m.id !== input.id && m.name.toLowerCase() === input.name.trim().toLowerCase())) throw new ops.DomainError("Ese material ya existe.");
          const previous = all.find((m) => m.id === input.id); const id = previous?.id ?? createId("mat");
          const now = new Date().toISOString();
          set({ projects:st.projects.map((p)=>input.validFrom <= todayISO() && p.status === "quotation" && !p.baseline ? { ...p,budgetLines:p.budgetLines.map((l)=>l.category === "materials" && l.materialId === id && l.unit === input.unit.trim() && l.quantity !== null ? { ...l,unitCost:input.price,total:Math.round(l.quantity*input.price*100)/100 } : l) } : p),ledger:{ ...st.ledger,materialCatalog:[...(st.ledger.materialCatalog ?? []).filter((m) => m.id !== id),{ id,name:input.name.trim(),unit:input.unit.trim(),rubro:previous?.rubro,referenceCost:previous?.referenceCost ?? input.price,active:previous?.active ?? true,validFrom:previous?.validFrom ?? input.validFrom }] },priceHistory:[...st.priceHistory,{ id:createId("price"),kind:"material_price",subjectId:id,value:input.price,validFrom:input.validFrom,createdBy:who.actor,createdAt:now }] });
          return undefined;
        }),
        setMaterialPrices: (prices, validFrom) => guardResult(() => {
          if (get().demoLocal && effectiveIdentity(get()).session !== "administracion") return { ok:false,error:"Los precios de referencia se editan exclusivamente en Administración." };
          if (!isManager(effectiveIdentity(get()).role)) return { ok: false, error: "Los precios los cambia un usuario Administrativo." };
          const bad = prices.map((p) => priceChangeError({ value: p.value, validFrom })).find(Boolean);
          if (bad) return { ok: false, error: bad };
          addHistory(prices.flatMap((p) => changeOf("material_price", p.materialId, p.value, p.previousValue, validFrom)));
          return { ok: true, value: undefined };
        }),
        saveAssignment: (input) =>
          run(() => {
            if (effectiveIdentity(get()).session === "administracion") throw new ops.DomainError("Administración no asigna trabajo de operarios.");
            const who = effectiveIdentity(get()).roleKey;
            if (who !== "admin" && who !== "jefe_planta") throw new ops.DomainError("Las asignaciones las hace el Jefe de planta.");
            const { projects, operators, assignments } = get();
            if (!get().demoLocal && get().organizationId && !input.itemId) throw new ops.DomainError("La planificación sin mueble está preparada en frontend; el backend actual todavía exige producto. No se guardó la asignación.");
            if (get().ledger.rubroCatalog.some((r) => r.id === input.rubro && !r.active)) throw new ops.DomainError("El rubro está desactivado para nuevas asignaciones.");
            if (get().demoLocal && !configuredOperators(operators,get().ledger).find((o)=>o.id===input.operatorId)?.enabledRubros?.includes(input.rubro)) throw new ops.DomainError("Rubro pendiente de habilitar en Personal para esta persona.");
            const error = assignmentError(input, { projects, operators: configuredOperators(operators,get().ledger) });
            if (error) throw new ops.DomainError(error);
            const previous = input.id ? assignments.find((a) => a.id === input.id) : undefined;
            const a: WorkAssignment = {
              id: input.id ?? createId("asg"),
              projectId: input.projectId,
              hourKind: input.hourKind ?? "labor",
              itemId: input.itemId,
              rubro: input.rubro,
              operatorId: input.operatorId,
              date: input.date,
              plannedHours: input.plannedHours,
              createdBy: previous?.createdBy ?? effectiveIdentity(get()).actor,
              createdAt: previous?.createdAt ?? new Date().toISOString(),
            };
            // El operario pasa al equipo del proyecto (la base hace lo mismo): así lo ve en "Mi día".
            set({
              assignments: previous ? assignments.map((x) => (x.id === a.id ? a : x)) : [...assignments, a],
              projects: projects.map((p) =>
                p.id === a.projectId && !p.assignedOperatorIds.includes(a.operatorId) ? { ...p, assignedOperatorIds: [...p.assignedOperatorIds, a.operatorId] } : p,
              ),
            });
            void persistRemote((db) => remote.saveAssignment(db, a));
            return a.id;
          }),
        removeAssignment: (id) =>
          run(() => {
            const who = effectiveIdentity(get()).roleKey;
            if (who !== "admin" && who !== "jefe_planta") throw new ops.DomainError("Las asignaciones las hace el Jefe de planta.");
            set({ assignments: get().assignments.filter((a) => a.id !== id) });
            void persistRemote((db) => remote.removeAssignment(db, id));
            return undefined;
          }),
        saveSchedule: (operatorId, change) =>
          run(() => {
            const who = effectiveIdentity(get()).roleKey;
            if (who !== "admin" && who !== "jefe_planta") throw new ops.DomainError("Los días laborales los define el Jefe de planta.");
            if(get().demoLocal && ((change.add?.length??0)>0 || (change.remove?.length??0)>0) && effectiveIdentity(get()).session!=="jefe_planta")throw new ops.DomainError("Las ausencias y excepciones se administran en Jefe de Planta.");
            if (change.workDays && effectiveIdentity(get()).session !== "gerencia") throw new ops.DomainError("Los días habituales se configuran en Gerencia; Planta registra excepciones.");
            const operator = get().operators.find((o) => o.id === operatorId);
            if (!operator) throw new ops.DomainError("Operario no encontrado.");
            const error = (change.workDays ? workDaysError(change.workDays) : null) ?? (change.add ?? []).map(exceptionError).find(Boolean) ?? null;
            if (error) throw new ops.DomainError(error);
            const now = new Date().toISOString();
            const by = effectiveIdentity(get()).actor;
            const added: DayException[] = (change.add ?? []).map((x) => ({ operatorId, date: x.date, works: x.works, hours: x.works ? x.hours : undefined, note: x.note?.trim() || undefined, createdBy: by, createdAt: now }));
            const touched = new Set([...added.map((x) => x.date), ...(change.remove ?? [])]);
            // Se guarda con la función de planta: se actualiza la memoria sin volver a escribir los operarios.
            set({
              operators: change.workDays
                ? get().operators.map((o) => (o.id === operatorId ? { ...o, workDays: [...new Set(change.workDays)].sort((a, b) => a - b) } : o))
                : get().operators,
              ledger: get().demoLocal && change.workDays ? { ...get().ledger,personnel:get().ledger.personnel?.map((p)=>p.employeeId===operatorId ? {...p,workDays:[...new Set(change.workDays)].sort((a,b)=>a-b)} : p) } : get().ledger,
              dayExceptions: [...get().dayExceptions.filter((x) => !(x.operatorId === operatorId && touched.has(x.date))), ...added].sort((a, b) => a.date.localeCompare(b.date)),
            });
            void persistRemote((db) => remote.saveSchedule(db, operatorId, change));
            return undefined;
          }),
        saveOrder: (draft) =>
          run(() => {
            if (!isBuyer(effectiveIdentity(get()).role)) throw new ops.DomainError("Las órdenes de compra las maneja Compras o un usuario Administrativo.");
            const error = orderDraftError(draft);
            if (error) throw new ops.DomainError(error);
            const previous = draft.id ? findOrder(draft.id) : undefined;
            if (previous && previous.status !== "draft") throw new ops.DomainError("Solo se modifica una orden en Borrador.");
            const order: PurchaseOrder = {
              id: previous?.id ?? createId("oc"),
              number: previous?.number ?? nextOrderNumber(get().orders),
              supplier: draft.supplier.trim(),
              date: draft.date,
              status: "draft",
              paid: false,
              received: "no",
              notes: draft.notes?.trim() || undefined,
              lines: draft.lines.map((l) => ({
                ...l,
                id: previous?.lines.find((x) => x.projectId === l.projectId && x.budgetLineId === l.budgetLineId)?.id ?? createId("ocl"),
                receivedQuantity: 0,
              })),
              createdBy: previous?.createdBy ?? effectiveIdentity(get()).actor,
              createdAt: previous?.createdAt ?? new Date().toISOString(),
            };
            set({ orders: previous ? get().orders.map((x) => (x.id === order.id ? order : x)) : [...get().orders, order] });
            void persistRemote((db) => remote.saveOrder(db, order));
            return order.id;
          }),
        sendOrder: (id) =>
          run(() => {
            const o = findOrder(id);
            if (o.status !== "draft") throw new ops.DomainError("Solo se envía una orden en Borrador.");
            replaceOrder({ ...o, status: "sent" });
            void persistRemote((db) => remote.orderStatus(db, { id, action: "send" }));
            return undefined;
          }),
        correctSentOrderLocal: (id, reason) => run(() => {
          if (!get().demoLocal) throw new ops.DomainError("Corrección disponible en demo local; requiere integración backend para empresas reales.");
          replaceOrder(correctSentOrder(findOrder(id),reason,ctx()));
          return undefined;
        }),
        reverseReceiptLocal: (id, movementId, reason) => run(() => {
          if (!get().demoLocal) throw new ops.DomainError("Reversión disponible en demo local; requiere integración backend para empresas reales.");
          const result = reverseLocalReceipt(findOrder(id),get().stock,get().deliveries,movementId,reason,ctx());
          set({ stock:result.stock,orders:get().orders.map((o) => o.id === id ? result.order : o) });
          return undefined;
        }),
        invoiceOrder: (id, invoice) =>
          run(() => {
            if (effectiveIdentity(get()).session === "compras") throw new ops.DomainError("La carga de facturas no está habilitada en Compras.");
            const o = findOrder(id);
            const error = invoiceError(o, invoice);
            if (error) throw new ops.DomainError(error);
            const { actor } = effectiveIdentity(get());
            const now = new Date().toISOString();
            const entries = invoiceEntries(o, invoice, actor, now);
            // La base crea lo mismo (mismos ids): se actualiza la memoria sin volver a escribir los proyectos.
            set({
              projects: get().projects.map((p) => {
                const mine = entries.filter((e) => e.projectId === p.id);
                if (mine.length === 0) return p;
                const events = invoiceActivity(o, p.id, invoice.invoiceNumber, actor, now, () => createId("act"));
                return { ...p, updatedAt: now, purchaseEntries: [...p.purchaseEntries, ...mine], activity: [...events, ...p.activity] };
              }),
            });
            replaceOrder({ ...o, status: "invoiced", invoiceNumber: invoice.invoiceNumber.trim(), invoiceAmount: invoice.invoiceAmount, invoiceDate: invoice.invoiceDate });
            void persistRemote((db) =>
              remote.orderStatus(db, { id, action: "invoice", invoice_number: invoice.invoiceNumber.trim(), invoice_amount: invoice.invoiceAmount, invoice_date: invoice.invoiceDate }),
            );
            return undefined;
          }),
        setOrderPaid: (id, paid) =>
          run(() => {
            if (effectiveIdentity(get()).session !== "gerencia") throw new ops.DomainError("Solo Gerencia registra pagos efectivos.");
            const o = findOrder(id);
            if (o.status !== "invoiced") throw new ops.DomainError("Solo se marca como pagada una orden Facturada.");
            replaceOrder({ ...o, paid });
            void persistRemote((db) => remote.orderStatus(db, { id, action: "paid", paid }));
            return undefined;
          }),
        receiveOrder: (id, receipts) =>
          run(() => {
            requirePhysicalWriter();
            if (effectiveIdentity(get()).session === "administracion") throw new ops.DomainError("Las recepciones corresponden a Compras.");
            const o = findOrder(id);
            const { actor } = effectiveIdentity(get());
            const res = receiveOrderLines(o, receipts, get().projects, { actor, now: new Date().toISOString(), today: todayISO() });
            if (res.sent.length === 0) throw new ops.DomainError("Indicá cuánto llegó de cada material.");
            // La base crea el mismo lote y movimiento: se actualiza la memoria sin volver a escribir el stock.
            set({ stock: applyChange(get().stock, res.change), ...(get().demoLocal ? { projects: afterMaterialArrival(get().projects,res.change.movements.filter((m) => m.to.type === "project").map((m) => m.to.type === "project" ? m.to.projectId : ""),ctx()) } : {}) });
            replaceOrder(get().demoLocal ? { ...res.order,localReceipts:[...(o.localReceipts ?? []),...res.sent.map((r) => ({ movementId:r.movement_id,lineId:r.line_id,lotId:r.lot_id,quantity:r.quantity,date:todayISO(),by:actor }))] } : res.order);
            void persistRemote((db) => remote.orderStatus(db, { id, action: "receive", receipts: res.sent }));
            return undefined;
          }),
        correctValue: async (projectId, input) => {
          if (effectiveIdentity(get()).session === "administracion") return { ok:false,error:"La cotización aprobada es inmutable. Publicá una nueva versión del BOM." };
          const project = get().projects.find((p) => p.id === projectId);
          if (!project) return { ok: false, error: "Proyecto no encontrado." };
          if (get().demoLocal && project.baseline && input.target === "budget_line") return { ok:false,error:"La cotización aprobada es inmutable para todas las vistas." };
          if (!isManager(effectiveIdentity(get()).role)) return { ok: false, error: "Las correcciones las hace un usuario Administrativo." };
          const error = correctionError(project, input);
          if (error) return { ok: false, error };
          try {
            // Primero se terminan de guardar los cambios pendientes; la corrección la registra el servidor.
            await queue;
            const receipt = get().organizationId ? await remote.correctValue(createClient(), projectId, input) : localCorrectionReceipt(project, input, effectiveIdentity(get()).actor);
            const current = get().projects.find((p) => p.id === projectId) ?? project;
            const res = applyCorrection(current, input, receipt);
            // Ya está guardado en la base: se actualiza la memoria sin volver a escribir.
            set({ projects: get().projects.map((p) => (p.id === projectId ? res.project : p)), corrections: [...get().corrections, res.correction] });
            return { ok: true, value: undefined };
          } catch (e) {
            return { ok: false, error: errorMessage(e) };
          }
        },

        resetDemo: () => get().demoLocal ? Promise.resolve(run(() => {
          set({ ...(demoFixture() as Partial<AppState>), currentMode: "gerencia", actingOperatorId: null });
          return undefined;
        })) : replaceAll(demoWorkspace(), true),
        clearData: () => replaceAll({ ...EMPTY_DATA, settings: { ...DEFAULT_SETTINGS } }, false),
        enterLocalDemo: () => guardVoid(() => {
          const saved = readDemo();
          const fixture = demoFixture();
          const data = saved ? { ...fixture, ...saved, ledger: normalizeLedger(saved.ledger as Ledger | undefined) } : fixture;
          if (!saved && typeof window !== "undefined" && !writeDemo(data)) throw new ops.DomainError("La demo no quedó guardada: el almacenamiento local no está disponible. No se reemplazaron los datos anteriores.");
          set({
            ...(data as Partial<AppState>),
            demoLocal: true,
            isDemo: true,
            organizationId: null,
            organizationName: "Madera Sur (demostración)",
            userId: null,
            userName: "Usuario de demostración",
            userEmail: "",
            role: "owner",
            syncStatus: "idle",
            syncError: null,
          });
          setDemoActive(true);
        }),
        restoreLocalDemo: () => guardVoid(() => {
          if (!get().demoLocal) return;
          set({ ...(demoFixture() as Partial<AppState>), currentMode: "gerencia", actingOperatorId: null });
        }),
        exitLocalDemo: () => {
          setDemoActive(false);
          set({ demoLocal: false });
        },
        confirmHoursLocal: (key) =>
          run(() => {
            if (!get().demoLocal) throw new ops.DomainError("Solo en el modo demostración.");
            if (!["jefe_planta", "gerencia"].includes(effectiveIdentity(get()).session)) throw new ops.DomainError("La revisión de horas la hace el Jefe de planta.");
            if (!get().reviewedHoursKeys.includes(key)) set({ reviewedHoursKeys: [...get().reviewedHoursKeys, key] });
            return undefined;
          }),
        executeWorkLocal: (input) => run(() => {
          const state = get();
          const who = effectiveIdentity(state);
          if (!state.demoLocal || who.session !== "operario" || who.operator?.id !== input.operatorId) throw new ops.DomainError("Esta carga flexible está disponible para el operario en el frontend local; falta integración backend.");
          const op = state.operators.find((o) => o.id === input.operatorId);
          if (!op) throw new ops.DomainError("Operario no encontrado.");
          const internal = state.ledger.internalHours.filter((h) => h.employeeId === op.id && h.date === input.date).reduce((s,h) => s+h.hours,0);
          const combined = checkHours(state.projects.flatMap((p) => p.actualEntries),op.id,input.date,input.hours+internal,todayISO(),state.costSettings.hoursPerDay);
          if (combined.level === "block") throw new ops.DomainError(combined.message);
          const valued = employeeCost(state.ledger,op,input.date,input.categoryId,state.priceHistory);
          if (valued.category && valued.category !== "labor") throw new ops.DomainError("La ejecución productiva requiere una categoría laboral productiva.");
          const cost = valued.hourlyCost;
          set({ projects: executeWork(state.projects,configuredOperators(state.operators,state.ledger),state.assignments,{ ...input,categoryId:valued.categoryId },{ actor: who.actor, now: new Date().toISOString(), today: todayISO(), cost, hoursPerDay: state.costSettings.hoursPerDay }) });
          return undefined;
        }),
        correctExecutionLocal: (input) => run(() => {
          const state = get(); const who = effectiveIdentity(state);
          if (!state.demoLocal || !["gerencia","jefe_planta"].includes(who.session)) throw new ops.DomainError("Esta corrección está disponible en el frontend local; falta integración backend.");
          const old = state.projects.flatMap((p) => p.actualEntries).find((e) => e.id === input.entryId);
          const internal = state.ledger.internalHours.filter((h) => h.employeeId === old?.operatorId && h.date === input.date).reduce((s,h) => s+h.hours,0);
          const productive = state.projects.flatMap((p) => p.actualEntries).filter((e) => e.id !== input.entryId && e.operatorId === old?.operatorId && e.date === input.date).reduce((s,e) => s+(e.labor?.hours ?? 0),0);
          if (internal + productive + input.hours > 24) throw new ops.DomainError("La suma de horas reales de la persona supera las 24 h del día.");
          set({ projects: correctExecution(state.projects,configuredOperators(state.operators,state.ledger),input,{ actor: who.actor, now: new Date().toISOString(), today: todayISO(), hoursPerDay: state.costSettings.hoursPerDay }) });
          return undefined;
        }),
        correctHoursLocal: (input) =>
          run(() => {
            if (!get().demoLocal) throw new ops.DomainError("Solo en el modo demostración.");
            if (!["jefe_planta", "gerencia"].includes(effectiveIdentity(get()).session)) throw new ops.DomainError("La corrección de horas la hace el Jefe de planta.");
            const { actor } = effectiveIdentity(get());
            set({ projects: correctHours(get().projects, get().assignments, input, { actor, now: new Date().toISOString(), id: () => createId("hc") }) });
            return undefined;
          }),
        recordLedger: (sessions, fn) =>
          run(() => {
            const state = get();
            if (!state.demoLocal && !state.ledgerReady) throw new ops.DomainError("Pendiente de backend: este dato todavía no se guarda en la base.");
            const who = effectiveIdentity(state);
            if (!sessions.includes(who.session)) throw new ops.DomainError("Esta acción no corresponde a tu sesión.");
            // Las reglas son las de lib/ledger.ts (puras): si algo no corresponde, lanza acá y no se guarda nada.
            const ledger = fn(state.ledger, { actor: who.actor, now: new Date().toISOString() }, state);
            if (state.demoLocal) {
              if(ledger.staffCategories!==state.ledger.staffCategories && (state.ledger.staffCategories??[]).some(c=>{const next=ledger.staffCategories?.find(x=>x.id===c.id);return !next || next.category!==c.category || next.kind!==c.kind;}))throw new ops.DomainError("Conservá la identidad y clasificación histórica de las categorías; desactivá en lugar de borrar.");
              const financeChanged=ledger.salesInvoices!==state.ledger.salesInvoices || ledger.collections!==state.ledger.collections || ledger.supplierPayments!==state.ledger.supplierPayments || ledger.financialCorrections!==state.ledger.financialCorrections;
              if(financeChanged && who.session!=="administracion")throw new ops.DomainError("Facturas, cobros y pagos efectivos se registran exclusivamente en Administración; Gerencia solo consulta.");
              if(financeChanged){
                const corrections=ledger.financialCorrections??[],oldCorrections=state.ledger.financialCorrections??[];
                if(oldCorrections.some(c=>JSON.stringify(corrections.find(x=>x.id===c.id))!==JSON.stringify(c)))throw new ops.DomainError("El historial financiero es inmutable.");
                for(const [field,entity] of [["salesInvoices","invoice"],["collections","collection"],["supplierPayments","payment"]] as const){
                  const old=state.ledger[field],next=ledger[field];
                  if(new Set(next.map(x=>x.id)).size!==next.length)throw new ops.DomainError("No se duplican identidades de registros financieros.");
                  for(const row of old){const after=next.find(x=>x.id===row.id);if(!after)throw new ops.DomainError("No se borran registros financieros; corregí o anulá con historial.");
                  if(JSON.stringify(after)!==JSON.stringify(row)&&!corrections.some(c=>c.entity===entity&&c.targetId===row.id&&!oldCorrections.some(o=>o.id===c.id)&&JSON.stringify(c.before)===JSON.stringify(row)&&JSON.stringify(c.after)===JSON.stringify(after)))throw new ops.DomainError("La corrección financiera requiere antes/después, autor y motivo.");}
                }
              }
              if(ledger.paymentRequests!==state.ledger.paymentRequests && !["compras","administracion"].includes(who.session))throw new ops.DomainError("Compras solicita pagos y Administración gestiona el banco.");
              if(ledger.paymentRequests!==state.ledger.paymentRequests && who.session==="administracion" && ((ledger.paymentRequests??[]).length!==(state.ledger.paymentRequests??[]).length || (ledger.paymentRequests??[]).some(r=>{const old=state.ledger.paymentRequests?.find(x=>x.id===r.id);return !old || r.amount!==old.amount || r.orderId!==old.orderId || r.reason!==old.reason || r.date!==old.date;})))throw new ops.DomainError("Administración gestiona la solicitud existente; no crea ni modifica su obligación.");
              if(ledger.paymentRequests!==state.ledger.paymentRequests){
                const next=ledger.paymentRequests??[],old=state.ledger.paymentRequests??[];
                if(new Set(next.map(r=>r.id)).size!==next.length)throw new ops.DomainError("Las solicitudes conservan identidades únicas.");
                if(who.session==="administracion"&&old.some(row=>{const after=next.find(r=>r.id===row.id);return after&&JSON.stringify(after)!==JSON.stringify(row)&&!(ledger.financialCorrections??[]).some(h=>h.entity==="banking"&&h.targetId===row.id&&!(state.ledger.financialCorrections??[]).some(o=>o.id===h.id)&&JSON.stringify(h.before)===JSON.stringify(row)&&JSON.stringify(h.after)===JSON.stringify(after));}))throw new ops.DomainError("La gestión o cancelación requiere historial con antes y después.");
              }
              if(ledger.paymentRequests!==state.ledger.paymentRequests && who.session==="compras" && (state.ledger.paymentRequests??[]).some(r=>JSON.stringify(ledger.paymentRequests?.find(x=>x.id===r.id))!==JSON.stringify(r)))throw new ops.DomainError("Compras no altera solicitudes previas ni su gestión bancaria.");
              if(ledger.paymentRequests!==state.ledger.paymentRequests && who.session==="compras" && (ledger.paymentRequests??[]).some(r=>!state.ledger.paymentRequests?.some(old=>old.id===r.id)&&r.banking))throw new ops.DomainError("Compras solicita pagos; la gestión bancaria corresponde a Administración.");
              if(ledger.externalWork!==state.ledger.externalWork){
                if(!["jefe_planta","gerencia"].includes(who.session))throw new ops.DomainError("Planta registra trabajos externos y Gerencia confirma su costo.");
                const old=state.ledger.externalWork??[],next=ledger.externalWork??[];
                if(old.some(row=>!next.some(x=>x.id===row.id)))throw new ops.DomainError("Los trabajos externos conservan su historial; no se borran.");
                if(who.session==="gerencia"&&(old.length!==next.length||next.some(row=>{const previous=old.find(x=>x.id===row.id);return !previous||JSON.stringify({...row,confirmedCost:undefined,confirmedBy:undefined,confirmedAt:undefined,costHistory:undefined})!==JSON.stringify({...previous,confirmedCost:undefined,confirmedBy:undefined,confirmedAt:undefined,costHistory:undefined});})))throw new ops.DomainError("Gerencia confirma costos; Planta registra y completa el trabajo externo.");
                if(who.session==="jefe_planta"&&next.some(row=>{const previous=old.find(x=>x.id===row.id);return row.confirmedCost!==previous?.confirmedCost||row.confirmedBy!==previous?.confirmedBy||row.confirmedAt!==previous?.confirmedAt||JSON.stringify(row.costHistory)!==JSON.stringify(previous?.costHistory);}))throw new ops.DomainError("Solo Gerencia confirma o corrige el costo definitivo del trabajo externo.");
              }
              const capacityChanged=ledger.capacityBase!==state.ledger.capacityBase || ledger.capacityAdjustments!==state.ledger.capacityAdjustments || ledger.capacityPlans!==state.ledger.capacityPlans;
              if(capacityChanged && who.session!=="jefe_planta")throw new ops.DomainError("La capacidad se administra exclusivamente en Jefe de Planta.");
              if(ledger.financialMonthlyRatePct!==state.ledger.financialMonthlyRatePct && who.session!=="gerencia")throw new ops.DomainError("La tasa financiera se configura exclusivamente en Gerencia.");
              if (who.session !== "administracion" && ledger.materialCatalog !== state.ledger.materialCatalog) throw new ops.DomainError("El catálogo se administra exclusivamente desde Administración.");
              if (who.session !== "gerencia" && (ledger.personnel !== state.ledger.personnel || ledger.staffCategories !== state.ledger.staffCategories || ledger.rubroCatalog !== state.ledger.rubroCatalog || ledger.rates !== state.ledger.rates || ledger.quoteDefaults !== state.ledger.quoteDefaults || ledger.externalRates !== state.ledger.externalRates)) throw new ops.DomainError("Personal, categorías, tarifas y rubros se administran desde Gerencia → Personal.");
            }
            if (state.demoLocal && ledger.boms !== state.ledger.boms) {
              if (who.session !== "administracion") throw new ops.DomainError("El BOM de producción se edita exclusivamente desde Administración.");
              if (state.ledger.boms.some((b)=>b.status === "published" && JSON.stringify(ledger.boms.find((next)=>next.id===b.id))!==JSON.stringify(b))) throw new ops.DomainError("Las versiones publicadas de BOM son inmutables; creá un borrador nuevo.");
              for(const bom of ledger.boms.filter((b)=>!state.ledger.boms.includes(b))) for(const line of bom.lines) {
                const catalog=materialCatalog(ledger).find((m)=>m.id===line.materialId && m.active!==false);
                const prior=state.ledger.boms.filter((b)=>b.projectId===bom.projectId && b.itemId===bom.itemId).flatMap((b)=>b.lines).find((l)=>l.id===line.id);
                const quoted=state.projects.find((p)=>p.id===bom.projectId)?.budgetLines.find((l)=>l.id===line.budgetLineId);
                const historical=(prior && prior.materialId===line.materialId && prior.unit===line.unit) || (quoted && quoted.materialId===line.materialId && quoted.unit===line.unit);
                if(!historical && (!catalog || catalog.unit!==line.unit)) throw new ops.DomainError("Seleccioná un material activo del catálogo y conservá su unidad.");
              }
              validateBomPublication(state.projects,state.ledger,ledger,state.orders,state.stock,todayISO());
            }
            if (ledger.capacityBase !== state.ledger.capacityBase && Object.entries(ledger.capacityBase ?? {}).some(([id,hours])=>!ledger.rubroCatalog.some((r)=>r.id===id) || !Number.isFinite(hours) || hours<0)) throw new ops.DomainError("Capacidad base inválida: elegí rubro y horas semanales no negativas.");
            if (ledger.quoteDefaults && Object.values(ledger.quoteDefaults).some((v)=>!Number.isFinite(v) || v<0 || v>=100)) throw new ops.DomainError("Los objetivos de rentabilidad deben estar entre 0 y menos de 100%.");
            if (ledger === state.ledger) return undefined;
            if (!state.demoLocal && (ledger.paymentRequests !== state.ledger.paymentRequests || ledger.financialCorrections !== state.ledger.financialCorrections || ledger.capacityPlans !== state.ledger.capacityPlans || ledger.materialCatalog !== state.ledger.materialCatalog || ledger.externalWork !== state.ledger.externalWork || ledger.personnel !== state.ledger.personnel || ledger.quoteDefaults !== state.ledger.quoteDefaults || ledger.capacityBase !== state.ledger.capacityBase || ledger.capacityAdjustments !== state.ledger.capacityAdjustments || ledger.externalRates !== state.ledger.externalRates || ledger.staffCategories !== state.ledger.staffCategories || ledger.projectNomenclature !== state.ledger.projectNomenclature)) throw new ops.DomainError("Esta configuración está preparada en frontend; su persistencia requiere integración backend.");
            set({ ledger, ...(state.demoLocal ? { projects: afterPublishedBom(state.projects,state.ledger,ledger,{ actor:who.actor, now:new Date().toISOString() }) } : {}) });
            // Demo local: queda en el navegador. Empresa real: se guarda en la base lo que cambió (la base valida de nuevo
            // el permiso y las reglas) y, si fue lo último pendiente, se relee para tomar lo que puso el servidor.
            if (!state.demoLocal) {
              const delta = ledgerDelta(state.ledger, ledger);
              if (delta) {
                void persistRemote(async (db) => {
                  await commitLedger(db, delta);
                  if (pending === 1) {
                    const fresh = await loadLedger(db);
                    if (fresh) set({ ledger: fresh });
                  }
                });
              }
            }
            return undefined;
          }),
        dismissSyncError: () => {
          if (get().demoLocal) { guardVoid(() => set({ syncStatus: "idle", syncError: null })); return; }
          void refreshWorkspace().catch(() => undefined);
        },
      };
    },
    {
      name: "nexo-ui-v2",
      version: 5,
      storage: createJSONStorage(() => safeLocalStorage()),
      // v3 guardaba "management" / "workshop" (Gestión / Taller).
      migrate: (persisted, version) => {
        const s = (persisted ?? {}) as { currentMode?: string; actingOperatorId?: string | null };
        // v4 guardaba el rol ("admin"); desde v5 es la sesión ("admin" → Gerencia).
        const mode = version < 4 ? (s.currentMode === "workshop" ? "operario" : "gerencia") : s.currentMode === "admin" ? "gerencia" : s.currentMode;
        return { currentMode: (mode ?? "gerencia") as SessionKey, actingOperatorId: s.actingOperatorId ?? null } as Partial<AppState>;
      },
      skipHydration: true,
      partialize: (s) => ({ currentMode: s.currentMode, actingOperatorId: s.actingOperatorId }),
    },
  ),
);

// Modo demostración local: cada cambio de datos se guarda en este navegador (nunca en una empresa real).
if (typeof window !== "undefined") {
  useAppStore.subscribe((next, prev) => {
    if (next.ledger.rubroCatalog !== prev.ledger.rubroCatalog || next.demoLocal !== prev.demoLocal || next.ledgerReady !== prev.ledgerReady) setRubroNames(next.demoLocal || next.ledgerReady ? next.ledger.rubroCatalog : []);
  });
}

export function useProject(id: string): Project | undefined {
  return useAppStore((s) => s.projects.find((p) => p.id === id));
}
