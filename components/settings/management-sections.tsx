"use client";
// Configuración de Gerencia: rubros de trabajo, capacidad, indicadores y cálculos, inflación y plazos de cobro,
// nomenclatura de proyectos y permisos por sesión. Los parámetros todavía no se guardan en la base
// (PENDIENTES_BACKEND.md): se pueden probar en pantalla, pero el botón de guardar queda deshabilitado.
import { useEffect, useMemo, useState } from "react";
import { capacityFromOperators, capacityHours, formatProjectCode, inflationLoss, projectCodeError } from "@/lib/gerencia";
import { INDICATORS } from "@/lib/indicators";
import { navFor, SESSION_KEYS, SESSION_LABELS, canSee, type DataField } from "@/lib/permissions";
import { formatCurrency, formatNumber } from "@/lib/formatting";
import { parseDecimal } from "@/lib/schemas";
import { useAppStore } from "@/store/use-app-store";
import { useManagementParams } from "@/store/session-data";
import { useToday } from "@/store/selectors";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PendingAction } from "@/components/shared/data-origin";

const SAVE_PENDING = "Estos parámetros se guardan cuando el backend lo habilite. Mientras tanto se usan los valores iniciales.";
const DAY_NAMES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

/** Rubros de trabajo de la empresa: texto libre, sin lista fija. */
export function RubrosSection({ readOnly = false }: { readOnly?: boolean }) {
  const params = useManagementParams();
  const [rubros, setRubros] = useState(params.workRubros);
  const [draft, setDraft] = useState("");
  const names = rubros.map((r) => r.name.trim().toLowerCase());
  const draftError = !draft.trim() ? "" : names.includes(draft.trim().toLowerCase()) ? "Ese rubro ya existe." : "";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">Rubros de trabajo <Badge tone="gray">Valores iniciales</Badge></CardTitle>
        <CardDescription>Cada empresa define los suyos (por ejemplo Carpintería madera, Carpintería metálica, Embalaje, Diseño). Se usan en el Cotizador, las horas y la capacidad.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
          {rubros.map((r, i) => (
            <li key={`${r.name}-${i}`} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
              <span className="min-w-40 flex-1 font-medium text-slate-800">{r.name}</span>
              <Badge tone={r.active ? "green" : "gray"}>{r.active ? "Activo" : "Inactivo"}</Badge>
              {!readOnly && (
                <Button size="sm" variant="ghost" onClick={() => setRubros(rubros.map((x, j) => (j === i ? { ...x, active: !x.active } : x)))}>
                  {r.active ? "Desactivar" : "Activar"}
                </Button>
              )}
            </li>
          ))}
        </ul>
        {!readOnly && (
          <>
            <form
              noValidate
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!draft.trim() || draftError) return;
                setRubros([...rubros, { name: draft.trim(), active: true }]);
                setDraft("");
              }}
            >
              <Field label="Nuevo rubro" htmlFor="new-rubro" className="min-w-56 flex-1">
                <Input id="new-rubro" value={draft} onChange={(e) => setDraft(e.target.value)} aria-invalid={!!draftError} />
              </Field>
              <Button type="submit" variant="outline" disabled={!draft.trim() || !!draftError}>Agregar a la lista</Button>
            </form>
            {draftError && <p role="alert" className="text-sm text-red-600">{draftError}</p>}
            <PendingAction label="Guardar rubros" reason={SAVE_PENDING} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Capacidad por rubro: sale de los empleados activos (cada uno cuenta una sola vez, en su rubro principal). */
