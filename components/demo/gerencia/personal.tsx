"use client";
// Gerencia → Personal (modo demostración): categoría, ingreso, estado, jornada y días laborables, costo por hora con
// vigencia (las horas pasadas conservan su costo) y rubros habilitados solo para obreros.
import Link from "next/link";
import { useState } from "react";
import { Plus } from "lucide-react";
import type { Employee } from "@/lib/core/types";
import * as op from "@/lib/core/ops";
import { categoryName, employeeCostAt, isWorker, rubroName } from "@/lib/core/lookup";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { day, FormDialog, money, num2, useAct, useCore, useDemoToday } from "../kit";

const WD = ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sá"];

export function PersonalDemo() {
  const w = useCore();
  const today = useDemoToday();
  return (
    <div className="space-y-4">
      <PageHeader
        title="Personal"
        actions={
          <>
            <Button asChild variant="outline"><Link href="/mis-horas">Registrar mis horas</Link></Button>
            <EmployeeDialog trigger={<Button><Plus /> Nueva persona</Button>} />
          </>
        }
      />
      <div className="rounded-lg border border-slate-200 bg-white">
        <Table>
          <THead>
            <TR>
              <TH>Persona</TH>
              <TH>Categoría</TH>
              <TH>Ingreso</TH>
              <TH>Jornada</TH>
              <TH>Rubros habilitados</TH>
              <TH className="text-right">Costo por hora</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {w.employees.map((e) => {
              const history = w.rates.filter((r) => r.kind === "employee_cost" && r.subjectId === e.id).sort((a, b) => a.validFrom.localeCompare(b.validFrom));
              const future = history.filter((r) => r.validFrom > today);
              return (
                <TR key={e.id} className={e.active ? "" : "opacity-60"}>
                  <TD className="font-medium">{e.name}{!e.active && <span className="ml-2 text-xs text-slate-500">inactivo</span>}</TD>
                  <TD>{categoryName(w, e.categoryId)}</TD>
                  <TD>{day(e.hireDate)}</TD>
                  <TD className="text-xs">{e.workDays.map((d) => WD[d]).join(" ")} · {e.dailyHours} h</TD>
                  <TD className="text-xs">{isWorker(w, e) ? e.rubroIds.map((r) => rubroName(w, r)).join(", ") : "—"}</TD>
                  <TD className="text-right tabular">
                    {money(employeeCostAt(w, e.id, today))}
                    {history.length > 1 && <span className="block text-xs text-slate-500">desde {day(history.filter((r) => r.validFrom <= today).at(-1)?.validFrom)}</span>}
                    {future.map((f) => <span key={f.id} className="block text-xs text-blue-700">{money(f.value)} desde {day(f.validFrom)}</span>)}
                  </TD>
                  <TD className="whitespace-nowrap">
                    <EmployeeDialog employee={e} trigger={<Button size="sm" variant="ghost">Editar</Button>} />
                    <RateDialog employee={e} />
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </div>
    </div>
  );
}

function EmployeeDialog({ employee, trigger }: { employee?: Employee; trigger: React.ReactNode }) {
  const w = useCore();
  const act = useAct();
  const today = useDemoToday();
  const [f, setF] = useState({
    name: employee?.name ?? "",
    categoryId: employee?.categoryId ?? w.config.categories[0]?.id ?? "",
    hireDate: employee?.hireDate ?? today,
    active: employee?.active ?? true,
    workDays: employee?.workDays ?? [1, 2, 3, 4, 5],
    dailyHours: String(employee?.dailyHours ?? 8),
    rubroIds: employee?.rubroIds ?? [],
    cost: "",
  });
  const cat = w.config.categories.find((c) => c.id === f.categoryId);
  return (
    <FormDialog
      trigger={trigger}
      title={employee ? "Editar persona" : "Nueva persona"}
      submitLabel="Guardar"
      onSubmit={() => {
        const r = act<string>((cw, ctx) => op.upsertEmployee(cw, { id: employee?.id, name: f.name, categoryId: f.categoryId, hireDate: f.hireDate, active: f.active, workDays: f.workDays, dailyHours: num2(f.dailyHours), rubroIds: f.rubroIds, sessions: employee?.sessions }, ctx));
        if (r.ok && !employee && f.cost) return act((cw, ctx) => op.addRate(cw, { kind: "employee_cost", subjectId: r.value as string, value: num2(f.cost), validFrom: f.hireDate }, ctx));
        return r;
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre" htmlFor="em-n"><Input id="em-n" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Categoría" htmlFor="em-c">
          <Select id="em-c" value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>
            {w.config.categories.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Fecha de ingreso" htmlFor="em-i"><Input id="em-i" type="date" value={f.hireDate} onChange={(e) => setF({ ...f, hireDate: e.target.value })} /></Field>
        <Field label="Horas por día" htmlFor="em-h"><Input id="em-h" inputMode="decimal" value={f.dailyHours} onChange={(e) => setF({ ...f, dailyHours: e.target.value })} /></Field>
        {!employee && <Field label="Costo por hora inicial" htmlFor="em-k"><Input id="em-k" inputMode="decimal" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} /></Field>}
        {employee && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Activo</label>}
      </div>
      <fieldset>
        <legend className="mb-1 text-sm font-medium text-slate-700">Días laborables</legend>
        <div className="flex gap-1">
          {WD.map((d, i) => (
            <label key={d} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={f.workDays.includes(i)} onChange={(e) => setF({ ...f, workDays: e.target.checked ? [...f.workDays, i] : f.workDays.filter((x) => x !== i) })} />{d}</label>
          ))}
        </div>
      </fieldset>
      {cat?.isWorker && (
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-slate-700">Rubros habilitados</legend>
          <div className="flex flex-wrap gap-3">
            {w.rubros.filter((r) => r.active).map((r) => (
              <label key={r.id} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={f.rubroIds.includes(r.id)} onChange={(e) => setF({ ...f, rubroIds: e.target.checked ? [...f.rubroIds, r.id] : f.rubroIds.filter((x) => x !== r.id) })} />{r.name}</label>
            ))}
          </div>
        </fieldset>
      )}
    </FormDialog>
  );
}

function RateDialog({ employee }: { employee: Employee }) {
  const act = useAct();
  const today = useDemoToday();
  const [value, setValue] = useState("");
  const [from, setFrom] = useState(today);
  return (
    <FormDialog trigger={<Button size="sm" variant="ghost">Costo por hora</Button>} title={`Costo por hora · ${employee.name}`} submitLabel="Guardar" note="Vale desde la fecha elegida: las horas anteriores conservan su costo." onSubmit={() => act((cw, ctx) => op.addRate(cw, { kind: "employee_cost", subjectId: employee.id, value: num2(value), validFrom: from }, ctx))}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Costo por hora" htmlFor="rt-v"><Input id="rt-v" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} /></Field>
        <Field label="Vigente desde" htmlFor="rt-f"><Input id="rt-f" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
      </div>
    </FormDialog>
  );
}
