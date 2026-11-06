"use client";
import { employeeCost, laborCategories } from "@/lib/personnel";
import { RubroCatalogSection } from "@/components/settings/demo-sections";
import { StaffCategoriesSettings } from "@/components/settings/frontend-production";
import { EmployeeForm } from "./employee-form";
import { personnelViews } from "@/lib/personnel";
import { useConfiguredOperators } from "@/store/selectors";
import { useConfirmedAction } from "@/store/confirmed-action";
import { useState } from "react";
import { HardHat, Plus, Trash2, UserCheck, UserMinus } from "lucide-react";
import type { Operator } from "@/types";
import { formatCurrency, formatDate, formatNumber, todayISO } from "@/lib/formatting";
import { activeOperators, operatorHasRecords, visibleOperators } from "@/lib/operators";

import { useAppStore, type Result } from "@/store/use-app-store";
import { useCategoryRate, useIdentity } from "@/store/selectors";
import { PageHeader } from "@/components/shared/page-header";

import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { SESSION_KEYS, SESSION_LABELS, type SessionKey } from "@/lib/permissions";
import { Input, Select } from "@/components/ui/input";
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
  const createEmployee = useConfirmedAction("createEmployeeLocal");
  const local = useAppStore((s) => s.demoLocal);
  const categories = useAppStore((s) => s.ledger.staffCategories);
  const [categoryId,setCategoryId] = useState("");
  const [views,setViews] = useState<SessionKey[]>([]);
  const [productive,setProductive] = useState(false);
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
    const category = categories?.find((c) => c.id === categoryId);
    if (local && !operator && (!category || !views.length)) return setError("Elegí categoría laboral y al menos una vista.");
    const input = { name, role:role || category?.name || "", hourlyCost: operator ? operator.hourlyCost : category?.hourlyCost ?? laborRate, email: email.trim() || undefined, userId: operator?.userId };
    const r = operator ? await updateOperator(operator.id, input, todayISO()) : local ? await createEmployee(input,{ enabled:true,view:views[0],views,categoryIds:[categoryId],productive,enabledRubros:[],accessEnabledOn:todayISO() }) : await createOperator(input);
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
          <DialogTitle>{operator ? "Editar empleado" : "Nuevo empleado"}</DialogTitle>
          <DialogDescription>
            La tarifa particular y las categorías se configuran en esta sección de Personal. La categoría laboral es independiente de la vista de Blerp.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4" noValidate>
          <Field label="Nombre" htmlFor="op-name"><Input id="op-name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          {local && !operator && <><label className="text-sm">Categoría inicial<Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}><option value="">Elegí…</option>{categories?.filter((c) => c.active !== false).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></label><fieldset><legend>Vistas asignadas</legend>{SESSION_KEYS.map((v) => <label key={v} className="block"><input type="checkbox" checked={views.includes(v)} onChange={(e) => setViews(e.target.checked ? [...views,v] : views.filter((x) => x !== v))} />{SESSION_LABELS[v]}</label>)}</fieldset><label><input type="checkbox" checked={productive} onChange={(e) => setProductive(e.target.checked)} />Habilitado como operario</label></>}
          <Field label="Rol o especialidad" htmlFor="op-role"><Input id="op-role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Carpintería, Armado…" /></Field>
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
  const local = useAppStore((s)=>s.demoLocal);
  const projects = useAppStore((s) => s.projects);
  const reactivateOperator = useConfirmedAction("reactivateOperator");
  const { isManager } = useIdentity();
  const [editing, setEditing] = useState<Operator | null | "new">(op ? (operators.find((o) => o.id === op) ?? null) : null);
  const [showDeactivated, setShowDeactivated] = useState(false);
  const [categoryFilter,setCategoryFilter]=useState("");
  const shown = visibleOperators(operators, showDeactivated).filter(o=>!categoryFilter || useAppStore.getState().ledger.personnel?.find(p=>p.employeeId===o.id)?.categoryIds?.includes(categoryFilter));
  const deactivatedCount = operators.length - activeOperators(operators).length;

  const hoursPerDay = useAppStore((s) => s.costSettings.hoursPerDay);
  const ledger = useAppStore((s) => s.ledger);
  const costHistory = useAppStore((s) => s.priceHistory);
  const costOf = (o: Operator) => { try { return employeeCost(ledger,o,todayISO(),undefined,costHistory).hourlyCost; } catch { return undefined; } };


  return (
    <div>
      <PageHeader
        back
        title="Personal"
        subtitle="Empleados, categorías laborales y rubros productivos."
        actions={isManager ? <Button onClick={() => setEditing("new")}><Plus /> Agregar empleado</Button> : undefined}
      />
      <nav aria-label="Secciones de Personal" className="mb-6 flex flex-wrap gap-2 text-sm"><a className="rounded-md border border-slate-300 bg-white px-3 py-2 text-blue-700 hover:bg-blue-50" href="#empleados">Empleados</a><a className="rounded-md border border-slate-300 bg-white px-3 py-2 text-blue-700 hover:bg-blue-50" href="#categorias">Categorías laborales y tarifas</a><a className="rounded-md border border-slate-300 bg-white px-3 py-2 text-blue-700 hover:bg-blue-50" href="#rubros">Rubros habilitados</a></nav>
      <h2 id="empleados" className="mb-3 scroll-mt-20 text-lg font-semibold">Empleados</h2>
      <label className="mb-4 block max-w-md text-sm">Categoría laboral a consultar<Select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}><option value="">Todas las categorías</option>{(ledger.staffCategories??[]).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</Select></label>
      {operators.length > 0 && (
        <label className="mb-3 flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" className="size-4" checked={showDeactivated} onChange={(e) => setShowDeactivated(e.target.checked)} />
          Mostrar dados de baja <span className="text-slate-400 tabular">({deactivatedCount})</span>
        </label>
      )}
      {operators.length === 0 ? (
        <EmptyState icon={HardHat} title="Todavía no hay empleados" description="Cargá a las personas que registran horas en el taller." />
      ) : shown.length === 0 ? (
        <EmptyState icon={HardHat} title="No hay empleados activos" description="Marcá “Mostrar dados de baja” para ver a los que están de baja y reactivarlos." />
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Nombre</TH>
                <TH>Categoría</TH><TH>Rubros</TH>
                <TH>Vista de Blerp</TH>
                <TH>Jornada y días</TH>
                <TH className="text-right">Costo por hora</TH>
                <TH><span className="sr-only">Acciones</span></TH>
              </TR>
            </THead>
            <TBody>
              {shown.map((o) => {
                return (
                  <TR key={o.id} className={o.id === op ? "bg-amber-50" : undefined}>
                    <TD className="font-medium text-slate-900">
                      {o.name}<span className="mt-2 block"><Badge tone={o.active ? "green" : "gray"}>{o.active ? "Activo" : `Inactivo${o.deactivatedAt ? ` desde el ${formatDate(o.deactivatedAt)}` : ""}`}</Badge></span>
                    </TD>
                    <TD>{laborCategories(ledger,o.id,false).map((c) => c.name).join(", ") || "Sin categoría"}</TD><TD>{!ledger.personnel?.some((p)=>p.employeeId===o.id) && o.productive === undefined ? "Sin rubros" : o.productive === false ? "—" : (o.enabledRubros?.length ?? 0) > 1 ? <details open><summary>Rubros habilitados</summary>{o.enabledRubros?.map((id) => ledger.rubroCatalog.find((r) => r.id === id)?.name ?? id).join(", ")}</details> : o.enabledRubros?.map((id) => ledger.rubroCatalog.find((r) => r.id === id)?.name ?? id).join(", ") || "Sin rubros"}</TD>
                    <TD className="text-xs text-slate-600">{ledger.personnel?.find((p)=>p.employeeId===o.id)?.views?.map((v)=>SESSION_LABELS[v]).join(", ") || (ledger.personnel?.find((p)=>p.employeeId===o.id) ? SESSION_LABELS[personnelViews(ledger.personnel.find((p)=>p.employeeId===o.id)!)[0]] : "Sin vista")}</TD>
                    <TD className="text-xs text-slate-600">
                      {formatNumber(o.hoursPerDay ?? hoursPerDay)} h por día
                      <span className="block">{daysLabel(o.workDays)}</span>
                    </TD>
                    <TD className="text-right tabular">
                      {costOf(o) === undefined ? "Elegir categoría / sin tarifa" : formatCurrency(costOf(o)!)}
                    </TD>
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
      <div className="mt-6 space-y-6"><section id="categorias" className="scroll-mt-20"><StaffCategoriesSettings /></section><section id="rubros" className="scroll-mt-20"><RubroCatalogSection /></section></div>
      {editing !== null && local && <Dialog open onOpenChange={(open)=>!open && setEditing(null)}><DialogContent className="max-w-3xl overflow-hidden"><DialogHeader><DialogTitle>{editing === "new" ? "Nuevo empleado" : "Editar empleado"}</DialogTitle><DialogDescription>Datos de Personal</DialogDescription></DialogHeader><EmployeeForm key={editing === "new" ? "new" : editing.id} employee={editing === "new" ? undefined : editing} onSaved={()=>setEditing(null)} onCancel={()=>setEditing(null)} /></DialogContent></Dialog>}
      {editing !== null && !local && (
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
