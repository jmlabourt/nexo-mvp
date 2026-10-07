"use client";
import { DIM_LABELS, dimFieldsForUnit, type DimsDraft } from "@/lib/material-kinds";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Medidas opcionales de un sobrante: sólo aparecen los campos que corresponden al tipo de material. */
export function LeftoverDimsFields({
  unit,
  value,
  onChange,
  big,
  idPrefix = "dim",
}: {
  unit: string;
  value: DimsDraft;
  onChange: (v: DimsDraft) => void;
  big?: boolean;
  idPrefix?: string;
}) {
  const fields = dimFieldsForUnit(unit);
  if (fields.length === 0) return null;
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-slate-700">
        Medidas del sobrante <span className="font-normal text-slate-500">(opcional)</span>
      </p>
      <div className="grid grid-cols-2 gap-3">
        {fields.map((f) => (
          <div key={f} className={f === "finish" ? "col-span-2" : undefined}>
            <label htmlFor={`${idPrefix}-${f}`} className="mb-1 block text-xs font-medium text-slate-600">
              {DIM_LABELS[f]}
            </label>
            <Input
              id={`${idPrefix}-${f}`}
              inputMode={f === "finish" ? "text" : "decimal"}
              value={value[f] ?? ""}
              onChange={(e) => onChange({ ...value, [f]: e.target.value })}
              className={cn(big && "h-12 text-base")}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
