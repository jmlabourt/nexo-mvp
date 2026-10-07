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
    deadlineNoProductionPct: pct,
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
  { key: "deadlineNoProductionPct", label: "Plazo transcurrido sin producción (%)", hint: "Avisar si pasó este % del plazo y el proyecto todavía no llegó a Producción." },
];

export function SettingsPage() {
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const resetSettings = useAppStore((s) => s.resetSettings);
  const resetDemo = useAppStore((s) => s.resetDemo);
  const clearData = useAppStore((s) => s.clearData);
  const organizationName = useAppStore((s) => s.organizationName);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const { register, handleSubmit, reset, formState } = useForm<AlertSettings>({ resolver: zodResolver(schema), defaultValues: settings });

  return (
    <div className="max-w-3xl">
      <PageHeader title="Configuración" subtitle={`${APP_NAME} · ${APP_SUBTITLE} · ${organizationName}`} />
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
          <CardTitle>Datos de la empresa</CardTitle>
          <CardDescription>
            Los datos se guardan en tu cuenta (Supabase). El reset restaura los proyectos de ejemplo de {COMPANY_NAME}; vaciar
            borra todo para empezar con tus proyectos reales.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={busy}
            onClick={async () => {
              if (!window.confirm("¿Restaurar los datos demo? Se perderán los registros cargados.")) return;
              setBusy(true);
              const res = await resetDemo();
              setBusy(false);
              if (res.ok) reset(DEFAULT_SETTINGS);
            }}
          >
            Reset demo
          </Button>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={async () => {
              if (!window.confirm("¿Borrar todos los proyectos, registros y sobrantes de tu empresa? No se puede deshacer.")) return;
              setBusy(true);
              const res = await clearData();
              setBusy(false);
              if (res.ok) reset(DEFAULT_SETTINGS);
            }}
          >
            Vaciar datos
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
