"use client";
// Administración / Comercial / Diseño → ficha de la OT (modo demostración): Muebles, BOM, Contrato y pagos, Notas y
// documentos. Solo cantidades físicas y valores comerciales: nunca costos reales, salarios ni rentabilidad.
import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { BomLine, CoreStatus, Project, ScheduledPayment } from "@/lib/core/types";
import * as op from "@/lib/core/ops";
import { contractAt } from "@/lib/core/contract";
import { usedByItem } from "@/lib/core/dashboard";
import { clientName, itemName, materialName, materialUnit, rateAt, rubroName } from "@/lib/core/lookup";
import { bomDiff, bomVersions, budgetLinesOf, draftBom, enabledRubros, publishedBom } from "@/lib/core/needs";
import { ITEM_STATE_LABELS, itemState } from "@/lib/core/plant";
import { qty, sumBy } from "@/lib/core/util";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { day, Empty, FormDialog, money, num, num2, Section, StatusBadge, useAct, useCore, useDemoToday, useFlash } from "../kit";

export function AdminProjectDemo({ project, tab }: { project: Project; tab?: string }) {
  const w = useCore();
  return (
    <div className="space-y-5">
      <PageHeader title={project.ot} back="/projects" actions={<StatusControl project={project} />} />
      <p className="-mt-4 text-sm text-slate-600">
        {clientName(w, project.clientId)} · {project.description} · inicio {day(project.startDate)} · entrega {day(project.dueDate)}
      </p>
      {project.status === "quotation" ? (
        <Section title="En cotización">
          <p className="text-sm text-slate-600">La cotización se edita y se aprueba en el Cotizador.</p>
          <Button asChild className="mt-3">
            <Link href={`/quotes?ot=${project.id}`}>Abrir en el Cotizador</Link>
          </Button>
        </Section>
      ) : (
        <Tabs defaultValue={tab && ["muebles", "bom", "contrato", "notas"].includes(tab) ? tab : "muebles"}>
          <TabsList>
            <TabsTrigger value="muebles">Muebles</TabsTrigger>
            <TabsTrigger value="bom">BOM</TabsTrigger>
            <TabsTrigger value="contrato">Contrato y pagos</TabsTrigger>
            <TabsTrigger value="notas">Notas y documentos</TabsTrigger>
          </TabsList>
          <TabsContent value="muebles">
            <FurnitureTab project={project} />
          </TabsContent>
          <TabsContent value="bom">
            <BomTab project={project} />
          </TabsContent>
          <TabsContent value="contrato">
            <ContractTab project={project} />
          </TabsContent>
          <TabsContent value="notas">
            <NotesTab project={project} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function StatusControl({ project }: { project: Project }) {
  const act = useAct();
  const [to, setTo] = useState<CoreStatus>(project.status);
  if (project.status === "closed" || project.status === "quotation") return <StatusBadge status={project.status} />;
  const options: CoreStatus[] = ["approved", "purchasing", "production"];
  return (
    <div className="flex items-center gap-2">
      <StatusBadge status={project.status} />
      <FormDialog
        trigger={<Button variant="outline" size="sm">Corregir estado</Button>}
        title="Corregir estado"
        submitLabel="Guardar"
        onSubmit={() => act((cw, ctx) => op.setStatusManual(cw, project.id, to, ctx))}
        note="Queda en el historial. Si la OT vuelve a Compras y llega material o se le asigna stock, pasa sola a Producción."
      >
        <Field label="Estado" htmlFor="st">
          <Select id="st" value={to} onChange={(e) => setTo(e.target.value as CoreStatus)}>
            {options.map((s) => (
              <option key={s} value={s}>
                {op.STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
      </FormDialog>
    </div>
  );
}

// ── Muebles ──

function FurnitureTab({ project }: { project: Project }) {
  const w = useCore();
  const lines = budgetLinesOf(w, project);
  const bom = publishedBom(w, project.id);
  const used = usedByItem(w, project.id);
  const requests = w.rubroRequests.filter((r) => r.projectId === project.id && r.status === "open");
  return (
    <div className="space-y-4">
      {requests.length > 0 && (
        <Section title="Pedidos de Planta">
          <ul className="divide-y divide-slate-100">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>
                  {itemName(project, r.itemId)} · <strong>{rubroName(w, r.rubroId)}</strong> · {num(r.hours, "h")} estimadas
                  {r.note && <span className="block text-xs text-slate-500">{r.note}</span>}
                </span>
                <span className="flex gap-2">
                  <AdditionalDialog project={project} request={r} />
                  <RejectRequest id={r.id} />
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <div className="flex justify-end">
        <AdditionalDialog project={project} />
      </div>
      {project.items.map((it) => {
        const mine = lines.filter((l) => l.itemId === it.id);
        const rubros = enabledRubros(w, project, it.id);
        const mats = [...new Set([...mine.filter((l) => l.kind === "material").map((l) => l.materialId as string), ...(bom?.lines.filter((l) => l.itemId === it.id).map((l) => l.materialId) ?? [])])];
        return (
          <Section key={it.id} title={`${it.name} · ${it.completedUnits}/${it.quantity}`} actions={<Badge tone={itemState(it) === "done" ? "green" : "blue"}>{ITEM_STATE_LABELS[itemState(it)]}</Badge>}>
            <div className="grid gap-4 lg:grid-cols-2">
              <Table>
                <THead>
                  <TR>
                    <TH>Rubro</TH>
                    <TH className="text-right">Horas cotizadas</TH>
                    <TH className="text-right">Horas reales</TH>
                  </TR>
                </THead>
                <TBody>
                  {rubros.map((rb) => (
                    <TR key={rb}>
                      <TD>{rubroName(w, rb)}</TD>
                      <TD className="text-right tabular">{num(sumBy(mine.filter((l) => l.kind === "labor" && l.rubroId === rb), (l) => l.quantity), "h")}</TD>
                      <TD className="text-right tabular">{num(sumBy(w.timeEntries.filter((t) => t.projectId === project.id && t.itemId === it.id && t.rubroId === rb), (t) => t.hours), "h")}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              <Table>
                <THead>
                  <TR>
                    <TH>Material</TH>
                    <TH className="text-right">BOM</TH>
                    <TH className="text-right">Consumido</TH>
                    <TH className="text-right">Desperdiciado</TH>
                  </TR>
                </THead>
                <TBody>
                  {mats.map((m) => {
                    const u = materialUnit(w, m);
                    const usedQ = used.get(`${it.id}|${m}`) ?? { consumed: 0, waste: 0 };
                    const bq = bom ? sumBy(bom.lines.filter((l) => l.itemId === it.id && l.materialId === m), (l) => l.quantity) : null;
                    return (
                      <TR key={m}>
                        <TD>{materialName(w, m)}</TD>
                        <TD className="text-right tabular">{bq === null ? "—" : num(bq, u)}</TD>
                        <TD className="text-right tabular">{num(usedQ.consumed, u)}</TD>
                        <TD className="text-right tabular">{num(usedQ.waste, u)}</TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </div>
          </Section>
        );
      })}
    </div>
  );
}

function RejectRequest({ id }: { id: string }) {
  const act = useAct();
  return (
    <Button size="sm" variant="ghost" onClick={() => act((cw, ctx) => op.rejectRubroRequest(cw, id, ctx))}>
      Rechazar
    </Button>
  );
}

function AdditionalDialog({ project, request }: { project: Project; request?: { id: string; itemId: string; rubroId: string; hours: number } }) {
  const w = useCore();
  const act = useAct();
  const today = useDemoToday();
  const [itemId, setItemId] = useState(request?.itemId ?? project.items[0]?.id ?? "");
  const [rubroId, setRubroId] = useState(request?.rubroId ?? "");
  const [hours, setHours] = useState(request ? String(request.hours) : "");
  const [rate, setRate] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [mq, setMq] = useState("");
  const [price, setPrice] = useState("");
  const defaultRate = rubroId ? rateAt(w, "rubro_cost", rubroId, today) : null;
  if (project.status === "closed") return null;
  return (
    <FormDialog
      trigger={<Button size="sm" variant={request ? "default" : "outline"}>{request ? "Aprobar como adicional" : <><Plus /> Agregar adicional</>}</Button>}
      title={request ? "Aprobar adicional" : "Agregar adicional"}
      submitLabel="Aprobar adicional"
      note="No cambia la cotización original. Si cargás un precio, sube el contrato vigente. Después actualizá el BOM si lleva materiales."
      onSubmit={() => {
        const m = materialId ? [{ materialId, quantity: num2(mq), unitCost: w.materials.find((x) => x.id === materialId)?.referenceCost ?? 0 }] : [];
        return act((cw, ctx) => op.addAdditional(cw, { projectId: project.id, itemId, rubroId, hours: num2(hours || "0"), hourlyCost: rate ? num2(rate) : (defaultRate ?? 0), materials: m, price: price ? num2(price) : undefined, requestId: request?.id }, ctx));
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Mueble" htmlFor="ad-it">
          <Select id="ad-it" value={itemId} disabled={!!request} onChange={(e) => setItemId(e.target.value)}>
            {project.items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Rubro" htmlFor="ad-rb">
          <Select id="ad-rb" value={rubroId} disabled={!!request} onChange={(e) => setRubroId(e.target.value)}>
            <option value="">Elegí…</option>
            {w.rubros.filter((r) => r.active).map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Horas estimadas" htmlFor="ad-h">
          <Input id="ad-h" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} />
        </Field>
        <Field label="Costo por hora (cotizar)" htmlFor="ad-r" hint={defaultRate ? `Del rubro: ${money(defaultRate)}` : undefined}>
          <Input id="ad-r" inputMode="decimal" value={rate} placeholder={defaultRate ? String(defaultRate) : ""} onChange={(e) => setRate(e.target.value)} />
        </Field>
        <Field label="Material (opcional)" htmlFor="ad-m">
          <Select id="ad-m" value={materialId} onChange={(e) => setMaterialId(e.target.value)}>
            <option value="">Sin material</option>
            {w.materials.filter((m) => m.active).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Cantidad del material" htmlFor="ad-mq">
          <Input id="ad-mq" inputMode="decimal" value={mq} disabled={!materialId} onChange={(e) => setMq(e.target.value)} />
        </Field>
        <Field label="Precio adicional al cliente (opcional)" htmlFor="ad-p">
          <Input id="ad-p" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
      </div>
    </FormDialog>
  );
}

// ── BOM ──

type DraftRow = Omit<BomLine, "id"> & { id?: string; key: string };

function BomTab({ project }: { project: Project }) {
  const w = useCore();
  const act = useAct();
  const flash = useFlash();
  const draft = draftBom(w, project.id);
  const pub = publishedBom(w, project.id);
  const versions = bomVersions(w, project.id);
  const [rows, setRows] = useState<DraftRow[] | null>(null);
  const base = useMemo<DraftRow[]>(() => (draft?.lines ?? []).map((l) => ({ ...l, key: l.id })), [draft]);
  const list = rows ?? base;
  const diff = draft ? bomDiff(pub?.lines ?? [], list) : [];
  const editable = project.status !== "closed";

  const save = () => {
    const r = act((cw, ctx) => op.saveBomDraft(cw, project.id, list.map((l) => ({ id: l.id, itemId: l.itemId, rubroId: l.rubroId, materialId: l.materialId, quantity: l.quantity })), ctx));
    if (r.ok) setRows(null);
    flash.show(r, "Borrador guardado. Compras todavía no lo ve.");
    return r;
  };

  return (
    <div className="space-y-4">
      {!draft ? (
        <Section title={pub ? `BOM publicado · v${pub.version}` : "BOM"} actions={editable && <Button onClick={() => flash.show(act((cw, ctx) => op.saveBomDraft(cw, project.id, null, ctx)), "Borrador creado.")}>{pub ? "Nueva versión" : "Armar BOM desde la cotización"}</Button>}>
          {pub ? <BomTable lines={pub.lines} project={project} /> : <Empty>Todavía no hay BOM. Se arma con los materiales cotizados de cada mueble.</Empty>}
          {flash.node}
        </Section>
      ) : (
        <Section
          title={`Borrador v${draft.version}`}
          actions={
            <>
              <Button variant="outline" onClick={save}>Guardar borrador</Button>
              <Button
                onClick={() => {
                  const r = save();
                  if (r.ok) flash.show(act((cw, ctx) => op.publishBom(cw, project.id, ctx)), "BOM publicado y enviado a Compras.");
                }}
              >
                Publicar y enviar a Compras
              </Button>
            </>
          }
        >
          <DraftEditor project={project} rows={list} onChange={setRows} />
          {diff.length > 0 && (
            <p className="mt-3 text-xs text-slate-600">
              Cambios contra {pub ? `v${pub.version}` : "nada publicado"}: {diff.map((d) => `${materialName(w, d.materialId)} (${itemName(project, d.itemId)}) ${d.before} → ${d.after}`).join(" · ")}
            </p>
          )}
          <div className="mt-2">{flash.node}</div>
        </Section>
      )}
      {versions.filter((v) => v.status === "published").length > 0 && (
        <Section title="Versiones publicadas">
          <ul className="space-y-1 text-sm">
            {versions
              .filter((v) => v.status === "published")
              .reverse()
              .map((v) => (
                <li key={v.id}>
                  v{v.version} · {day(v.publishedDate)} · {v.publishedBy} · {v.lines.length} líneas{v.id === pub?.id ? " · vigente" : ""}
                </li>
              ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function BomTable({ lines, project }: { lines: BomLine[]; project: Project }) {
  const w = useCore();
  return (
    <div className="space-y-3">
      {project.items.map((it) => {
        const mine = lines.filter((l) => l.itemId === it.id);
        if (!mine.length) return null;
        return (
          <div key={it.id}>
            <h3 className="mb-1 text-sm font-medium text-slate-800">{it.name} × {it.quantity}</h3>
            <Table>
              <TBody>
                {mine.map((l) => (
                  <TR key={l.id}>
                    <TD className="w-40 text-slate-500">{rubroName(w, l.rubroId)}</TD>
                    <TD>{materialName(w, l.materialId)}</TD>
                    <TD className="text-right tabular">{num(l.quantity, materialUnit(w, l.materialId))}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        );
      })}
    </div>
  );
}

function DraftEditor({ project, rows, onChange }: { project: Project; rows: DraftRow[]; onChange: (r: DraftRow[]) => void }) {
  const w = useCore();
  const [add, setAdd] = useState({ itemId: project.items[0]?.id ?? "", rubroId: "", materialId: "", quantity: "" });
  const set = (key: string, patch: Partial<DraftRow>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-4">
      {project.items.map((it) => {
        const mine = rows.filter((r) => r.itemId === it.id);
        return (
          <div key={it.id}>
            <h3 className="mb-1 text-sm font-medium text-slate-800">{it.name} × {it.quantity}</h3>
            {mine.length === 0 ? (
              <p className="text-xs text-slate-500">Sin materiales.</p>
            ) : (
              <Table>
                <TBody>
                  {mine.map((r) => (
                    <TR key={r.key}>
                      <TD className="w-40 text-slate-500">{rubroName(w, r.rubroId)}</TD>
                      <TD>{materialName(w, r.materialId)}</TD>
                      <TD className="w-44">
                        <span className="flex items-center gap-1">
                          <Input aria-label={`Cantidad de ${materialName(w, r.materialId)}`} inputMode="decimal" className="h-8 w-24 text-right" value={String(r.quantity).replace(".", ",")} onChange={(e) => set(r.key, { quantity: num2(e.target.value) })} />
                          <span className="text-xs text-slate-500">{materialUnit(w, r.materialId)}</span>
                        </span>
                      </TD>
                      <TD className="w-10">
                        <button type="button" aria-label="Quitar" className="text-slate-400 hover:text-red-600" onClick={() => onChange(rows.filter((x) => x.key !== r.key))}>
                          <Trash2 className="size-4" />
                        </button>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </div>
        );
      })}
      <div className="flex flex-wrap items-end gap-2 rounded-md bg-slate-50 p-3">
        <Select aria-label="Mueble" className="w-40" value={add.itemId} onChange={(e) => setAdd({ ...add, itemId: e.target.value, rubroId: "" })}>
          {project.items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </Select>
        <Select aria-label="Rubro" className="w-40" value={add.rubroId} onChange={(e) => setAdd({ ...add, rubroId: e.target.value })}>
          <option value="">Rubro…</option>
          {enabledRubros(w, project, add.itemId).map((r) => (
            <option key={r} value={r}>
              {rubroName(w, r)}
            </option>
          ))}
        </Select>
        <Select aria-label="Material" className="w-56" value={add.materialId} onChange={(e) => setAdd({ ...add, materialId: e.target.value })}>
          <option value="">Material…</option>
          {w.materials.filter((m) => m.active).map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
        <Input aria-label="Cantidad" inputMode="decimal" placeholder="Cantidad" className="w-24" value={add.quantity} onChange={(e) => setAdd({ ...add, quantity: e.target.value })} />
        <Button
          variant="outline"
          disabled={!add.rubroId || !add.materialId || !(num2(add.quantity) > 0)}
          onClick={() => {
            onChange([...rows, { key: `n${Date.now()}`, itemId: add.itemId, rubroId: add.rubroId, materialId: add.materialId, quantity: qty(num2(add.quantity)) }]);
            setAdd({ ...add, materialId: "", quantity: "" });
          }}
        >
          <Plus /> Agregar material
        </Button>
      </div>
    </div>
  );
}

// ── Contrato y pagos ──

function ContractTab({ project }: { project: Project }) {
  const w = useCore();
  const act = useAct();
  const today = useDemoToday();
  const flash = useFlash();
  const revisions = w.contractRevisions.filter((r) => r.projectId === project.id);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [po, setPo] = useState(project.clientPo ?? "");
  const [sched, setSched] = useState<Array<Omit<ScheduledPayment, "amount"> & { amount: string }> | null>(null);
  const list = sched ?? project.schedule.map((s) => ({ ...s, amount: String(s.amount) }));
  const current = contractAt(w, project, today);
  const editable = project.status !== "closed";
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="Contrato">
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between"><dt className="text-slate-600">Precio aprobado</dt><dd className="tabular">{money(project.baseline?.agreedPrice)}</dd></div>
          <div className="flex justify-between font-medium"><dt>Contrato vigente</dt><dd className="tabular">{money(current)}</dd></div>
        </dl>
        {revisions.length > 0 && (
          <ul className="mt-3 space-y-1 border-t border-slate-100 pt-2 text-xs text-slate-600">
            {revisions.map((r) => (
              <li key={r.id}>
                {day(r.date)} · {money(r.previous)} → {money(r.next)}
                {r.note ? ` · ${r.note}` : ""} · {r.createdBy}
              </li>
            ))}
          </ul>
        )}
        {editable && (
          <div className="mt-4 space-y-2">
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Nuevo contrato vigente" htmlFor="ct-a">
                <Input id="ct-a" inputMode="decimal" className="w-40" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
              <Field label="Nota (opcional)" htmlFor="ct-n">
                <Input id="ct-n" className="w-56" value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
              <Button variant="outline" onClick={() => { const r = act((cw, ctx) => op.reviseContract(cw, project.id, { amount: num2(amount), date: today, note }, ctx)); flash.show(r, "Contrato actualizado."); if (r.ok) { setAmount(""); setNote(""); } }}>
                Guardar
              </Button>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <Field label="OC del cliente" htmlFor="ct-po">
                <Input id="ct-po" className="w-56" value={po} onChange={(e) => setPo(e.target.value)} />
              </Field>
              <Button variant="outline" onClick={() => flash.show(act((cw, ctx) => op.updateProjectInfo(cw, project.id, { clientPo: po.trim() || undefined }, ctx)), "OC del cliente guardada.")}>
                Guardar
              </Button>
            </div>
          </div>
        )}
        <div className="mt-2">{flash.node}</div>
      </Section>
      <Section title="Señas y cuotas previstas">
        <Table>
          <THead>
            <TR>
              <TH>Concepto</TH>
              <TH>Fecha acordada</TH>
              <TH className="text-right">Importe</TH>
              {editable && <TH />}
            </TR>
          </THead>
          <TBody>
            {list.map((s, i) => (
              <TR key={s.id || i}>
                <TD>{editable ? <Input aria-label="Concepto" className="h-8" value={s.label} onChange={(e) => setSched(list.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} /> : s.label}</TD>
                <TD>{editable ? <Input aria-label="Fecha" type="date" className="h-8" value={s.date} onChange={(e) => setSched(list.map((x, k) => (k === i ? { ...x, date: e.target.value } : x)))} /> : day(s.date)}</TD>
                <TD className="text-right">{editable ? <Input aria-label="Importe" inputMode="decimal" className="h-8 text-right" value={s.amount} onChange={(e) => setSched(list.map((x, k) => (k === i ? { ...x, amount: e.target.value } : x)))} /> : money(num2(s.amount))}</TD>
                {editable && (
                  <TD>
                    <button type="button" aria-label="Quitar cuota" className="text-slate-400 hover:text-red-600" onClick={() => setSched(list.filter((_, k) => k !== i))}>
                      <Trash2 className="size-4" />
                    </button>
                  </TD>
                )}
              </TR>
            ))}
          </TBody>
        </Table>
        <p className="mt-2 text-xs text-slate-500">Total previsto: {money(sumBy(list, (s) => (Number.isFinite(num2(s.amount)) ? num2(s.amount) : 0)))} de {money(current)}.</p>
        {editable && (
          <div className="mt-3 flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setSched([...list, { id: "", label: "Cuota", date: project.dueDate, amount: "" }])}>
              <Plus /> Agregar cuota
            </Button>
            <Button size="sm" onClick={() => { const r = act((cw, ctx) => op.setSchedule(cw, project.id, list.map((s) => ({ id: s.id || undefined, label: s.label, date: s.date, amount: num2(s.amount) })), ctx)); flash.show(r, "Cobros previstos guardados."); if (r.ok) setSched(null); }}>
              Guardar cuotas
            </Button>
          </div>
        )}
      </Section>
    </div>
  );
}

// ── Notas y documentos ──

function NotesTab({ project }: { project: Project }) {
  const act = useAct();
  const today = useDemoToday();
  const [text, setText] = useState("");
  const [doc, setDoc] = useState({ name: "", reference: "" });
  const flash = useFlash();
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="Notas">
        <Textarea aria-label="Nota" value={text} onChange={(e) => setText(e.target.value)} />
        <Button className="mt-2" size="sm" onClick={() => { const r = act((cw, ctx) => op.addNote(cw, project.id, { text, date: today }, ctx)); flash.show(r, "Nota guardada."); if (r.ok) setText(""); }}>
          Agregar nota
        </Button>
        <ul className="mt-3 space-y-2 text-sm">
          {project.notes.map((n) => (
            <li key={n.id} className="border-t border-slate-100 pt-2">
              <span className="block text-xs text-slate-500">{day(n.date)} · {n.by}</span>
              {n.text}
            </li>
          ))}
        </ul>
        {flash.node}
      </Section>
      <Section title="Documentos">
        <div className="flex flex-wrap gap-2">
          <Input aria-label="Nombre del documento" placeholder="Nombre (plano, render…)" className="w-56" value={doc.name} onChange={(e) => setDoc({ ...doc, name: e.target.value })} />
          <Input aria-label="Referencia" placeholder="Link o ubicación" className="w-56" value={doc.reference} onChange={(e) => setDoc({ ...doc, reference: e.target.value })} />
          <Button size="sm" onClick={() => { const r = act((cw, ctx) => op.addDocument(cw, project.id, { ...doc, date: today }, ctx)); if (r.ok) setDoc({ name: "", reference: "" }); flash.show(r, "Documento registrado."); }}>
            Agregar
          </Button>
        </div>
        {project.documents.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Sin documentos.</p>
        ) : (
          <ul className="mt-3 space-y-1 text-sm">
            {project.documents.map((d) => (
              <li key={d.id}>
                {d.name}
                {d.reference && <span className="text-slate-500"> · {d.reference}</span>}
                <span className="block text-xs text-slate-500">{day(d.date)} · {d.by}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

