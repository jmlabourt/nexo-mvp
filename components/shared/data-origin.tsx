"use client";
// Piezas chicas compartidas por las cinco sesiones: de dónde sale un dato (ejemplo / pendiente de backend) y la
// ayuda ⓘ de un indicador (su definición vive en lib/indicators.ts).
import Link from "next/link";
import { indicator } from "@/lib/indicators";
import { HelpTip } from "@/components/ui/help-tip";
import { Badge } from "@/components/ui/badge";

/** "Datos de ejemplo" (demo) o "Pendiente de backend" (empresa real sin el dato). */
export function OriginTag({ origin }: { origin: "example" | "pending" }) {
  return origin === "example" ? (
    <Badge tone="gray" title="Datos de ejemplo de la demo: no son registros reales ni se guardan.">Datos de ejemplo</Badge>
  ) : (
    <Badge tone="gray" title="La base todavía no guarda este dato (ver PENDIENTES_BACKEND.md).">Pendiente de backend</Badge>
  );
}

/** Ayuda ⓘ con la definición del indicador: qué significa, fórmula, fuente y límites. */
export function IndicatorTip({ id }: { id: string }) {
  const def = indicator(id);
  if (!def) return null;
  return (
    <HelpTip label={def.name}>
      <span className="block">{def.meaning}</span>
      <span className="mt-1 block"><strong>Cálculo:</strong> {def.formula}</span>
      <span className="mt-1 block"><strong>Fuente:</strong> {def.source}</span>
      <span className="mt-1 block text-slate-500">{def.limits}</span>
      <Link href={`/settings#ind-${def.id}`} className="mt-1 block text-blue-700 hover:underline">Ver en Indicadores y cálculos</Link>
    </HelpTip>
  );
}

/** Acción que todavía no tiene guardado real: deshabilitada, con la explicación al lado. */
export function PendingAction({ label, reason = "Disponible cuando el backend guarde este dato." }: { label: string; reason?: string }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" disabled className="inline-flex h-9 cursor-not-allowed items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-400" title={reason}>
        {label}
      </button>
      <span className="text-xs text-slate-500">{reason}</span>
    </span>
  );
}
