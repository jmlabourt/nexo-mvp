"use client";
import { useMemo, useState } from "react";
import { HardHat, Plus } from "lucide-react";
import type { Operator } from "@/types";
import { parseDecimal } from "@/lib/schemas";
import { formatCurrency, formatNumber } from "@/lib/formatting";
import { useAppStore } from "@/store/use-app-store";
import { useIdentity } from "@/store/selectors";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function OperatorDialog({ operator, open, onOpenChange }: { operator: Operator | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const createOperator = useAppStore((s) => s.createOperator);
  const updateOperator = useAppStore((s) => s.updateOperator);
  const [name, setName] = useState(operator?.name ?? "");
  const [role, setRole] = useState(operator?.role ?? "");
  const [rate, setRate] = useState(operator ? String(operator.hourlyCost) : "");
  const [email, setEmail] = useState(operator?.email ?? "");
  const [active, setActive] = useState(operator?.active ?? true);
  const [error, setError] = useState("");

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const input = { name, role, hourlyCost: parseDecimal(rate), active, email: email.trim() || undefined, userId: operator?.userId };
    const r = operator ? updateOperator(operator.id, input) : createOperator(input);
    if (!r.ok) return setError(r.error);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{operator ? "Editar operario" : "Nuevo operario"}</DialogTitle>
          <DialogDescription>
            El costo por hora se usa para valorizar las horas que cargue. Si lo cambiás, las horas ya cargadas conservan su valor.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4" noValidate>
          <Field label="Nombre" htmlFor="op-name"><Input id="op-name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Rol o especialidad" htmlFor="op-role"><Input id="op-role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Carpintería, Armado…" /></Field>
          <Field label="Costo por hora ($)" htmlFor="op-rate"><Input id="op-rate" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} /></Field>
          <Field label="Email de acceso (opcional)" htmlFor="op-email" hint="Si el operario entra con este email, ve sólo Taller y sus proyectos asignados.">
            <Input id="op-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4" checked={active} onChange={(e) => setActive(e.target.checked)} /> Activo
          </label>
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
  const operators = useAppStore((s) => s.operators);
  const projects = useAppStore((s) => s.projects);
  const { isManager } = useIdentity();
  const [editing, setEditing] = useState<Operator | null | "new">(op ? (operators.find((o) => o.id === op) ?? null) : null);

  const stats = useMemo(() => {
    const m = new Map<string, { hours: number; cost: number; projects: number }>();
    for (const o of operators) m.set(o.id, { hours: 0, cost: 0, projects: projects.filter((p) => !p.isClosed && p.assignedOperatorIds.includes(o.id)).length });
    for (const p of projects)
      for (const e of p.actualEntries) {
        if (e.type !== "labor" || !e.operatorId) continue;
        const s = m.get(e.operatorId);
        if (s) { s.hours += e.labor?.hours ?? 0; s.cost += e.amount; }
      }
    return m;
  }, [operators, projects]);

  return (
    <div>
      <PageHeader
        title="Operarios"
        subtitle="Quién trabaja, a qué costo por hora y en qué proyectos. Las horas se cargan siempre a nombre de un operario."
        actions={isManager ? <Button onClick={() => setEditing("new")}><Plus /> Nuevo operario</Button> : undefined}
      />
      {operators.length === 0 ? (
        <EmptyState icon={HardHat} title="Todavía no hay operarios" description="Cargá a las personas que registran horas en el taller." />
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Nombre</TH>
                <TH>Rol</TH>
                <TH className="text-right">Costo por hora</TH>
                <TH className="text-right">Proyectos activos</TH>
                <TH className="text-right">Horas cargadas</TH>
                <TH>Acceso</TH>
                <TH>Estado</TH>
                <TH><span className="sr-only">Acciones</span></TH>
              </TR>
            </THead>
            <TBody>
              {operators.map((o) => {
                const s = stats.get(o.id);
                return (
                  <TR key={o.id} className={o.id === op ? "bg-amber-50" : undefined}>
                    <TD className="font-medium text-slate-900">{o.name}</TD>
                    <TD>{o.role}</TD>
                    <TD className="text-right tabular">{formatCurrency(o.hourlyCost)}</TD>
                    <TD className="text-right tabular">{s?.projects ?? 0}</TD>
                    <TD className="text-right tabular">{formatNumber(s?.hours ?? 0)} h · {formatCurrency(s?.cost ?? 0)}</TD>
                    <TD className="text-xs text-slate-600">{o.userId ? "Vinculado" : o.email ? `Invitado: ${o.email}` : "Sin acceso"}</TD>
                    <TD><Badge tone={o.active ? "green" : "gray"}>{o.active ? "Activo" : "Inactivo"}</Badge></TD>
                    <TD>{isManager && <Button size="sm" variant="outline" onClick={() => setEditing(o)}>Editar</Button>}</TD>
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
          open
          onOpenChange={(o) => { if (!o) setEditing(null); }}
        />
      )}
    </div>
  );
}
