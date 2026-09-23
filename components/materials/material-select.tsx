"use client";
import type { MaterialOption } from "@/lib/material-options";
import { OTHER_MATERIAL_ID } from "@/lib/constants";
import { Select } from "@/components/ui/input";

export function MaterialSelect({ id, options, ...props }: { id: string; options: MaterialOption[] } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  const inBudget = options.filter((o) => o.inBudget);
  const rest = options.filter((o) => !o.inBudget);
  return (
    <Select id={id} {...props}>
      <option value="">Elegí un material…</option>
      {inBudget.length > 0 && (
        <optgroup label="Del presupuesto / compras del proyecto">
          {inBudget.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </optgroup>
      )}
      <optgroup label="Catálogo frecuente">
        {rest.map((o) => (
          <option key={o.id} value={o.id}>{o.name}</option>
        ))}
        <option value={OTHER_MATERIAL_ID}>Otro…</option>
      </optgroup>
    </Select>
  );
}
