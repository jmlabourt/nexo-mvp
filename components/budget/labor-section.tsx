"use client";
// Mano de obra del Cotizador / Nuevo proyecto: por rol se eligen operarios activos; el costo por hora sale
// de cada operario. Con plazo de entrega se estima la disponibilidad y las horas extra (lib/capacity.ts).
import { useState } from "react";
import Link from "next/link";
import { Plus, Trash2, TriangleAlert } from "lucide-react";
import type { Operator } from "@/types";
import type { LaborPlan, OperatorPlan, RolePlan } from "@/lib/capacity";
import { activeOperators } from "@/lib/operators";
import { formatCurrency, formatDate, formatNumber, formatWorkingDays } from "@/lib/formatting";
import { parseDecimal } from "@/lib/schemas";
import { useAppStore } from "@/store/use-app-store";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { newLaborRow, type LaborRow } from "./calculator-state";

const hours = (n: number) => `${formatNumber(n, 1)} h`;
const multiplierText = (m: number) => `×${formatNumber(m, 2)}`;

interface Props {
  rows: LaborRow[];
  onRows: (rows: LaborRow[]) => void;
  plan: LaborPlan;
  /** Plazo de entrega ("" = sin plazo). */
  deadline: string;
  installationDays: number;
  overtimeMultiplier: number;
  /** Campos de jornada y días de instalación (los dibuja la calculadora). */
  children?: React.ReactNode;
}

export function LaborSection({ rows, onRows, plan, deadline, installationDays, overtimeMultiplier, children }: Props) {
  const operators = useAppStore((s) => s.operators);
  const active = activeOperators(operators);
  const roles = [...new Set(active.map((o) => o.role))].sort((a, b) => a.localeCompare(b, "es"));
  const update = (key: string, patch: Partial<LaborRow>) => onRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">2 · Mano de obra</h3>
          <p className="text-xs text-slate-500">Por cada rol: las horas totales y qué operarios las hacen. El costo por hora sale de cada operario, no se tipea.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => onRows([...rows, newLaborRow()])}>
          <Plus /> Rol
        </Button>
      </div>

      {active.length === 0 && (
        <p className="mb-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          No hay operarios activos. <Link href="/operators" className="font-medium underline">Cargalos en Operarios</Link> para calcular la mano de obra.
        </p>
      )}

      <div className="space-y-4">
        {rows.map((row, i) => (
          <LaborRoleRow
            key={row.key}
            index={i}
            row={row}
            roles={roles}
            candidates={active.filter((o) => o.role === row.role)}
            plan={plan.roles[i]}
            deadline={deadline}
            onChange={(patch) => update(row.key, patch)}
            onRemove={() => onRows(rows.filter((r) => r.key !== row.key))}
          />
        ))}
      </div>

      {children}

      <div className="mt-3 space-y-1 rounded-md bg-slate-50 p-3 text-xs text-slate-600">
        {deadline && plan.workingDays !== null ? (
          <p>
            Plazo de entrega {formatDate(deadline)}: {formatWorkingDays(plan.workingDays)} hábiles desde el inicio
            {installationDays > 0 ? `, ${formatWorkingDays(plan.productionDays ?? 0)} para producir (descontando ${formatWorkingDays(Math.ceil(installationDays))} de instalación)` : ""}.
          </p>
        ) : (
          <p>Sin plazo de entrega: todas las horas se calculan en horario normal. Cargá un plazo para ver la disponibilidad y las horas extra.</p>
        )}
        <p>
          Horas extra = costo por hora {multiplierText(overtimeMultiplier)}. El multiplicador se cambia en{" "}
          <Link href="/settings" className="underline">Configuración</Link>.
        </p>
        <p>
          Es una estimación simple, no una agenda ni un planificador: reparte las horas del rol en partes iguales entre los operarios elegidos y descuenta lo que ya
          tienen asignado en otros proyectos activos.
        </p>
      </div>
    </section>
  );
}

