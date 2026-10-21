// ─────────────────────────────────────────────────────────────
// Registros de la demo integral (facturas, cobros, pagos a proveedores, contrato vigente, condiciones de pago, BOM
// versionado, entregas al cliente, horas internas, catálogo de rubros, tarifas, clientes y proveedores).
// Funciones puras: reciben el ledger y devuelven uno nuevo. El store las aplica y la demo las guarda en el navegador.
// ─────────────────────────────────────────────────────────────
import type { Ledger } from "@/types";
import { DEFAULT_FINANCIAL_PCT } from "./constants";

export const EMPTY_LEDGER: Ledger = {
  salesInvoices: [],
  collections: [],
  supplierInvoices: [],
  contractRevisions: [],
  paymentTerms: [],
  boms: [],
  handovers: [],
  internalHours: [],
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
