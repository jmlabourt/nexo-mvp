"use client";
// Compras (modo demostración): Dashboard, Por comprar, Órdenes de compra, Stock y Alertas. Todo sale del BOM publicado,
// los pedidos adicionales de Planta, las OCs registradas y el stock por lote (lib/core).
import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import type { OrderLine } from "@/lib/core/types";
import * as op from "@/lib/core/ops";
import { comprasAlerts } from "@/lib/core/alerts";
import { clientName, itemName, materialName, materialOf, materialUnit, otOf, supplierName } from "@/lib/core/lookup";
import { BUYING_STATUSES, needRows, toBuyRows, type NeedRow } from "@/lib/core/needs";
import { isOpenOrder, lineReceived, linePending, lineValue, ORDER_STATE_LABELS, orderState, orderTotal } from "@/lib/core/orders";
import { asg, FREE, holdingsAt, stockRows } from "@/lib/core/stock";
import { addDays, EPS, money as m2, qty, sumBy } from "@/lib/core/util";
import { PageHeader } from "@/components/shared/page-header";
import { Stat } from "@/components/shared/stat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { Result } from "@/store/use-app-store";
import { AlertList, day, Empty, FormDialog, money, num, num2, OtLink, SearchSelect, Section, useAct, useCore, useDemoToday, useFlash } from "../kit";

const OC_NOTE = "Esto registra la OC solo en Blerp: no la crea ni la envía al proveedor.";

// ── Dashboard ──

