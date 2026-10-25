"use client";
// Jefe de planta → Proyectos (modo demostración). Dos vistas: "Hoy" (lo planificado para hoy, horas reales que cargaron
// los operarios, material en planta y su rendición, unidades terminadas, entrega) y "Planificación" (semana por semana).
// Sin precios ni rentabilidad.
import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import type { Project } from "@/lib/core/types";
import * as op from "@/lib/core/ops";
import { handoverOf, pendingMaterials } from "@/lib/core/closing";
import { clientName, itemName, materialName, materialUnit, rubroName } from "@/lib/core/lookup";
import { budgetLinesOf, enabledRubros, publishedBom } from "@/lib/core/needs";
import { allItemsDone, assignedHours, isPlantProject, ITEM_STATE_LABELS, itemState, openReleases, releaseBalance, todayRows } from "@/lib/core/plant";
import { asg, holdingsAt } from "@/lib/core/stock";
import { addDays, eachDay, EPS, qty, sumBy, weekStart } from "@/lib/core/util";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { day, Empty, FormDialog, num, num2, Section, useAct, useCore, useDemoToday, useFlash } from "../kit";

const DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export function PlantaProyectosDemo({ projectId }: { projectId?: string }) {
  const [view, setView] = useState<"hoy" | "plan">("hoy");
  return (
    <div className="space-y-4">
      <PageHeader
        title="Proyectos"
        actions={
          <div className="flex gap-1">
            <Button size="sm" variant={view === "hoy" ? "default" : "outline"} onClick={() => setView("hoy")}>Hoy</Button>
            <Button size="sm" variant={view === "plan" ? "default" : "outline"} onClick={() => setView("plan")}>Planificación</Button>
          </div>
        }
      />
      {view === "hoy" ? <Hoy focus={projectId} /> : <Planificacion />}
    </div>
  );
}

// ── Hoy ──

function Hoy({ focus }: { focus?: string }) {
  const w = useCore();
  const today = useDemoToday();
  const projects = w.projects.filter(isPlantProject).sort((a, b) => (a.id === focus ? -1 : b.id === focus ? 1 : a.dueDate.localeCompare(b.dueDate)));
  const rows = todayRows(w, today);
  if (projects.length === 0) return <Empty>No hay OTs en Producción.</Empty>;
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">{DAYS[new Date(`${today}T12:00:00Z`).getUTCDay()]} {day(today)}</p>
      {projects.map((p) => (
        <OtToday key={p.id} project={p} rows={rows.filter((r) => r.projectId === p.id)} />
      ))}
    </div>
  );
}

