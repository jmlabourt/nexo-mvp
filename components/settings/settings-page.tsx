"use client";
import { MaterialCatalogSettings } from "./material-catalog";

import { QuoteDefaultsSettings, FrontendProductionSettings } from "./frontend-production";
import { useConfirmedAction } from "@/store/confirmed-action";
// Configuración en pestañas. Gerencia: Rubros y capacidad · Costos horarios · Costos · Alertas · Indicadores y cálculos ·
// Inflación y nomenclatura · Usuarios y permisos · Datos. Administración: solo Nomenclatura y Rubros (consulta).
// Cada sección con guardado real tiene un solo "Guardar", avisa si hay cambios sin guardar y puede volver a los valores
// por defecto; las que la base todavía no guarda lo dicen y dejan el botón deshabilitado.
// Configuración en pestañas. Gerencia: Rubros y capacidad · Costos horarios · Costos · Alertas · Indicadores y cálculos ·
// Inflación y nomenclatura · Usuarios y permisos · Datos. Administración: solo Nomenclatura y Rubros (consulta).
// Cada sección con guardado real tiene un solo "Guardar", avisa si hay cambios sin guardar y puede volver a los valores
// por defecto; las que la base todavía no guarda lo dicen y dejan el botón deshabilitado.
import { useState, useSyncExternalStore } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { AlertSettings } from "@/types";
import { APP_NAME, APP_SUBTITLE, COMPANY_NAME, DEFAULT_FINANCIAL_PCT, DEFAULT_SETTINGS } from "@/lib/constants";

import { formatCurrency, formatNumber } from "@/lib/formatting";


import { parseDecimal } from "@/lib/schemas";
import { useAppStore } from "@/store/use-app-store";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { HelpTip } from "@/components/ui/help-tip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DemoSection, FinancialRateSection, GeneralCostsSection } from "./demo-sections";



import { UsersSection } from "./users-section";
import { useIdentity, useLedgerBacked } from "@/store/selectors";
import { IndicatorsSection, NomenclatureSection, PermissionsSection } from "./management-sections";

// ── Piezas comunes de cada sección ───────────────────────────

/** Estado visible del guardado: cambios sin guardar o confirmación de que se guardó. */
function SaveStatus({ dirty, saved, error }: { dirty: boolean; saved: boolean; error?: string }) {
  if (error) return <p role="alert" className="text-sm text-red-600">{error}</p>;
  if (dirty) return <p role="status" className="text-sm text-amber-800">Hay cambios sin guardar.</p>;
  if (saved) return <p role="status" className="text-sm text-emerald-700">Cambios guardados.</p>;
  return null;
}

function SectionActions({ onRestore, dirty, saved, error }: { onRestore: () => void; dirty: boolean; saved: boolean; error?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
      <Button type="submit">Guardar</Button>
      <Button type="button" variant="outline" onClick={onRestore}>
        Restaurar valores por defecto
      </Button>
      <SaveStatus dirty={dirty} saved={saved} error={error} />
    </div>
  );
}

const asText = (n: number) => String(n).replace(".", ",");

// ── Alertas ──────────────────────────────────────────────────

const pct = z.number({ error: "Ingresá un número" }).min(0, "Mínimo 0").max(100, "Máximo 100");
const alertsSchema = z
  .object({
    categoryWarningPct: pct,
    categoryCriticalPct: pct,
    marginWarningPp: pct,
    marginCriticalPp: pct,
    daysWithoutRecords: z.number({ error: "Ingresá un número" }).int("Días enteros").min(1).max(90),
    dueSoonDays: z.number({ error: "Ingresá un número" }).int("Días enteros").min(0).max(60),
    deadlineNoProductionPct: pct,
    hoursDeviationPct: z.number({ error: "Ingresá un número" }).min(1, "Mínimo 1").max(500, "Máximo 500"),
    hoursDeviationHours: z.number({ error: "Ingresá un número" }).min(0.5, "Mínimo 0,5").max(24, "Máximo 24"),
    purchaseLeadDays: z.number({ error: "Ingresá un número" }).int("Días enteros").min(1, "Mínimo 1").max(60, "Máximo 60"),
  })
  .refine((v) => v.categoryCriticalPct > v.categoryWarningPct, { path: ["categoryCriticalPct"], message: "Debe ser mayor que el de atención" })
  .refine((v) => v.marginCriticalPp > v.marginWarningPp, { path: ["marginCriticalPp"], message: "Debe ser mayor que el de atención" });

type AlertField = { key: keyof AlertSettings; label: string; help: (v: AlertSettings) => string };
type AlertGroup = { title: string; help: string; fields: AlertField[] };

const PTS = (x: number) => formatNumber(Math.round(x * 10) / 10, 1);

