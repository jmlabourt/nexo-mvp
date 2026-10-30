"use client";
import { PersonnelView } from "./personnel-view";
import { ScheduleDialog } from "@/components/plant/schedule-dialog";
import { useConfiguredOperators } from "@/store/selectors";
import { useConfirmedAction } from "@/store/confirmed-action";
import { useMemo, useState } from "react";
import { HardHat, Plus, Trash2, UserCheck, UserMinus } from "lucide-react";
import type { Operator } from "@/types";
import { formatCurrency, formatDate, formatNumber, todayISO } from "@/lib/formatting";
import { activeOperators, operatorHasRecords, visibleOperators } from "@/lib/operators";
import { hourlyCostAt } from "@/lib/ledger";
import { rubroLabel } from "@/lib/rubros";
import { useAppStore, type Result } from "@/store/use-app-store";
import { useCategoryRate, useIdentity, useLedgerBacked } from "@/store/selectors";
import { PageHeader } from "@/components/shared/page-header";
import Link from "next/link";
import { useManagementParams } from "@/store/session-data";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { DeactivatePanel } from "./deactivate-panel";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Confirm = "deactivate" | "delete" | null;

const DAY_NAMES = ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sá"];
const daysLabel = (days: number[] | undefined) => {
  const d = days ?? [1, 2, 3, 4, 5];
  return d.join() === "1,2,3,4,5" ? "Lunes a viernes" : [...d].sort().map((x) => DAY_NAMES[x]).join(", ");
};