export function CapacitySection() {
  const operators = useAppStore((s) => s.operators);
  const hoursPerDay = useAppStore((s) => s.costSettings.hoursPerDay);
  const params = useManagementParams();
  const today = useToday();
  const monthFrom = `${today.slice(0, 7)}-01`;
  const d = new Date(`${monthFrom}T12:00:00`);
  const monthTo = new Date(d.getFullYear(), d.getMonth() + 1, 0, 12).toISOString().slice(0, 10);
  const capacities = useMemo(() => capacityFromOperators(operators, params.roleToRubro, hoursPerDay), [operators, params.roleToRubro, hoursPerDay]);

  return (
    <Card id="capacidad" className="scroll-mt-20">
      <CardHeader>
        <CardTitle>Capacidad por rubro</CardTitle>
        <CardDescription>
          Se calcula con el personal activo, la jornada ({formatNumber(hoursPerDay, 1)} h por día, en Tarifas y horas) y los días que trabaja cada uno. Quien trabaja en más
          de un rubro cuenta una sola vez, en su rubro principal. Para cambiarla, cambiá el personal o la jornada.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {capacities.length === 0 ? (
          <p className="text-sm text-slate-500">Todavía no hay personal activo.</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Rubro</TH>
                <TH className="text-right">Empleados</TH>
                <TH className="text-right">Horas por día</TH>
                <TH>Días</TH>
                <TH className="text-right">Horas este mes</TH>
              </TR>
            </THead>
            <TBody>
              {capacities.map((c) => (
                <TR key={c.rubro}>
                  <TD className="font-medium text-slate-900">{c.rubro}</TD>
                  <TD className="text-right tabular">{c.employees}</TD>
                  <TD className="text-right tabular">{formatNumber(c.employees * c.hoursPerDay, 1)}</TD>
                  <TD className="text-xs text-slate-600">{c.workDays.map((x) => DAY_NAMES[x]).join(" ")}</TD>
                  <TD className="text-right tabular">{formatNumber(capacityHours(c, monthFrom, monthTo), 0)} h</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        <div>
          <h3 className="mb-1 text-sm font-semibold text-slate-900">Puesto → rubro principal</h3>
          <ul className="grid gap-1 text-sm text-slate-600 sm:grid-cols-2">
            {Object.entries(params.roleToRubro).map(([role, rubro]) => (
              <li key={role}>{role} → <span className="font-medium text-slate-800">{rubro}</span></li>
            ))}
          </ul>
        </div>
        <PendingAction label="Cambiar asignación de rubros" reason={SAVE_PENDING} />
      </CardContent>
    </Card>
  );
}

/** Indicadores y cálculos: la misma definición que muestran las ayudas ⓘ del Dashboard. */
export function IndicatorsSection({ hash }: { hash: string }) {
  const target = hash.startsWith("#ind-") ? hash.slice(1) : "";
  useEffect(() => {
    if (target) document.getElementById(target)?.scrollIntoView({ block: "start" });
  }, [target]);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Indicadores y cálculos</CardTitle>
        <CardDescription>
          Qué significa cada número del Dashboard, cómo se calcula y de dónde sale. Las fórmulas no se editan; los parámetros (inflación, capacidad, alertas) se
          configuran en sus secciones.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {INDICATORS.map((ind) => (
            <li key={ind.id}>
              <details id={`ind-${ind.id}`} open={target === `ind-${ind.id}`} className="scroll-mt-20 rounded-md border border-slate-200 p-3 open:bg-slate-50/60">
                <summary className="cursor-pointer text-sm font-medium text-slate-900">{ind.name}</summary>
                <dl className="mt-2 grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[9rem_1fr]">
                  {(
                    [
                      ["Qué significa", ind.meaning],
                      ["Cálculo", ind.formula],
                      ["Fuente", ind.source],
                      ["Parámetros", ind.params],
                      ["Período", ind.period],
                      ["Límites", ind.limits],
                      ["Se actualiza", ind.updates],
                    ] as const
                  ).map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-slate-500">{k}</dt>
                      <dd className="text-slate-800">{v}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** Inflación mensual estimada y plazos de cobro: solo para estimar el costo financiero, nunca es un gasto real. */
export function InflationSection() {
  const params = useManagementParams();
  const today = useToday();
  const [value, setValue] = useState(String(params.inflationMonthlyPct).replace(".", ","));
  const pct = parseDecimal(value);
  const error = !Number.isFinite(pct) || pct < 0 || pct > 50 ? "Ingresá un porcentaje entre 0 y 50." : "";
  const example = 1_000_000;
  const plus = (days: number) => {
    const d = new Date(`${today}T12:00:00`);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Inflación y plazos de cobro</CardTitle>
        <CardDescription>
          Se usa para estimar cuánto poder de compra se pierde por cobrar más tarde. Es una estimación: no es un gasto real ni se suma a los costos del proyecto.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field label="Inflación mensual estimada (%)" htmlFor="inflation-pct" className="max-w-xs">
          <Input id="inflation-pct" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} aria-invalid={!!error} />
        </Field>
        {error ? (
          <p role="alert" className="text-sm text-red-600">{error}</p>
        ) : (
          <div>
            <p className="mb-2 text-sm text-slate-600">Ejemplo: {formatCurrency(example)} que se cobran dentro de…</p>
            <ul className="grid gap-2 sm:grid-cols-3">
              {[30, 60, 90].map((days) => (
                <li key={days} className="rounded-md border border-slate-200 p-3 text-sm">
                  <div className="text-xs text-slate-500">{days} días</div>
                  <div className="font-semibold tabular text-slate-900">−{formatCurrency(inflationLoss(example, pct, today, plus(days)).total)}</div>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-sm text-slate-600">
          Plazos de cobro: cada proyecto usa las fechas previstas de sus facturas (en la ficha, pestaña Facturación). Si un cobro se atrasa, la pérdida por el atraso
          se muestra aparte.
        </p>
        <PendingAction label="Guardar inflación" reason={SAVE_PENDING} />
      </CardContent>
    </Card>
  );
}

/** Nomenclatura de proyectos: formato configurable, vista previa y control de duplicados. */
export function NomenclatureSection({ readOnly = false }: { readOnly?: boolean }) {
  const params = useManagementParams();
  const projects = useAppStore((s) => s.projects);
  const [pattern, setPattern] = useState(params.projectCodePattern);
  const [prefix, setPrefix] = useState(params.projectCodePrefix);
  const [number, setNumber] = useState("4300");
  const [client, setClient] = useState("Cliente");
  const [name, setName] = useState("Local centro");
  const n = Number.parseInt(number, 10);
  const code = formatProjectCode(pattern, { prefix: prefix.trim(), number: Number.isFinite(n) ? n : 0, client, name });
  const problem = !Number.isFinite(n) || n <= 0 ? "Indicá un número de proyecto." : projectCodeError(pattern, code, projects.map((p) => p.code));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nomenclatura de proyectos</CardTitle>
        <CardDescription>
          Formato del código: <code className="rounded bg-slate-100 px-1">{"{prefijo}{numero}_{cliente}_{nombre}"}</code>. Por ejemplo OT4300_Cliente_LocalCentro. Sin
          espacios ni acentos, y nunca repetido.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Formato" htmlFor="code-pattern">
            <Input id="code-pattern" value={pattern} readOnly={readOnly} onChange={(e) => setPattern(e.target.value)} />
          </Field>
          <Field label="Prefijo" htmlFor="code-prefix">
            <Input id="code-prefix" value={prefix} readOnly={readOnly} onChange={(e) => setPrefix(e.target.value)} />
          </Field>
        </div>
        <fieldset className="rounded-md border border-slate-200 p-3">
          <legend className="px-1 text-sm font-medium text-slate-700">Probar con un proyecto</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Número" htmlFor="code-number">
              <Input id="code-number" inputMode="numeric" value={number} onChange={(e) => setNumber(e.target.value)} />
            </Field>
            <Field label="Cliente" htmlFor="code-client">
              <Input id="code-client" value={client} onChange={(e) => setClient(e.target.value)} />
            </Field>
            <Field label="Nombre" htmlFor="code-name">
              <Input id="code-name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          </div>
          <p className="mt-3 text-sm">
            Código: <strong className="tabular text-slate-900">{code || "—"}</strong>
          </p>
          {problem && <p role="alert" className="mt-1 text-sm text-red-600">{problem}</p>}
        </fieldset>
        {!readOnly && <PendingAction label="Guardar formato" reason={SAVE_PENDING} />}
      </CardContent>
    </Card>
  );
}

const DATA_LABELS: Array<[DataField, string]> = [
  ["salesPrice", "Precio de venta"],
  ["materialCost", "Costo de materiales"],
  ["hours", "Horas"],
  ["laborValue", "Valor de la mano de obra"],
  ["hourlyCost", "Remuneraciones y costo horario"],
  ["margin", "Ganancia y rentabilidad"],
];

/** Qué ve cada sesión. La separación Gerencia / Administración es visual: la base todavía da el mismo acceso a las dos. */
export function PermissionsSection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Permisos por sesión</CardTitle>
        <CardDescription>
          Gerencia y Administración usan el mismo rol de la base (Administrativo): hoy la separación entre las dos es de pantallas, no de base de datos. Está anotado
          como pendiente del backend.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Table>
          <THead>
            <TR>
              <TH>Dato</TH>
              {SESSION_KEYS.map((s) => (
                <TH key={s} className="text-center">{SESSION_LABELS[s]}</TH>
              ))}
            </TR>
          </THead>
          <TBody>
            {DATA_LABELS.map(([field, label]) => (
              <TR key={field}>
                <TD>{label}</TD>
                {SESSION_KEYS.map((s) => (
                  <TD key={s} className="text-center">{canSee(s, field) ? <span aria-label="Sí">✓</span> : <span className="text-slate-300" aria-label="No">—</span>}</TD>
                ))}
              </TR>
            ))}
          </TBody>
        </Table>
        <ul className="space-y-1 text-sm text-slate-600">
          {SESSION_KEYS.map((s) => (
            <li key={s}>
              <span className="font-medium text-slate-800">{SESSION_LABELS[s]}:</span> {navFor(s).map((i) => i.label).join(" · ")}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