const ALERT_GROUPS: AlertGroup[] = [
  {
    title: "Costos que se pasan del presupuesto",
    help: "Se compara el costo real de cada categoría (Materiales, Mano de obra, etc.) con el costo presupuestado.",
    fields: [
      {
        key: "categoryWarningPct",
        label: "Atención si se excede en (%)",
        help: (v) =>
          `Por ejemplo, si Materiales se presupuestó en ${formatCurrency(1_000_000)}, pasa a Atención cuando el costo real supera ${formatCurrency(1_000_000 * (1 + v.categoryWarningPct / 100))}.`,
      },
      {
        key: "categoryCriticalPct",
        label: "En riesgo si se excede en (%)",
        help: (v) => `En ese mismo caso, pasa a En riesgo cuando el costo real supera ${formatCurrency(1_000_000 * (1 + v.categoryCriticalPct / 100))}.`,
      },
    ],
  },
  {
    title: "Caída de la rentabilidad",
    help: "Se compara la rentabilidad proyectada con la rentabilidad esperada. La diferencia se mide en puntos de margen.",
    fields: [
      {
        key: "marginWarningPp",
        label: "Atención si cae (puntos)",
        help: (v) => `Si la rentabilidad esperada era 40%, avisa cuando la proyectada baja a ${PTS(40 - v.marginWarningPp)}% o menos.`,
      },
      {
        key: "marginCriticalPp",
        label: "En riesgo si cae (puntos)",
        help: (v) => `Con el mismo 40% esperado, es En riesgo cuando la proyectada baja de ${PTS(40 - v.marginCriticalPp)}%.`,
      },
    ],
  },
  {
    title: "Plazos y registros",
    help: "Avisos para que no se pase por alto un proyecto que no se está cargando o que se acerca a la entrega.",
    fields: [
      {
        key: "daysWithoutRecords",
        label: "Días sin registros",
        help: (v) => `Un proyecto en Producción al que hace ${v.daysWithoutRecords} días o más no se le carga ningún consumo ni costo genera un aviso.`,
      },
      {
        key: "dueSoonDays",
        label: "Días antes de la entrega",
        help: (v) => `Desde ${v.dueSoonDays} días antes de la fecha de entrega, el proyecto muestra un aviso de entrega cercana.`,
      },
      {
        key: "deadlineNoProductionPct",
        label: "Plazo transcurrido sin llegar a Producción (%)",
        help: (v) => `Si ya pasó el ${v.deadlineNoProductionPct}% del plazo total y el proyecto todavía no llegó a Producción, avisa.`,
      },
    ],
  },
  {
    title: "Desvío de horas (supuesto a ajustar con el cliente)",
    help: "Se comparan las horas cargadas con las previstas: las de la asignación del día y las estimadas para el rubro en el presupuesto. Avisa al Jefe de planta y al Administrativo, no al operario. El valor inicial (25 % o 2 h, lo que ocurra primero) es un supuesto.",
    fields: [
      {
        key: "hoursDeviationPct",
        label: "Avisar si se pasa en (%)",
        help: (v) => `Si se previeron 8 h, avisa desde ${PTS(8 * (1 + v.hoursDeviationPct / 100))} h cargadas (o antes, si se cumple el de horas).`,
      },
      {
        key: "hoursDeviationHours",
        label: "…o en (horas)",
        help: (v) => `Si se previeron 4 h, avisa desde ${PTS(4 + v.hoursDeviationHours)} h cargadas (o antes, si se cumple el %).`,
      },
    ],
  },
  {
    title: "Compras (supuesto a ajustar con el cliente)",
    help: "El material de un proyecto se necesita para el día de inicio. Avisa a Compras (y al Administrativo) lo que todavía no se compró y se necesita en pocos días. Los 7 días iniciales son un supuesto.",
    fields: [
      {
        key: "purchaseLeadDays",
        label: "Avisar material sin comprar con (días de anticipación)",
        help: (v) => `Un proyecto que arranca en ${v.purchaseLeadDays} días o menos y tiene materiales pendientes o cotizando genera un aviso.`,
      },
    ],
  },
];

const numOr = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);

