"use client";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatPercent, formatPp } from "@/lib/formatting";

export interface MarginDatum {
  code: string;
  name: string;
  expected: number;
  projected: number;
}

// Esperado = referencia (gris), Proyectado = dato actual (azul). Los números están también en la tabla.
const EXPECTED = "#94a3b8";
const PROJECTED = "#1d4ed8";

function ChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: MarginDatum }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-medium text-slate-900">
        {d.code} · {d.name}
      </div>
      <div className="flex justify-between gap-4 text-slate-600">
        <span>Esperado</span>
        <span className="tabular">{formatPercent(d.expected)}</span>
      </div>
      <div className="flex justify-between gap-4 text-slate-600">
        <span>Proyectado</span>
        <span className="tabular">{formatPercent(d.projected)}</span>
      </div>
      <div className="mt-1 flex justify-between gap-4 border-t border-slate-100 pt-1 font-medium text-slate-800">
        <span>Diferencia</span>
        <span className="tabular">{formatPp(d.projected - d.expected)}</span>
      </div>
    </div>
  );
}

export function MarginComparisonChart({ data }: { data: MarginDatum[] }) {
  return (
    <div className="h-72 w-full" role="img" aria-label="Margen esperado versus margen proyectado por proyecto activo">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barGap={2} barCategoryGap="28%" margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="code" tickLine={false} axisLine={{ stroke: "#cbd5e1" }} tick={{ fontSize: 12, fill: "#64748b" }} />
          <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#64748b" }} tickFormatter={(v: number) => `${v}%`} domain={[0, "auto"]} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f1f5f9" }} />
          <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12, color: "#475569" }} />
          <Bar dataKey="expected" name="Margen esperado" fill={EXPECTED} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
          <Bar dataKey="projected" name="Margen proyectado" fill={PROJECTED} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
