"use client";
// Gráficos del Dashboard de Gerencia (sin librerías), con el estilo de components/shared/column-chart.tsx:
// barras finas (≤ 24 px) con punta redondeada de 4 px y base recta, separación de 2 px, línea de 2 px con marcadores de
// 8 px y anillo del color de fondo, grilla tenue, leyenda con 2+ series, tooltip al pasar o enfocar y tabla equivalente.
// Paleta validada (scripts de dataviz): real #1d4ed8 · cotizado/previsto #60a5fa (contraste bajo → siempre con leyenda
// y tabla). "Parcial" (OT abierta) lleva además un rayado, así no depende solo del color.
import { useState } from "react";
import { cn } from "@/lib/utils";

const REAL = "#1d4ed8";
const SOFT = "#60a5fa";

function TableToggle({ table, onToggle }: { table: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} className="text-xs font-medium text-blue-700 hover:underline">
      {table ? "Ver gráfico" : "Ver como tabla"}
    </button>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div role="tooltip" className="pointer-events-none absolute z-10 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-md">
      {children}
    </div>
  );
}

export interface HBarRow {
  key: string;
  label: React.ReactNode;
  text: string;
  value: number;
  href?: string;
  onClick?: () => void;
}

/** Barras horizontales ordenadas (una serie: el título dice qué se mide). */
export function HBarChart({ title, rows, format, empty }: { title: string; rows: HBarRow[]; format: (n: number) => string; empty: string }) {
  const [table, setTable] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-slate-500">{empty}</p>;
  return (
    <figure aria-label={title} className="space-y-2">
      <div className="flex justify-end">
        <TableToggle table={table} onToggle={() => setTable(!table)} />
      </div>
      {table ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="py-1 font-medium">OT</th>
              <th className="py-1 text-right font-medium">Importe</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="py-1.5">{r.label}</td>
                <td className="py-1.5 text-right tabular">{format(r.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.key} className="grid grid-cols-[minmax(0,11rem)_1fr_auto] items-center gap-3 text-sm">
              <span className="min-w-0 truncate text-xs text-slate-700" title={r.text}>
                {r.label}
              </span>
              <button
                type="button"
                onClick={r.onClick}
                onMouseEnter={() => setHover(r.key)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(r.key)}
                onBlur={() => setHover(null)}
                aria-label={`${r.text}: ${format(r.value)}`}
                className="relative flex h-6 items-center rounded focus-visible:outline-2 focus-visible:outline-blue-600"
              >
                <span
                  className={cn("block h-4 rounded-r-[4px] transition-opacity", hover && hover !== r.key ? "opacity-60" : "")}
                  style={{ width: `${Math.max(1, (r.value / max) * 100)}%`, background: REAL }}
                />
                {hover === r.key && (
                  <span className="absolute left-0 top-7">
                    <Tip>
                      <strong className="block text-slate-900">{format(r.value)}</strong>
                      <span className="text-slate-500">{r.text}</span>
                    </Tip>
                  </span>
                )}
              </button>
              <span className="text-right text-xs font-medium tabular text-slate-900">{format(r.value)}</span>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}

export interface CompareRow {
  key: string;
  label: string;
  quoted: number | null;
  real: number | null;
  partial: boolean;
  onClick?: () => void;
}

/** Barras comparativas: rentabilidad cotizada vs real por OT (en %). La real de una OT abierta es parcial. */
export function CompareChart({ title, rows, empty }: { title: string; rows: CompareRow[]; empty: string }) {
  const [table, setTable] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const values = rows.flatMap((r) => [r.quoted ?? 0, r.real ?? 0]);
  const max = Math.max(10, ...values.map((v) => Math.abs(v)));
  const min = Math.min(0, ...values);
  const span = max - min;
  const h = 150;
  const y = (v: number) => ((max - v) / span) * h;
  const fmt = (v: number | null) => (v === null ? "Sin datos" : `${v.toFixed(1).replace(".", ",")} %`);
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-slate-500">{empty}</p>;
  return (
    <figure aria-label={title} className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
        <ul className="flex flex-wrap gap-3" aria-label="Leyenda">
          <li className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-sm" style={{ background: SOFT }} aria-hidden /> Cotizada
          </li>
          <li className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-sm" style={{ background: REAL }} aria-hidden /> Real final
          </li>
          <li className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-sm" style={{ background: `repeating-linear-gradient(45deg, ${REAL} 0 2px, #fff 2px 4px)` }} aria-hidden /> Real parcial (hasta hoy)
          </li>
        </ul>
        <TableToggle table={table} onToggle={() => setTable(!table)} />
      </div>
      {table ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="py-1 font-medium">OT</th>
              <th className="py-1 text-right font-medium">Cotizada</th>
              <th className="py-1 text-right font-medium">Real</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="break-all py-1.5">{r.label}</td>
                <td className="py-1.5 text-right tabular">{fmt(r.quoted)}</td>
                <td className="py-1.5 text-right tabular">
                  {fmt(r.real)} {r.partial && <span className="text-xs text-slate-500">(parcial)</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="relative overflow-x-auto">
          <div className="flex min-w-max items-end gap-4 pl-8" style={{ height: h + 40 }}>
            <div className="absolute inset-x-0 top-0" style={{ height: h }} aria-hidden>
              {[max, (max + min) / 2, min].map((v) => (
                <div key={v} className="absolute inset-x-0 border-t border-slate-100 text-[10px] text-slate-400" style={{ top: y(v) }}>
                  <span className="-mt-2 block w-7 bg-white text-right">{Math.round(v)}%</span>
                </div>
              ))}
              <div className="absolute inset-x-0 border-t border-slate-300" style={{ top: y(0) }} />
            </div>
            {rows.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={r.onClick}
                onMouseEnter={() => setHover(r.key)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(r.key)}
                onBlur={() => setHover(null)}
                aria-label={`${r.label}: cotizada ${fmt(r.quoted)}, real ${fmt(r.real)}${r.partial ? " parcial" : ""}`}
                className="relative flex w-14 flex-col items-center focus-visible:outline-2 focus-visible:outline-blue-600"
                style={{ height: h + 40 }}
              >
                <div className="relative w-full" style={{ height: h }}>
                  {[
                    { v: r.quoted, color: SOFT, x: 8, hatch: false },
                    { v: r.real, color: REAL, x: 30, hatch: r.partial },
                  ].map((b, i) =>
                    b.v === null ? null : (
                      <span
                        key={i}
                        className={cn("absolute w-[18px]", b.v >= 0 ? "rounded-t-[4px]" : "rounded-b-[4px]")}
                        style={{
                          left: b.x,
                          top: b.v >= 0 ? y(b.v) : y(0),
                          height: Math.max(1, Math.abs(y(b.v) - y(0))),
                          background: b.hatch ? `repeating-linear-gradient(45deg, ${b.color} 0 3px, #dbeafe 3px 6px)` : b.color,
                        }}
                      />
                    ),
                  )}
                </div>
                <span className="mt-1 w-14 truncate text-center text-[10px] text-slate-600" title={r.label}>
                  {r.label.slice(0, 6)}
                </span>
                {hover === r.key && (
                  <span className="absolute left-12 top-4">
                    <Tip>
                      <span className="block break-all text-slate-500">{r.label}</span>
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block h-0.5 w-3" style={{ background: SOFT }} /> <strong className="text-slate-900">{fmt(r.quoted)}</strong> cotizada
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block h-0.5 w-3" style={{ background: REAL }} /> <strong className="text-slate-900">{fmt(r.real)}</strong> {r.partial ? "real parcial" : "real final"}
                      </span>
                    </Tip>
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </figure>
  );
}

export interface LinePoint {
  key: string;
  label: string;
  value: number;
}

/** Línea de 2 px con marcadores: evolución de cobros por semana o mes. */
export function LineChart({ title, points, format, empty }: { title: string; points: LinePoint[]; format: (n: number) => string; empty: string }) {
  const [table, setTable] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  if (points.length === 0) return <p className="py-6 text-center text-sm text-slate-500">{empty}</p>;
  const W = Math.max(320, points.length * 48);
  const H = 150;
  const pad = 8;
  const max = Math.max(1, ...points.map((p) => p.value));
  const x = (i: number) => pad + (points.length === 1 ? (W - 2 * pad) / 2 : (i * (W - 2 * pad)) / (points.length - 1));
  const y = (v: number) => pad + (1 - v / max) * (H - 2 * pad);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  return (
    <figure aria-label={title} className="space-y-2">
      <div className="flex justify-end">
        <TableToggle table={table} onToggle={() => setTable(!table)} />
      </div>
      {table ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="py-1 font-medium">Período</th>
              <th className="py-1 text-right font-medium">Cobrado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {points.map((p) => (
              <tr key={p.key}>
                <td className="py-1.5">{p.label}</td>
                <td className="py-1.5 text-right tabular">{format(p.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="relative overflow-x-auto">
          <svg width={W} height={H + 24} role="img" aria-label={title} onMouseLeave={() => setHover(null)}>
            {[0, 0.5, 1].map((f) => (
              <line key={f} x1={0} x2={W} y1={pad + f * (H - 2 * pad)} y2={pad + f * (H - 2 * pad)} stroke="#f1f5f9" strokeWidth={1} />
            ))}
            <path d={path} fill="none" stroke={REAL} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad} y2={H - pad} stroke="#cbd5e1" strokeWidth={1} />}
            {points.map((p, i) => (
              <g key={p.key}>
                <circle cx={x(i)} cy={y(p.value)} r={4} fill={REAL} stroke="#fff" strokeWidth={2} />
                <rect
                  x={x(i) - 18}
                  y={0}
                  width={36}
                  height={H}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${p.label}: ${format(p.value)}`}
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                />
                <text x={x(i)} y={H + 16} textAnchor="middle" fontSize={10} fill="#64748b">
                  {p.label}
                </text>
              </g>
            ))}
          </svg>
          {hover !== null && (
            <span className="absolute" style={{ left: Math.min(x(hover) + 8, W - 140), top: 4 }}>
              <Tip>
                <strong className="block text-slate-900">{format(points[hover].value)}</strong>
                <span className="text-slate-500">{points[hover].label}</span>
              </Tip>
            </span>
          )}
        </div>
      )}
    </figure>
  );
}
