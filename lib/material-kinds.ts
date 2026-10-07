// ─────────────────────────────────────────────────────────────
// Qué medidas tiene sentido pedir de un sobrante según el tipo de material.
//   placas   → largo, ancho, espesor, color/terminación
//   perfiles → largo
//   herrajes → sólo unidades (sin medidas)
// ─────────────────────────────────────────────────────────────
import type { LeftoverDims } from "@/types";

export type DimField = "length" | "width" | "thickness" | "finish";

export const DIM_LABELS: Record<DimField, string> = {
  length: "Largo (mm)",
  width: "Ancho (mm)",
  thickness: "Espesor (mm)",
  finish: "Color / terminación",
};

export function dimFieldsForUnit(unit: string): DimField[] {
  const u = unit.trim().toLowerCase();
  if (u === "placa" || u === "placas" || u === "plancha") return ["length", "width", "thickness", "finish"];
  if (u === "m" || u === "ml" || u === "metro" || u === "metros") return ["length"];
  return [];
}

export type DimsDraft = Partial<Record<DimField, string>>;

/** Convierte lo tipeado en medidas; ignora los vacíos. Devuelve error si hay un número inválido. */
export function parseDims(fields: DimField[], draft: DimsDraft): { dims?: LeftoverDims; error?: string } {
  const out: LeftoverDims = {};
  for (const f of fields) {
    const raw = (draft[f] ?? "").trim();
    if (!raw) continue;
    if (f === "finish") {
      out.finish = raw;
      continue;
    }
    const n = Number(raw.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return { error: `${DIM_LABELS[f]}: ingresá un número mayor a cero.` };
    if (f === "length") out.lengthMm = n;
    if (f === "width") out.widthMm = n;
    if (f === "thickness") out.thicknessMm = n;
  }
  return { dims: Object.keys(out).length ? out : undefined };
}

export function formatDims(d: LeftoverDims | undefined): string {
  if (!d) return "";
  const size = [d.lengthMm, d.widthMm, d.thicknessMm].filter((n): n is number => n !== undefined).join(" × ");
  return [size ? `${size} mm` : "", d.finish ?? ""].filter(Boolean).join(" · ");
}
