"use client";
import { useForm, useWatch } from "react-hook-form";
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

type FieldDef = {
  key: keyof AlertSettings;
  label: string;
  hint: (v: AlertSettings) => string;
};

type Group = { title: string; description: string; fields: FieldDef[] };

const ARS = (x: number) => `$ ${Math.round(x).toLocaleString("es-AR")}`;
const PTS = (x: number) => `${Math.round(x * 10) / 10}`.replace(".", ",");

const GROUPS: Group[] = [
  {
    title: "Costos que se pasan del presupuesto",
    description: "Se compara el costo real de cada categoría (Materiales, Mano de obra, etc.) con lo presupuestado.",
    fields: [
      {
        key: "categoryWarningPct",
        label: "Pasa a Atención cuando se excede en (%)",
        hint: (v) =>
          `Ej.: si Materiales se presupuestó en ${ARS(1_000_000)}, pasa a Atención cuando el costo real supera ${ARS(1_000_000 * (1 + v.categoryWarningPct / 100))}.`,
      },
      {
        key: "categoryCriticalPct",
        label: "Pasa a En riesgo cuando se excede en (%)",
        hint: (v) =>
          `Ej.: en ese mismo caso, pasa a En riesgo cuando el costo real supera ${ARS(1_000_000 * (1 + v.categoryCriticalPct / 100))}.`,
      },
    ],
  },
  {
    title: "Caída del margen",
    description: "Se compara el margen proyectado con el margen esperado. La diferencia se mide en puntos de margen.",
    fields: [
      {
        key: "marginWarningPp",
        label: "Pasa a Atención si el margen cae (puntos)",
        hint: (v) =>
          `Ej.: si el margen esperado era 40%, avisa cuando el proyectado baja a ${PTS(40 - v.marginWarningPp)}% o menos.`,
      },
      {
        key: "marginCriticalPp",
        label: "Pasa a En riesgo si el margen cae (puntos)",
        hint: (v) =>
          `Ej.: con el mismo 40% esperado, es En riesgo cuando el proyectado baja de ${PTS(40 - v.marginCriticalPp)}%.`,
      },
    ],
  },
  {
    title: "Plazos y registros",
    description: "Avisos para que no se pase por alto un proyecto que no se está cargando o que se acerca a la entrega.",
    fields: [
      {
        key: "daysWithoutRecords",
        label: "Días sin registros",
        hint: (v) =>
          `Ej.: un proyecto en Producción al que hace ${v.daysWithoutRecords} días o más no se le carga ningún consumo ni costo genera un aviso.`,
      },
      {
        key: "dueSoonDays",
        label: "Días antes de la entrega",
        hint: (v) => `Ej.: desde ${v.dueSoonDays} días antes de la fecha de entrega, el proyecto muestra un aviso de entrega cercana.`,
      },
      {
        key: "deadlineNoProductionPct",
        label: "Plazo transcurrido sin llegar a Producción (%)",
        hint: (v) =>
          `Ej.: si ya pasó el ${v.deadlineNoProductionPct}% del plazo total y el proyecto todavía no llegó a Producción, avisa.`,
      },
    ],
  },
];

function numOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function SettingsPage() {
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const resetSettings = useAppStore((s) => s.resetSettings);
  const resetDemo = useAppStore((s) => s.resetDemo);
  const clearData = useAppStore((s) => s.clearData);
  const organizationName = useAppStore((s) => s.organizationName);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const { register, handleSubmit, reset, control, formState } = useForm<AlertSettings>({
    resolver: zodResolver(schema),
    defaultValues: settings,
  });

  const confirmWord = organizationName.trim() || "VACIAR";
  const canClear = confirmText.trim().toLowerCase() === confirmWord.toLowerCase();

  // Valores en vivo para que los ejemplos se actualicen mientras se escribe.
  const raw = useWatch({ control });
  const live: AlertSettings = {
    categoryWarningPct: numOr(raw.categoryWarningPct, settings.categoryWarningPct),
    categoryCriticalPct: numOr(raw.categoryCriticalPct, settings.categoryCriticalPct),
    marginWarningPp: numOr(raw.marginWarningPp, settings.marginWarningPp),
    marginCriticalPp: numOr(raw.marginCriticalPp, settings.marginCriticalPp),
    daysWithoutRecords: numOr(raw.daysWithoutRecords, settings.daysWithoutRecords),
    dueSoonDays: numOr(raw.dueSoonDays, settings.dueSoonDays),
    deadlineNoProductionPct: numOr(raw.deadlineNoProductionPct, settings.deadlineNoProductionPct),
  };

  return (
    <div className="max-w-3xl">
      <PageHeader title="Configuración" subtitle={`${APP_NAME} · ${APP_SUBTITLE} · ${organizationName}`} />

      <Card>
        <CardHeader>
          <CardTitle>Cuándo avisar</CardTitle>
          <CardDescription>
            Estos números definen cuándo un desvío se considera Atención o En riesgo. Al guardar, se recalculan todas las
            pantallas al instante. No modifican ningún costo ni registro, solo cómo se clasifican.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            noValidate
            onSubmit={handleSubmit((v) => {
              updateSettings(v);
              setSaved(true);
              setTimeout(() => setSaved(false), 2500);
            })}
            className="space-y-8"
          >
            {GROUPS.map((g) => (
              <section key={g.title} aria-labelledby={`grp-${g.title}`}>
                <h3 id={`grp-${g.title}`} className="text-sm font-semibold text-slate-900">
                  {g.title}
                </h3>
                <p className="mb-3 mt-0.5 text-sm text-slate-500">{g.description}</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  {g.fields.map((f) => (
                    <Field key={f.key} label={f.label} htmlFor={f.key} hint={f.hint(live)} error={formState.errors[f.key]?.message}>
                      <Input id={f.key} type="number" step="any" {...register(f.key, { valueAsNumber: true })} aria-invalid={!!formState.errors[f.key]} />
                    </Field>
                  ))}
                </div>
              </section>
            ))}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit">Guardar</Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  resetSettings();
                  reset(DEFAULT_SETTINGS);
                }}
              >
                Restaurar valores por defecto
              </Button>
              {saved && (
                <span role="status" className="text-sm text-emerald-700">
                  Guardado
                </span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Cómo se clasifica cada proyecto</CardTitle>
          <CardDescription>Es una regla fija: usa las alertas abiertas del proyecto (costos, margen, plazos y material sin destino). Los finalizados no llevan esta etiqueta.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-slate-700">
            <li>
              <span className="font-semibold text-red-700">En riesgo:</span> tiene al menos una alerta crítica abierta.
            </li>
            <li>
              <span className="font-semibold text-amber-700">Atención:</span> tiene alertas de atención abiertas y ninguna crítica.
            </li>
            <li>
              <span className="font-semibold text-emerald-700">Sin desvíos:</span> hay datos registrados y no hay alertas abiertas.
            </li>
            <li>
              <span className="font-semibold text-slate-600">Sin datos todavía:</span> aún no se cargó ningún consumo ni costo.
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card className="mt-6 border-red-200">
        <CardHeader>
          <CardTitle className="text-red-800">Zona de riesgo</CardTitle>
          <CardDescription>
            Estas acciones reemplazan o borran los datos de tu empresa. Los datos se guardan en tu cuenta y no se pueden
            recuperar después.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Restaurar datos demo</h3>
            <p className="mb-3 mt-0.5 text-sm text-slate-500">
              Vuelve a cargar los proyectos de ejemplo de {COMPANY_NAME}. Se pierden los registros cargados.
            </p>
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
          </div>

          <div className="border-t border-slate-200 pt-6">
            <h3 className="text-sm font-semibold text-slate-900">Vaciar todos los datos</h3>
            <p className="mb-3 mt-0.5 text-sm text-slate-500">
              Borra todos los proyectos, registros y sobrantes para empezar con tus proyectos reales.
            </p>
            <Field label={`Para confirmar, escribí: ${confirmWord}`} htmlFor="confirm-clear">
              <Input
                id="confirm-clear"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                autoComplete="off"
              />
            </Field>
            <Button
              className="mt-3"
              variant="destructive"
              disabled={busy || !canClear}
              onClick={async () => {
                setBusy(true);
                const res = await clearData();
                setBusy(false);
                if (res.ok) {
                  reset(DEFAULT_SETTINGS);
                  setConfirmText("");
                }
              }}
            >
              Vaciar datos
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
