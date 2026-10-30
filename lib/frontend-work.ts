// Frontend-only domain extensions. No remote calls or changes to auth/backend contracts.
import type { ExternalWork, Ledger, Project, RubroId } from "@/types";
import { createId } from "./activity";
import { DomainError } from "./project-operations";
import { addDays } from "./plant";
import { dayCapacity } from "./schedule";
import type { DayException, Operator, WorkAssignment } from "@/types";
import { rubroLabel } from "./rubros";
import { loadByRubro } from "./gerencia";

const round = (v: number) => Math.round(v * 100) / 100;
export function approvalDate(p: Project): string | undefined {
  return p.baseline?.capturedAt.slice(0, 10) ?? p.activity.find((a) => a.kind === "status" && /aprob/i.test(a.message))?.at.slice(0, 10);
}
export function actualStart(p: Project, ledger?: Ledger): string | undefined {
  return [...p.actualEntries.filter((e) => e.category === "labor" && e.labor && e.labor.hours > 0).map((e) => e.date),
    ...p.materialUsages.filter((u) => u.quantityConsumed + u.wasteQuantity > 0).map((u) => u.date),
    ...(ledger?.externalWork ?? []).filter((e) => e.projectId === p.id && e.kind === "hourly" && (e.hours ?? 0) > 0).map((e) => e.date)].sort()[0];
}
export function activeOn(p: Project, date: string): boolean {
  const approved = approvalDate(p);
  if (!approved || approved > date) return false;
  const closed = p.closedAt?.slice(0, 10);
  return closed ? date <= closed : !p.isClosed;
}
export function generalAllocations(projects: Project[], date: string, cost: number) {
  const active = projects.filter((p) => activeOn(p, date)).sort((a,b) => a.id.localeCompare(b.id));
  const each = active.length ? Math.floor(cost * 100 / active.length) / 100 : 0;
  return active.map((p,i) => ({ projectId: p.id, amount: i === active.length - 1 ? round(cost - each * i) : each }));
}
export function externalCost(ledger: Ledger, projectId: string): number {
  return round((ledger.externalWork ?? []).filter((e) => e.projectId === projectId).reduce((s,e) => s + (e.confirmedCost ?? e.estimatedCost ?? 0), 0));
}
export function pendingExternal(ledger: Ledger, projectId: string): ExternalWork[] {
  return (ledger.externalWork ?? []).filter((e) => e.projectId === projectId && (e.confirmedCost === undefined || !e.confirmedBy));
}
export function registerExternal(ledger: Ledger, projects: Project[], input: Omit<ExternalWork, "id" | "createdAt" | "createdBy" | "confirmedCost" | "confirmedBy" | "confirmedAt">, ctx: { actor: string; now: string }): Ledger {
  const p = projects.find((p) => p.id === input.projectId);
  if (!p || p.isClosed || p.status === "quotation") throw new DomainError("Elegí un proyecto aprobado y abierto.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || input.date > ctx.now.slice(0,10)) throw new DomainError("Indicá una fecha real, no futura.");
  const item = p.items.find((i) => i.id === input.itemId);
  if (input.itemId && !item) throw new DomainError("Mueble inválido.");
  if (!(item ? item.rubros : p.items.flatMap((i) => i.rubros)).some((r) => r.rubro === input.rubro)) throw new DomainError("Elegí un rubro del proyecto.");
  if (input.description.trim().length < 3) throw new DomainError("Describí el trabajo.");
  if (input.kind === "hourly" && !(Number.isFinite(input.hours) && input.hours! > 0 && input.hours! <= 24)) throw new DomainError("Indicá horas reales entre 0 y 24 por persona.");
  if (input.estimatedCost !== undefined && (!Number.isFinite(input.estimatedCost) || input.estimatedCost < 0)) throw new DomainError("Costo inválido.");
  const rate = input.kind === "hourly" ? externalHourlyRate(ledger,input.rubro,input.date) : undefined;
  const estimatedCost = input.estimatedCost ?? (rate !== undefined ? round(rate * input.hours!) : undefined);
  const row: ExternalWork = { ...input, estimatedCost, hours: input.kind === "hourly" ? input.hours : undefined, id: createId("ext"), createdBy: ctx.actor, createdAt: ctx.now };
  return { ...ledger, externalWork: [...(ledger.externalWork ?? []), row] };
}
export function confirmExternal(ledger: Ledger, id: string, amount: number, ctx: { actor: string; now: string }, reason?: string): Ledger {
  if (!Number.isFinite(amount) || amount < 0) throw new DomainError("Indicá un costo definitivo válido (puede ser cero confirmado).");
  if (!(ledger.externalWork ?? []).some((e) => e.id === id)) throw new DomainError("Trabajo externo no encontrado.");
  const previous = ledger.externalWork!.find((e) => e.id === id)!;
  if (previous.confirmedCost !== undefined && (reason?.trim().length ?? 0) < 3) throw new DomainError("Indicá el motivo de la corrección del costo confirmado.");
  return { ...ledger, externalWork: (ledger.externalWork ?? []).map((e) => e.id === id ? { ...e, confirmedCost: round(amount), confirmedBy: ctx.actor, confirmedAt: ctx.now,costHistory:[...(e.costHistory ?? []),{ previous:e.confirmedCost,next:round(amount),by:ctx.actor,at:ctx.now,reason:reason?.trim() }] } : e) };
}
/** Read-only reporting projection, never persisted as a second productive entry. */
export function withExternalHours(projects: Project[], ledger: Ledger): Project[] {
  return projects.map((p) => ({ ...p, actualEntries: [...p.actualEntries, ...(ledger.externalWork ?? []).filter((e) => e.projectId === p.id && e.kind === "hourly").map((e) => ({
    id: e.id, projectId: p.id, date: e.date, type: "labor" as const, category: "labor" as const, description: e.description,
    amount: 0, itemId: e.itemId, rubro: e.rubro, labor: { role: rubroLabel(e.rubro), hours: e.hours ?? 0, hourlyCost: 0, workerName: e.supplier ?? "Externo" }, createdBy: e.createdBy, createdAt: e.createdAt,
  }))] }));
}
/** Shared availability and demand: each employee/day has one capacity, even with multiple skills. */
export function weeklyCapacity(projects: Project[], operators: Operator[], assignments: WorkAssignment[], exceptions: DayException[], from: string, to: string, today: string, hoursPerDay: number, rubro?: RubroId, ledger?: Ledger) {
  let available = 0;
  for (let date = from; date <= to; date = addDays(date, 1)) {
    for (const op of operators.filter((o) => o.active && o.productive !== false)) {
      const cap = dayCapacity(op, date, exceptions, hoursPerDay).hours;
      if (!rubro) { available += cap; continue; }
      const skills = op.enabledRubros ?? [];
      // Across skills divide only the unplanned capacity; never create two simultaneous working days.
      const mine = assignments.filter((a) => a.operatorId === op.id && a.date === date);
      const planned = mine.reduce((s,a) => s + a.plannedHours, 0);
      const used = mine.filter((a) => a.rubro === rubro).reduce((s,a) => s + a.plannedHours, 0);
      if (skills.includes(rubro)) available += Math.min(cap, used) + Math.max(0, cap - planned) / skills.length;
    }
  }
  available += (ledger?.capacityAdjustments ?? []).filter((a) => a.date >= from && a.date <= to && (!rubro || a.rubro === rubro)).reduce((s,a) => s+a.hours,0);
  available = Math.max(0,available);
  const workDays = [...new Set(operators.filter((o) => o.active && o.productive !== false).flatMap((o) => o.workDays ?? [1,2,3,4,5]))];
  const load = loadByRubro(projects, [], from, to, today,workDays.length ? workDays : undefined).confirmed;
  const needed = rubro ? load[rubroLabel(rubro)] ?? 0 : Object.values(load).reduce((s,h) => s+h,0);
  const planned = assignments.filter((a) => a.date >= from && a.date <= to && (!rubro || a.rubro === rubro)).reduce((s,a) => s+a.plannedHours,0);
  return { available: round(available), planned: round(planned), needed: round(needed) };
}

export function configuredOperators(operators: Operator[], ledger: Ledger): Operator[] {
  return operators.map((o) => {
    const setup = ledger.personnel?.find((p) => p.employeeId === o.id);
    return setup ? { ...o, productive:setup.productive, hoursPerDay: setup.hoursPerDay, enabledRubros: setup.enabledRubros } : o;
  });
}
export function externalHourlyRate(ledger: Ledger, rubro: RubroId, date: string): number | undefined {
  return (ledger.externalRates ?? []).filter((r) => r.rubro === rubro && r.validFrom <= date).sort((a,b) => a.validFrom.localeCompare(b.validFrom) || a.at.localeCompare(b.at)).at(-1)?.hourlyCost;
}

/** Event-driven frontend transitions; never rewrite the approved quotation or past BOM versions. */
export function afterPublishedBom(projects: Project[], before: Ledger, after: Ledger, ctx: { actor: string; now: string }): Project[] {
  const published = new Set(after.boms.filter((b) => b.status === "published" && !before.boms.some((old) => old.id === b.id && old.status === "published")).map((b) => b.projectId));
  return projects.map((p) => published.has(p.id) && !p.isClosed && p.status === "approved" ? { ...p,status:"purchasing",updatedAt:ctx.now,activity:[...p.activity,{ id:createId("stage"),kind:"status",at:ctx.now,actor:ctx.actor,message:"BOM publicado: pasa a Compras." }] } : p);
}
export function afterMaterialArrival(projects: Project[], projectIds: string[], ctx: { actor: string; now: string }): Project[] {
  return projects.map((p) => projectIds.includes(p.id) && !p.isClosed && ["approved","purchasing"].includes(p.status) ? { ...p,status:"production",updatedAt:ctx.now,activity:[...p.activity,{ id:createId("stage"),kind:"status",at:ctx.now,actor:ctx.actor,message:"Material recibido o stock asignado: pasa a Producción. Inicio real pendiente de trabajo productivo." }] } : p);
}
