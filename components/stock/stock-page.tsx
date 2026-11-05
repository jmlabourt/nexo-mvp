"use client";
import { StockActionDialog, type StockTarget } from "./stock-action-dialog";
import { useConfirmedAction } from "@/store/confirmed-action";
import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { Boxes } from "lucide-react";
import { leftoverRows, stockRows, stockValuation, EPS } from "@/lib/stock";
import { formatDims } from "@/lib/material-kinds";
import { projectCode } from "@/lib/stock-labels";
import { formatCurrency, formatDate, formatDateTime, formatNumber, formatQty } from "@/lib/formatting";
import { useAppStore } from "@/store/use-app-store";
import { useIdentity } from "@/store/selectors";
import { projectHref } from "@/lib/permissions";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Stock (Gerencia, Administración y Compras). Gerencia solo ingresa stock: las operaciones de rutina (asignar, liberar,
 * transferir, sobrantes) se hacen desde el proyecto o en Planta. Administración y Compras lo consultan.
 */
export function StockPage({ material, lot, tab, basePath = "/stock" }: { material?: string; lot?: string; tab?: string; basePath?: string }) {
  const stock = useAppStore((s) => s.stock);
  const projects = useAppStore((s) => s.projects);
  const requests = useAppStore((s) => s.requests);
  const setRequestStatus = useConfirmedAction("setRequestStatus");
  const { session, roleKey } = useIdentity();
  const buying = session !== "gerencia";
  const canAssign = session === "compras";
  const local = useAppStore((s) => s.demoLocal);
  const reverse = useConfirmedAction("reverseAssignmentLocal");
  const [undo,setUndo] = useState("");
  const [reason,setReason] = useState("");
  const [error,setError] = useState("");
  const [stockAction, setStockAction] = useState<{ kind: "assign" | "transfer"; target: StockTarget } | null>(null);
  const projectLink = (id: string, tabName?: string) => projectHref(roleKey, id, tabName);
  const [query, setQuery] = useState("");

  const rows = useMemo(() => stockRows(stock), [stock]);
  const leftovers = useMemo(() => leftoverRows(stock), [stock]);
  const valuation = stockValuation(stock);
  const total = valuation.value;
  const filtered = rows.filter((r) => r.name.toLowerCase().includes(query.trim().toLowerCase()));
  const openRequests = requests.filter((r) => r.status === "open");
  const defaultTab = tab === "sobrantes" || tab === "pedidos" ? tab : lot && leftovers.some((l) => l.lot.id === lot) ? "sobrantes" : "materiales";



  return (
    <div>
      <PageHeader
        back={material || lot || tab ? basePath : undefined}
        title="Stock"
        subtitle="Material libre en el depósito y asignado a proyectos. El material entra por las recepciones de Compras."
      />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {!buying && <Card><CardContent className="p-4"><div className="text-xs text-slate-500">Valor total en stock</div><div className="text-lg font-semibold tabular">{formatCurrency(total)}</div>{!valuation.complete && <p className="text-xs">Valor parcial: hay existencias sin costo de origen registrado.</p>}</CardContent></Card>}
        <Card><CardContent className="p-4"><div className="text-xs text-slate-500">Materiales</div><div className="text-lg font-semibold tabular">{rows.length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-slate-500">Sobrantes reutilizables</div><div className="text-lg font-semibold tabular">{leftovers.length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-slate-500">Pedidos de operarios abiertos</div><div className="text-lg font-semibold tabular">{openRequests.length}</div></CardContent></Card>
      </div>

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="materiales">Materiales</TabsTrigger>
          <TabsTrigger value="sobrantes">Sobrantes ({leftovers.length})</TabsTrigger>
          <TabsTrigger value="pedidos">Pedidos de operarios ({openRequests.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="materiales">
          <div className="mb-3 max-w-sm">
            <label htmlFor="stock-q" className="sr-only">Buscar material</label>
            <Input id="stock-q" placeholder="Buscar material…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          {filtered.length === 0 ? (
            <EmptyState icon={Boxes} title="No hay stock para mostrar" description="Registrá una compra para el depósito o desde la etapa Compras de un proyecto." />
          ) : (
            <Card>
              <Table>
                <THead>
                  <TR>
                    <TH>Material</TH>
                    <TH className="text-right">Físico</TH>
                    <TH className="text-right">Disponible</TH>
                    <TH className="text-right">Asignado a proyectos</TH>
                    <TH className="text-right">Sobrantes</TH>
                    <TH><span className="sr-only">Detalle</span></TH>
                  </TR>
                </THead>
                <TBody>
                  {filtered.map((r) => (
                    <Fragment key={r.key}>
                      <TR className={r.key === material ? "bg-amber-50" : undefined}>
                        <TD className="min-w-44 font-medium text-slate-900">{r.name}<div className="text-xs font-normal text-slate-500">{r.unit}</div></TD>
                        <TD className="text-right tabular">{formatNumber(r.physical)}</TD>
                        <TD className="text-right tabular font-medium">{formatNumber(r.available)}</TD>
                        <TD className="text-right tabular">{formatNumber(r.assigned)}</TD>
                        <TD className="text-right tabular">{r.leftoverQty > 0 ? formatNumber(r.leftoverQty) : <span className="text-slate-300">0</span>}</TD>
                        <TD>
                          {canAssign && <Button size="sm" variant="outline" disabled={r.available <= EPS} onClick={() => setStockAction({ kind:"assign",target:{ materialId:r.materialId,materialName:r.name,unit:r.unit,max:r.available } })}>Asignar a proyecto</Button>}
                          {canAssign && <details className="text-xs mt-2"><summary>Asignaciones</summary>{stock.movements.filter((m) => m.kind === "assign" && stock.lots.some((l) => l.id === m.lotId && l.materialId === r.materialId && l.unit === r.unit)).map((m) => <p key={m.id}>{formatDate(m.date)} · {m.to.type === "project" ? projectCode(projects,m.to.projectId) : ""} · {formatQty(m.quantity,r.unit)}{stock.movements.some((n) => n.reversalOf === m.id) ? " · Revertida" : local && <Button size="sm" variant="ghost" onClick={() => { setUndo(m.id);setReason("");setError(""); }}>Revertir asignación</Button>}</p>)}</details>}
                        </TD>
                      </TR>
                    </Fragment>
                  ))}
                </TBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="sobrantes">
          {leftovers.length === 0 ? (
            <EmptyState icon={Boxes} title="No hay sobrantes reutilizables" />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Sobrantes reutilizables</CardTitle>
                <CardDescription>Conservan el costo del proyecto de origen. No son desperdicio.</CardDescription>
              </CardHeader>
              <Table>
                <THead>
                  <TR>
                    <TH>Material</TH>
                    <TH>Medidas</TH>
                    <TH className="text-right">Cantidad</TH>
                    <TH>Origen</TH>
                    <TH>Estado</TH>
                    <TH><span className="sr-only">Acciones</span></TH>
                  </TR>
                </THead>
                <TBody>
                  {leftovers.map((l) => (
                    <TR key={`${l.lot.id}-${l.assignedProjectId ?? "w"}`} className={l.lot.id === lot ? "bg-amber-50" : undefined}>
                      <TD className="font-medium text-slate-900">{l.lot.materialName}</TD>
                      <TD className="text-xs text-slate-600">{formatDims(l.lot.dims) || "—"}</TD>
                      <TD className="text-right tabular">{formatQty(l.quantity, l.lot.unit)}</TD>
                      <TD className="text-xs">
                        {l.lot.originProjectId ? (
                          <Link href={projectLink(l.lot.originProjectId)} className="text-blue-700 hover:underline">{l.lot.originProjectName}</Link>
                        ) : "—"}
                      </TD>
                      <TD className="text-xs text-slate-600">
                        {l.assignedProjectId ? `Asignado a ${projectCode(projects, l.assignedProjectId)}` : "Libre"}
                      </TD>
                      <TD>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="pedidos">
          {requests.length === 0 ? (
            <EmptyState icon={Boxes} title="Sin pedidos de operarios" description="Cuando un operario solicite material, aparece acá." />
          ) : (
            <Card>
              <Table>
                <THead>
                  <TR>
                    <TH>Fecha</TH>
                    <TH>Proyecto</TH>
                    <TH>Material</TH>
                    <TH className="text-right">Cantidad</TH>
                    <TH>Pidió</TH>
                    <TH>Estado</TH>
                    <TH><span className="sr-only">Acciones</span></TH>
                  </TR>
                </THead>
                <TBody>
                  {[...requests].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((r) => (
                    <TR key={r.id}>
                      <TD className="whitespace-nowrap tabular">{formatDateTime(r.createdAt)}</TD>
                      <TD><Link className="text-blue-700 hover:underline" href={projectLink(r.projectId, "materials")}>{projectCode(projects, r.projectId)}</Link></TD>
                      <TD>{r.materialName}{r.note && <div className="text-xs text-slate-500">{r.note}</div>}</TD>
                      <TD className="text-right tabular">{formatQty(r.quantity, r.unit)}</TD>
                      <TD>{r.requestedBy}</TD>
                      <TD><Badge tone={r.status === "open" ? "yellow" : r.status === "resolved" ? "green" : "gray"}>{r.status === "open" ? "Abierto" : r.status === "resolved" ? "Resuelto" : "Cancelado"}</Badge></TD>
                      <TD>
                        {session === "gerencia" && r.status === "open" && (
                          <div className="flex gap-1.5">
                            <Button size="sm" variant="outline" onClick={async () => await setRequestStatus(r.id, "resolved")}>Resuelto</Button>
                            <Button size="sm" variant="ghost" onClick={async () => await setRequestStatus(r.id, "cancelled")}>Cancelar</Button>
                          </div>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!undo} onOpenChange={(open) => !open && setUndo("")}><DialogContent><DialogHeader><DialogTitle>Revertir asignación</DialogTitle><DialogDescription>Conserva el movimiento original y devuelve el material al disponible.</DialogDescription></DialogHeader><label>Motivo<Input value={reason} onChange={(e) => setReason(e.target.value)} /></label>{error && <p role="alert">{error}</p>}<Button onClick={async () => { const r = await reverse(undo,reason);setError(r.ok ? "" : r.error);if (r.ok) setUndo(""); }}>Guardar reversión</Button></DialogContent></Dialog>
      {stockAction && <StockActionDialog action={stockAction.kind} target={stockAction.target} open onOpenChange={(open) => !open && setStockAction(null)} />}
    </div>
  );
}
