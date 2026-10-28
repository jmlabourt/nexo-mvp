// ─────────────────────────────────────────────────────────────
// Registros de la empresa (el "ledger") en Supabase: facturas, cobros, pagos a proveedores, contrato vigente,
// condiciones de pago, BOM por versiones, entrega al cliente, horas propias, rubros, tarifas, directorios.
//
// Las reglas del negocio son las funciones puras de lib/ledger.ts (el store las aplica en memoria) y la base las vuelve
// a hacer cumplir (migración 20261028120000). Acá solo se lee y se escribe:
//   · loadLedger     → public.ledger_workspace(): lo que el rol puede ver, con la forma del contrato `Ledger`.
//   · ledgerDelta    → qué cambió entre dos ledgers (función pura, sin red).
//   · commitLedger   → public.ledger_commit(p): guarda ese cambio; la base valida permiso y reglas.
//   · resetLedger    → public.ledger_reset(p): carga masiva (demo de la empresa / empezar de cero).
// ─────────────────────────────────────────────────────────────
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Ledger } from "@/types";
import { normalizeLedger } from "@/lib/ledger";

/** Cambio de una colección: filas nuevas o modificadas, e ids que se quitaron. */
interface ListDelta {
  upsert: unknown[];
  remove?: string[];
}

/** Lo que se manda a ledger_commit. Solo trae las colecciones que cambiaron. */
export type LedgerDelta = Partial<Record<Exclude<keyof Ledger, "financialMonthlyRatePct">, ListDelta>> & { financialMonthlyRatePct?: number };

type ListKey = Exclude<keyof Ledger, "financialMonthlyRatePct" | "closures">;

/** Colecciones que se identifican por `id` y las que no (el proyecto es la clave). */
const BY_ID: ListKey[] = ["salesInvoices", "collections", "supplierPayments", "contractRevisions", "boms", "handovers", "internalHours", "generalCosts", "rubroCatalog", "rates", "clients", "suppliers"];

/** De las colecciones, las únicas de las que se puede quitar un registro (el resto es historial). */
const REMOVABLE: ListKey[] = ["boms", "generalCosts"];

/**
 * Qué cambió de `prev` a `next`. Las operaciones de lib/ledger.ts son inmutables, así que un registro sin cambios
 * conserva su referencia: alcanza con comparar referencias. null = no hay nada que guardar.
 */
export function ledgerDelta(prev: Ledger, next: Ledger): LedgerDelta | null {
  const delta: LedgerDelta = {};
  for (const key of BY_ID) {
    const before = prev[key] as Array<{ id: string }>;
    const after = next[key] as Array<{ id: string }>;
    if (before === after) continue;
    const old = new Map(before.map((x) => [x.id, x]));
    const upsert = after.filter((x) => old.get(x.id) !== x);
    const keep = new Set(after.map((x) => x.id));
    const remove = REMOVABLE.includes(key) ? before.filter((x) => !keep.has(x.id)).map((x) => x.id) : [];
    if (upsert.length || remove.length) delta[key] = { upsert, ...(remove.length ? { remove } : {}) };
  }
  if (prev.paymentTerms !== next.paymentTerms) {
    const old = new Map(prev.paymentTerms.map((t) => [t.projectId, t]));
    const upsert = next.paymentTerms.filter((t) => old.get(t.projectId) !== t);
    if (upsert.length) delta.paymentTerms = { upsert };
  }
  if (prev.financialMonthlyRatePct !== next.financialMonthlyRatePct) delta.financialMonthlyRatePct = next.financialMonthlyRatePct;
  return Object.keys(delta).length ? delta : null;
}

const MISSING = (e: { code?: string; message?: string }) =>
  ["42883", "PGRST202"].includes(e.code ?? "") || /could not find the function|does not exist/i.test(e.message ?? "");

/**
 * Lee los registros que el rol puede ver. null = la base todavía no tiene la migración de los registros de la empresa
 * (la app sigue funcionando sin ellos y no ofrece cargarlos).
 */
export async function loadLedger(db: SupabaseClient): Promise<Ledger | null> {
  const { data, error } = await db.rpc("ledger_workspace");
  if (error) {
    if (MISSING(error)) return null;
    throw new Error(error.message);
  }
  const raw = (data ?? {}) as Partial<Ledger>;
  // La tasa llega solo a quien cotiza o es Gerencia: los demás usan la de la app.
  const { financialMonthlyRatePct, ...lists } = raw;
  return financialMonthlyRatePct === null || financialMonthlyRatePct === undefined ? normalizeLedger(lists) : normalizeLedger({ ...lists, financialMonthlyRatePct });
}

/** Guarda lo que cambió. Lanza con el mensaje de la base (permiso o regla del negocio) si no se puede. */
export async function commitLedger(db: SupabaseClient, delta: LedgerDelta): Promise<void> {
  const { error } = await db.rpc("ledger_commit", { p: delta });
  if (error) throw new Error(error.message);
}

/** Reemplaza todos los registros de la empresa (null = vaciarlos). Solo Administrativo. Sin la migración: no hace nada. */
export async function resetLedger(db: SupabaseClient, ledger: Ledger | null): Promise<void> {
  const { error } = await db.rpc("ledger_reset", { p: ledger });
  if (error && !MISSING(error)) throw new Error(error.message);
}
