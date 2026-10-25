"use client";
// Configuración (modo demostración).
//  · Gerencia: Roles y capacidades · Costos · Alertas y nomenclatura · Indicadores y cálculos · Usuarios y permisos.
//  · Administración: Rubros · Materiales · Clientes · Proveedores.
import { useState } from "react";
import { Plus } from "lucide-react";
import type { AlertThresholds, OtPart, RateKind } from "@/lib/core/types";
import type { SessionKey } from "@/lib/permissions";
import { SESSION_LABELS, SESSION_KEYS } from "@/lib/permissions";
import * as op from "@/lib/core/ops";
import { formatOt } from "@/lib/core/ot";
import { recordAt, rubroName } from "@/lib/core/lookup";
import { useIdentity } from "@/store/selectors";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClientsDemo, SuppliersDemo } from "./directory";
import { IndicadoresDemo } from "./gerencia/indicadores";
import { day, FormDialog, money, num2, Section, useAct, useCore, useDemoToday, useFlash } from "./kit";

export function SettingsDemo({ section }: { section?: string }) {
  const { session } = useIdentity();
  return session === "gerencia" ? <GerenciaSettings section={section} /> : <AdminSettings section={section} />;
}

function GerenciaSettings({ section }: { section?: string }) {
  const tabs = ["roles", "costos", "alertas", "indicadores", "usuarios"];
  return (
    <div className="space-y-4">
      <PageHeader title="Configuración" />
      <Tabs defaultValue={section && tabs.includes(section) ? section : "roles"}>
        <TabsList>
          <TabsTrigger value="roles">Roles y capacidades</TabsTrigger>
          <TabsTrigger value="costos">Costos</TabsTrigger>
          <TabsTrigger value="alertas">Alertas y nomenclatura</TabsTrigger>
          <TabsTrigger value="indicadores">Indicadores y cálculos</TabsTrigger>
          <TabsTrigger value="usuarios">Usuarios y permisos</TabsTrigger>
        </TabsList>
        <TabsContent value="roles"><Roles /></TabsContent>
        <TabsContent value="costos"><Costs /></TabsContent>
        <TabsContent value="alertas"><AlertsAndOt /></TabsContent>
        <TabsContent value="indicadores"><IndicadoresDemo /></TabsContent>
        <TabsContent value="usuarios"><Users /></TabsContent>
      </Tabs>
    </div>
  );
}

function AdminSettings({ section }: { section?: string }) {
  const tabs = ["rubros", "materiales", "clientes", "proveedores"];
  return (
    <div className="space-y-4">
      <PageHeader title="Configuración" />
      <Tabs defaultValue={section && tabs.includes(section) ? section : "rubros"}>
        <TabsList>
          <TabsTrigger value="rubros">Rubros</TabsTrigger>
          <TabsTrigger value="materiales">Materiales</TabsTrigger>
          <TabsTrigger value="clientes">Clientes</TabsTrigger>
          <TabsTrigger value="proveedores">Proveedores</TabsTrigger>
        </TabsList>
        <TabsContent value="rubros"><RubrosEditor /></TabsContent>
        <TabsContent value="materiales"><Materials /></TabsContent>
        <TabsContent value="clientes"><ClientsDemo embedded /></TabsContent>
        <TabsContent value="proveedores"><SuppliersDemo embedded /></TabsContent>
      </Tabs>
    </div>
  );
}

// ── Rubros y materiales (Administración y Gerencia) ──

function RubrosEditor() {
  const w = useCore();
  const act = useAct();
  const flash = useFlash();
  const [name, setName] = useState("");
  return (
    <Section title="Rubros de obreros">
      <div className="mb-3 flex gap-2">
        <Input aria-label="Nuevo rubro" placeholder="Nuevo rubro (ej. Vidriería)" value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs" />
        <Button onClick={() => { const r = act((cw, ctx) => op.upsertRubro(cw, { name }, ctx)); flash.show(r, "Rubro creado."); if (r.ok) setName(""); }}><Plus /> Agregar</Button>
      </div>
      {flash.node}
      <ul className="divide-y divide-slate-100 text-sm">
        {w.rubros.map((r) => <RubroRow key={r.id} id={r.id} />)}
      </ul>
      <p className="mt-2 text-xs text-slate-500">Diseño y Administración son categorías de personal, no rubros.</p>
    </Section>
  );
}

