"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import type { AlertSettings } from "@/types";
import { APP_NAME, APP_SUBTITLE, COMPANY_NAME, DEFAULT_SETTINGS } from "@/lib/constants";
import { useAppStore } from "@/store/use-app-store";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const pct = z.number({ error: "Ingresá un número" }).min(0, "Mínimo 0").max(100, "Máximo 100");
const schema = z
  .object({
    categoryWarningPct: pct,
    categoryCriticalPct: pct,
    marginWarningPp: pct,
    marginCriticalPp: pct,
    daysWithoutRecords: z.number({ error: "Ingresá un número" }).int("Días enteros").min(1).max(90),
    dueSoonDays: z.number({ error: "Ingresá un número" }).int("Días enteros").min(0).max(60),
    dueSoonProgressPct: pct,
  })
  .refine((v) => v.categoryCriticalPct > v.categoryWarningPct, { path: ["categoryCriticalPct"], message: "Debe ser mayor que el de atención" })
  .refine((v) => v.marginCriticalPp > v.marginWarningPp, { path: ["marginCriticalPp"], message: "Debe ser mayor que el de atención" });

const FIELDS: Array<{ key: keyof AlertSettings; label: string; hint: string }> = [
  { key: "categoryWarningPct", label: "Atención por categoría (%)", hint: "Real supera al presupuesto de la categoría en más de…" },
  { key: "categoryCriticalPct", label: "Crítico por categoría (%)", hint: "Por encima de este % la categoría pone el proyecto En riesgo." },
  { key: "marginWarningPp", label: "Atención por margen (pp)", hint: "Caída del margen proyectado vs. esperado, en puntos." },
  { key: "marginCriticalPp", label: "Crítico por margen (pp)", hint: "Caída mayor a estos puntos = crítico." },
  { key: "daysWithoutRecords", label: "Días sin registros", hint: "En Producción, avisar si no se registran consumos ni costos." },
  { key: "dueSoonDays", label: "Días antes de la entrega", hint: "Avisar si faltan estos días o menos…" },
  { key: "dueSoonProgressPct", label: "…y el avance es menor a (%)", hint: "Avance manual informado." },
];

export function SettingsPage() {
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const resetSettings = useAppStore((s) => s.resetSettings);
  const resetDemo = useAppStore((s) => s.resetDemo);
  const [saved, setSaved] = useState(false);
  const { register, handleSubmit, reset, formState } = useForm<AlertSettings>({ resolver: zodResolver(schema), defaultValues: settings });

  return (
    <div className="max-w-3xl">
      <PageHeader title="Configuración" subtitle={`${APP_NAME} · ${APP_SUBTITLE} · ${COMPANY_NAME} (empresa demo)`} />
      <Card>
        <CardHeader>
          <CardTitle>Umbrales de alertas</CardTitle>
          <CardDescription>Cambian cómo se clasifican los desvíos en todo el sistema, al instante.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            noValidate
            onSubmit={handleSubmit((v) => {
              updateSettings(v);
              setSaved(true);
              setTimeout(() => setSaved(false), 2500);
            })}
            className="grid gap-4 sm:grid-cols-2"
          >
            {FIELDS.map((f) => (
              <Field key={f.key} label={f.label} htmlFor={f.key} hint={f.hint} error={formState.errors[f.key]?.message}>
                <Input id={f.key} type="number" step="any" {...register(f.key, { valueAsNumber: true })} aria-invalid={!!formState.errors[f.key]} />
              </Field>
            ))}
            <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
              <Button type="submit">Guardar</Button>
              <Button
                variant="outline"
                onClick={() => {
                  resetSettings();
                  reset(DEFAULT_SETTINGS);
                }}
              >
                Restaurar valores por defecto
              </Button>
              {saved && <span role="status" className="text-sm text-emerald-700">Guardado</span>}
            </div>
          </form>
        </CardContent>
      </Card>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Datos demo</CardTitle>
          <CardDescription>Los datos se guardan solo en este navegador (localStorage). El reset restaura los proyectos iniciales de {COMPANY_NAME}.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="destructive"
            onClick={() => {
              if (window.confirm("¿Restaurar los datos demo iniciales?")) {
                resetDemo();
                reset(DEFAULT_SETTINGS);
              }
            }}
          >
            Reset demo
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
