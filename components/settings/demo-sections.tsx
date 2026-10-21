"use client";
// Configuración de Gerencia en el modo demostración: catálogo de rubros (texto libre), costos horarios por rubro con
// excepción por persona y vigencia, tasa del gasto financiero y la sección Demo. Todo se guarda de verdad en la demo
// (lib/ledger.ts); en una empresa real estas secciones son "Pendiente de backend".
import { useState } from "react";
import { addGeneralCost, addRate, addRubro, removeGeneralCost, renameRubro, setFinancialRate, setRubroActive } from "@/lib/ledger";
import { financialCost } from "@/lib/financial";
import { formatCurrency, formatDate, formatNumber, todayISO } from "@/lib/formatting";
import { useAppStore } from "@/store/use-app-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { LocalDemoBar } from "@/components/layout/local-demo";

const num = (s: string) => Number(s.replace(",", "."));

function useLedgerAction() {
  const record = useAppStore((s) => s.recordLedger);
  const [error, setError] = useState("");
  const run = (fn: Parameters<typeof record>[1]) => {
    const r = record(["gerencia"], fn);
    setError(r.ok ? "" : r.error);
    return r.ok;
  };
  return { run, error };
}

export function RubroCatalogSection() {
  const catalog = useAppStore((s) => s.ledger.rubroCatalog);
  const { run, error } = useLedgerAction();
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Rubros de trabajo</CardTitle>
        <CardDescription>Texto libre: cada empresa define los suyos. Se usan en las tarifas, las horas y la capacidad. Desactivar un rubro no borra lo ya cargado.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
          {catalog.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
              {editing?.id === r.id ? (
                <form
                  className="flex flex-1 gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (run((l) => renameRubro(l, r.id, editing.name))) setEditing(null);
                  }}
                >
                  <Input aria-label="Nombre del rubro" value={editing.name} onChange={(e) => setEditing({ id: r.id, name: e.target.value })} />
                  <Button type="submit" size="sm">Guardar</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
                </form>
              ) : (
                <>
                  <span className="min-w-40 flex-1 font-medium text-slate-800">{r.name}</span>
                  <Badge tone={r.active ? "green" : "gray"}>{r.active ? "Activo" : "Inactivo"}</Badge>
                  <Button size="sm" variant="ghost" onClick={() => setEditing({ id: r.id, name: r.name })}>Renombrar</Button>
                  <Button size="sm" variant="ghost" onClick={() => run((l) => setRubroActive(l, r.id, !r.active))}>{r.active ? "Desactivar" : "Activar"}</Button>
                </>
              )}
            </li>
          ))}
        </ul>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (run((l) => addRubro(l, draft))) setDraft("");
          }}
        >
          <label className="min-w-56 flex-1 text-sm font-medium text-slate-700">
            Nuevo rubro
            <Input className="mt-1" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Por ejemplo: Tapicería" />
          </label>
          <Button type="submit" variant="outline">Agregar rubro</Button>
        </form>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      </CardContent>
    </Card>
  );
}

export function RubroRatesSection() {
  const ledger = useAppStore((s) => s.ledger);
  const operators = useAppStore((s) => s.operators);
  const { run, error } = useLedgerAction();
  const [form, setForm] = useState({ scope: "rubro" as "rubro" | "employee", subjectId: "", hourlyRate: "", validFrom: todayISO() });
  const nameOf = (scope: "rubro" | "employee", id: string) =>
    scope === "rubro" ? (ledger.rubroCatalog.find((r) => r.id === id)?.name ?? id) : (operators.find((o) => o.id === id)?.name ?? id);
  const rates = [...ledger.rates].sort((a, b) => a.scope.localeCompare(b.scope) || nameOf(a.scope, a.subjectId).localeCompare(nameOf(b.scope, b.subjectId)) || b.validFrom.localeCompare(a.validFrom));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Costo horario por rubro</CardTitle>
        <CardDescription>
          Cada rubro tiene su costo por hora. Una persona puede tener una excepción, que prevalece sobre el rubro. Cada valor rige desde su fecha: las horas ya cargadas
          conservan el valor del día en que se trabajaron.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Table>
          <THead>
            <TR>
              <TH>Aplica a</TH>
              <TH className="text-right">Costo por hora</TH>
              <TH>Vigente desde</TH>
            </TR>
          </THead>
          <TBody>
            {rates.map((r) => (
              <TR key={r.id}>
                <TD>
                  {nameOf(r.scope, r.subjectId)} {r.scope === "employee" && <Badge tone="blue">Excepción</Badge>}
                </TD>
                <TD className="text-right tabular">{formatCurrency(r.hourlyRate)}</TD>
                <TD className="tabular">{formatDate(r.validFrom)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
        <form
          className="grid gap-2 sm:grid-cols-5 sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (run((l, ctx) => addRate(l, { scope: form.scope, subjectId: form.subjectId, hourlyRate: num(form.hourlyRate), validFrom: form.validFrom }, ctx))) setForm({ ...form, hourlyRate: "" });
          }}
        >
          <label className="text-xs font-medium text-slate-600">
            Tipo
            <Select className="mt-1" value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value as "rubro" | "employee", subjectId: "" })}>
              <option value="rubro">Rubro</option>
              <option value="employee">Excepción de una persona</option>
            </Select>
          </label>
          <label className="text-xs font-medium text-slate-600 sm:col-span-2">
            {form.scope === "rubro" ? "Rubro" : "Persona"}
            <Select className="mt-1" value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })}>
              <option value="">Elegí…</option>
              {form.scope === "rubro"
                ? ledger.rubroCatalog.filter((r) => r.active).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)
                : operators.filter((o) => o.active).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </Select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Costo por hora
            <Input className="mt-1" inputMode="decimal" value={form.hourlyRate} onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })} />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Vigente desde
            <Input className="mt-1" type="date" value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} />
          </label>
          <div className="sm:col-span-5">
            <Button type="submit" variant="outline" disabled={!form.subjectId}>Agregar costo horario</Button>
          </div>
        </form>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      </CardContent>
    </Card>
  );
}

