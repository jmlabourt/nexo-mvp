// Utilidades puras del núcleo: redondeo, fechas ISO (sin depender del huso del navegador) e ids deterministas.
import type { CoreWorld, ISODate } from "./types";

/** Error de una regla de negocio: el mensaje se muestra tal cual. */
export class CoreError extends Error {}

export const EPS = 1e-6;
/** Pesos con centavos. */
export const money = (n: number) => Math.round(n * 100) / 100;
/** Cantidades físicas (hasta milésimas). */
export const qty = (n: number) => Math.round(n * 1000) / 1000;
/** Porcentajes y horas con dos decimales. */
export const r2 = (n: number) => Math.round(n * 100) / 100;

export const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
export const sumBy = <T>(xs: readonly T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);

export const isISODate = (s: unknown): s is ISODate => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

const toUTC = (d: ISODate) => Date.parse(`${d}T00:00:00Z`);

export function addDays(d: ISODate, n: number): ISODate {
  return new Date(toUTC(d) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Días calendario de `a` a `b` (b − a). */
export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b) - toUTC(a)) / 86_400_000);
}

/** 0 = domingo … 6 = sábado. */
export function weekday(d: ISODate): number {
  return new Date(toUTC(d)).getUTCDay();
}

/** Lunes de la semana de `d`. */
export function weekStart(d: ISODate): ISODate {
  const w = weekday(d);
  return addDays(d, w === 0 ? -6 : 1 - w);
}

export function eachDay(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export const maxDate = (a: ISODate, b: ISODate) => (a > b ? a : b);
export const minDate = (a: ISODate, b: ISODate) => (a < b ? a : b);

/** Id determinista: el contador vive en el estado, así una misma secuencia de acciones da los mismos ids. */
export function nextId(w: CoreWorld, prefix: string): [string, CoreWorld] {
  const seq = w.seq + 1;
  return [`${prefix}-${String(seq).padStart(4, "0")}`, { ...w, seq }];
}

/** Varios ids de una vez. */
export function nextIds(w: CoreWorld, prefix: string, n: number): [string[], CoreWorld] {
  const ids = Array.from({ length: n }, (_, i) => `${prefix}-${String(w.seq + i + 1).padStart(4, "0")}`);
  return [ids, { ...w, seq: w.seq + n }];
}

export function byId<T extends { id: string }>(xs: readonly T[], id: string | undefined): T | undefined {
  return id === undefined ? undefined : xs.find((x) => x.id === id);
}

export function must<T>(x: T | undefined | null, msg: string): T {
  if (x === undefined || x === null) throw new CoreError(msg);
  return x;
}

export function replaceById<T extends { id: string }>(xs: readonly T[], next: T): T[] {
  return xs.map((x) => (x.id === next.id ? next : x));
}

export function groupBy<T>(xs: readonly T[], key: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const k = key(x);
    const list = m.get(k);
    if (list) list.push(x);
    else m.set(k, [x]);
  }
  return m;
}

/** Normaliza un nombre para comparar duplicados (sin tildes, minúsculas, espacios simples). */
export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