export function ComprasDashboardDemo() {
  const w = useCore();
  const today = useDemoToday();
  const week = addDays(today, 7);
  const toBuy = toBuyRows(w);
  const thisWeek = toBuy.filter((n) => n.startDate <= week);
  const byProject = [...new Set(toBuy.map((n) => n.projectId))].map((pid) => ({ pid, lines: toBuy.filter((n) => n.projectId === pid).length }));
  const open = w.orders.filter((o) => isOpenOrder(w, o));
  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" />
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Materiales por pedir esta semana" value={String(new Set(thisWeek.map((n) => n.materialId)).size)} tone={thisWeek.length ? "yellow" : "default"} />
        <Stat label="OTs con compras pendientes" value={String(byProject.length)} />
        <Stat label="Órdenes de compra abiertas" value={String(open.length)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Por pedir esta semana">
          {thisWeek.length === 0 ? <Empty>Nada para pedir esta semana.</Empty> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {thisWeek.map((n) => (
                <li key={`${n.projectId}${n.materialId}`} className="flex justify-between gap-2 py-2">
                  <span>{materialName(w, n.materialId)} <span className="block text-xs text-slate-500">{otOf(w, n.projectId)}</span></span>
                  <span className="shrink-0 tabular">{num(n.toRegister, materialUnit(w, n.materialId))}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="OTs con compras pendientes">
          {byProject.length === 0 ? <Empty>Sin pendientes.</Empty> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {byProject.map((x) => (
                <li key={x.pid} className="flex justify-between gap-2 py-2">
                  <OtLink projectId={x.pid} />
                  <span className="shrink-0 text-slate-600">{x.lines} línea{x.lines === 1 ? "" : "s"}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}

// ── Por comprar ──

export function PorComprarDemo({ projectId }: { projectId?: string }) {
  const w = useCore();
  const today = useDemoToday();
  const flash = useFlash();
  const [only, setOnly] = useState(projectId ?? "");
  const [showAll, setShowAll] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const rows = useMemo(() => needRows(w).filter((n) => (!only || n.projectId === only) && (showAll || n.toRegister > EPS || n.pendingReceipt > EPS || n.uncovered > EPS)), [w, only, showAll]);
  const key = (n: NeedRow) => `${n.projectId}|${n.materialId}`;
  const chosen = rows.filter((n) => sel.has(key(n)) && n.toRegister > EPS);
  const projects = w.projects.filter((p) => BUYING_STATUSES.includes(p.status));
  return (
    <div className="space-y-4">
      <PageHeader
        title="Por comprar"
        actions={<NewOrderDialog key={chosen.map(key).join(",")} preset={chosen} trigger={<Button disabled={chosen.length === 0}>Registrar orden de compra ({chosen.length})</Button>} />}
      />
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          OT
          <Select value={only} onChange={(e) => setOnly(e.target.value)} className="w-72">
            <option value="">Todas</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.ot}</option>)}
          </Select>
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Ver también lo cubierto
        </label>
      </div>
      {flash.node}
      {rows.length === 0 ? <Empty>No hay materiales pendientes.</Empty> : (
        <div className="rounded-lg border border-slate-200 bg-white">
          <Table>
            <THead>
              <TR>
                <TH />
                <TH>OT · inicio / entrega</TH>
                <TH>Material</TH>
                <TH className="text-right">Necesario</TH>
                <TH className="text-right">Asignado</TH>
                <TH className="text-right">Usado</TH>
                <TH className="text-right">Stock libre</TH>
                <TH className="text-right">Pedido sin recibir</TH>
                <TH className="text-right">Pendiente de registrar en OC</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {rows.map((n) => {
                const u = materialUnit(w, n.materialId);
                const late = n.startDate <= today;
                return (
                  <TR key={key(n)}>
                    <TD>
                      {n.toRegister > EPS && (
                        <input type="checkbox" aria-label={`Elegir ${materialName(w, n.materialId)}`} checked={sel.has(key(n))} onChange={(e) => { const s = new Set(sel); if (e.target.checked) s.add(key(n)); else s.delete(key(n)); setSel(s); }} />
                      )}
                    </TD>
                    <TD className="min-w-[9rem]">
                      <OtLink projectId={n.projectId} short />
                      <span className={cn("block text-xs", late ? "font-medium text-red-700" : "text-slate-500")}>{day(n.startDate)} / {day(n.dueDate)}</span>
                    </TD>
                    <TD>
                      {materialName(w, n.materialId)}
                      {n.extra > 0 && <Badge tone="yellow" className="ml-1">+{num(n.extra)} adicional de Planta</Badge>}
                    </TD>
                    <TD className="text-right tabular">{num(n.demand, u)}</TD>
                    <TD className="text-right tabular">{num(qty(n.assigned + n.inProduction), u)}</TD>
                    <TD className="text-right tabular">{num(n.used, u)}</TD>
                    <TD className="text-right tabular">{num(n.freeStock, u)}</TD>
                    <TD className="text-right tabular">{num(n.pendingReceipt, u)}</TD>
                    <TD className={cn("text-right font-medium tabular", n.toRegister > EPS && "text-amber-700")}>{num(n.toRegister, u)}</TD>
                    <TD>{n.freeStock > EPS && n.toRegister > EPS && <AssignDialog projectId={n.projectId} materialId={n.materialId} max={Math.min(n.freeStock, n.toRegister)} onDone={(r) => flash.show(r, "Stock asignado a la OT.")} />}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </div>
      )}
      <p className="text-xs text-slate-500">
        Pendiente de registrar = necesario − usado − asignado − pedido sin recibir. Lo recibido ya figura como asignado. <Link className="text-blue-700 hover:underline" href="/compras/ordenes">Órdenes de compra</Link>
      </p>
    </div>
  );
}

function AssignDialog({ projectId, materialId, max, onDone }: { projectId: string; materialId: string; max: number; onDone: (r: Result<unknown>) => void }) {
  const act = useAct();
  const w = useCore();
  const [q, setQ] = useState(String(max));
  return (
    <FormDialog
      trigger={<Button size="sm" variant="outline">Asignar a OT</Button>}
      title={`Asignar ${materialName(w, materialId)} a ${otOf(w, projectId).split("_")[0]}`}
      submitLabel="Asignar"
      note="Sale del stock libre (lotes más viejos primero) y pasa a la OT: resta de Por comprar y habilita Producción."
      onSubmit={() => {
        const r = act((cw, ctx) => op.assignStock(cw, { materialId, projectId, quantity: num2(q) }, ctx));
        if (r.ok) onDone(r);
        return r;
      }}
    >
      <Field label={`Cantidad (${materialUnit(w, materialId)})`} htmlFor="as-q" hint={`Libre: ${num(qtyFree(w, materialId))}`}>
        <Input id="as-q" inputMode="decimal" value={q} onChange={(e) => setQ(e.target.value)} />
      </Field>
    </FormDialog>
  );
}

const qtyFree = (w: ReturnType<typeof useCore>, materialId: string) => qty(sumBy(holdingsAt(w, FREE, materialId), (h) => h.quantity));

type DraftLine = Omit<OrderLine, "id" | "quantity" | "unitPrice"> & { key: string; quantity: string; unitPrice: string };

function NewOrderDialog({ preset, trigger }: { preset: NeedRow[]; trigger: React.ReactNode }) {
  const w = useCore();
  const act = useAct();
  const today = useDemoToday();
  const [supplierId, setSupplierId] = useState("");
  const [date, setDate] = useState(today);
  const [expected, setExpected] = useState(addDays(today, 7));
  const [lines, setLines] = useState<DraftLine[]>(() =>
    preset.map((n, i) => ({ key: `p${i}`, projectId: n.projectId, materialId: n.materialId, quantity: String(n.toRegister), unitPrice: String(materialOf(w, n.materialId)?.referenceCost ?? "") })),
  );
  const projects = w.projects.filter((p) => BUYING_STATUSES.includes(p.status));
  const total = sumBy(lines, (l) => (num2(l.quantity) || 0) * (num2(l.unitPrice) || 0));
  return (
    <FormDialog
      trigger={trigger}
      wide
      title="Registrar orden de compra"
      submitLabel="Registrar orden de compra"
      note={OC_NOTE}
      onSubmit={() => act((cw, ctx) => op.registerOrder(cw, { supplierId, date, expectedDate: expected || undefined, lines: lines.map((l) => ({ projectId: l.projectId || undefined, materialId: l.materialId, quantity: num2(l.quantity), unitPrice: num2(l.unitPrice) })) }, ctx))}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Proveedor" htmlFor="oc-s">
          <SearchSelect id="oc-s" value={supplierId} onChange={setSupplierId} options={w.suppliers.filter((s) => s.active).map((s) => ({ value: s.id, label: s.name }))} />
        </Field>
        <Field label="Fecha" htmlFor="oc-d"><Input id="oc-d" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Llegada comprometida" htmlFor="oc-e"><Input id="oc-e" type="date" value={expected} onChange={(e) => setExpected(e.target.value)} /></Field>
      </div>
      <Table>
        <THead><TR><TH>OT</TH><TH>Material</TH><TH>Cantidad</TH><TH>Precio unitario</TH><TH /></TR></THead>
        <TBody>
          {lines.map((l, i) => (
            <TR key={l.key}>
              <TD>
                <Select aria-label="OT" className="h-8" value={l.projectId ?? ""} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, projectId: e.target.value || undefined } : x)))}>
                  <option value="">Stock libre</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.ot.split("_")[0]} · {clientName(w, p.clientId)}</option>)}
                </Select>
              </TD>
              <TD>
                <Select aria-label="Material" className="h-8" value={l.materialId} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, materialId: e.target.value } : x)))}>
                  <option value="">Material…</option>
                  {w.materials.filter((m) => m.active).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </Select>
              </TD>
              <TD><Input aria-label="Cantidad" inputMode="decimal" className="h-8 w-20" value={l.quantity} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, quantity: e.target.value } : x)))} /></TD>
              <TD><Input aria-label="Precio unitario" inputMode="decimal" className="h-8 w-28" value={l.unitPrice} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, unitPrice: e.target.value } : x)))} /></TD>
              <TD><button type="button" className="text-xs text-slate-500 hover:text-red-600" onClick={() => setLines(lines.filter((_, k) => k !== i))}>Quitar</button></TD>
            </TR>
          ))}
        </TBody>
      </Table>
      <div className="flex items-center justify-between">
        <Button type="button" size="sm" variant="outline" onClick={() => setLines([...lines, { key: `n${Date.now()}`, materialId: "", quantity: "", unitPrice: "" }])}><Plus /> Línea</Button>
        <span className="text-sm">Total {money(total)}</span>
      </div>
    </FormDialog>
  );
}