function AlertsSection() {
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useConfirmedAction("updateSettings");
  const [saved, setSaved] = useState(false);
  const { register, handleSubmit, reset, control, formState } = useForm<AlertSettings>({ resolver: zodResolver(alertsSchema), defaultValues: settings });
  const raw = useWatch({ control });
  // Valores en vivo para que las explicaciones se actualicen mientras se escribe.
  const live = Object.fromEntries(
    (Object.keys(DEFAULT_SETTINGS) as Array<keyof AlertSettings>).map((k) => [k, numOr(raw[k], settings[k])]),
  ) as unknown as AlertSettings;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cuándo avisar</CardTitle>
        <CardDescription>Definen cuándo un desvío es Atención o En riesgo. No cambian ningún costo ni registro.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          onSubmit={handleSubmit(async (v) => {
            const result = await updateSettings(v);
            if (!result.ok) return;
            reset(v);
            setSaved(true);
          })}
          className="space-y-8"
        >
          {ALERT_GROUPS.map((g) => (
            <fieldset key={g.title}>
              <legend className="flex items-center gap-1 text-sm font-semibold text-slate-900">
                {g.title}
                <HelpTip label={g.title}>{g.help}</HelpTip>
              </legend>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                {g.fields.map((f) => (
                  <div key={f.key} className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-1">
                      <label htmlFor={f.key} className="text-sm font-medium text-slate-700">{f.label}</label>
                      <HelpTip label={f.label}>{f.help(live)}</HelpTip>
                    </div>
                    <Input id={f.key} type="number" step="any" {...register(f.key, { valueAsNumber: true })} aria-invalid={!!formState.errors[f.key]} />
                    {formState.errors[f.key] && <p role="alert" className="text-xs text-red-600">{formState.errors[f.key]?.message}</p>}
                  </div>
                ))}
              </div>
            </fieldset>
          ))}
          <SectionActions onRestore={() => reset(DEFAULT_SETTINGS, { keepDefaultValues: true })} dirty={formState.isDirty} saved={saved} />
        </form>
      </CardContent>
    </Card>
  );
}

// ── Tarifas y horas ──────────────────────────────────────────

function CostsSection() {
  const financialPct = useAppStore((s) => s.costSettings.financialPct);
  const updateCostSettings = useConfirmedAction("updateCostSettings");
  const [value, setValue] = useState(() => asText(financialPct));
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const dirty = value !== asText(financialPct);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Costos</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          className="space-y-6"
          onSubmit={async (e) => {
            e.preventDefault();
            const res = await updateCostSettings({ financialPct: parseDecimal(value) });
            if (!res.ok) return setError(res.error);
            setError("");
            setSaved(true);
          }}
        >
          <div className="flex max-w-sm flex-col gap-1.5">
            <div className="flex items-center gap-1">
              <label htmlFor="financial-pct" className="text-sm font-medium text-slate-700">Costo financiero (% del precio de venta)</label>
              <HelpTip label="Costo financiero">
                Es un costo: aparece como línea &quot;Costo financiero&quot; en el costo presupuestado. Es el valor con el que arranca cada cotización; en el Cotizador
                se puede cambiar. El {DEFAULT_FINANCIAL_PCT}% inicial es un valor de ejemplo, a confirmar.
              </HelpTip>
            </div>
            <Input id="financial-pct" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} aria-invalid={!!error} />
          </div>
          <SectionActions onRestore={() => setValue(asText(DEFAULT_FINANCIAL_PCT))} dirty={dirty} saved={saved} error={error} />
        </form>
      </CardContent>
    </Card>
  );
}

// ── Datos ────────────────────────────────────────────────────

function DataSection() {
  const isDemo = useAppStore((s) => s.isDemo);
  const resetDemo = useAppStore((s) => s.resetDemo);
  const clearData = useAppStore((s) => s.clearData);
  const organizationName = useAppStore((s) => s.organizationName);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const confirmWord = organizationName.trim() || "VACIAR";
  const canClear = confirmText.trim().toLowerCase() === confirmWord.toLowerCase();

  return (
    <Card className="border-red-200">
      <CardHeader>
        <CardTitle className="text-red-800">Zona de riesgo</CardTitle>
        <CardDescription>Estas acciones reemplazan o borran los datos de tu empresa y no se pueden deshacer.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isDemo && (
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Restaurar datos demo</h3>
            <p className="mb-3 mt-0.5 text-sm text-slate-500">Vuelve a cargar los proyectos de ejemplo de {COMPANY_NAME}. Se pierden los registros cargados.</p>
            <Button
              variant="outline"
              disabled={busy}
              onClick={async () => {
                if (!window.confirm("¿Restaurar los datos demo? Se perderán los registros cargados.")) return;
                setBusy(true);
                const res = await resetDemo();
                setBusy(false);
                setDone(res.ok ? "Datos demo restaurados." : "");
              }}
            >
              Restaurar datos demo
            </Button>
          </div>
        )}

        <div className={isDemo ? "border-t border-slate-200 pt-6" : undefined}>
          <h3 className="text-sm font-semibold text-slate-900">Vaciar todos los datos</h3>
          <p className="mb-3 mt-0.5 text-sm text-slate-500">Borra todos los proyectos, registros y sobrantes para empezar con tus proyectos reales.</p>
          <Field label={`Para confirmar, escribí: ${confirmWord}`} htmlFor="confirm-clear">
            <Input id="confirm-clear" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
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
                setConfirmText("");
                setDone("Datos vaciados.");
              }
            }}
          >
            Vaciar datos
          </Button>
        </div>
        {done && <p role="status" className="text-sm text-emerald-700">{done}</p>}
      </CardContent>
    </Card>
  );
}