function OtToday({ project: p, rows }: { project: Project; rows: ReturnType<typeof todayRows> }) {
  const w = useCore();
  const act = useAct();
  const today = useDemoToday();
  const flash = useFlash();
  const releases = openReleases(w, p.id);
  const assigned = holdingsAt(w, asg(p.id));
  const assignedByMat = [...new Set(assigned.map((h) => h.lot.materialId))].map((m) => ({ m, q: qty(sumBy(assigned.filter((h) => h.lot.materialId === m), (h) => h.quantity)) }));
  const [rend, setRend] = useState<Record<string, { c: string; d: string; r: string }>>({});
  const done = allItemsDone(p);
  const pend = pendingMaterials(w, p.id);
  const handover = handoverOf(w, p.id);
  const late = p.dueDate < today && !handover;

  const saveDay = () => {
    const entries = Object.entries(rend).filter(([, v]) => v.c || v.d || v.r);
    if (entries.length === 0) return flash.show({ ok: false, error: "Cargá qué pasó con al menos una entrega (o usá “Sigue en producción”)." }, "");
    for (const [releaseId, v] of entries) {
      const r = act((cw, ctx) => op.renderRelease(cw, { releaseId, consumed: num2(v.c || "0"), waste: num2(v.d || "0"), returned: num2(v.r || "0") }, ctx));
      if (!r.ok) return flash.show(r, "");
    }
    setRend({});
    flash.show({ ok: true, value: undefined }, "Jornada guardada.");
  };

  return (
    <Section
      title={`${p.ot.split("_")[0]} · ${clientName(w, p.clientId)}`}
      actions={
        <>
          <span className={cn("text-xs", late ? "font-medium text-red-700" : "text-slate-500")}>Entrega {day(p.dueDate)}</span>
          <RequestMaterial project={p} />
          <RequestRubro project={p} />
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="mb-1 text-sm font-medium text-slate-700">Trabajos de hoy</h3>
          {rows.length === 0 ? <p className="text-sm text-slate-500">Nada planificado para hoy.</p> : (
            <Table>
              <THead><TR><TH>Mueble</TH><TH>Rubro</TH><TH className="text-right">Planificadas</TH><TH className="text-right">Reales</TH></TR></THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={`${r.itemId}${r.rubroId}`}>
                    <TD>{itemName(p, r.itemId)}</TD>
                    <TD>{rubroName(w, r.rubroId)}</TD>
                    <TD className="text-right tabular">{num(r.planned, "h")}</TD>
                    <TD className="text-right tabular">{num(r.real, "h")}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
          <h3 className="mb-1 mt-4 text-sm font-medium text-slate-700">Muebles</h3>
          <ul className="space-y-2">
            {p.items.map((it) => <Units key={it.id} project={p} itemId={it.id} />)}
          </ul>
        </div>
        <div>
          <h3 className="mb-1 text-sm font-medium text-slate-700">Material asignado (sin entregar)</h3>
          {assignedByMat.length === 0 ? <p className="text-sm text-slate-500">Nada asignado.</p> : (
            <ul className="space-y-1 text-sm">
              {assignedByMat.map(({ m, q }) => (
                <li key={m} className="flex items-center justify-between gap-2">
                  <span>{materialName(w, m)} · {num(q, materialUnit(w, m))}</span>
                  <span className="flex gap-1">
                    <ReleaseDialog project={p} materialId={m} max={q} />
                    {done && <Button size="sm" variant="ghost" onClick={() => flash.show(act((cw, ctx) => op.unassignStock(cw, { materialId: m, projectId: p.id, quantity: q }, ctx)), "Devuelto a stock.")}>Devolver a stock</Button>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <h3 className="mb-1 mt-4 text-sm font-medium text-slate-700">En producción · rendición del día</h3>
          {releases.length === 0 ? <p className="text-sm text-slate-500">Sin material en producción.</p> : (
            <>
              <Table>
                <THead><TR><TH>Entrega</TH><TH>Consumido</TH><TH>Desperdicio</TH><TH>Devuelto</TH><TH className="text-right">Sigue</TH></TR></THead>
                <TBody>
                  {releases.map((r) => {
                    const b = releaseBalance(w, r);
                    const v = rend[r.id] ?? { c: "", d: "", r: "" };
                    const sigue = qty(b.inProduction - (num2(v.c || "0") || 0) - (num2(v.d || "0") || 0) - (num2(v.r || "0") || 0));
                    const set = (k: "c" | "d" | "r", x: string) => setRend({ ...rend, [r.id]: { ...v, [k]: x } });
                    return (
                      <TR key={r.id}>
                        <TD className="text-xs">
                          {materialName(w, r.materialId)}
                          <span className="block text-slate-500">{itemName(p, r.itemId)} · {day(r.date)} · {num(b.inProduction, materialUnit(w, r.materialId))}</span>
                        </TD>
                        <TD><Input aria-label="Consumido" inputMode="decimal" className="h-8 w-16" value={v.c} onChange={(e) => set("c", e.target.value)} /></TD>
                        <TD><Input aria-label="Desperdicio" inputMode="decimal" className="h-8 w-16" value={v.d} onChange={(e) => set("d", e.target.value)} /></TD>
                        <TD><Input aria-label="Devuelto a stock" inputMode="decimal" className="h-8 w-16" value={v.r} onChange={(e) => set("r", e.target.value)} /></TD>
                        <TD className={cn("text-right tabular", sigue < -EPS && "text-red-700")}>{num(sigue)}</TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" onClick={saveDay}>Guardar jornada</Button>
                <Button size="sm" variant="outline" onClick={() => {
                  for (const r of releases) act((cw, ctx) => op.renderRelease(cw, { releaseId: r.id, consumed: 0, waste: 0, returned: 0 }, ctx));
                  flash.show({ ok: true, value: undefined }, "Registrado: todo sigue en producción.");
                }}>Sigue todo en producción</Button>
              </div>
              <p className="mt-1 text-xs text-slate-500">Liberado = consumido + desperdicio + devuelto + sigue en producción. Lo devuelto vuelve al stock libre con su lote.</p>
            </>
          )}
        </div>
      </div>
      {done && (
        <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
          <strong>Rendición final.</strong>{" "}
          {pend.length ? `Falta rendir: ${pend.map((m) => materialName(w, m.materialId)).join(", ")}.` : "Todo el material está rendido."}{" "}
          {handover ? `Entregado al cliente el ${day(handover.date)}.` : <HandoverButton project={p} />}
        </div>
      )}
      <div className="mt-2">{flash.node}</div>
    </Section>
  );
}

function Units({ project: p, itemId }: { project: Project; itemId: string }) {
  const act = useAct();
  const it = p.items.find((i) => i.id === itemId)!;
  const [v, setV] = useState(String(it.completedUnits));
  const [err, setErr] = useState("");
  return (
    <li className="flex flex-wrap items-center gap-2 text-sm">
      <span className="min-w-[10rem]">{it.name}</span>
      <Input aria-label={`Unidades terminadas de ${it.name}`} inputMode="numeric" className="h-8 w-16" value={v} onChange={(e) => setV(e.target.value)} />
      <span className="text-slate-500">/ {it.quantity}</span>
      <Button size="sm" variant="outline" onClick={() => { const r = act((cw, ctx) => op.setCompletedUnits(cw, p.id, it.id, Number(v), ctx)); setErr(r.ok ? "" : r.error); }}>Terminar unidades</Button>
      <Badge tone={itemState(it) === "done" ? "green" : "blue"}>{ITEM_STATE_LABELS[itemState(it)]}</Badge>
      {err && <span className="text-xs text-red-600">{err}</span>}
    </li>
  );
}

function HandoverButton({ project }: { project: Project }) {
  const act = useAct();
  const today = useDemoToday();
  const [date, setDate] = useState(today);
  return (
    <FormDialog trigger={<Button size="sm">Registrar entrega al cliente</Button>} title="Entrega al cliente" submitLabel="Registrar entrega" onSubmit={() => act((cw, ctx) => op.registerHandover(cw, project.id, { date }, ctx))}>
      <Field label="Fecha de entrega" htmlFor="ho-d"><Input id="ho-d" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
    </FormDialog>
  );
}

function ReleaseDialog({ project: p, materialId, max }: { project: Project; materialId: string; max: number }) {
  const w = useCore();
  const act = useAct();
  const bom = publishedBom(w, p.id);
  const options = bom?.lines.filter((l) => l.materialId === materialId) ?? [];
  const [target, setTarget] = useState(options[0] ? `${options[0].itemId}|${options[0].rubroId}` : "");
  const [q, setQ] = useState(String(max));
  return (
    <FormDialog
      trigger={<Button size="sm" variant="outline">Entregar a producción</Button>}
      title={`Entregar ${materialName(w, materialId)}`}
      submitLabel="Entregar"
      onSubmit={() => {
        const [itemId, rubroId] = target.split("|");
        return act((cw, ctx) => op.releaseMaterial(cw, { projectId: p.id, itemId, rubroId, materialId, quantity: num2(q) }, ctx));
      }}
    >
      <Field label="Para" htmlFor="rl-t">
        <Select id="rl-t" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">Elegí mueble y rubro…</option>
          {p.items.flatMap((it) => enabledRubros(w, p, it.id).map((rb) => <option key={`${it.id}|${rb}`} value={`${it.id}|${rb}`}>{it.name} · {rubroName(w, rb)}</option>))}
        </Select>
      </Field>
      <Field label={`Cantidad (${materialUnit(w, materialId)})`} htmlFor="rl-q" hint={`Asignado a la OT: ${num(max)}`}>
        <Input id="rl-q" inputMode="decimal" value={q} onChange={(e) => setQ(e.target.value)} />
      </Field>
    </FormDialog>
  );
}

function RequestMaterial({ project: p }: { project: Project }) {
  const w = useCore();
  const act = useAct();
  const bom = publishedBom(w, p.id);
  const [itemId, setItemId] = useState(p.items[0]?.id ?? "");
  const [materialId, setMaterialId] = useState("");
  const [q, setQ] = useState("");
  const [note, setNote] = useState("");
  const mats = [...new Set(bom?.lines.filter((l) => l.itemId === itemId).map((l) => l.materialId) ?? [])];
  return (
    <FormDialog trigger={<Button size="sm" variant="outline">Solicitar material</Button>} title="Solicitar material" submitLabel="Enviar a Compras" note="Va directo a Por comprar como adicional al BOM." onSubmit={() => act((cw, ctx) => op.requestMaterial(cw, { projectId: p.id, itemId, materialId, quantity: num2(q), note }, ctx))}>
      <Field label="Mueble" htmlFor="rm-i">
        <Select id="rm-i" value={itemId} onChange={(e) => { setItemId(e.target.value); setMaterialId(""); }}>
          {p.items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </Select>
      </Field>
      <Field label="Material del BOM" htmlFor="rm-m">
        <Select id="rm-m" value={materialId} onChange={(e) => setMaterialId(e.target.value)}>
          <option value="">Elegí…</option>
          {mats.map((m) => <option key={m} value={m}>{materialName(w, m)}</option>)}
        </Select>
      </Field>
      <Field label={`Cantidad adicional${materialId ? ` (${materialUnit(w, materialId)})` : ""}`} htmlFor="rm-q"><Input id="rm-q" inputMode="decimal" value={q} onChange={(e) => setQ(e.target.value)} /></Field>
      <Field label="Nota (opcional)" htmlFor="rm-n"><Input id="rm-n" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
    </FormDialog>
  );
}

function RequestRubro({ project: p }: { project: Project }) {
  const w = useCore();
  const act = useAct();
  const [itemId, setItemId] = useState(p.items[0]?.id ?? "");
  const [rubroId, setRubroId] = useState("");
  const [hours, setHours] = useState("");
  const [note, setNote] = useState("");
  const enabled = enabledRubros(w, p, itemId);
  return (
    <FormDialog trigger={<Button size="sm" variant="ghost">Pedir rubro nuevo</Button>} title="Pedir un rubro no cotizado" submitLabel="Enviar a Administración" note="Administración lo aprueba como adicional; recién ahí se puede planificar." onSubmit={() => act((cw, ctx) => op.requestRubro(cw, { projectId: p.id, itemId, rubroId, hours: num2(hours), note }, ctx))}>
      <Field label="Mueble" htmlFor="rr-i">
        <Select id="rr-i" value={itemId} onChange={(e) => setItemId(e.target.value)}>
          {p.items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </Select>
      </Field>
      <Field label="Rubro" htmlFor="rr-r">
        <Select id="rr-r" value={rubroId} onChange={(e) => setRubroId(e.target.value)}>
          <option value="">Elegí…</option>
          {w.rubros.filter((r) => r.active && !enabled.includes(r.id)).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
      </Field>
      <Field label="Horas estimadas" htmlFor="rr-h"><Input id="rr-h" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} /></Field>
      <Field label="Motivo" htmlFor="rr-n"><Input id="rr-n" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
    </FormDialog>
  );
}

// ── Planificación ──

function Planificacion() {
  const w = useCore();
  const act = useAct();
  const today = useDemoToday();
  const flash = useFlash();
  const [week, setWeek] = useState(weekStart(today));
  const days = eachDay(week, addDays(week, 6));
  const plans = w.plans.filter((x) => x.date >= week && x.date <= addDays(week, 6));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="icon" variant="outline" aria-label="Semana anterior" onClick={() => setWeek(addDays(week, -7))}><ChevronLeft /></Button>
        <span className="text-sm font-medium">Semana del {day(week)} al {day(addDays(week, 6))}</span>
        <Button size="icon" variant="outline" aria-label="Semana siguiente" onClick={() => setWeek(addDays(week, 7))}><ChevronRight /></Button>
        <span className="flex-1" />
        <PlanDialog defaultDate={today < week ? week : today} />
      </div>
      {flash.node}
      <div className="space-y-2">
        {days.map((d) => {
          const list = plans.filter((x) => x.date === d);
          if (list.length === 0 && [0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay())) return null;
          return (
            <div key={d} className={cn("rounded-lg border bg-white p-3", d === today ? "border-blue-300" : "border-slate-200")}>
              <h3 className="mb-1 text-sm font-medium text-slate-800">{DAYS[new Date(`${d}T12:00:00Z`).getUTCDay()]} {day(d)}{d === today && " · hoy"}</h3>
              {list.length === 0 ? <p className="text-xs text-slate-500">Sin trabajos planificados.</p> : (
                <ul className="divide-y divide-slate-100 text-sm">
                  {list.map((pl) => {
                    const p = w.projects.find((x) => x.id === pl.projectId);
                    const asgd = assignedHours(w, (a) => a.projectId === pl.projectId && a.itemId === pl.itemId && a.rubroId === pl.rubroId, d);
                    return (
                      <li key={pl.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                        <span>
                          <strong>{p?.ot.split("_")[0]}</strong> · {itemName(p, pl.itemId)} · {rubroName(w, pl.rubroId)}
                          <span className={cn("ml-2 text-xs", asgd + EPS < pl.hours ? "text-amber-700" : "text-slate-500")}>{num(pl.hours, "h")} · asignadas {num(Math.min(asgd, 99), "h")}</span>
                        </span>
                        <span className="flex gap-1">
                          <PlanDialog entry={pl} defaultDate={pl.date} />
                          <Button size="sm" variant="ghost" aria-label="Quitar" onClick={() => flash.show(act((cw, ctx) => op.removePlan(cw, pl.id, ctx)), asgd > 0 ? "Quitado. Revisá las asignaciones de ese día en Operarios." : "Quitado.")}><Trash2 /></Button>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PlanDialog({ entry, defaultDate }: { entry?: { id: string; projectId: string; itemId: string; rubroId: string; date: string; hours: number }; defaultDate: string }) {
  const w = useCore();
  const act = useAct();
  const [f, setF] = useState({ projectId: entry?.projectId ?? "", itemId: entry?.itemId ?? "", rubroId: entry?.rubroId ?? "", date: entry?.date ?? defaultDate, hours: entry ? String(entry.hours) : "" });
  const projects = w.projects.filter(isPlantProject);
  const p = projects.find((x) => x.id === f.projectId);
  const rubros = p && f.itemId ? enabledRubros(w, p, f.itemId) : [];
  const ref = (() => {
    if (!p || !f.itemId || !f.rubroId) return null;
    const budget = sumBy(budgetLinesOf(w, p).filter((l) => l.kind === "labor" && l.itemId === f.itemId && l.rubroId === f.rubroId), (l) => l.quantity);
    const planned = sumBy(w.plans.filter((x) => x.projectId === p.id && x.itemId === f.itemId && x.rubroId === f.rubroId && x.id !== entry?.id), (x) => x.hours);
    const real = sumBy(w.timeEntries.filter((t) => t.projectId === p.id && t.itemId === f.itemId && t.rubroId === f.rubroId), (t) => t.hours);
    return { budget, planned, real };
  })();
  const assigned = entry ? assignedHours(w, (a) => a.projectId === entry.projectId && a.itemId === entry.itemId && a.rubroId === entry.rubroId, entry.date) : 0;
  return (
    <FormDialog
      trigger={entry ? <Button size="sm" variant="ghost">Editar</Button> : <Button><Plus /> Planificar</Button>}
      title={entry ? "Editar trabajo planificado" : "Planificar"}
      submitLabel="Guardar"
      note={entry && assigned > 0 ? `Ese día ya hay ${num(assigned, "h")} asignadas a operarios: revisalas en Operarios si cambia lo planificado.` : undefined}
      onSubmit={() => act((cw, ctx) => op.savePlan(cw, { id: entry?.id, projectId: f.projectId, itemId: f.itemId, rubroId: f.rubroId, date: f.date, hours: num2(f.hours) }, ctx))}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Fecha" htmlFor="pl-d"><Input id="pl-d" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="OT" htmlFor="pl-p">
          <Select id="pl-p" value={f.projectId} onChange={(e) => setF({ ...f, projectId: e.target.value, itemId: "", rubroId: "" })}>
            <option value="">Elegí…</option>
            {projects.map((x) => <option key={x.id} value={x.id}>{x.ot.split("_")[0]} · {clientName(w, x.clientId)}</option>)}
          </Select>
        </Field>
        <Field label="Mueble" htmlFor="pl-i">
          <Select id="pl-i" value={f.itemId} disabled={!p} onChange={(e) => setF({ ...f, itemId: e.target.value, rubroId: "" })}>
            <option value="">Elegí…</option>
            {p?.items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </Select>
        </Field>
        <Field label="Rubro" htmlFor="pl-r">
          <Select id="pl-r" value={f.rubroId} disabled={!f.itemId} onChange={(e) => setF({ ...f, rubroId: e.target.value })}>
            <option value="">Elegí…</option>
            {rubros.map((r) => <option key={r} value={r}>{rubroName(w, r)}</option>)}
          </Select>
        </Field>
        <Field label="Horas" htmlFor="pl-h" hint={ref ? `Presupuestadas ${num(ref.budget)} h · planificadas ${num(ref.planned)} h · reales ${num(ref.real)} h` : undefined}>
          <Input id="pl-h" inputMode="decimal" value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} />
        </Field>
      </div>
    </FormDialog>
  );
}

