"use client";
// Gerencia → ficha de la OT (modo demostración). Costos reales por lote y por hora histórica, costo financiero por
// tramos, ingresos efectivos, OCs imputables y cierre con condiciones.
import Link from "next/link";
import { useState } from "react";
import type { Project } from "@/lib/core/types";
import * as op from "@/lib/core/ops";
import { closeCheck } from "@/lib/core/closing";
import { contractAt, scheduleStatus } from "@/lib/core/contract";
import { usedByItem } from "@/lib/core/dashboard";
import { economics, laborCosts, materialCosts, otherCostsOf, STAGE_LABEL, updatedFinancial } from "@/lib/core/economics";
import { clientName, employeeName, itemName, materialName, materialUnit, rubroName, supplierName } from "@/lib/core/lookup";
import { budgetLinesOf, publishedBom } from "@/lib/core/needs";
import { lineReceived, orderPartFor, ordersOfProject, paidByProject } from "@/lib/core/orders";
import { ITEM_STATE_LABELS, itemState } from "@/lib/core/plant";
import { movementsValue } from "@/lib/core/stock";
import { money as m2, qty, sumBy } from "@/lib/core/util";
import { PageHeader } from "@/components/shared/page-header";
import { Stat } from "@/components/shared/stat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { day, Empty, FormDialog, money, num, num2, pct, Section, StatusBadge, useAct, useCore, useDemoToday, useFlash } from "../kit";

const TABS = ["muebles", "presupuesto", "materiales", "horas", "otros", "ingresos", "historial"];

