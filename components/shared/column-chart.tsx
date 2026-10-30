"use client";
// Gráfico de columnas simple (sin librerías), con el estilo de Blerp: barras finas con punta redondeada, separación de
// 2px, grilla tenue, leyenda y tabla equivalente ("Ver como tabla"). Paleta validada (scripts de dataviz):
// real/confirmado #1d4ed8 · previsto/potencial #60a5fa (contraste bajo → siempre con leyenda y tabla) · referencia
// (capacidad) como una línea oscura.
import { useState } from "react";
import { cn } from "@/lib/utils";

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
}

export interface ChartColumn {
  id?: string;
  label: string;
  tooltip?: string;
  values: Record<string, number>;
  /** Línea de referencia de esa columna (ej. capacidad). */
  reference?: number;
}

export function ColumnChart({
  title,
  series,
  columns,
  mode = "grouped",
  referenceLabel,
  format,
  height = 180,
  onColumnClick,
}: {
  title: string;
  series: ChartSeries[];
  columns: ChartColumn[];
  mode?: "grouped" | "stacked";
  referenceLabel?: string;
  format: (n: number) => string;
  height?: number;
  onColumnClick?: (id: string | undefined) => void;
}) {
  const [table, setTable] = useState(false);
  const totals = columns.map((c) => (mode === "stacked" ? series.reduce((s, x) => s + (c.values[x.key] ?? 0), 0) : Math.max(0, ...series.map((x) => c.values[x.key] ?? 0))));
  const max = Math.max(1, ...totals, ...columns.map((c) => c.reference ?? 0));
  const pct = (v: number) => `${(v / max) * 100}%`;

  return (
    <figure className="space-y-2" aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
        <ul className="flex flex-wrap gap-3" aria-label="Leyenda">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
              {s.label}
            </li>
          ))}
          {referenceLabel && (
            <li className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-3 bg-slate-900" aria-hidden />
              {referenceLabel}
            </li>
          )}
        </ul>
        <button type="button" className="text-blue-700 hover:underline" onClick={() => setTable(!table)} aria-pressed={table}>
          {table ? "Ver gráfico" : "Ver como tabla"}
        </button>
      </div>
      {table ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-1.5 pr-3 font-medium"> </th>
                {series.map((s) => (
                  <th key={s.key} className="py-1.5 pr-3 text-right font-medium">{s.label}</th>
                ))}
                {referenceLabel && <th className="py-1.5 text-right font-medium">{referenceLabel}</th>}
              </tr>
            </thead>
            <tbody>
              {columns.map((c) => (
                <tr key={c.label} className="border-b border-slate-100">
                  <td className="py-1.5 pr-3">{c.label}</td>
                  {series.map((s) => (
                    <td key={s.key} className="py-1.5 pr-3 text-right">{format(c.values[s.key] ?? 0)}</td>
                  ))}
                  {referenceLabel && <td className="py-1.5 text-right">{c.reference === undefined ? "—" : format(c.reference)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="flex min-w-max items-end gap-3 border-b border-slate-300 pb-0" style={{ height }} role="img" aria-label={`${title}. Abrí "Ver como tabla" para los valores.`}>
            {columns.map((c) => {
              const tip = c.tooltip ?? [c.label, ...series.map((s) => `${s.label}: ${format(c.values[s.key] ?? 0)}`), ...(c.reference !== undefined && referenceLabel ? [`${referenceLabel}: ${format(c.reference)}`] : [])].join(" · ");
              return (
                <div
                  key={c.id ?? c.label}
                  className={cn("relative flex h-full min-w-12 flex-1 flex-col justify-end", onColumnClick && c.id ? "cursor-pointer" : undefined)}
                  title={tip}
                  tabIndex={onColumnClick && c.id ? 0 : -1}
                  aria-label={tip}
                  role={onColumnClick && c.id ? "button" : undefined}
                  onClick={() => onColumnClick?.(c.id)}
                  onKeyDown={(e) => {
                    if (!onColumnClick || !c.id) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onColumnClick(c.id);
                    }
                  }}
                >
                  <div className={cn("flex h-full items-end justify-center", mode === "grouped" ? "gap-[2px]" : "flex-col-reverse items-stretch gap-[2px]")}>
                    {series.map((s) => {
                      const v = c.values[s.key] ?? 0;
                      if (v <= 0) return mode === "grouped" ? <div key={s.key} className="w-3" /> : null;
                      return (
                        <div
                          key={s.key}
                          className={cn(mode === "grouped" ? "w-3 rounded-t" : "mx-auto w-6 first:rounded-t last:rounded-t")}
                          style={{ height: pct(v), background: s.color }}
                        />
                      );
                    })}
                  </div>
                  {c.reference !== undefined && c.reference > 0 && (
                    <div className="pointer-events-none absolute inset-x-0 border-t-2 border-slate-900" style={{ bottom: pct(c.reference) }} aria-hidden />
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex min-w-max gap-3 pt-1 text-xs text-slate-500">
            {columns.map((c) => (
              <div key={`${c.id ?? c.label}-label`} className="min-w-12 flex-1 text-center">{c.label}</div>
            ))}
          </div>
        </div>
      )}
    </figure>
  );
}

export const CHART_COLORS = { real: "#1d4ed8", planned: "#60a5fa" } as const;
