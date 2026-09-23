"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check } from "lucide-react";
import { CATEGORY_LABELS, CATEGORY_ORDER, DEMO_USERS, PROJECT_TYPES } from "@/lib/constants";
import { projectInfoSchema, type ProjectInfoValues } from "@/lib/schemas";
import { formatCurrency, formatDate, formatPercent, todayISO, toISODate } from "@/lib/formatting";
import { marginPercent } from "@/lib/calculations";
import { nextProjectCode, type BudgetLineInput } from "@/lib/project-operations";
import { useAppStore } from "@/store/use-app-store";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BudgetEditor, draftToInput, draftTotal, newDraftLine, type DraftLine } from "@/components/budget/budget-editor";
import { cn } from "@/lib/utils";

const STEPS = ["Información general", "Presupuesto", "Resumen"];

function in30days() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return toISODate(d);
}

export function NewProjectWizard() {
  const router = useRouter();
  const projects = useAppStore((s) => s.projects);
  const createProject = useAppStore((s) => s.createProject);
  const code = useMemo(() => nextProjectCode(projects), [projects]);
  const [step, setStep] = useState(0);
  const [lines, setLines] = useState<DraftLine[]>(() => [newDraftLine("materials"), newDraftLine("labor"), newDraftLine("installation")]);
  const [lineErrors, setLineErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");

  const form = useForm<ProjectInfoValues>({
    resolver: zodResolver(projectInfoSchema),
    defaultValues: {
      name: "",
      client: "",
      projectType: PROJECT_TYPES[0],
      description: "",
      startDate: todayISO(),
      dueDate: in30days(),
      owner: DEMO_USERS.management.name,
      salesPrice: undefined as unknown as number,
    },
    mode: "onTouched",
  });
  const { register, formState, control, trigger, getValues } = form;
  const salesPrice = Number(useWatch({ control, name: "salesPrice" })) || 0;
  const budget = lines.reduce((s, l) => s + draftTotal(l), 0);
  const profit = salesPrice - budget;
  const margin = marginPercent(profit, salesPrice);

  const validateLines = (): BudgetLineInput[] | null => {
    const errs: Record<string, string> = {};
    const inputs: BudgetLineInput[] = [];
    const nonEmpty = lines.filter((l) => l.description.trim() || l.unitCost.trim());
    for (const l of nonEmpty) {
      const r = draftToInput(l);
      if (r.error) errs[l.key] = r.error;
      else if (r.input) inputs.push(r.input);
    }
    setLineErrors(errs);
    if (Object.keys(errs).length) return null;
    if (inputs.length === 0) {
      setFormError("Agregá al menos un concepto al presupuesto.");
      return null;
    }
    setFormError("");
    return inputs;
  };

  const next = async () => {
    if (step === 0 && !(await trigger())) return;
    if (step === 1 && !validateLines()) return;
    setStep((s) => s + 1);
  };

  const submit = () => {
    const inputs = validateLines();
    if (!inputs) return setStep(1);
    const v = getValues();
    const res = createProject({ ...v, salesPrice: Number(v.salesPrice), code, budgetLines: inputs });
    if (!res.ok) return setFormError(res.error);
    router.push(`/projects/${res.value}`);
  };

  const byCat = CATEGORY_ORDER.map((c) => ({ c, total: lines.filter((l) => l.category === c).reduce((s, l) => s + draftTotal(l), 0) })).filter((x) => x.total > 0);

  return (
    <div>
      <PageHeader title="Nuevo proyecto" subtitle={`Código asignado: ${code}. El presupuesto que cargues será la línea base contra la que se medirán los desvíos.`} />
      <ol className="mb-6 flex flex-wrap gap-2" aria-label="Pasos">
        {STEPS.map((s, i) => (
          <li
            key={s}
            aria-current={i === step ? "step" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-full border px-3 py-1 text-sm",
              i === step ? "border-blue-600 bg-blue-50 font-medium text-blue-800" : i < step ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 text-slate-500",
            )}
          >
            <span className="flex size-5 items-center justify-center rounded-full bg-white text-xs tabular">{i < step ? <Check className="size-3" /> : i + 1}</span>
            {s}
          </li>
        ))}
      </ol>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div>
          {step === 0 && (
            <Card>
              <CardContent className="grid gap-4 pt-5 sm:grid-cols-2">
                <Field label="Nombre" htmlFor="name" error={formState.errors.name?.message} className="sm:col-span-2">
                  <Input id="name" {...register("name")} aria-invalid={!!formState.errors.name} placeholder="Ej.: Local Palermo – Mobiliario comercial" />
                </Field>
                <Field label="Cliente" htmlFor="client" error={formState.errors.client?.message}>
                  <Input id="client" {...register("client")} aria-invalid={!!formState.errors.client} />
                </Field>
                <Field label="Tipo" htmlFor="projectType" error={formState.errors.projectType?.message}>
                  <Select id="projectType" {...register("projectType")}>
                    {PROJECT_TYPES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Descripción" htmlFor="description" className="sm:col-span-2">
                  <Textarea id="description" {...register("description")} />
                </Field>
                <Field label="Fecha inicio" htmlFor="startDate" error={formState.errors.startDate?.message}>
                  <Input id="startDate" type="date" {...register("startDate")} />
                </Field>
                <Field label="Fecha entrega" htmlFor="dueDate" error={formState.errors.dueDate?.message}>
                  <Input id="dueDate" type="date" {...register("dueDate")} aria-invalid={!!formState.errors.dueDate} />
                </Field>
                <Field label="Responsable" htmlFor="owner" error={formState.errors.owner?.message}>
                  <Input id="owner" {...register("owner")} />
                </Field>
                <Field label="Precio de venta (ARS)" htmlFor="salesPrice" error={formState.errors.salesPrice?.message}>
                  <Input id="salesPrice" type="number" min={0} step="any" inputMode="numeric" {...register("salesPrice", { valueAsNumber: true })} aria-invalid={!!formState.errors.salesPrice} />
                </Field>
              </CardContent>
            </Card>
          )}
          {step === 1 && (
            <Card>
              <CardHeader>
                <CardTitle>Presupuesto</CardTitle>
                <p className="text-sm text-slate-500">Cargá materiales con cantidad para poder compararlos luego con lo comprado y consumido.</p>
              </CardHeader>
              <CardContent>
                <BudgetEditor lines={lines} onChange={setLines} errors={lineErrors} />
                {formError && <p role="alert" className="mt-3 text-sm text-red-600">{formError}</p>}
              </CardContent>
            </Card>
          )}
          {step === 2 && (
            <Card>
              <CardHeader>
                <CardTitle>{getValues("name")}</CardTitle>
                <p className="text-sm text-slate-500">
                  {code} · {getValues("client")} · {getValues("projectType")} · entrega {formatDate(getValues("dueDate"))}
                </p>
              </CardHeader>
              <CardContent>
                <dl className="divide-y divide-slate-100 text-sm">
                  {byCat.map(({ c, total }) => (
                    <div key={c} className="flex justify-between py-2">
                      <dt className="text-slate-600">{CATEGORY_LABELS[c]}</dt>
                      <dd className="tabular font-medium">{formatCurrency(total)}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-4 rounded-md bg-blue-50 p-3 text-sm text-blue-900">
                  El proyecto se crea en estado <strong>Cotización</strong>. Podés editar el presupuesto hasta que pase a Compras/Producción.
                </p>
                {formError && <p role="alert" className="mt-3 text-sm text-red-600">{formError}</p>}
              </CardContent>
            </Card>
          )}
          <div className="mt-4 flex justify-between">
            <Button variant="outline" onClick={() => (step === 0 ? router.push("/projects") : setStep(step - 1))}>
              {step === 0 ? "Cancelar" : "Atrás"}
            </Button>
            {step < 2 ? <Button onClick={next}>Continuar</Button> : <Button onClick={submit}>Crear proyecto</Button>}
          </div>
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start" aria-label="Resumen económico">
          <Card>
            <CardContent className="space-y-3 pt-5 text-sm">
              <Row label="Precio de venta" value={formatCurrency(salesPrice)} />
              <Row label="Costo presupuestado" value={formatCurrency(budget)} />
              <Row label="Ganancia esperada" value={formatCurrency(profit)} strong />
              <div className="border-t border-slate-100 pt-3">
                <div className="text-xs text-slate-500">Margen esperado</div>
                <div className={cn("text-3xl font-semibold tabular", margin !== null && margin < 15 ? "text-amber-700" : "text-slate-900")} aria-live="polite">
                  {formatPercent(margin)}
                </div>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-slate-500">{label}</span>
      <span className={cn("tabular", strong && "font-semibold text-slate-900")}>{value}</span>
    </div>
  );
}