function LaborRoleRow({
  index,
  row,
  roles,
  candidates,
  plan,
  deadline,
  onChange,
  onRemove,
}: {
  index: number;
  row: LaborRow;
  roles: string[];
  candidates: Operator[];
  plan: RolePlan | undefined;
  deadline: string;
  onChange: (patch: Partial<LaborRow>) => void;
  onRemove: () => void;
}) {
  const roleOptions = row.role && !roles.includes(row.role) ? [row.role, ...roles] : roles;
  const toggle = (id: string) =>
    onChange({ operatorIds: row.operatorIds.includes(id) ? row.operatorIds.filter((x) => x !== id) : [...row.operatorIds, id] });
  const needsOperator = parseDecimal(row.hours) > 0 && row.operatorIds.length === 0;

  return (
    <div className="rounded-md border border-slate-200 p-3">
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2 sm:grid-cols-[2fr_1fr_auto]">
        <div className="flex flex-col gap-1">
          <label htmlFor={`l-role-${row.key}`} className="text-xs font-medium text-slate-600">Rol</label>
          <Select
            id={`l-role-${row.key}`}
            value={row.role}
            onChange={(e) => onChange({ role: e.target.value, operatorIds: [] })}
          >
            <option value="">Elegí un rol…</option>
            {roleOptions.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`l-hours-${row.key}`} className="text-xs font-medium text-slate-600">Horas totales</label>
          <div className="relative">
            <Input id={`l-hours-${row.key}`} inputMode="decimal" className="pr-9 text-right" placeholder="0" value={row.hours} onChange={(e) => onChange({ hours: e.target.value })} />
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">h</span>
          </div>
        </div>
        <Button variant="ghost" size="icon" aria-label={`Quitar rol ${index + 1}`} onClick={onRemove} className="self-end">
          <Trash2 />
        </Button>
      </div>

      {row.role && (
        <fieldset className="mt-3">
          <legend className="text-xs font-medium text-slate-600">Operarios de {row.role}</legend>
          {candidates.length === 0 ? (
            <p className="mt-1 text-sm text-slate-500">
              No hay operarios activos con este rol. <Link href="/operators" className="underline">Cargalos en Operarios</Link>.
            </p>
          ) : (
            <div className="mt-1 flex flex-wrap gap-2">
              {candidates.map((o) => (
                <label key={o.id} className="flex items-center gap-2 rounded-md border border-slate-200 px-2.5 py-1.5 text-sm">
                  <input type="checkbox" className="size-4 accent-blue-700" checked={row.operatorIds.includes(o.id)} onChange={() => toggle(o.id)} />
                  <span>{o.name}</span>
                  <span className="text-xs text-slate-500 tabular">{o.hourlyCost > 0 ? `${formatCurrency(o.hourlyCost)}/h` : "sin costo por hora"}</span>
                </label>
              ))}
            </div>
          )}
        </fieldset>
      )}

      {needsOperator && <p className="mt-2 text-sm text-amber-800">Elegí al menos un operario para calcular el costo de estas horas.</p>}

      {plan && plan.operators.length > 0 && (
        <div className="mt-3 space-y-2" aria-live="polite">
          {plan.shortage && plan.availableHours !== null && (
            <Warning>
              No alcanza la disponibilidad de {plan.role}: hacen falta {hours(plan.hours)} y hay {hours(plan.availableHours)} disponibles en horario normal hasta el plazo.
            </Warning>
          )}
          <ul className="space-y-2">
            {plan.operators.map((o) => (
              <OperatorBreakdown key={o.operatorId} plan={o} deadline={deadline} />
            ))}
          </ul>
          <p className="text-right text-sm font-medium text-slate-800 tabular">Total {plan.role}: {formatCurrency(plan.total)}</p>
        </div>
      )}
    </div>
  );
}

function OperatorBreakdown({ plan: o, deadline }: { plan: OperatorPlan; deadline: string }) {
  return (
    <li className="rounded-md bg-slate-50 p-2.5 text-sm">
      <div className="flex flex-wrap justify-between gap-x-3">
        <span className="font-medium text-slate-900">{o.name}</span>
        <span className="tabular font-medium">{formatCurrency(o.total)}</span>
      </div>
      <div className="mt-0.5 text-xs text-slate-600 tabular">
        {hours(o.normalHours)} normales × {formatCurrency(o.hourlyCost)} = {formatCurrency(o.normalCost)}
        {o.overtimeHours > 0 && (
          <>
            {" "}+ {hours(o.overtimeHours)} extra × {formatCurrency(o.overtimeRate)} = {formatCurrency(o.overtimeCost)}
          </>
        )}
      </div>
      {deadline && o.availableHours !== null && (
        <div className="text-xs text-slate-500">
          Disponible hasta el plazo: {hours(o.availableHours)}
          {o.assignedElsewhere > 0 ? ` (ya tiene ${hours(o.assignedElsewhere)} asignadas en otros proyectos activos)` : ""}.
        </div>
      )}
      {o.overtimeHours > 0 && <Warning>Con este plazo, {o.name} necesita {hours(o.overtimeHours)} extra.</Warning>}
      {o.missingCost && <MissingCost operatorId={o.operatorId} name={o.name} />}
    </li>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-1 flex items-start gap-1.5 text-sm text-amber-800">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

/** El operario no tiene costo por hora: se avisa y se puede completar acá mismo (se guarda en Operarios). */
function MissingCost({ operatorId, name }: { operatorId: string; name: string }) {
  const operator = useAppStore((s) => s.operators.find((o) => o.id === operatorId));
  const updateOperator = useAppStore((s) => s.updateOperator);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  if (!operator) return null;

  const save = () => {
    const cost = parseDecimal(value);
    if (!(cost > 0)) return setError("Ingresá un costo por hora mayor a cero.");
    const res = updateOperator(operator.id, { name: operator.name, role: operator.role, hourlyCost: cost, email: operator.email, userId: operator.userId });
    if (!res.ok) return setError(res.error);
    setError("");
  };

  return (
    <div className="mt-2 rounded-md bg-amber-50 p-2.5 text-sm text-amber-900">
      <p>
        {name} no tiene costo por hora cargado: sus horas suman $ 0 hasta que lo completes. Podés cargarlo acá (se guarda en{" "}
        <Link href="/operators" className="underline">Operarios</Link>).
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label htmlFor={`mc-${operatorId}`} className="sr-only">Costo por hora de {name}</label>
        <Input id={`mc-${operatorId}`} inputMode="decimal" className="h-8 w-36 text-right" placeholder="Costo por hora" value={value} onChange={(e) => setValue(e.target.value)} />
        <Button size="sm" variant="outline" onClick={save}>Guardar costo</Button>
      </div>
      {error && <p role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}
