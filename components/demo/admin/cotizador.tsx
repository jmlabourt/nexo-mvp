"use client";
// Administración → Cotizador (modo demostración). Cotizaciones en curso (borradores, enviadas, en negociación) y el
// editor por mueble → rubro: horas y materiales del catálogo. Precio por rentabilidad objetivo (margen sobre el precio:
// costo / (1 − m)), costos generales, costo financiero previsto normal, cuotas y descuento. Aprobar congela la cotización.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Project, Quote, QuoteLine, StaffLine } from "@/lib/core/types";
import * as op from "@/lib/core/ops";
import { approvalErrors, quoteTotals } from "@/lib/core/quote";
import { clientName, materialName, materialUnit, rateAt } from "@/lib/core/lookup";
import { r2 } from "@/lib/core/util";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { day, Empty, FormDialog, money, num2, pct, SearchSelect, Section, useAct, useCore, useDemoToday, useFlash } from "../kit";

export function CotizadorDemo({ id, nuevo }: { id?: string; nuevo?: boolean }) {
  const w = useCore();
  const project = id ? w.projects.find((p) => p.id === id) : undefined;
  if (project && project.status === "quotation") return <QuoteEditor key={project.id} project={project} />;
  return <QuoteList openNew={!!nuevo} />;
}