function OperatorDialog({ operator, hasRecords, open, onOpenChange }: { operator: Operator | null; hasRecords: boolean; open: boolean; onOpenChange: (o: boolean) => void }) {
  const createOperator = useConfirmedAction("createOperator");
  const updateOperator = useConfirmedAction("updateOperator");
  const reactivateOperator = useConfirmedAction("reactivateOperator");
  const deleteOperator = useConfirmedAction("deleteOperator");
  const [name, setName] = useState(operator?.name ?? "");
  const [role, setRole] = useState(operator?.role ?? "");
  const laborRate = useCategoryRate("labor");
  const [email, setEmail] = useState(operator?.email ?? "");
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [error, setError] = useState("");

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    // El costo por hora no se edita acá: un alta toma la tarifa de Mano de obra de Configuración y una edición no lo toca.
    const input = { name, role, hourlyCost: operator ? operator.hourlyCost : laborRate, email: email.trim() || undefined, userId: operator?.userId };
    const r = operator ? await updateOperator(operator.id, input, todayISO()) : await createOperator(input);
    if (!r.ok) return setError(r.error);
    onOpenChange(false);
  };

  const act = async (fn: (id: string) => Promise<Result>) => {
    if (!operator) return;
    const r = await fn(operator.id);
    if (!r.ok) return setError(r.error);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{operator ? "Editar operario" : "Nuevo operario"}</DialogTitle>
          <DialogDescription>
            El costo por hora se configura en Gerencia → Configuración → Costos. La categoría laboral es independiente de la vista de Blerp.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4" noValidate>
          <Field label="Nombre" htmlFor="op-name"><Input id="op-name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Rol o especialidad" htmlFor="op-role"><Input id="op-role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Carpintería, Armado…" /></Field>
          <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
            Costo por hora: <strong className="tabular">{formatCurrency(laborRate)}</strong> (tarifa de Mano de obra). Se cambia solo en{" "}
            <Link href="/settings" className="text-blue-700 hover:underline">Configuración → Costos horarios</Link>.
          </p>
          <Field
            label="Email (opcional)"
            htmlFor="op-email"
            hint="Es un dato de la persona. Para que entre a Blerp como Operario, invitalo desde Configuración → Usuarios (puede existir sin usuario)."
          >
            <Input id="op-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          {operator && (
            <section aria-label="Alta y baja" className="space-y-3 rounded-lg border border-slate-200 p-3">
              {operator.active ? (
                confirm === "deactivate" ? (
                  <DeactivatePanel operator={operator} onCancel={() => setConfirm(null)} onDone={() => onOpenChange(false)} />
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="text-slate-600">Si ya no trabaja con ustedes, dalo de baja. No se borra nada.</span>
                    <Button type="button" variant="outline" size="sm" onClick={() => setConfirm("deactivate")}>
                      <UserMinus /> Dar de baja
                    </Button>
                  </div>
                )
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="text-slate-600">
                    Dado de baja{operator.deactivatedAt ? ` el ${formatDate(operator.deactivatedAt)}` : ""}.
                  </span>
                  <Button type="button" variant="outline" size="sm" onClick={() => act(reactivateOperator)}>
                    <UserCheck /> Reactivar
                  </Button>
                </div>
              )}
              <div className="border-t border-slate-100 pt-3 text-sm">
                {hasRecords ? (
                  <p className="text-slate-500">Tiene horas registradas: no se puede eliminar definitivamente, solo dar de baja.</p>
                ) : confirm === "delete" ? (
                  <div className="space-y-2">
                    <p className="text-slate-800">
                      ¿Eliminar definitivamente a <strong>{operator.name}</strong>? No tiene horas registradas. Esto no se puede deshacer.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => setConfirm(null)}>No, volver</Button>
                      <Button type="button" variant="destructive" size="sm" onClick={() => act(deleteOperator)}>Sí, eliminar</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-slate-500">No tiene horas registradas.</span>
                    <Button type="button" variant="ghost" size="sm" className="text-red-700" onClick={() => setConfirm("delete")}>
                      <Trash2 /> Eliminar definitivamente
                    </Button>
                  </div>
                )}
              </div>
            </section>
          )}
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit">Guardar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function OperatorsPage({ op }: { op?: string }) {
  const operators = useConfiguredOperators();
  const projects = useAppStore((s) => s.projects);
  const reactivateOperator = useConfirmedAction("reactivateOperator");
  const { isManager } = useIdentity();
  const [editing, setEditing] = useState<Operator | null | "new">(op ? (operators.find((o) => o.id === op) ?? null) : null);
  const [showDeactivated, setShowDeactivated] = useState(false);
  const [schedule,setSchedule] = useState<string | null>(null);
  const shown = visibleOperators(operators, showDeactivated);
  const deactivatedCount = operators.length - activeOperators(operators).length;

  // Horas reales del período: el mes elegido (por defecto, el actual).
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const params = useManagementParams();
  const laborRate = useCategoryRate("labor");
  const designRate = useCategoryRate("design");
  const laborValuation = useAppStore((s) => s.costSettings.laborValuation);
  // Categoría de la tarifa: quien trabaja en Diseño cobra la hora de Diseño; el resto, la de Mano de obra.
  const categoryOf = (role: string) => ((params.roleToRubro[role] ?? role) === "Diseño" ? "design" : "labor");
  const rateOf = (role: string) => (categoryOf(role) === "design" ? designRate : laborRate);
  const hoursPerDay = useAppStore((s) => s.costSettings.hoursPerDay);
  const ledgerBacked = useLedgerBacked();
  const ledger = useAppStore((s) => s.ledger);
  // Demo: el costo sale de Configuración → Costo horario por rubro (la excepción de la persona prevalece).
  const rubroIdOf = (o: Operator) => ledger.rubroCatalog.find((r) => r.name === (params.roleToRubro[o.role] ?? o.role))?.id;
  const costOf = (o: Operator) => (ledgerBacked ? hourlyCostAt(ledger, { employeeId: o.id, rubroId: rubroIdOf(o), date: todayISO() }, rateOf(o.role)) : rateOf(o.role));
  const costSource = (o: Operator) =>
    ledgerBacked && ledger.rates.some((r) => r.scope === "employee" && r.subjectId === o.id && r.validFrom <= todayISO())
      ? "Excepción de la persona"
      : ledgerBacked && rubroIdOf(o)
        ? "Costo del rubro · Configuración"
        : `${categoryOf(o.role) === "design" ? "Diseño" : "Mano de obra"} · Configuración`;
  const stats = useMemo(() => {
    const m = new Map<string, { hours: number; cost: number; projects: number; rubros: string[] }>();
    for (const o of operators) m.set(o.id, { hours: 0, cost: 0, projects: projects.filter((p) => !p.isClosed && p.assignedOperatorIds.includes(o.id)).length, rubros: [] });
    for (const p of projects)
      for (const e of p.actualEntries) {
        if (e.type !== "labor" || !e.operatorId || !e.date.startsWith(month)) continue;
        const s = m.get(e.operatorId);
        if (s) {
          s.hours += e.labor?.hours ?? 0;
          s.cost += e.amount;
          const r = e.rubro ? rubroLabel(e.rubro) : null;
          if (r && !s.rubros.includes(r)) s.rubros.push(r);
        }
      }
    return m;
  }, [operators, projects, month]);

  return (
    <div>
      <ScheduleDialog operatorId={schedule} onClose={() => setSchedule(null)} />
      <PageHeader
        back
        title="Personal"
        subtitle="Quién trabaja, en qué rubro, la tarifa por hora de su categoría (se define solo en Configuración) y cuántas horas reales cargó. Los costos son privados de Gerencia."
        actions={isManager ? <Button onClick={() => setEditing("new")}><Plus /> Agregar empleado</Button> : undefined}
      />
      <div className="mb-3 flex flex-wrap items-end gap-4">
        <label className="text-xs font-medium text-slate-600">
          Horas del mes
          <Input type="month" className="mt-1 w-40" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        </label>
        <p className="text-xs text-slate-500">
          La categoría laboral y la vista de Blerp son independientes. Editá la vista y la disponibilidad desde esta misma tabla.
        </p>
      </div>
      {laborValuation === "operator" && (
        <p role="note" className="mb-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          En Configuración está elegido valorizar las horas reales con el costo guardado de cada operario. Para que todos cobren la tarifa de esta tabla, elegí
          “Con la tarifa general de Mano de obra” en <Link href="/settings" className="underline">Configuración → Costos horarios</Link>.
        </p>
      )}
      {operators.length > 0 && (
        <label className="mb-3 flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" className="size-4" checked={showDeactivated} onChange={(e) => setShowDeactivated(e.target.checked)} />
          Mostrar dados de baja <span className="text-slate-400 tabular">({deactivatedCount})</span>
        </label>
      )}
      {operators.length === 0 ? (
        <EmptyState icon={HardHat} title="Todavía no hay operarios" description="Cargá a las personas que registran horas en el taller." />
      ) : shown.length === 0 ? (
        <EmptyState icon={HardHat} title="No hay operarios activos" description="Marcá “Mostrar dados de baja” para ver a los que están de baja y reactivarlos." />
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Nombre</TH>
                <TH>Rubro principal</TH>
                <TH>Vista de Blerp</TH>
                <TH>Estado</TH>
                <TH>Jornada y días</TH>
                <TH className="text-right">Costo por hora</TH>
                <TH className="text-right">Horas reales del mes</TH>
                <TH><span className="sr-only">Acciones</span></TH>
              </TR>
            </THead>
            <TBody>
              {shown.map((o) => {
                const s = stats.get(o.id);
                return (
                  <TR key={o.id} className={o.id === op ? "bg-amber-50" : undefined}>
                    <TD className="font-medium text-slate-900">
                      {o.name}
                      <span className="block text-xs font-normal text-slate-500">{o.role} · {s?.projects ?? 0} proyectos activos</span>
                    </TD>
                    <TD>{params.roleToRubro[o.role] ?? o.role}</TD>
                    <TD className="text-xs text-slate-600"><PersonnelView employee={o} /></TD>
                    <TD>
                      <Badge tone={o.active ? "green" : "gray"}>
                        {o.active ? "Activo" : `Inactivo${o.deactivatedAt ? ` desde el ${formatDate(o.deactivatedAt)}` : ""}`}
                      </Badge>
                    </TD>
                    <TD className="text-xs text-slate-600">
                      {formatNumber(o.hoursPerDay ?? hoursPerDay)} h por día
                      <span className="block">{daysLabel(o.workDays)}</span><Button size="sm" variant="ghost" onClick={() => setSchedule(o.id)}>Días y disponibilidad</Button>
                      {(s?.rubros.length ?? 0) > 1 && <span className="block">Multirrol: {s?.rubros.join(", ")}</span>}
                    </TD>
                    <TD className="text-right tabular">
                      {formatCurrency(costOf(o))}
                      <span className="block text-xs text-slate-500">{costSource(o)}</span>
                    </TD>
                    <TD className="text-right tabular">{formatNumber(s?.hours ?? 0)} h<span className="block text-xs text-slate-500">{formatCurrency(s?.cost ?? 0)}</span></TD>
                    <TD>
                      {isManager && (
                        <div className="flex justify-end gap-2">
                          {!o.active && (
                            <Button size="sm" variant="outline" onClick={async () => await reactivateOperator(o.id)}>
                              <UserCheck /> Reactivar
                            </Button>
                          )}
                          <Button size="sm" variant="outline" onClick={() => setEditing(o)}>Editar</Button>
                        </div>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Card>
      )}
      {editing !== null && (
        <OperatorDialog
          key={editing === "new" ? "new" : editing.id}
          operator={editing === "new" ? null : editing}
          hasRecords={editing !== "new" && operatorHasRecords(projects, editing.id)}
          open
          onOpenChange={(o) => { if (!o) setEditing(null); }}
        />
      )}
    </div>
  );
}
