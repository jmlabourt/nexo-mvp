import type { Project, WorkAssignment, Operator } from "@/types";
import { addDays, exceeds, type Threshold } from "./plant";

/** Solo se revisan las jornadas de los últimos 7 días: lo anterior ya no se puede reconstruir con el operario. */
export const REVIEW_WINDOW_DAYS = 7;
export interface HoursReview {
  key: string; operatorId: string; worker: string; date: string;
  reason: "distribution" | "missing" | "excess";
  assignments: WorkAssignment[];
  entries: Project["actualEntries"];
  message: string;
}
/**
 * One review per person/day. Today's missing work is not overdue. No monetary data.
 * Solo los últimos REVIEW_WINDOW_DAYS días, y con la misma tolerancia de Configuración para lo que sobra y lo que
 * falta (por ejemplo 2 h o 25 %): 7,5 h cargadas de 8 previstas no es algo para revisar.
 */
export function dailyHoursReviews(projects: Project[], assignments: WorkAssignment[], operators: Operator[], today: string, threshold: Threshold): HoursReview[] {
  const result: HoursReview[] = [];
  const groups = new Map<string, WorkAssignment[]>();
  const from = addDays(today, -REVIEW_WINDOW_DAYS);
  for (const a of assignments) {
    if (a.date > today || a.date < from || !projects.some((p) => p.id === a.projectId && !p.isClosed)) continue;
    const key = `${a.operatorId}|${a.date}`;
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  for (const [group, rows] of groups) {
    rows.sort((a,b) => a.id.localeCompare(b.id));
    const { operatorId, date } = rows[0];
    const entries = projects.flatMap((p) => p.actualEntries).filter((e) => e.type === "labor" && e.operatorId === operatorId && e.date === date).sort((a,b) => a.id.localeCompare(b.id));
    const logged = (a: WorkAssignment) => entries.filter((e) => e.assignmentId === a.id).reduce((s,e) => s+(e.labor?.hours ?? 0),0);
    const total = entries.reduce((s,e) => s+(e.labor?.hours ?? 0),0);
    const planned = rows.reduce((s,a) => s+a.plannedHours,0);
    const missing = exceeds(total, planned, threshold) || rows.some((a) => logged(a) === 0 && a.plannedHours > 0);
    const concentrated = new Set(rows.map((a) => a.projectId)).size > 1 && new Set(entries.map((e) => e.projectId)).size === 1 && total >= planned && rows.some((a) => logged(a) === 0);
    const reason = concentrated ? "distribution" : exceeds(planned,total,threshold) ? "excess" : date < today && missing ? "missing" : null;
    if (!reason) continue;
    const worker = operators.find((o) => o.id === operatorId)?.name ?? "Operario";
    const detail = rows.map((a) => `${projects.find((p) => p.id === a.projectId)?.code ?? a.projectId}: ${a.plannedHours} h previstas, ${logged(a)} h cargadas`).join("; ");
    const fingerprint = JSON.stringify([rows.map((a) => [a.id,a.plannedHours,a.projectId]),entries.map((e) => [e.id,e.assignmentId,e.labor?.hours])]);
    result.push({ key: `${group}|${fingerprint}`, operatorId, worker, date, reason, assignments: rows, entries,
      message: `Revisar horas de ${worker}. ${detail}. ${concentrated ? "Posible imputación incorrecta." : reason === "missing" ? "Quedan horas por revisar." : "Se superó lo previsto."}` });
  }
  return result;
}

export interface HoursCorrectionInput {
  entryId: string;
  reason: string;
  /** Cómo se reparten las horas del registro entre las asignaciones del día (el total se mantiene). */
  allocations: Array<{ assignmentId: string; hours: number }>;
}

/**
 * Corrección del Jefe de planta (modo demostración; en una empresa real lo hace planta_correct_hours): reparte las
 * horas de un registro entre las asignaciones del día, con motivo. El total no cambia y el costo se reparte en la
 * misma proporción (la tarifa del registro no se recalcula). Queda en el historial de cada proyecto tocado.
 */
export function correctHours(
  projects: Project[],
  assignments: WorkAssignment[],
  input: HoursCorrectionInput,
  ctx: { actor: string; now: string; id: () => string },
): Project[] {
  const source = projects.find((p) => p.actualEntries.some((e) => e.id === input.entryId));
  const entry = source?.actualEntries.find((e) => e.id === input.entryId);
  if (!source || !entry?.labor) throw new Error("Registro de horas no encontrado.");
  if (input.reason.trim().length < 3) throw new Error("Escribí el motivo de la corrección.");
  const total = entry.labor.hours;
  const parts = input.allocations.filter((a) => a.hours > 0);
  const sum = parts.reduce((s, a) => s + a.hours, 0);
  if (parts.length === 0 || Math.abs(sum - total) > 1e-6) throw new Error(`El reparto tiene que sumar ${total} h (suma ${Math.round(sum * 100) / 100} h).`);
  const note = `Corregido por ${ctx.actor}: ${input.reason.trim()}`;
  const added = new Map<string, Project["actualEntries"]>();
  for (const a of parts) {
    const asg = assignments.find((x) => x.id === a.assignmentId);
    if (!asg) throw new Error("Asignación no encontrada.");
    const share = a.hours / total;
    const next = {
      ...entry,
      id: ctx.id(),
      projectId: asg.projectId,
      itemId: asg.itemId ?? entry.itemId,
      rubro: asg.rubro,
      assignmentId: asg.id,
      amount: Math.round(entry.amount * share * 100) / 100,
      labor: { ...entry.labor, hours: a.hours },
      notes: [entry.notes, note].filter(Boolean).join(" · "),
    };
    added.set(asg.projectId, [...(added.get(asg.projectId) ?? []), next]);
  }
  return projects.map((p) => {
    const keep = p.id === source.id ? p.actualEntries.filter((e) => e.id !== entry.id) : p.actualEntries;
    const extra = added.get(p.id) ?? [];
    if (p.id !== source.id && extra.length === 0) return p;
    return {
      ...p,
      actualEntries: [...keep, ...extra],
      updatedAt: ctx.now,
      activity: [...p.activity, { id: ctx.id(), kind: "cost" as const, actor: ctx.actor, message: `Horas corregidas por el Jefe de planta (${total} h): ${input.reason.trim()}`, at: ctx.now }],
    };
  });
}