// ── Página ───────────────────────────────────────────────────

const subscribeHash = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};

/** Pestaña que corresponde a un ancla (#capacidad, #ind-…, #usuarios) para que los links del Dashboard lleguen. */
function tabFromHash(hash: string): string | null {
  if (hash === "#capacidad" || hash === "#rubros") return "rubros";
  if (hash.startsWith("#ind-") || hash === "#indicadores") return "indicators";
  if (hash === "#usuarios") return "users";
  if (hash === "#inflacion" || hash === "#nomenclatura") return "params";
  return null;
}

export function SettingsPage() {
  const organizationName = useAppStore((s) => s.organizationName);
  const { session } = useIdentity();
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash, () => "");
  // La pestaña elegida a mano vale mientras no cambie el ancla.
  const [picked, setPicked] = useState<{ hash: string; tab: string } | null>(null);
  const gerencia = session === "gerencia";
  const demoLocal = useAppStore((s) => s.demoLocal);
  const ledgerBacked = useLedgerBacked();
  const fallback = gerencia ? "rubros" : "materials";
  const tab = picked && picked.hash === hash ? picked.tab : (gerencia ? tabFromHash(hash) : null) ?? fallback;

  if (!gerencia) {
    // Administración / Comercial / Diseño: solo lo que necesita para cotizar, sin costos horarios ni usuarios.
    return (
      <div className="max-w-3xl">
        <PageHeader title="Configuración" subtitle={`${APP_NAME} · ${organizationName}`} />
        <Tabs value={tab} onValueChange={(t) => setPicked({ hash, tab: t })}>
          <TabsList aria-label="Secciones de Configuración">
            <TabsTrigger value="materials">Materiales</TabsTrigger>
          </TabsList>
          <TabsContent value="materials"><MaterialCatalogSettings /></TabsContent>
        </Tabs>
        <p className="mt-4 text-sm text-slate-500">Los costos horarios, las alertas y los usuarios los configura Gerencia.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <PageHeader title="Configuración" subtitle={`${APP_NAME} · ${APP_SUBTITLE} · ${organizationName}`} />
      <Tabs value={tab} onValueChange={(t) => setPicked({ hash, tab: t })}>
        <TabsList aria-label="Secciones de Configuración">
          <TabsTrigger value="rubros">Capacidad: consulta</TabsTrigger>
          <TabsTrigger value="costs">Costos</TabsTrigger>
          <TabsTrigger value="alerts">Alertas</TabsTrigger>
          <TabsTrigger value="indicators">Indicadores y cálculos</TabsTrigger>
          <TabsTrigger value="params">Nomenclatura de proyectos</TabsTrigger>
          {!demoLocal && <TabsTrigger value="users">Usuarios y permisos</TabsTrigger>}
          <TabsTrigger value="data">Datos</TabsTrigger>
          {demoLocal && <TabsTrigger value="demo">Demo</TabsTrigger>}
        </TabsList>
        <TabsContent value="rubros" className="space-y-6">
          <p>La capacidad y los ajustes se administran desde Jefe de Planta → Planificación. Gerencia consulta los mismos indicadores en el Dashboard.</p>
        </TabsContent>
        <TabsContent value="costs" className="space-y-6"><QuoteDefaultsSettings />
          <FrontendProductionSettings kind="rates" />
          {ledgerBacked ? (
            <>
              <FinancialRateSection />
              <GeneralCostsSection />
            </>
          ) : (
            <CostsSection />
          )}
        </TabsContent>
        {demoLocal && (
          <TabsContent value="demo">
            <DemoSection />
          </TabsContent>
        )}
        <TabsContent value="alerts">
          <AlertsSection />
        </TabsContent>
        <TabsContent value="indicators">
          <IndicatorsSection hash={hash} />
        </TabsContent>
        <TabsContent value="params" className="space-y-6">
          <div id="nomenclatura" className="scroll-mt-20"><NomenclatureSection /></div>
        </TabsContent>
        <TabsContent value="users" id="usuarios" className="space-y-6">
          {demoLocal ? (
            <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">
              En el modo demostración no se muestran ni se cambian los usuarios reales de tu empresa. Las cinco sesiones se prueban con &quot;Ver como&quot;.
            </p>
          ) : (
            <UsersSection />
          )}
          <PermissionsSection />
        </TabsContent>
        <TabsContent value="data">
          <DataSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