export function GerenciaProjectDemo({ project, tab }: { project: Project; tab?: string }) {
  const w = useCore();
  const today = useDemoToday();
  const e = economics(w, project, today);
  const check = closeCheck(w, project);
  const act = useAct();
  const flash = useFlash();
  const closure = w.closures.find((c) => c.projectId === project.id);
  return (
    <div className="space-y-5">
      <PageHeader
        title={project.ot}
        back="/projects"
        actions={
          <>
            <StatusBadge status={project.status} />
            {project.status === "production" && (
              <FormDialog
                trigger={<Button size="sm">Cerrar OT</Button>}
                title="Cerrar OT"
                submitLabel="Cerrar"
                onSubmit={() => act((cw, ctx) => op.closeProject(cw, project.id, ctx))}
                note={check.canClose ? "Queda la foto final de los costos operativos. El costo financiero sigue actualizándose hasta cobrar todo." : undefined}
              >
                {check.canClose ? <p className="text-sm text-slate-700">Todo terminado, rendido y entregado.</p> : (
                  <ul className="list-disc space-y-1 pl-5 text-sm text-red-700">
                    {check.blockers.map((b) => <li key={b}>{b}</li>)}
                  </ul>
                )}
              </FormDialog>
            )}
          </>
        }
      />
      <p className="-mt-4 text-sm text-slate-600">
        {clientName(w, project.clientId)} · {project.description} · inicio {day(project.startDate)} · entrega {day(project.dueDate)}
        {closure && ` · cerrada el ${day(closure.date)}`}
      </p>
      {flash.node}
      {project.baseline ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="Contrato vigente" value={money(e.contract)} hint={`Cobrado ${money(e.collected)}`} />
          <Stat label="Costo real" value={money(e.realCost)} hint={`Operativo ${money(e.operatingCost)} + financiero ${money(e.financialUpdated)}`} />
          <Stat label={e.stage === "final" ? "Ganancia final" : "Ganancia hasta hoy"} value={money(e.profit)} tone={e.profit !== null && e.profit < 0 ? "red" : "default"} />
          <Stat label={e.stage === "final" ? "Rentabilidad final" : "Rentabilidad hasta hoy"} value={pct(e.marginPct)} hint={`${STAGE_LABEL[e.stage]} · cotizada ${pct(e.quotedMarginPct)}`} />
          <Stat label="Costo financiero" value={money(e.financialUpdated)} hint={`Previsto a hoy ${money(e.financialBudgetToDate)} · adicional ${money(e.financialAdditional)}`} />
        </div>
      ) : (
        <p className="text-sm text-slate-600">En cotización: todavía no hay contrato ni costos reales.</p>
      )}
      {e.incomplete.length > 0 && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">Información incompleta: {e.incomplete.join(" ")}</p>}
      <Tabs defaultValue={tab && TABS.includes(tab) ? tab : "muebles"}>
        <TabsList>
          <TabsTrigger value="muebles">Muebles</TabsTrigger>
          <TabsTrigger value="presupuesto">Presupuesto original</TabsTrigger>
          <TabsTrigger value="materiales">Materiales</TabsTrigger>
          <TabsTrigger value="horas">Horas</TabsTrigger>
          <TabsTrigger value="otros">Otros costos</TabsTrigger>
          <TabsTrigger value="ingresos">Ingresos y OC</TabsTrigger>
          <TabsTrigger value="historial">Historial</TabsTrigger>
        </TabsList>
        <TabsContent value="muebles"><Furniture project={project} /></TabsContent>
        <TabsContent value="presupuesto"><Budget project={project} /></TabsContent>
        <TabsContent value="materiales"><Materials project={project} /></TabsContent>
        <TabsContent value="horas"><Hours project={project} /></TabsContent>
        <TabsContent value="otros"><Others project={project} /></TabsContent>
        <TabsContent value="ingresos"><Money project={project} /></TabsContent>
        <TabsContent value="historial">
          <Section title="Historial">
            <ul className="space-y-1.5 text-sm">
              {project.activity.map((a) => (
                <li key={a.id}>
                  <span className="text-xs text-slate-500">{day(a.date)} · {a.by}{a.auto ? " · automático" : ""}</span>
                  <span className="block">{a.text}</span>
                </li>
              ))}
            </ul>
          </Section>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Furniture({ project }: { project: Project }) {
  const w = useCore();
  const lines = budgetLinesOf(w, project).filter((l) => l.kind === "material");
  const used = usedByItem(w, project.id);
  return (
    <Section title="Muebles del proyecto">
      <div className="space-y-4">
        {project.items.map((it) => {
          const mats = [...new Set([...lines.filter((l) => l.itemId === it.id).map((l) => l.materialId as string), ...[...used.keys()].filter((k) => k.startsWith(`${it.id}|`)).map((k) => k.split("|")[1])])];
          return (
            <div key={it.id}>
              <div className="mb-1 flex items-center gap-2 text-sm font-medium text-slate-800">
                {it.name} · {it.completedUnits}/{it.quantity} <Badge tone={itemState(it) === "done" ? "green" : "blue"}>{ITEM_STATE_LABELS[itemState(it)]}</Badge>
              </div>
              <Table>
                <THead>
                  <TR>
                    <TH>Material</TH>
                    <TH className="text-right">Cantidad cotizada</TH>
                    <TH className="text-right">Cantidad real</TH>
                    <TH className="text-right">Desvío</TH>
                  </TR>
                </THead>
                <TBody>
                  {mats.map((m) => {
                    const u = materialUnit(w, m);
                    const qd = sumBy(lines.filter((l) => l.itemId === it.id && l.materialId === m), (l) => l.quantity);
                    const ud = used.get(`${it.id}|${m}`) ?? { consumed: 0, waste: 0 };
                    const real = qty(ud.consumed + ud.waste);
                    return (
                      <TR key={m}>
                        <TD>{materialName(w, m)}</TD>
                        <TD className="text-right tabular">{num(qd, u)}</TD>
                        <TD className="text-right tabular">{num(real, u)}</TD>
                        <TD className={cn("text-right tabular", real > qd && "text-red-700")}>{num(qty(real - qd), u)}</TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function Budget({ project }: { project: Project }) {
  const w = useCore();
  const b = project.baseline;
  if (!b) return <Empty>La cotización todavía no se aprobó.</Empty>;
  const bom = publishedBom(w, project.id);
  const adds = w.additionals.filter((a) => a.projectId === project.id);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title={`Cotización aprobada el ${day(b.approvedAt)}`}>
        <dl className="space-y-1 text-sm">
          {[
            ["Materiales", b.costs.materials],
            ["Mano de obra", b.costs.labor],
            ["Personal (diseño, administración)", b.costs.staff],
            ...b.generalCosts.map((g) => [g.name, g.amount] as [string, number]),
            ["Costo financiero previsto", b.costs.financial],
          ].map(([k, v]) => (
            <div key={k as string} className="flex justify-between gap-2"><dt className="text-slate-600">{k}</dt><dd className="tabular">{money(v as number)}</dd></div>
          ))}
          <div className="flex justify-between gap-2 border-t border-slate-100 pt-1 font-medium"><dt>Costo total cotizado</dt><dd className="tabular">{money(b.costs.total)}</dd></div>
          <div className="flex justify-between gap-2"><dt className="text-slate-600">Precio sugerido</dt><dd className="tabular">{money(b.suggestedPrice)}</dd></div>
          <div className="flex justify-between gap-2"><dt className="text-slate-600">Descuento</dt><dd className="tabular">{money(b.discount)}</dd></div>
          <div className="flex justify-between gap-2 font-medium"><dt>Precio acordado</dt><dd className="tabular">{money(b.agreedPrice)}</dd></div>
          <div className="flex justify-between gap-2"><dt className="text-slate-600">Rentabilidad cotizada</dt><dd className="tabular">{pct(b.quotedMarginPct)}</dd></div>
          <div className="flex justify-between gap-2 text-xs text-slate-500"><dt>Objetivo materiales / mano de obra</dt><dd>{pct(b.marginMaterialsPct)} / {pct(b.marginLaborPct)}</dd></div>
        </dl>
        {adds.length > 0 && (
          <p className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-600">
            Adicionales: {adds.map((a) => `${rubroName(w, a.rubroId)} en ${itemName(project, a.itemId)} (${money(sumBy(a.lines, (l) => l.quantity * l.unitCost))} de costo${a.price ? `, ${money(a.price)} al cliente` : ""})`).join(" · ")}
          </p>
        )}
      </Section>
      <Section title="Materiales: cotizado vs. BOM publicado">
        <Table>
          <THead>
            <TR>
              <TH>Mueble · material</TH>
              <TH className="text-right">Cotizado</TH>
              <TH className="text-right">BOM {bom ? `v${bom.version}` : ""}</TH>
            </TR>
          </THead>
          <TBody>
            {project.items.flatMap((it) => {
              const ql = b.lines.filter((l) => l.itemId === it.id && l.kind === "material");
              const keys = [...new Set([...ql.map((l) => l.materialId as string), ...(bom?.lines.filter((l) => l.itemId === it.id).map((l) => l.materialId) ?? [])])];
              return keys.map((m) => {
                const u = materialUnit(w, m);
                const qv = sumBy(ql.filter((l) => l.materialId === m), (l) => l.quantity);
                const bv = bom ? sumBy(bom.lines.filter((l) => l.itemId === it.id && l.materialId === m), (l) => l.quantity) : null;
                return (
                  <TR key={`${it.id}${m}`}>
                    <TD>{it.name} · {materialName(w, m)}</TD>
                    <TD className="text-right tabular">{num(qv, u)}</TD>
                    <TD className={cn("text-right tabular", bv !== null && bv !== qv && "font-medium text-amber-700")}>{bv === null ? "—" : num(bv, u)}</TD>
                  </TR>
                );
              });
            })}
          </TBody>
        </Table>
      </Section>
    </div>
  );
}

function Materials({ project }: { project: Project }) {
  const w = useCore();
  const today = useDemoToday();
  const mc = materialCosts(w, project.id, today);
  const lines = budgetLinesOf(w, project).filter((l) => l.kind === "material");
  const returned = w.movements.filter((m) => m.kind === "return" && w.releases.some((r) => r.projectId === project.id && `prod:${r.id}` === m.from));
  const mats = [...new Set([...lines.map((l) => l.materialId as string), ...mc.rows.map((r) => r.materialId)])];
  const purchased = ordersOfProject(w, project.id).flatMap((o) => o.lines.filter((l) => l.projectId === project.id));
  return (
    <Section title="Materiales">
      <Table>
        <THead>
          <TR>
            <TH>Material</TH>
            <TH className="text-right">Estimado</TH>
            <TH className="text-right">Costo estimado</TH>
            <TH className="text-right">Consumido</TH>
            <TH className="text-right">Desperdiciado</TH>
            <TH className="text-right">Devuelto a stock</TH>
            <TH className="text-right">Costo real</TH>
            <TH className="text-right">Diferencia</TH>
          </TR>
        </THead>
        <TBody>
          {mats.map((m) => {
            const u = materialUnit(w, m);
            const est = lines.filter((l) => l.materialId === m);
            const estQ = sumBy(est, (l) => l.quantity);
            const estC = m2(sumBy(est, (l) => l.quantity * l.unitCost));
            const r = mc.rows.find((x) => x.materialId === m);
            const ret = qty(sumBy(returned.filter((x) => w.lots.find((l) => l.id === x.lotId)?.materialId === m), (x) => x.quantity));
            const real = m2((r?.consumedCost ?? 0) + (r?.wasteCost ?? 0));
            return (
              <TR key={m}>
                <TD>{materialName(w, m)}</TD>
                <TD className="text-right tabular">{num(estQ, u)}</TD>
                <TD className="text-right tabular">{money(estC)}</TD>
                <TD className="text-right tabular">{num(r?.consumedQty ?? 0, u)}</TD>
                <TD className="text-right tabular">{num(r?.wasteQty ?? 0, u)}</TD>
                <TD className="text-right tabular">{num(ret, u)}</TD>
                <TD className="text-right tabular">{money(real)}</TD>
                <TD className={cn("text-right tabular", real > estC && "text-red-700")}>{money(m2(real - estC))}</TD>
              </TR>
            );
          })}
          <TR className="font-medium">
            <TD>Total</TD>
            <TD />
            <TD className="text-right tabular">{money(m2(sumBy(lines, (l) => l.quantity * l.unitCost)))}</TD>
            <TD colSpan={3} className="text-right text-xs font-normal text-slate-500">desperdicio {money(mc.waste)}</TD>
            <TD className="text-right tabular">{money(mc.total)}</TD>
            <TD />
          </TR>
        </TBody>
      </Table>
      <p className="mt-3 text-xs text-slate-500">
        Costo real = consumido + desperdiciado, con el costo de cada lote. Lo comprado para la OT ({money(m2(sumBy(purchased, (l) => l.quantity * l.unitPrice)))} en OCs) es informativo: el sobrante devuelto sigue en stock. Valor devuelto: {money(movementsValue(w, returned))}.
      </p>
    </Section>
  );
}

function Hours({ project }: { project: Project }) {
  const w = useCore();
  const today = useDemoToday();
  const { labor, staff } = laborCosts(w, project.id, today);
  const lines = budgetLinesOf(w, project).filter((l) => l.kind === "labor");
  const keys = [...new Set([...lines.map((l) => `${l.itemId}|${l.rubroId}`), ...labor.entries.map((c) => `${c.entry.itemId}|${c.entry.rubroId}`)])];
  return (
    <div className="space-y-4">
      <Section title="Mano de obra por mueble y rubro">
        <Table>
          <THead>
            <TR>
              <TH>Mueble</TH>
              <TH>Rubro</TH>
              <TH className="text-right">Horas cotizadas</TH>
              <TH className="text-right">Horas reales</TH>
              <TH className="text-right">Costo cotizado</TH>
              <TH className="text-right">Costo real</TH>
            </TR>
          </THead>
          <TBody>
            {keys.map((k) => {
              const [itemId, rubroId] = k.split("|");
              const bl = lines.filter((l) => l.itemId === itemId && l.rubroId === rubroId);
              const rl = labor.entries.filter((c) => c.entry.itemId === itemId && c.entry.rubroId === rubroId);
              return (
                <TR key={k}>
                  <TD>{itemName(project, itemId)}</TD>
                  <TD>{rubroName(w, rubroId)}</TD>
                  <TD className="text-right tabular">{num(sumBy(bl, (l) => l.quantity), "h")}</TD>
                  <TD className="text-right tabular">{num(sumBy(rl, (c) => c.entry.hours), "h")}</TD>
                  <TD className="text-right tabular">{money(m2(sumBy(bl, (l) => l.quantity * l.unitCost)))}</TD>
                  <TD className="text-right tabular">{money(m2(sumBy(rl, (c) => c.cost ?? 0)))}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Section>
      <Section title="Registros de horas">
        <Table>
          <THead>
            <TR>
              <TH>Fecha</TH>
              <TH>Persona</TH>
              <TH>Tarea</TH>
              <TH className="text-right">Horas</TH>
              <TH className="text-right">Costo/h</TH>
              <TH className="text-right">Extra</TH>
              <TH className="text-right">Costo</TH>
              <TH>Revisión</TH>
            </TR>
          </THead>
          <TBody>
            {[...labor.entries, ...staff.entries]
              .sort((a, b) => b.entry.date.localeCompare(a.entry.date))
              .map((c) => (
                <TR key={c.entry.id}>
                  <TD className="whitespace-nowrap">{day(c.entry.date)}</TD>
                  <TD>{employeeName(w, c.entry.employeeId)}</TD>
                  <TD className="text-xs">{c.entry.itemId ? itemName(project, c.entry.itemId) : "General"}{c.entry.rubroId ? ` · ${rubroName(w, c.entry.rubroId)}` : ""}{c.entry.note ? ` · ${c.entry.note}` : ""}</TD>
                  <TD className="text-right tabular">{num(c.entry.hours)}</TD>
                  <TD className="text-right tabular">{money(c.rate)}</TD>
                  <TD className="text-right tabular">{c.overtimeHours ? `${num(c.overtimeHours)} h × ${c.multiplier}` : "—"}</TD>
                  <TD className="text-right tabular">{money(c.cost)}</TD>
                  <TD className="text-xs text-slate-500">{c.entry.review ? (c.entry.review.status === "corrected" ? "Corregida" : "Confirmada") : "Pendiente"}</TD>
                </TR>
              ))}
          </TBody>
        </Table>
        <p className="mt-2 text-xs text-slate-500">
          Obreros {num(labor.hours, "h")} · {money(labor.cost)} — Personal {num(staff.hours, "h")} · {money(staff.cost)}. Costo/h vigente en la fecha de cada registro.
        </p>
      </Section>
    </div>
  );
}

function Others({ project }: { project: Project }) {
  const w = useCore();
  const act = useAct();
  const today = useDemoToday();
  const list = otherCostsOf(w, project.id);
  const [f, setF] = useState({ date: today, description: "", categoryId: w.config.otherCostCategories.find((c) => c.active)?.id ?? "", amount: "" });
  return (
    <Section
      title="Otros costos reales"
      actions={
        project.baseline && (
          <FormDialog trigger={<Button size="sm">Registrar costo</Button>} title="Otro costo real" submitLabel="Registrar" onSubmit={() => act((cw, ctx) => op.addOtherCost(cw, { projectId: project.id, date: f.date, description: f.description, categoryId: f.categoryId, amount: num2(f.amount) }, ctx))}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Fecha" htmlFor="oc-d"><Input id="oc-d" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
              <Field label="Categoría" htmlFor="oc-c">
                <Select id="oc-c" value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>
                  {w.config.otherCostCategories.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <Field label="Descripción" htmlFor="oc-x"><Input id="oc-x" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
              <Field label="Monto (sin IVA)" htmlFor="oc-m"><Input id="oc-m" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
            </div>
          </FormDialog>
        )
      }
    >
      {list.length === 0 ? (
        <Empty>Sin otros costos.</Empty>
      ) : (
        <Table>
          <THead><TR><TH>Fecha</TH><TH>Descripción</TH><TH>Categoría</TH><TH className="text-right">Monto</TH><TH>Usuario</TH></TR></THead>
          <TBody>
            {list.map((c) => (
              <TR key={c.id}><TD>{day(c.date)}</TD><TD>{c.description}</TD><TD>{w.config.otherCostCategories.find((x) => x.id === c.categoryId)?.name}</TD><TD className="text-right tabular">{money(c.amount)}</TD><TD>{c.createdBy}</TD></TR>
            ))}
          </TBody>
        </Table>
      )}
    </Section>
  );
}

function Money({ project }: { project: Project }) {
  const w = useCore();
  const act = useAct();
  const today = useDemoToday();
  const incomes = w.incomes.filter((i) => i.projectId === project.id);
  const sched = project.baseline ? scheduleStatus(w, project, today) : [];
  const fin = project.baseline ? updatedFinancial(w, project, today) : null;
  const [inc, setInc] = useState({ date: today, amount: "", reference: "" });
  const contract = contractAt(w, project, today);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Section
          title="Ingresos"
          actions={
            project.baseline && (
              <FormDialog trigger={<Button size="sm">Registrar ingreso</Button>} title="Registrar ingreso" submitLabel="Registrar ingreso" note="Solo dinero que realmente ingresó, con su fecha efectiva." onSubmit={() => act((cw, ctx) => op.registerIncome(cw, { projectId: project.id, date: inc.date, amount: num2(inc.amount), reference: inc.reference }, ctx))}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Fecha de ingreso" htmlFor="in-d"><Input id="in-d" type="date" value={inc.date} onChange={(e) => setInc({ ...inc, date: e.target.value })} /></Field>
                  <Field label="Importe (sin IVA)" htmlFor="in-a"><Input id="in-a" inputMode="decimal" value={inc.amount} onChange={(e) => setInc({ ...inc, amount: e.target.value })} /></Field>
                  <Field label="Referencia (factura o cuota, opcional)" htmlFor="in-r"><Input id="in-r" value={inc.reference} onChange={(e) => setInc({ ...inc, reference: e.target.value })} /></Field>
                </div>
              </FormDialog>
            )
          }
        >
          {incomes.length === 0 ? <Empty>Sin ingresos.</Empty> : (
            <Table>
              <TBody>
                {incomes.map((i) => (
                  <TR key={i.id}><TD>{day(i.date)}</TD><TD className="text-xs text-slate-600">{i.reference}</TD><TD className="text-right tabular">{money(i.amount)}</TD></TR>
                ))}
              </TBody>
            </Table>
          )}
          <p className="mt-2 text-sm">Cobrado {money(m2(sumBy(incomes, (i) => i.amount)))} de {money(contract)} · saldo {money(contract === null ? null : Math.max(0, contract - sumBy(incomes, (i) => i.amount)))}</p>
        </Section>
        <Section title="Cobros acordados">
          {sched.length === 0 ? <Empty>Sin cobros previstos.</Empty> : (
            <Table>
              <THead><TR><TH>Cuota</TH><TH>Fecha</TH><TH className="text-right">Importe</TH><TH className="text-right">Pendiente</TH><TH>Días</TH></TR></THead>
              <TBody>
                {sched.map((s) => (
                  <TR key={s.payment.id}>
                    <TD>{s.payment.label}</TD>
                    <TD>{day(s.payment.date)}</TD>
                    <TD className="text-right tabular">{money(s.payment.amount)}</TD>
                    <TD className={cn("text-right tabular", s.overdue && "font-medium text-red-700")}>{money(s.pending)}</TD>
                    <TD className="text-xs text-slate-600">{s.pending <= 0 ? "Cubierta" : s.overdue ? `Vencida hace ${-s.daysToDue}` : `Faltan ${s.daysToDue}`}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Section>
      </div>
      {fin && (
        <Section title="Costo financiero actualizado">
          {fin.tramos.length === 0 ? <Empty>Sin capital inmovilizado hasta hoy.</Empty> : (
            <Table>
              <THead><TR><TH>Desde</TH><TH>Hasta</TH><TH className="text-right">Días</TH><TH className="text-right">Capital inmovilizado</TH><TH className="text-right">Costo</TH></TR></THead>
              <TBody>
                {fin.tramos.map((t) => (
                  <TR key={t.from}><TD>{day(t.from)}</TD><TD>{day(t.to)}</TD><TD className="text-right tabular">{t.days}</TD><TD className="text-right tabular">{money(t.capital)}</TD><TD className="text-right tabular">{money(t.amount)}</TD></TR>
                ))}
              </TBody>
            </Table>
          )}
          <p className="mt-2 text-xs text-slate-500">
            Tasa {fin.ratePct} % mensual, interés simple, 30 días. Total {money(fin.total)}. Parte del cálculo usa supuestos (horas pagadas el día trabajado; material sin pago cargado, invertido al recibir).{" "}
            <Link href="/settings?s=indicadores#ind-financiero" className="text-blue-700 hover:underline">Ver cálculo</Link>
          </p>
        </Section>
      )}
      <Section title="Órdenes de compra de esta OT">
        <OrdersOf project={project} />
      </Section>
    </div>
  );
}

function OrdersOf({ project }: { project: Project }) {
  const w = useCore();
  const act = useAct();
  const today = useDemoToday();
  const orders = ordersOfProject(w, project.id);
  const [pay, setPay] = useState({ date: today, amount: "", reference: "", only: false });
  if (orders.length === 0) return <Empty>Sin órdenes de compra.</Empty>;
  return (
    <ul className="divide-y divide-slate-100">
      {orders.map((o) => {
        const part = orderPartFor(o, project.id);
        const paid = paidByProject(w, o).get(project.id) ?? 0;
        const multi = o.lines.some((l) => l.projectId !== project.id);
        return (
          <li key={o.id} className="py-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                <strong>{o.number}</strong> · {supplierName(w, o.supplierId)} · {day(o.date)} · {o.createdBy}
                {multi && <Badge tone="gray" className="ml-2">Compartida con otras OTs</Badge>}
              </span>
              <span className="flex items-center gap-3">
                <span className="tabular">Esta OT: {money(part.amount)} · pagado atribuido {money(paid)}</span>
                <FormDialog
                  trigger={<Button size="sm" variant="outline">Registrar pago</Button>}
                  title={`Pago a proveedor · ${o.number}`}
                  submitLabel="Registrar pago"
                  note="Sin marcar la OT, el pago se reparte entre las OTs según el valor de sus líneas. Es atribución del desembolso: no suma costo de material."
                  onSubmit={() => act((cw, ctx) => op.registerSupplierPayment(cw, { orderId: o.id, date: pay.date, amount: num2(pay.amount), reference: pay.reference, projectId: pay.only ? project.id : undefined }, ctx))}
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Fecha del pago" htmlFor="pg-d"><Input id="pg-d" type="date" value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} /></Field>
                    <Field label="Importe" htmlFor="pg-a"><Input id="pg-a" inputMode="decimal" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></Field>
                    <Field label="Referencia" htmlFor="pg-r"><Input id="pg-r" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} /></Field>
                    {multi && (
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input type="checkbox" checked={pay.only} onChange={(e) => setPay({ ...pay, only: e.target.checked })} /> Solo para {project.ot.split("_")[0]}
                      </label>
                    )}
                  </div>
                </FormDialog>
              </span>
            </div>
            <ul className="mt-1 text-xs text-slate-600">
              {part.lines.map((l) => (
                <li key={l.id}>
                  {materialName(w, l.materialId)}: {num(l.quantity, materialUnit(w, l.materialId))} × {money(l.unitPrice)} · recibido {num(lineReceived(w, l.id))}
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}