function QuoteList({ openNew }: { openNew: boolean }) {
  const w = useCore();
  const act = useAct();
  const router = useRouter();
  const today = useDemoToday();
  const [f, setF] = useState({ clientId: "", description: "", startDate: today, dueDate: today, item: "", qty: "1" });
  const [open, setOpen] = useState(openNew);
  const quotes = w.projects.filter((p) => p.status === "quotation").sort((a, b) => b.otNumber - a.otNumber);
  return (
    <div className="space-y-4">
      <PageHeader title="Cotizador" actions={<Button onClick={() => setOpen(true)}><Plus /> Nueva cotización</Button>} />
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title="Nueva cotización"
        submitLabel="Crear y cotizar"
        note="La OT se numera sola con el nomenclador de Gerencia."
        onSubmit={() => {
          const r = act<string>((cw, ctx) => op.createProject(cw, { clientId: f.clientId, description: f.description, startDate: f.startDate, dueDate: f.dueDate, items: f.item ? [{ name: f.item, quantity: Number(f.qty) }] : [] }, ctx));
          if (r.ok && r.value) router.push(`/quotes?ot=${r.value}`);
          return r;
        }}
      >
        <Field label="Cliente" htmlFor="nq-c" hint="Si no está, cargalo en Clientes.">
          <SearchSelect id="nq-c" value={f.clientId} onChange={(v) => setF({ ...f, clientId: v })} options={w.clients.filter((c) => c.active).map((c) => ({ value: c.id, label: c.name }))} />
        </Field>
        <Field label="Descripción" htmlFor="nq-d"><Input id="nq-d" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Inicio" htmlFor="nq-s"><Input id="nq-s" type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></Field>
          <Field label="Entrega" htmlFor="nq-e"><Input id="nq-e" type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field>
          <Field label="Primer mueble" htmlFor="nq-i"><Input id="nq-i" value={f.item} onChange={(e) => setF({ ...f, item: e.target.value })} /></Field>
          <Field label="Cantidad" htmlFor="nq-q"><Input id="nq-q" inputMode="numeric" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} /></Field>
        </div>
      </FormDialog>
      <Section title="Cotizaciones en curso">
        {quotes.length === 0 ? <Empty>No hay cotizaciones en curso.</Empty> : (
          <Table>
            <THead><TR><TH>OT</TH><TH>Estado</TH><TH>Inicio</TH><TH>Entrega</TH><TH className="text-right">Precio</TH><TH /></TR></THead>
            <TBody>
              {quotes.map((p) => (
                <TR key={p.id}>
                  <TD>
                    <Link href={`/quotes?ot=${p.id}`} className="break-all font-medium text-blue-800 hover:underline">{p.ot}</Link>
                    <span className="block text-xs text-slate-500">{clientName(w, p.clientId)}</span>
                  </TD>
                  <TD className="text-sm">{op.QUOTE_STATE_LABELS[p.quote.state]}</TD>
                  <TD>{day(p.startDate)}</TD>
                  <TD>{day(p.dueDate)}</TD>
                  <TD className="text-right tabular">{p.quote.lines.length ? money(quoteTotals(p.quote, p, w.config.financialMonthlyRatePct).agreedPrice) : "—"}</TD>
                  <TD className="text-right">
                    <Button asChild size="sm" variant="outline"><Link href={`/quotes?ot=${p.id}`}>Abrir</Link></Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Section>
    </div>
  );
}

type EditItem = { id: string; name: string; quantity: number };

function QuoteEditor({ project }: { project: Project }) {
  const w = useCore();
  const act = useAct();
  const router = useRouter();
  const today = useDemoToday();
  const flash = useFlash();
  const [items, setItems] = useState<EditItem[]>(project.items.map((i) => ({ id: i.id, name: i.name, quantity: i.quantity })));
  const [quote, setQuote] = useState<Quote>(project.quote);
  const [dates, setDates] = useState({ startDate: project.startDate, dueDate: project.dueDate });
  const [reason, setReason] = useState("");
  const t = useMemo(() => quoteTotals(quote, dates, w.config.financialMonthlyRatePct), [quote, dates, w.config.financialMonthlyRatePct]);
  const errors = approvalErrors({ ...project, items: items.map((i) => ({ ...i, completedUnits: 0 })), quote, ...dates });
  const setLines = (lines: QuoteLine[]) => setQuote({ ...quote, lines });
  const uid = () => `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  const save = () => {
    const r1 = act((cw, ctx) => op.updateProjectInfo(cw, project.id, dates, ctx));
    if (!r1.ok) return r1;
    return act((cw, ctx) => op.saveQuote(cw, project.id, { quote, items }, ctx));
  };

  return (
    <div className="space-y-4">
      <PageHeader title={project.ot} back="/quotes" actions={<span className="text-sm text-slate-600">{op.QUOTE_STATE_LABELS[project.quote.state]}</span>} />
      <p className="-mt-4 text-sm text-slate-600">{clientName(w, project.clientId)} · {project.description}</p>
      <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          <Section title="Fechas">
            <div className="flex flex-wrap gap-3">
              <Field label="Inicio" htmlFor="q-s"><Input id="q-s" type="date" value={dates.startDate} onChange={(e) => setDates({ ...dates, startDate: e.target.value })} /></Field>
              <Field label="Entrega" htmlFor="q-e"><Input id="q-e" type="date" value={dates.dueDate} onChange={(e) => setDates({ ...dates, dueDate: e.target.value })} /></Field>
            </div>
          </Section>
          {items.map((it) => (
            <ItemCard
              key={it.id}
              item={it}
              lines={quote.lines.filter((l) => l.itemId === it.id)}
              onItem={(patch) => setItems(items.map((x) => (x.id === it.id ? { ...x, ...patch } : x)))}
              onRemove={() => { setItems(items.filter((x) => x.id !== it.id)); setLines(quote.lines.filter((l) => l.itemId !== it.id)); }}
              onLines={(ls) => setLines([...quote.lines.filter((l) => l.itemId !== it.id), ...ls])}
              newId={uid}
              date={today}
            />
          ))}
          <Button variant="outline" onClick={() => setItems([...items, { id: uid(), name: "", quantity: 1 }])}><Plus /> Agregar mueble</Button>
          <StaffCard lines={quote.staffLines} onChange={(staffLines) => setQuote({ ...quote, staffLines })} newId={uid} date={today} />
          <Section title="Cobros previstos (seña y cuotas)">
            <Table>
              <THead><TR><TH>Concepto</TH><TH>% del precio</TH><TH>Fecha</TH><TH className="text-right">Importe</TH><TH /></TR></THead>
              <TBody>
                {quote.plan.map((c, i) => (
                  <TR key={c.id}>
                    <TD><Input aria-label="Concepto" className="h-8" value={c.label} onChange={(e) => setQuote({ ...quote, plan: quote.plan.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })} /></TD>
                    <TD><Input aria-label="Porcentaje" className="h-8 w-20" inputMode="decimal" value={String(c.pct)} onChange={(e) => setQuote({ ...quote, plan: quote.plan.map((x, k) => (k === i ? { ...x, pct: num2(e.target.value) || 0 } : x)) })} /></TD>
                    <TD><Input aria-label="Fecha" type="date" className="h-8" value={c.date} onChange={(e) => setQuote({ ...quote, plan: quote.plan.map((x, k) => (k === i ? { ...x, date: e.target.value } : x)) })} /></TD>
                    <TD className="text-right tabular">{money(t.plan[i]?.amount)}</TD>
                    <TD><button type="button" aria-label="Quitar" className="text-slate-400 hover:text-red-600" onClick={() => setQuote({ ...quote, plan: quote.plan.filter((_, k) => k !== i) })}><Trash2 className="size-4" /></button></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <div className="mt-2 flex items-center justify-between">
              <Button size="sm" variant="outline" onClick={() => setQuote({ ...quote, plan: [...quote.plan, { id: uid(), label: quote.plan.length ? "Cuota" : "Seña", pct: Math.max(0, 100 - r2(t.planPct)), date: quote.plan.length ? dates.dueDate : dates.startDate }] })}><Plus /> Agregar cobro</Button>
              <span className={t.planPct === 100 ? "text-xs text-slate-500" : "text-xs font-medium text-amber-700"}>Suman {r2(t.planPct)} %</span>
            </div>
          </Section>
        </div>
        <div className="space-y-4">
          <Section title="Resultado">
            <div className="mb-3 grid grid-cols-2 gap-2">
              <Field label="Rentabilidad materiales %" htmlFor="q-mm"><Input id="q-mm" inputMode="decimal" value={String(quote.marginMaterialsPct)} onChange={(e) => setQuote({ ...quote, marginMaterialsPct: num2(e.target.value) || 0 })} /></Field>
              <Field label="Rentabilidad mano de obra %" htmlFor="q-ml"><Input id="q-ml" inputMode="decimal" value={String(quote.marginLaborPct)} onChange={(e) => setQuote({ ...quote, marginLaborPct: num2(e.target.value) || 0 })} /></Field>
            </div>
            <dl className="space-y-1 text-sm">
              <Row k="Materiales" v={money(t.materials)} />
              <Row k="Mano de obra" v={money(t.labor)} />
              <Row k="Personal (diseño, administración)" v={money(t.staff)} />
              {t.generalLines.map((g) => <Row key={g.id} k={g.name} v={money(g.amount)} />)}
              <Row k="Costo financiero previsto" v={money(t.financial.total)} />
              <Row k="Costo total" v={money(t.totalCost)} strong />
              <Row k="Precio sugerido" v={money(t.suggestedPrice)} />
            </dl>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Field label="Precio de lista" htmlFor="q-lp"><Input id="q-lp" inputMode="decimal" placeholder={String(t.suggestedPrice)} value={quote.listPriceOverride ? String(quote.listPriceOverride) : ""} onChange={(e) => setQuote({ ...quote, listPriceOverride: num2(e.target.value) || undefined })} /></Field>
              <Field label="Descuento $" htmlFor="q-ds"><Input id="q-ds" inputMode="decimal" value={quote.discount ? String(quote.discount) : ""} onChange={(e) => setQuote({ ...quote, discount: num2(e.target.value) || 0 })} /></Field>
            </div>
            <dl className="mt-3 space-y-1 text-sm">
              <Row k="Precio final (sin IVA)" v={money(t.agreedPrice)} strong />
              <Row k="Rentabilidad cotizada" v={pct(t.quotedMarginPct)} strong />
            </dl>
            <p className="mt-2 text-xs text-slate-500">
              Escenario normal: costo directo invertido al inicio y cobros en sus fechas, tasa {w.config.financialMonthlyRatePct} % mensual.
            </p>
          </Section>
          <Section title="Acciones">
            <div className="flex flex-col gap-2">
              <Button variant="outline" onClick={() => flash.show(save(), "Cotización guardada.")}>Guardar borrador</Button>
              {project.quote.state === "draft" && <Button variant="outline" onClick={() => { const r = save(); flash.show(r.ok ? act((cw, ctx) => op.setQuoteState(cw, project.id, "sent", ctx)) : r, "Marcada como enviada al cliente."); }}>Marcar enviada</Button>}
              {project.quote.state !== "negotiating" && project.quote.state !== "draft" && <Button variant="outline" onClick={() => { const r = save(); flash.show(r.ok ? act((cw, ctx) => op.setQuoteState(cw, project.id, "negotiating", ctx)) : r, "En negociación."); }}>En negociación</Button>}
              <Button
                disabled={errors.length > 0}
                onClick={() => {
                  const r = save();
                  const r2 = r.ok ? act((cw, ctx) => op.approveQuote(cw, project.id, ctx)) : r;
                  if (r2.ok) router.push(`/projects/${project.id}?tab=bom`);
                  else flash.show(r2, "");
                }}
              >
                Confirmar aprobación del cliente
              </Button>
              {errors.length > 0 && <ul className="list-disc pl-4 text-xs text-amber-800">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
              <FormDialog trigger={<Button variant="ghost" className="w-full">No aprobada</Button>} title="Cotización no aprobada" submitLabel="Guardar" onSubmit={() => act((cw, ctx) => op.setQuoteState(cw, project.id, "rejected", ctx, reason))}>
                <Field label="Motivo" htmlFor="q-rr"><Input id="q-rr" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
              </FormDialog>
              <FormDialog trigger={<Button variant="ghost" className="w-full text-red-700">Borrar cotización</Button>} title="¿Borrar la cotización?" submitLabel="Borrar" onSubmit={() => { const r = act((cw, ctx) => op.deleteQuote(cw, project.id, ctx)); if (r.ok) router.push("/quotes"); return r; }}>
                <p className="text-sm text-slate-600">El número de OT no se vuelve a usar.</p>
              </FormDialog>
              {flash.node}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className={strong ? "flex justify-between gap-2 border-t border-slate-100 pt-1 font-medium" : "flex justify-between gap-2"}>
      <dt className={strong ? "" : "text-slate-600"}>{k}</dt>
      <dd className="tabular">{v}</dd>
    </div>
  );
}

function ItemCard({ item, lines, onItem, onRemove, onLines, newId, date }: { item: EditItem; lines: QuoteLine[]; onItem: (p: Partial<EditItem>) => void; onRemove: () => void; onLines: (l: QuoteLine[]) => void; newId: () => string; date: string }) {
  const w = useCore();
  const rubros = [...new Set(lines.map((l) => l.rubroId))];
  const [addRubro, setAddRubro] = useState("");
  const set = (id: string, patch: Partial<QuoteLine>) => onLines(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  return (
    <Section
      title={item.name || "Mueble nuevo"}
      actions={<button type="button" aria-label="Quitar mueble" className="text-slate-400 hover:text-red-600" onClick={onRemove}><Trash2 className="size-4" /></button>}
    >
      <div className="mb-3 grid grid-cols-[1fr_6rem] gap-2">
        <Input aria-label="Nombre del mueble" placeholder="Nombre del mueble" value={item.name} onChange={(e) => onItem({ name: e.target.value })} />
        <Input aria-label="Cantidad de unidades" inputMode="numeric" value={String(item.quantity)} onChange={(e) => onItem({ quantity: Math.max(1, Math.round(num2(e.target.value) || 1)) })} />
      </div>
      <p className="mb-2 text-xs text-slate-500">Cantidades y horas son el total del mueble (todas sus unidades).</p>
      {rubros.map((rb) => {
        const labor = lines.find((l) => l.rubroId === rb && l.kind === "labor");
        const mats = lines.filter((l) => l.rubroId === rb && l.kind === "material");
        return (
          <div key={rb} className="mb-3 rounded-md border border-slate-200 p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-medium text-slate-800">{w.rubros.find((r) => r.id === rb)?.name}</h3>
              <button type="button" aria-label="Quitar rubro" className="text-slate-400 hover:text-red-600" onClick={() => onLines(lines.filter((l) => l.rubroId !== rb))}><Trash2 className="size-4" /></button>
            </div>
            <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-slate-600">Horas</span>
              <Input aria-label="Horas" inputMode="decimal" className="h-8 w-20" value={labor ? String(labor.quantity) : ""} onChange={(e) => {
                const h = num2(e.target.value) || 0;
                if (labor) set(labor.id, { quantity: h });
                else onLines([...lines, { id: newId(), itemId: item.id, rubroId: rb, kind: "labor", quantity: h, unit: "h", unitCost: rateAt(w, "rubro_cost", rb, date) ?? 0 }]);
              }} />
              <span className="text-xs text-slate-500">× {money(labor?.unitCost ?? rateAt(w, "rubro_cost", rb, date))}/h</span>
            </div>
            {mats.map((m) => (
              <div key={m.id} className="mb-1 grid grid-cols-[1fr_5rem_7rem_auto] items-center gap-2">
                <SearchSelect id={`mat-${m.id}`} value={m.materialId ?? ""} onChange={(v) => { const mm = w.materials.find((x) => x.id === v); set(m.id, { materialId: v, unit: mm?.unit ?? "", unitCost: mm?.referenceCost ?? 0 }); }} options={w.materials.filter((x) => x.active).map((x) => ({ value: x.id, label: x.name }))} placeholder="Material…" />
                <Input aria-label={`Cantidad de ${materialName(w, m.materialId)}`} inputMode="decimal" className="h-9" value={String(m.quantity)} onChange={(e) => set(m.id, { quantity: num2(e.target.value) || 0 })} />
                <Input aria-label="Costo unitario" inputMode="decimal" className="h-9" value={String(m.unitCost)} onChange={(e) => set(m.id, { unitCost: num2(e.target.value) || 0 })} />
                <button type="button" aria-label="Quitar material" className="text-slate-400 hover:text-red-600" onClick={() => onLines(lines.filter((l) => l.id !== m.id))}><Trash2 className="size-4" /></button>
              </div>
            ))}
            {mats.length > 0 && <p className="text-xs text-slate-500">Cantidad en {mats.map((m) => materialUnit(w, m.materialId)).filter(Boolean).join(", ")} · costo unitario de referencia, editable.</p>}
            <Button size="sm" variant="ghost" onClick={() => onLines([...lines, { id: newId(), itemId: item.id, rubroId: rb, kind: "material", materialId: "", quantity: 1, unit: "", unitCost: 0 }])}><Plus /> Material</Button>
          </div>
        );
      })}
      <div className="flex gap-2">
        <Select aria-label={`Agregar rubro a ${item.name}`} value={addRubro} onChange={(e) => setAddRubro(e.target.value)} className="w-56">
          <option value="">Agregar rubro…</option>
          {w.rubros.filter((r) => r.active && !rubros.includes(r.id)).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
        <Button variant="outline" disabled={!addRubro} onClick={() => { onLines([...lines, { id: newId(), itemId: item.id, rubroId: addRubro, kind: "labor", quantity: 0, unit: "h", unitCost: rateAt(w, "rubro_cost", addRubro, date) ?? 0 }]); setAddRubro(""); }}>Agregar</Button>
      </div>
    </Section>
  );
}

function StaffCard({ lines, onChange, newId, date }: { lines: StaffLine[]; onChange: (l: StaffLine[]) => void; newId: () => string; date: string }) {
  const w = useCore();
  const cats = w.config.categories.filter((c) => !c.isWorker && c.active && rateAt(w, "category_cost", c.id, date) !== null);
  return (
    <Section title="Horas de diseño y administración">
      {lines.map((l, i) => (
        <div key={l.id} className="mb-1 grid grid-cols-[1fr_6rem_auto] items-center gap-2">
          <Select aria-label="Categoría" value={l.categoryId} onChange={(e) => onChange(lines.map((x, k) => (k === i ? { ...x, categoryId: e.target.value, hourlyCost: rateAt(w, "category_cost", e.target.value, date) ?? 0 } : x)))}>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Input aria-label="Horas" inputMode="decimal" value={String(l.hours)} onChange={(e) => onChange(lines.map((x, k) => (k === i ? { ...x, hours: num2(e.target.value) || 0 } : x)))} />
          <button type="button" aria-label="Quitar" className="text-slate-400 hover:text-red-600" onClick={() => onChange(lines.filter((_, k) => k !== i))}><Trash2 className="size-4" /></button>
        </div>
      ))}
      {cats.length > 0 && <Button size="sm" variant="ghost" onClick={() => onChange([...lines, { id: newId(), categoryId: cats[0].id, hours: 0, hourlyCost: rateAt(w, "category_cost", cats[0].id, date) ?? 0 }])}><Plus /> Horas</Button>}
    </Section>
  );
}