export function FinancialRateSection() {
  const rate = useAppStore((s) => s.ledger.financialMonthlyRatePct);
  const { run, error } = useLedgerAction();
  const [value, setValue] = useState(String(rate).replace(".", ","));
  const example = financialCost({ price: 1_000_000, monthlyRatePct: num(value) || 0, startDate: "2026-11-01", deliveryDate: "2026-12-01", daysAfterDelivery: 30 });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Gasto financiero</CardTitle>
        <CardDescription>
          Tasa mensual sobre el precio de venta sin IVA. Gasto = precio × tasa / 100 × días financiados / 30. Días financiados = días de producción (inicio → entrega) +
          días que tarda el cliente en pagar. Con seña o cuotas se calcula por tramos sobre el saldo. Es una estimación: nunca un costo pagado.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run((l) => setFinancialRate(l, num(value)));
          }}
        >
          <label className="text-sm font-medium text-slate-700">
            Tasa mensual (%)
            <Input className="mt-1 w-32" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
          </label>
          <Button type="submit" variant="outline" disabled={num(value) === rate}>Guardar tasa</Button>
        </form>
        <p className="text-sm text-slate-600">
          Ejemplo: $ 1.000.000, 30 días de producción y 30 de pago, al {formatNumber(num(value) || 0, 2)} % mensual →{" "}
          <strong>{example.ok ? formatCurrency(example.amount) : "—"}</strong>.
        </p>
        <p className="text-xs text-slate-500">Las cotizaciones aprobadas guardan su gasto financiero (foto). La ficha de cada proyecto muestra, aparte, la estimación actualizada con esta tasa.</p>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      </CardContent>
    </Card>
  );
}

export function GeneralCostsSection() {
  const costs = useAppStore((s) => s.ledger.generalCosts);
  const { run, error } = useLedgerAction();
  const [form, setForm] = useState({ name: "", amount: "" });
  const total = costs.reduce((s, c) => s + c.monthlyAmount, 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Otros costos generales</CardTitle>
        <CardDescription>Costos de estructura por mes (alquiler, servicios, seguros). Son informativos: no se reparten entre los proyectos ni cambian su rentabilidad.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {costs.length > 0 && (
          <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 text-sm">
            {costs.map((c) => (
              <li key={c.id} className="flex items-center gap-2 px-3 py-2">
                <span className="flex-1">{c.name}</span>
                <span className="tabular">{formatCurrency(c.monthlyAmount)}</span>
                <Button size="sm" variant="ghost" onClick={() => run((l) => removeGeneralCost(l, c.id))}>Quitar</Button>
              </li>
            ))}
            <li className="flex px-3 py-2 font-medium">
              <span className="flex-1">Total por mes</span>
              <span className="tabular">{formatCurrency(total)}</span>
            </li>
          </ul>
        )}
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (run((l) => addGeneralCost(l, form.name, num(form.amount)))) setForm({ name: "", amount: "" });
          }}
        >
          <label className="min-w-48 flex-1 text-sm font-medium text-slate-700">
            Concepto
            <Input className="mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Monto mensual
            <Input className="mt-1 w-36" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </label>
          <Button type="submit" variant="outline">Agregar</Button>
        </form>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      </CardContent>
    </Card>
  );
}

export function DemoSection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Modo demostración</CardTitle>
        <CardDescription>
          Las cinco sesiones comparten un mismo estado de ejemplo, guardado solo en este navegador. Nada de esto llega a la base ni a ninguna empresa real. Restaurar
          vuelve al escenario inicial (5 proyectos: 2 en cotización, 2 en ejecución, 1 cerrado).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <LocalDemoBar />
      </CardContent>
    </Card>
  );
}
