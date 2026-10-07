import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMarginPoints, formatPercent } from "@/lib/formatting";

/** Diferencia de margen en puntos de margen, con color semántico. */
export function DeltaPoints({ value, className }: { value: number | null; className?: string }) {
  if (value === null) return <span className={cn("text-slate-400", className)}>—</span>;
  const r = Number(value.toFixed(1));
  const color = r < -5 ? "text-red-700" : r < 0 ? "text-amber-700" : "text-emerald-700";
  const Icon = r < 0 ? ArrowDown : r > 0 ? ArrowUp : ArrowRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 font-medium tabular", color, className)}>
      <Icon className="size-3.5" aria-hidden />
      {formatMarginPoints(value, { signed: true, short: true })}
    </span>
  );
}

/**
 * 40,0% → 30,8%  ↓ −9,2 puntos
 * Sin `to` (undefined) muestra solo el margen esperado: es el caso de un proyecto sin datos todavía.
 */
export function MarginShift({
  from,
  to,
  size = "md",
  toLabel = "Proyectado",
}: {
  from: number | null;
  to?: number | null;
  size?: "md" | "xl";
  toLabel?: string;
}) {
  const big = size === "xl";
  const expected = (
    <div>
      <div className="text-xs font-medium text-slate-500">Esperado</div>
      <div className={cn("font-semibold tabular text-slate-900", big ? "text-4xl" : "text-xl")}>{formatPercent(from)}</div>
    </div>
  );
  if (to === undefined) return <div className="flex flex-wrap items-end gap-x-4 gap-y-2">{expected}</div>;
  const delta = from !== null && to !== null ? to - from : null;
  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
      {expected}
      <ArrowRight className={cn("text-slate-400", big ? "mb-2 size-6" : "mb-1 size-4")} aria-hidden />
      <div>
        <div className="text-xs font-medium text-slate-500">{toLabel}</div>
        <div
          className={cn(
            "font-semibold tabular",
            big ? "text-4xl" : "text-xl",
            delta === null ? "text-slate-900" : delta < -5 ? "text-red-700" : delta < 0 ? "text-amber-700" : "text-emerald-700",
          )}
        >
          {formatPercent(to)}
        </div>
      </div>
      <DeltaPoints value={delta} className={big ? "mb-1.5 text-lg" : "mb-0.5"} />
    </div>
  );
}
