"use client";
import { useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { MaterialSource, Project } from "@/types";
import { OTHER_MATERIAL_ID, SOURCE_LABELS, UNIT_COST_ORIGIN_LABELS } from "@/lib/constants";
import { projectMaterialOptions } from "@/lib/material-options";
import { resolveUnitCost } from "@/lib/project-operations";
import { usageSchema, type UsageValues } from "@/lib/schemas";
import { formatCurrency, formatQty, todayISO } from "@/lib/formatting";
import { slugify } from "@/lib/material-reconciliation";
import { poolAvailableFor } from "@/lib/reusable-pool";
import { useAppStore } from "@/store/use-app-store";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Choice } from "@/components/ui/choice";
import { DialogFooter } from "@/components/ui/dialog";
import { MaterialSelect } from "./material-select";

export function UsageForm({ project, onDone }: { project: Project; onDone: () => void }) {
  const addMaterialUsage = useAppStore((s) => s.addMaterialUsage);
  const pool = useAppStore((s) => s.reusableMaterials);
  const options = useMemo(() => projectMaterialOptions(project), [project]);
  const { register, handleSubmit, control, setValue, setError, formState } = useForm<UsageValues>({
    resolver: zodResolver(usageSchema),
    defaultValues: {
      materialId: "",
      customName: "",
      unit: "u",
      source: "purchased_for_project",
      hasWaste: false,
      wasteQuantity: 0,
      hasLeftover: false,
      leftoverQuantity: 0,
      date: todayISO(),
      notes: "",
    },
  });
  const v = useWatch({ control }) as UsageValues;
  const e = formState.errors;
  const isOther = v.materialId === OTHER_MATERIAL_ID;
  const option = options.find((o) => o.id === v.materialId);
  const poolItems = v.materialId && !isOther ? poolAvailableFor(pool, v.materialId) : [];
  const poolItem = pool.find((p) => p.id === v.reusableMaterialId);
  const resolved = v.materialId
    ? resolveUnitCost(project, isOther ? `custom:${slugify(v.customName ?? "")}` : v.materialId, option?.name ?? v.customName ?? "", v.source, poolItem)
    : null;
  const unitCost = v.source === "reused_leftover" ? resolved?.unitCost ?? 0 : Number.isFinite(v.unitCost) && v.unitCost !== undefined ? v.unitCost : resolved?.unitCost ?? 0;
  const consumed = Number(v.quantityConsumed) || 0;
  const waste = v.hasWaste ? Number(v.wasteQuantity) || 0 : 0;
  const left = v.hasLeftover ? Number(v.leftoverQuantity) || 0 : 0;

  const onMaterial = (id: string) => {
    setValue("materialId", id, { shouldValidate: true });
    setValue("reusableMaterialId", undefined);
    setValue("unitCost", undefined);
    if (v.source === "reused_leftover") setValue("source", "purchased_for_project");
    const o = options.find((x) => x.id === id);
    if (o) setValue("unit", o.unit);
  };

  const submit = (val: UsageValues) => {
    const edited = val.unitCost !== undefined && Number.isFinite(val.unitCost) && val.unitCost !== resolved?.unitCost;
    const res = addMaterialUsage(project.id, {
      materialId: isOther ? `custom:${slugify(val.customName ?? "")}` : val.materialId,
      materialName: isOther ? (val.customName ?? "").trim() : option?.name ?? val.materialId,
      unit: val.unit,
      source: val.source,
      reusableMaterialId: val.source === "reused_leftover" ? val.reusableMaterialId : undefined,
      quantityConsumed: val.quantityConsumed,
      wasteQuantity: val.hasWaste ? val.wasteQuantity : 0,
      reusableLeftoverQuantity: val.hasLeftover ? val.leftoverQuantity : 0,
      unitCost: edited ? val.unitCost : undefined,
      date: val.date,
      notes: val.notes || undefined,
    });
    if (!res.ok) return setError("root", { message: res.error });
    onDone();
  };

  const sources: MaterialSource[] = ["purchased_for_project", "existing_stock", ...(poolItems.length ? (["reused_leftover"] as const) : [])];

  return (
    <form onSubmit={handleSubmit(submit)} noValidate className="space-y-4">
      <Field label="Material" htmlFor="u-material" error={e.materialId?.message}>
        <MaterialSelect id="u-material" options={options} value={v.materialId} onChange={(ev) => onMaterial(ev.target.value)} aria-invalid={!!e.materialId} />
      </Field>
      {isOther && (
        <div className="grid grid-cols-3 gap-3">
          <Field label="Nombre" htmlFor="u-custom" error={e.customName?.message} className="col-span-2">
            <Input id="u-custom" {...register("customName")} />
          </Field>
          <Field label="Unidad" htmlFor="u-unit" error={e.unit?.message}>
            <Input id="u-unit" {...register("unit")} />
          </Field>
        </div>
      )}
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-slate-700">Origen</legend>
        <Choice<MaterialSource>
          name="Origen"
          value={v.source}
          onChange={(s) => {
            setValue("source", s);
            if (s !== "reused_leftover") setValue("reusableMaterialId", undefined);
          }}
          options={sources.map((s) => ({ value: s, label: SOURCE_LABELS[s] }))}
        />
      </fieldset>
      {v.source === "reused_leftover" && (
        <Field label="Sobrante utilizado" htmlFor="u-pool" error={e.reusableMaterialId?.message}>
          <Select id="u-pool" value={v.reusableMaterialId ?? ""} onChange={(ev) => setValue("reusableMaterialId", ev.target.value || undefined, { shouldValidate: true })}>
            <option value="">Elegí un sobrante…</option>
            {poolItems.map((p) => (
              <option key={p.id} value={p.id}>
                {formatQty(p.quantity, p.unit)} · de {p.originProjectName} · {formatCurrency(p.unitCost)}/{p.unit}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Cantidad utilizada (${v.unit})`} htmlFor="u-qty" error={e.quantityConsumed?.message}>
          <Input id="u-qty" type="number" step="any" min={0} {...register("quantityConsumed", { valueAsNumber: true })} aria-invalid={!!e.quantityConsumed} />
        </Field>
        <Field label="Fecha" htmlFor="u-date" error={e.date?.message}>
          <Input id="u-date" type="date" {...register("date")} />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <fieldset className="space-y-2">
          <legend className="mb-1.5 text-sm font-medium text-slate-700">¿Hubo desperdicio?</legend>
          <Choice<"no" | "si"> name="Desperdicio" value={v.hasWaste ? "si" : "no"} onChange={(x) => setValue("hasWaste", x === "si")} options={[{ value: "no", label: "No" }, { value: "si", label: "Sí" }]} />
          {v.hasWaste && (
            <Field label="Cantidad desperdiciada" htmlFor="u-waste" error={e.wasteQuantity?.message}>
              <Input id="u-waste" type="number" step="any" min={0} {...register("wasteQuantity", { valueAsNumber: true })} />
            </Field>
          )}
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="mb-1.5 text-sm font-medium text-slate-700">¿Quedó material reutilizable?</legend>
          <Choice<"no" | "si"> name="Sobrante" value={v.hasLeftover ? "si" : "no"} onChange={(x) => setValue("hasLeftover", x === "si")} options={[{ value: "no", label: "No" }, { value: "si", label: "Sí" }]} />
          {v.hasLeftover && (
            <Field label="Cantidad reutilizable" htmlFor="u-left" error={e.leftoverQuantity?.message}>
              <Input id="u-left" type="number" step="any" min={0} {...register("leftoverQuantity", { valueAsNumber: true })} />
            </Field>
          )}
        </fieldset>
      </div>
      {v.materialId && (
        <Field
          label="Costo unitario (solo gestión)"
          htmlFor="u-cost"
          hint={resolved ? `Sugerido: ${formatCurrency(resolved.unitCost)} — ${UNIT_COST_ORIGIN_LABELS[resolved.origin]}` : undefined}
        >
          <Input
            id="u-cost"
            type="number"
            step="any"
            min={0}
            disabled={v.source === "reused_leftover"}
            placeholder={resolved ? String(resolved.unitCost) : ""}
            {...register("unitCost", { setValueAs: (x: string) => (x === "" || x === undefined ? undefined : Number(x)) })}
          />
        </Field>
      )}
      <Field label="Notas" htmlFor="u-notes">
        <Textarea id="u-notes" rows={2} {...register("notes")} />
      </Field>
      <div className="grid grid-cols-3 gap-2 rounded-md bg-slate-50 p-3 text-center text-xs">
        <div>
          <div className="text-slate-500">Imputa al proyecto</div>
          <div className="mt-0.5 text-sm font-semibold tabular text-slate-900">{formatCurrency((consumed + waste) * unitCost)}</div>
        </div>
        <div>
          <div className="text-slate-500">De eso, desperdicio</div>
          <div className="mt-0.5 text-sm font-semibold tabular text-slate-900">{formatCurrency(waste * unitCost)}</div>
        </div>
        <div>
          <div className="text-slate-500">Va al pool de sobrantes</div>
          <div className="mt-0.5 text-sm font-semibold tabular text-emerald-700">{formatCurrency(left * unitCost)}</div>
        </div>
      </div>
      {e.root && <p role="alert" className="text-sm text-red-600">{e.root.message}</p>}
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>Cancelar</Button>
        <Button type="submit">Registrar uso</Button>
      </DialogFooter>
    </form>
  );
}