// ── Órdenes de compra ──

export function OrdenesDemo() {
  const w = useCore();
  const [filter, setFilter] = useState<"open" | "all">("open");
  const list = w.orders.filter((o) => filter === "all" || isOpenOrder(w, o)).sort((a, b) => b.number.localeCompare(a.number));
  return (
    <div className="space-y-4">
      <PageHeader title="Órdenes de compra" actions={<NewOrderDialog preset={[]} trigger={<Button><Plus /> Registrar orden de compra</Button>} />} />
      <div className="flex gap-1">
        <Button size="sm" variant={filter === "open" ? "default" : "outline"} onClick={() => setFilter("open")}>Abiertas</Button>
        <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>Todas</Button>
      </div>
      {list.length === 0 ? <Empty>No hay órdenes.</Empty> : list.map((o) => <OrderCard key={o.id} orderId={o.id} />)}
    </div>
  );
}

function OrderCard({ orderId }: { orderId: string }) {
  const w = useCore();
  const act = useAct();
  const today = useDemoToday();
  const flash = useFlash();
  const o = w.orders.find((x) => x.id === orderId)!;
  const st = orderState(w, o);
  const [recv, setRecv] = useState<Record<string, string>>({});
  const [recvDate, setRecvDate] = useState(today);
  const [inv, setInv] = useState({ number: o.invoice?.number ?? "", date: o.invoice?.date ?? today, amount: o.invoice ? String(o.invoice.amount) : "" });
  const [reason, setReason] = useState("");
  const receipts = w.receipts.filter((r) => r.orderId === o.id);
  const late = !!o.expectedDate && o.expectedDate < today && st !== "received";
  return (
    <Section
      title={`${o.number} · ${supplierName(w, o.supplierId)}`}
      actions={
        <>
          <Badge tone={st === "received" ? "green" : st === "partial" ? "yellow" : "gray"}>{ORDER_STATE_LABELS[st]}</Badge>
          {st !== "received" && (
            <FormDialog trigger={<Button size="sm">Materiales recibidos</Button>} title={`Materiales recibidos · ${o.number}`} submitLabel="Registrar ingreso" note="Cada línea con OT queda asignada a esa OT; sin OT, entra al stock libre." onSubmit={() => act((cw, ctx) => op.receiveMaterials(cw, o.id, { date: recvDate, lines: Object.entries(recv).filter(([, v]) => v).map(([lineId, v]) => ({ lineId, quantity: num2(v) })) }, ctx))}>
              <Field label="Fecha de llegada" htmlFor={`rd-${o.id}`}><Input id={`rd-${o.id}`} type="date" value={recvDate} onChange={(e) => setRecvDate(e.target.value)} /></Field>
              {o.lines.filter((l) => linePending(w, l) > EPS).map((l) => (
                <div key={l.id} className="grid grid-cols-[1fr_7rem] items-center gap-2 text-sm">
                  <span>{materialName(w, l.materialId)} · {l.projectId ? otOf(w, l.projectId).split("_")[0] : "Stock libre"} <span className="block text-xs text-slate-500">faltan {num(linePending(w, l), materialUnit(w, l.materialId))}</span></span>
                  <Input aria-label={`Llegó de ${materialName(w, l.materialId)}`} inputMode="decimal" value={recv[l.id] ?? ""} onChange={(e) => setRecv({ ...recv, [l.id]: e.target.value })} />
                </div>
              ))}
            </FormDialog>
          )}
          <FormDialog trigger={<Button size="sm" variant="outline">Comprobante</Button>} title="Comprobante del proveedor" submitLabel="Guardar" onSubmit={() => act((cw, ctx) => op.setOrderInvoice(cw, o.id, { number: inv.number, date: inv.date, amount: num2(inv.amount) }, ctx))}>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Número" htmlFor={`in-${o.id}`}><Input id={`in-${o.id}`} value={inv.number} onChange={(e) => setInv({ ...inv, number: e.target.value })} /></Field>
              <Field label="Fecha" htmlFor={`id-${o.id}`}><Input id={`id-${o.id}`} type="date" value={inv.date} onChange={(e) => setInv({ ...inv, date: e.target.value })} /></Field>
              <Field label="Importe sin IVA" htmlFor={`ia-${o.id}`}><Input id={`ia-${o.id}`} inputMode="decimal" value={inv.amount} onChange={(e) => setInv({ ...inv, amount: e.target.value })} /></Field>
            </div>
          </FormDialog>
        </>
      }
    >
      <p className="mb-2 text-xs text-slate-500">
        {day(o.date)} · registrada por {o.createdBy} · llegada comprometida <span className={late ? "font-medium text-red-700" : ""}>{o.expectedDate ? day(o.expectedDate) : "sin fecha"}</span>
        {o.invoice && ` · comprobante ${o.invoice.number} por ${money(o.invoice.amount)}`}
      </p>
      <Table>
        <THead><TR><TH>OT</TH><TH>Material</TH><TH className="text-right">Cantidad</TH><TH className="text-right">Recibido</TH><TH className="text-right">Precio unitario</TH><TH className="text-right">Importe</TH></TR></THead>
        <TBody>
          {o.lines.map((l) => (
            <TR key={l.id}>
              <TD>{l.projectId ? <OtLink projectId={l.projectId} short /> : "Stock libre"}{l.itemId && <span className="block text-xs text-slate-500">{itemName(w.projects.find((p) => p.id === l.projectId), l.itemId)}</span>}</TD>
              <TD>{materialName(w, l.materialId)}</TD>
              <TD className="text-right tabular">{num(l.quantity, materialUnit(w, l.materialId))}</TD>
              <TD className="text-right tabular">{num(lineReceived(w, l.id))}</TD>
              <TD className="text-right tabular">{money(l.unitPrice)}</TD>
              <TD className="text-right tabular">{money(lineValue(l))}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
      <p className="mt-1 text-right text-sm font-medium">Total {money(orderTotal(o))}</p>
      {receipts.length > 0 && (
        <div className="mt-3 border-t border-slate-100 pt-2">
          <h3 className="mb-1 text-xs font-medium uppercase text-slate-500">Recepciones</h3>
          <ul className="space-y-1 text-sm">
            {receipts.map((r) => {
              const l = o.lines.find((x) => x.id === r.lineId)!;
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className={r.reversal ? "text-slate-400 line-through" : ""}>
                    {day(r.date)} · {materialName(w, l.materialId)} {num(r.quantity, materialUnit(w, l.materialId))} · {r.createdBy}
                  </span>
                  {r.reversal ? (
                    <span className="text-xs text-slate-500">Revertida el {day(r.reversal.date)}: {r.reversal.reason}</span>
                  ) : (
                    <FormDialog trigger={<Button size="sm" variant="ghost">Revertir</Button>} title="Revertir recepción" submitLabel="Revertir" note="Se bloquea si ese material ya se entregó a producción o se movió." onSubmit={() => act((cw, ctx) => op.reverseReceipt(cw, r.id, reason, ctx))}>
                      <Field label="Motivo" htmlFor={`rv-${r.id}`}><Input id={`rv-${r.id}`} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
                    </FormDialog>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {flash.node}
    </Section>
  );
}

// ── Stock (Compras: cantidades y costo unitario por lote; Administración: solo cantidades) ──

export function StockDemo({ withCosts, canAssign, gerencia }: { withCosts: boolean; canAssign: boolean; gerencia?: boolean }) {
  const w = useCore();
  const flash = useFlash();
  const rows = stockRows(w);
  const freeRows = rows.filter((r) => r.free > EPS);
  const freeValue = m2(sumBy(rows, (r) => r.freeValue));
  return (
    <div className="space-y-4">
      <PageHeader title="Stock" />
      <div className="max-w-sm">
        <Stat label="Stock disponible sin proyecto asignado" value={withCosts ? money(freeValue) : `${freeRows.length} materiales`} hint={withCosts ? `${freeRows.length} materiales` : undefined} />
      </div>
      {gerencia && <p className="text-sm text-slate-600">Asignado a OTs: {money(m2(sumBy(rows, (r) => r.assignedValue)))} · en producción: {money(m2(sumBy(rows, (r) => r.inProductionValue)))}</p>}
      {flash.node}
      <div className="rounded-lg border border-slate-200 bg-white">
        <Table>
          <THead>
            <TR>
              <TH>Material</TH>
              <TH className="text-right">Libre</TH>
              <TH className="text-right">Asignado a OTs</TH>
              <TH className="text-right">En producción</TH>
              {withCosts && <TH className="text-right">Costo unitario (lotes libres)</TH>}
              {withCosts && <TH>OC de origen</TH>}
              {canAssign && <TH />}
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => {
              const u = materialUnit(w, r.materialId);
              const lots = holdingsAt(w, FREE, r.materialId);
              const byOt = w.projects.map((p) => ({ p, q: qty(sumBy(holdingsAt(w, asg(p.id), r.materialId), (h) => h.quantity)) })).filter((x) => x.q > EPS);
              return (
                <TR key={r.materialId}>
                  <TD>{materialName(w, r.materialId)}</TD>
                  <TD className="text-right font-medium tabular">{num(r.free, u)}</TD>
                  <TD className="text-right text-xs tabular">
                    {byOt.length === 0 ? "—" : byOt.map((x) => <span key={x.p.id} className="block">{x.p.ot.split("_")[0]}: {num(x.q, u)}</span>)}
                  </TD>
                  <TD className="text-right tabular">{num(r.inProduction, u)}</TD>
                  {withCosts && <TD className="text-right text-xs tabular">{lots.length ? [...new Set(lots.map((h) => money(h.lot.unitCost)))].join(" · ") : "—"}</TD>}
                  {withCosts && <TD className="text-xs">{r.orderIds.map((id) => w.orders.find((o) => o.id === id)?.number).join(", ") || (lots.some((h) => h.lot.source === "opening") ? "Inventario inicial" : "—")}</TD>}
                  {canAssign && <TD>{r.free > EPS && <AssignFromStock materialId={r.materialId} onDone={(r2) => flash.show(r2, "Stock asignado a la OT.")} />}</TD>}
                </TR>
              );
            })}
          </TBody>
        </Table>
      </div>
      {gerencia && <OpenRequests />}
    </div>
  );
}

function OpenRequests() {
  const w = useCore();
  const list = w.materialRequests.filter((r) => r.status === "active");
  return (
    <Section title="Pedidos abiertos">
      {list.length === 0 ? <Empty>Sin pedidos abiertos.</Empty> : (
        <ul className="divide-y divide-slate-100 text-sm">
          {list.map((r) => (
            <li key={r.id} className="flex justify-between gap-2 py-2">
              <span>{materialName(w, r.materialId)} · {num(r.quantity, materialUnit(w, r.materialId))} <span className="block text-xs text-slate-500">{otOf(w, r.projectId).split("_")[0]} · {itemName(w.projects.find((p) => p.id === r.projectId), r.itemId)} · {r.createdBy} · {day(r.date)}</span></span>
              <span className="text-xs text-slate-500">{r.note}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function AssignFromStock({ materialId, onDone }: { materialId: string; onDone: (r: Result<unknown>) => void }) {
  const w = useCore();
  const act = useAct();
  const [pid, setPid] = useState("");
  const [q, setQ] = useState("");
  const projects = w.projects.filter((p) => BUYING_STATUSES.includes(p.status));
  return (
    <FormDialog
      trigger={<Button size="sm" variant="outline">Asignar a OT</Button>}
      title={`Asignar ${materialName(w, materialId)}`}
      submitLabel="Asignar"
      note="Resta de Por comprar de esa OT, aparece en Planta y habilita Producción."
      onSubmit={() => {
        const r = act((cw, ctx) => op.assignStock(cw, { materialId, projectId: pid, quantity: num2(q) }, ctx));
        if (r.ok) onDone(r);
        return r;
      }}
    >
      <Field label="OT" htmlFor="af-p">
        <SearchSelect id="af-p" value={pid} onChange={setPid} options={projects.map((p) => ({ value: p.id, label: p.ot }))} />
      </Field>
      <Field label={`Cantidad (${materialUnit(w, materialId)})`} htmlFor="af-q" hint={`Libre: ${num(qtyFree(w, materialId))}`}>
        <Input id="af-q" inputMode="decimal" value={q} onChange={(e) => setQ(e.target.value)} />
      </Field>
    </FormDialog>
  );
}

// ── Alertas ──

export function ComprasAlertasDemo() {
  const w = useCore();
  const today = useDemoToday();
  const alerts = useMemo(() => comprasAlerts(w, today), [w, today]);
  return (
    <div className="space-y-4">
      <PageHeader title="Alertas" />
      <Section title={`${alerts.length} alerta${alerts.length === 1 ? "" : "s"}`}>
        <AlertList alerts={alerts} hrefOf={(a) => (a.orderId ? "/compras/ordenes" : a.projectId ? `/compras/proyectos?p=${a.projectId}` : undefined)} />
      </Section>
    </div>
  );
}
