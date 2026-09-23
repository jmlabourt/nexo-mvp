"use client";
import { Minus, Plus } from "lucide-react";
import { parseDecimal } from "@/lib/schemas";
import { pluralizeUnit } from "@/lib/formatting";

/** Input numérico grande con +/−, acepta coma decimal. */
export function QuantityInput({
  id,
  label,
  value,
  onChange,
  unit,
  step = 1,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  unit: string;
  step?: number;
  error?: string;
}) {
  const n = parseDecimal(value);
  const bump = (d: number) => {
    const base = Number.isFinite(n) ? n : 0;
    const next = Math.max(0, Math.round((base + d) * 100) / 100);
    onChange(String(next).replace(".", ","));
  };
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className="flex items-stretch gap-2">
        <button type="button" onClick={() => bump(-step)} aria-label={`Restar ${step}`} className="flex w-14 items-center justify-center rounded-md border border-slate-300 bg-white active:bg-slate-100">
          <Minus className="size-5" />
        </button>
        <div className="relative flex-1">
          <input
            id={id}
            inputMode="decimal"
            autoComplete="off"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-error` : undefined}
            className="h-14 w-full rounded-md border border-slate-300 bg-white px-4 pr-20 text-2xl font-semibold tabular aria-[invalid=true]:border-red-500"
          />
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-500">
            {pluralizeUnit(unit, Number.isFinite(n) ? n : 2)}
          </span>
        </div>
        <button type="button" onClick={() => bump(step)} aria-label={`Sumar ${step}`} className="flex w-14 items-center justify-center rounded-md border border-slate-300 bg-white active:bg-slate-100">
          <Plus className="size-5" />
        </button>
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