function RubroRow({ id }: { id: string }) {
  const w = useCore();
  const act = useAct();
  const r = w.rubros.find((x) => x.id === id)!;
  const [name, setName] = useState(r.name);
  return (
    <li className="flex flex-wrap items-center gap-2 py-2">
      <Input aria-label="Nombre del rubro" value={name} onChange={(e) => setName(e.target.value)} className="h-8 max-w-xs" />
      <Button size="sm" variant="ghost" onClick={() => act((cw, ctx) => op.upsertRubro(cw, { id, name }, ctx))}>Renombrar</Button>
      <Button size="sm" variant="ghost" onClick={() => act((cw, ctx) => op.upsertRubro(cw, { id, name: r.name, active: !r.active }, ctx))}>{r.active ? "Desactivar" : "Activar"}</Button>
      {!r.active && <span className="text-xs text-slate-500">inactivo</span>}
    </li>
  );
}

function Materials() {
  const w = useCore();
  const act = useAct();
  const [f, setF] = useState({ name: "", unit: "", rubroId: w.rubros[0]?.id ?? "", referenceCost: "" });
  return (
    <Section
      title="Materiales"
      actions={
        <FormDialog trigger={<Button size="sm"><Plus /> Nuevo material</Button>} title="Nuevo material" submitLabel="Guardar" onSubmit={() => act((cw, ctx) => op.upsertMaterial(cw, { name: f.name, unit: f.unit, rubroId: f.rubroId, referenceCost: num2(f.referenceCost || "0") }, ctx))}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre" htmlFor="mt-n"><Input id="mt-n" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Unidad" htmlFor="mt-u"><Input id="mt-u" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} /></Field>
            <Field label="Rubro habitual" htmlFor="mt-r"><Select id="mt-r" value={f.rubroId} onChange={(e) => setF({ ...f, rubroId: e.target.value })}>{w.rubros.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
            <Field label="Costo de referencia (para cotizar)" htmlFor="mt-c"><Input id="mt-c" inputMode="decimal" value={f.referenceCost} onChange={(e) => setF({ ...f, referenceCost: e.target.value })} /></Field>
          </div>
        </FormDialog>
      }
    >
      <Table>
        <THead><TR><TH>Material</TH><TH>Unidad</TH><TH>Rubro</TH><TH className="text-right">Costo de referencia</TH><TH /></TR></THead>
        <TBody>
          {w.materials.map((m) => (
            <TR key={m.id}>
              <TD>{m.name}{!m.active && <span className="ml-2 text-xs text-slate-500">inactivo</span>}</TD>
              <TD>{m.unit}</TD>
              <TD>{rubroName(w, m.rubroId)}</TD>
              <TD className="text-right tabular">{money(m.referenceCost)}</TD>
              <TD><MaterialEdit id={m.id} /></TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </Section>
  );
}

function MaterialEdit({ id }: { id: string }) {
  const w = useCore();
  const act = useAct();
  const m = w.materials.find((x) => x.id === id)!;
  const [f, setF] = useState({ name: m.name, unit: m.unit, rubroId: m.rubroId, referenceCost: String(m.referenceCost), active: m.active });
  return (
    <FormDialog trigger={<Button size="sm" variant="ghost">Editar</Button>} title="Editar material" submitLabel="Guardar" note="El costo de referencia solo afecta cotizaciones nuevas: el costo real sale de cada lote." onSubmit={() => act((cw, ctx) => op.upsertMaterial(cw, { id, name: f.name, unit: f.unit, rubroId: f.rubroId, referenceCost: num2(f.referenceCost), active: f.active }, ctx))}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre" htmlFor={`me-n-${id}`}><Input id={`me-n-${id}`} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Unidad" htmlFor={`me-u-${id}`}><Input id={`me-u-${id}`} value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} /></Field>
        <Field label="Rubro habitual" htmlFor={`me-r-${id}`}><Select id={`me-r-${id}`} value={f.rubroId} onChange={(e) => setF({ ...f, rubroId: e.target.value })}>{w.rubros.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
        <Field label="Costo de referencia" htmlFor={`me-c-${id}`}><Input id={`me-c-${id}`} inputMode="decimal" value={f.referenceCost} onChange={(e) => setF({ ...f, referenceCost: e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Activo</label>
      </div>
    </FormDialog>
  );
}

// ── Gerencia ──

function RateRow({ kind, subjectId, label }: { kind: RateKind; subjectId: string; label: string }) {
  const w = useCore();
  const act = useAct();
  const today = useDemoToday();
  const cur = recordAt(w.rates, kind, subjectId, today);
  const next = w.rates.filter((r) => r.kind === kind && r.subjectId === subjectId && r.validFrom > today);
  const [v, setV] = useState("");
  const [from, setFrom] = useState(today);
  const isMult = kind === "overtime_cost" || kind === "overtime_sale";
  return (
    <TR>
      <TD>{label}</TD>
      <TD className="text-right tabular">{cur ? (isMult ? `× ${cur.value}` : money(cur.value)) : "Sin dato"}{cur && <span className="block text-xs text-slate-500">desde {day(cur.validFrom)}</span>}{next.map((n) => <span key={n.id} className="block text-xs text-blue-700">{isMult ? `× ${n.value}` : money(n.value)} desde {day(n.validFrom)}</span>)}</TD>
      <TD>
        <FormDialog trigger={<Button size="sm" variant="ghost">Cambiar</Button>} title={label} submitLabel="Guardar" note="Vale desde la fecha elegida; lo anterior conserva su valor." onSubmit={() => act((cw, ctx) => op.addRate(cw, { kind, subjectId, value: num2(v), validFrom: from }, ctx))}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={isMult ? "Multiplicador" : "Costo por hora"} htmlFor={`rr-${kind}-${subjectId}`}><Input id={`rr-${kind}-${subjectId}`} inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} /></Field>
            <Field label="Vigente desde" htmlFor={`rf-${kind}-${subjectId}`}><Input id={`rf-${kind}-${subjectId}`} type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          </div>
        </FormDialog>
      </TD>
    </TR>
  );
}

function Roles() {
  const w = useCore();
  const act = useAct();
  const flash = useFlash();
  const [cat, setCat] = useState({ name: "", isWorker: false });
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="Categorías de personal">
        <ul className="divide-y divide-slate-100 text-sm">
          {w.config.categories.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 py-2">
              <span>{c.name}{c.isWorker && <span className="ml-2 text-xs text-slate-500">obrero · lleva rubros</span>}{!c.active && <span className="ml-2 text-xs text-slate-500">inactiva</span>}</span>
              <Button size="sm" variant="ghost" onClick={() => flash.show(act((cw, ctx) => op.updateConfig(cw, { categories: cw.config.categories.map((x) => (x.id === c.id ? { ...x, active: !x.active } : x)) }, ctx)), "Guardado.")}>{c.active ? "Desactivar" : "Activar"}</Button>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Input aria-label="Nueva categoría" placeholder="Nueva categoría" value={cat.name} onChange={(e) => setCat({ ...cat, name: e.target.value })} className="h-8 max-w-[12rem]" />
          <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={cat.isWorker} onChange={(e) => setCat({ ...cat, isWorker: e.target.checked })} /> Es obrero</label>
          <Button size="sm" onClick={() => { if (!cat.name.trim()) return; const r = act((cw, ctx) => op.updateConfig(cw, { categories: [...cw.config.categories, { id: `cat-${Date.now().toString(36)}`, name: cat.name.trim(), isWorker: cat.isWorker, active: true }] }, ctx)); flash.show(r, "Categoría creada."); if (r.ok) setCat({ name: "", isWorker: false }); }}>Agregar</Button>
        </div>
        {flash.node}
      </Section>
      <Section title="Costos por hora para cotizar y horas extra">
        <Table>
          <TBody>
            {w.config.categories.filter((c) => !c.isWorker && c.active).map((c) => <RateRow key={c.id} kind="category_cost" subjectId={c.id} label={`Hora de ${c.name.toLowerCase()}`} />)}
            {w.rubros.filter((r) => r.active).map((r) => <RateRow key={r.id} kind="rubro_cost" subjectId={r.id} label={`Hora de ${r.name.toLowerCase()}`} />)}
            <RateRow kind="overtime_cost" subjectId="all" label="Hora extra: cuánto se paga" />
            <RateRow kind="overtime_sale" subjectId="all" label="Hora extra: cuánto se cobra al cliente" />
          </TBody>
        </Table>
        <p className="mt-2 text-xs text-slate-500">El costo real de cada persona está en Personal. Jornadas y días laborables también.</p>
      </Section>
      <div className="lg:col-span-2"><RubrosEditor /></div>
    </div>
  );
}

function Costs() {
  const w = useCore();
  const act = useAct();
  const flash = useFlash();
  const c = w.config;
  const [f, setF] = useState({ mm: String(c.marginMaterialsPct), ml: String(c.marginLaborPct), rate: String(c.financialMonthlyRatePct) });
  const [gcs, setGcs] = useState(c.quoteGeneralCosts);
  const [occ, setOcc] = useState("");
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="Rentabilidad objetivo y costo financiero">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Materiales %" htmlFor="cf-mm"><Input id="cf-mm" inputMode="decimal" value={f.mm} onChange={(e) => setF({ ...f, mm: e.target.value })} /></Field>
          <Field label="Mano de obra %" htmlFor="cf-ml"><Input id="cf-ml" inputMode="decimal" value={f.ml} onChange={(e) => setF({ ...f, ml: e.target.value })} /></Field>
          <Field label="Tasa mensual del costo financiero %" htmlFor="cf-r"><Input id="cf-r" inputMode="decimal" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} /></Field>
        </div>
        <Button className="mt-3" size="sm" onClick={() => flash.show(act((cw, ctx) => op.updateConfig(cw, { marginMaterialsPct: num2(f.mm), marginLaborPct: num2(f.ml), financialMonthlyRatePct: num2(f.rate) }, ctx)), "Guardado. Se usa en cotizaciones nuevas y en el costo financiero actualizado.")}>Guardar</Button>
        <p className="mt-2 text-xs text-slate-500">Rentabilidad = margen sobre el precio de venta. Interés simple, mes de 30 días. Supuesto para material sin pago cargado: invertido al recibir.</p>
        {flash.node}
      </Section>
      <Section title="Costos generales de cotización">
        {gcs.map((g, i) => (
          <div key={g.id} className="mb-2 grid grid-cols-[1fr_7rem_6rem_auto] items-center gap-2">
            <Input aria-label="Nombre" className="h-8" value={g.name} onChange={(e) => setGcs(gcs.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} />
            <Select aria-label="Tipo" className="h-8" value={g.mode} onChange={(e) => setGcs(gcs.map((x, k) => (k === i ? { ...x, mode: e.target.value as "pct" | "amount" } : x)))}>
              <option value="pct">% del costo</option>
              <option value="amount">Importe fijo</option>
            </Select>
            <Input aria-label="Valor" className="h-8" inputMode="decimal" value={String(g.value)} onChange={(e) => setGcs(gcs.map((x, k) => (k === i ? { ...x, value: num2(e.target.value) || 0 } : x)))} />
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={g.active} onChange={(e) => setGcs(gcs.map((x, k) => (k === i ? { ...x, active: e.target.checked } : x)))} /> Activo</label>
          </div>
        ))}
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setGcs([...gcs, { id: `gc-${Date.now()}`, name: "Nuevo costo", mode: "pct", value: 0, active: true }])}><Plus /> Agregar</Button>
          <Button size="sm" onClick={() => flash.show(act((cw, ctx) => op.updateConfig(cw, { quoteGeneralCosts: gcs }, ctx)), "Guardado.")}>Guardar</Button>
        </div>
        <p className="mt-2 text-xs text-slate-500">Se suman a la cotización; no son gastos reales ni se financian.</p>
      </Section>
      <Section title="Categorías de otros costos reales">
        <ul className="mb-2 text-sm">{c.otherCostCategories.map((x) => <li key={x.id}>{x.name}</li>)}</ul>
        <div className="flex gap-2">
          <Input aria-label="Nueva categoría" className="h-8 max-w-xs" value={occ} onChange={(e) => setOcc(e.target.value)} />
          <Button size="sm" onClick={() => { if (!occ.trim()) return; const r = act((cw, ctx) => op.updateConfig(cw, { otherCostCategories: [...cw.config.otherCostCategories, { id: `occ-${Date.now().toString(36)}`, name: occ.trim(), active: true }] }, ctx)); if (r.ok) setOcc(""); }}>Agregar</Button>
        </div>
      </Section>
    </div>
  );
}

const ALERT_FIELDS: Array<{ key: keyof AlertThresholds; label: string }> = [
  { key: "urgentPurchaseDays", label: "Compras urgentes: días antes del inicio" },
  { key: "dueSoonDays", label: "Entregas próximas: días" },
  { key: "lowMarginPoints", label: "Rentabilidad baja: puntos debajo de la cotizada" },
  { key: "overcostPct", label: "Sobrecosto: % sobre lo presupuestado" },
  { key: "capacityWeeks", label: "Capacidad: semanas hacia adelante" },
  { key: "renditionDays", label: "Material sin novedades de rendición: días" },
  { key: "reviewDays", label: "Horas sin revisar: días" },
];

function AlertsAndOt() {
  const w = useCore();
  const act = useAct();
  const flash = useFlash();
  const [al, setAl] = useState<Record<string, string>>(Object.fromEntries(ALERT_FIELDS.map((f) => [f.key, String(w.config.alerts[f.key])])));
  const [ot, setOt] = useState(w.config.ot);
  const togglePart = (part: OtPart) => setOt({ ...ot, parts: ot.parts.includes(part) ? ot.parts.filter((x) => x !== part) : [...ot.parts, part] });
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="Umbrales de alertas">
        <div className="grid gap-3 sm:grid-cols-2">
          {ALERT_FIELDS.map((f) => (
            <Field key={f.key} label={f.label} htmlFor={`al-${f.key}`}><Input id={`al-${f.key}`} inputMode="decimal" value={al[f.key]} onChange={(e) => setAl({ ...al, [f.key]: e.target.value })} /></Field>
          ))}
        </div>
        <Button className="mt-3" size="sm" onClick={() => flash.show(act((cw, ctx) => op.updateConfig(cw, { alerts: Object.fromEntries(ALERT_FIELDS.map((f) => [f.key, num2(al[f.key])])) as unknown as AlertThresholds }, ctx)), "Guardado.")}>Guardar</Button>
        {flash.node}
      </Section>
      <Section title="Nomenclatura de OT">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Prefijo" htmlFor="ot-p"><Input id="ot-p" value={ot.prefix} onChange={(e) => setOt({ ...ot, prefix: e.target.value })} /></Field>
          <Field label="Próximo número" htmlFor="ot-n" hint="Lo asigna Blerp (último usado + 1)."><Input id="ot-n" value={String(w.config.ot.lastNumber + 1)} disabled /></Field>
        </div>
        <fieldset className="mt-3 flex gap-4 text-sm">
          <legend className="mb-1 text-sm font-medium text-slate-700">Partes</legend>
          <label className="flex items-center gap-1"><input type="checkbox" checked disabled /> Número</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={ot.parts.includes("client")} onChange={() => togglePart("client")} /> Cliente</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={ot.parts.includes("description")} onChange={() => togglePart("description")} /> Descripción</label>
        </fieldset>
        <p className="mt-2 text-sm">Ejemplo: <strong>{formatOt({ ...ot, parts: (["number", "client", "description"] as OtPart[]).filter((x) => ot.parts.includes(x)) }, w.config.ot.lastNumber + 1, "Cliente Ejemplo", "Mueble de recepción")}</strong></p>
        <Button className="mt-3" size="sm" onClick={() => flash.show(act((cw, ctx) => op.updateConfig(cw, { ot: { ...ot, parts: (["number", "client", "description"] as OtPart[]).filter((x) => ot.parts.includes(x)) } }, ctx)), "Guardado. Vale para las OTs nuevas.")}>Guardar</Button>
      </Section>
    </div>
  );
}

function Users() {
  const w = useCore();
  const act = useAct();
  const flash = useFlash();
  return (
    <Section title="Usuarios y permisos">
      <p className="mb-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">En la demostración, las sesiones son una simulación visual. La seguridad real (quién puede leer o escribir cada dato) la aplica la base de datos; ese contrato está pendiente de backend.</p>
      {flash.node}
      <Table>
        <THead><TR><TH>Persona</TH>{SESSION_KEYS.map((s) => <TH key={s} className="text-center">{SESSION_LABELS[s]}</TH>)}</TR></THead>
        <TBody>
          {w.employees.filter((e) => e.active).map((e) => (
            <TR key={e.id}>
              <TD>{e.name}</TD>
              {SESSION_KEYS.map((s: SessionKey) => (
                <TD key={s} className="text-center">
                  <input
                    type="checkbox"
                    aria-label={`${e.name}: ${SESSION_LABELS[s]}`}
                    checked={e.sessions.includes(s)}
                    disabled={s === "operario" && !w.config.categories.find((c) => c.id === e.categoryId)?.isWorker}
                    onChange={(ev) => flash.show(act((cw, ctx) => op.upsertEmployee(cw, { ...e, sessions: ev.target.checked ? [...e.sessions, s] : e.sessions.filter((x) => x !== s) }, ctx)), "Permisos actualizados.")}
                  />
                </TD>
              ))}
            </TR>
          ))}
        </TBody>
      </Table>
    </Section>
  );
}
