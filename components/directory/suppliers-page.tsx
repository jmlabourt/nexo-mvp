"use client";
// Proveedores: un solo directorio compartido por Administración y Compras. Sale de las órdenes y compras registradas
// (no se inventa nadie). Compras ve además los materiales con su último precio y el historial; Administración, solo
// los datos de contacto y qué materiales provee. Los contactos de la demo son datos de ejemplo. Alta, edición y
// "Registrar precio" quedan para cuando la base guarde proveedores (PENDIENTES_BACKEND.md).
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { normalizeName, suppliersFrom, type SupplierSummary } from "@/lib/directory";
import { exampleSupplierDetails } from "@/lib/demo/ejemplos";
import { formatCurrency, formatDate } from "@/lib/formatting";
import { useAppStore } from "@/store/use-app-store";
import { useLedgerBacked } from "@/store/selectors";
import { useExampleData } from "@/store/session-data";
import { LedgerDirectory } from "./ledger-directory";
import { PageHeader } from "@/components/shared/page-header";
import { OriginTag, PendingAction } from "@/components/shared/data-origin";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function SuppliersPage({ prices }: { prices: boolean }) {
  const ledgerBacked = useLedgerBacked();
  return ledgerBacked ? <LedgerDirectory kind="suppliers" /> : <ExampleSuppliersPage prices={prices} />;
}

function ExampleSuppliersPage({ prices }: { prices: boolean }) {
  const projects = useAppStore((s) => s.projects);
  const stock = useAppStore((s) => s.stock);
  const orders = useAppStore((s) => s.orders);
  const example = useExampleData();
  const suppliers = useMemo(() => suppliersFrom(projects, stock, orders), [projects, stock, orders]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<SupplierSummary | null>(null);
  const details = (s: SupplierSummary) => (example ? exampleSupplierDetails(s.name, suppliers.indexOf(s)) : {});
  const list = suppliers.filter((s) => !q.trim() || normalizeName(s.name).includes(normalizeName(q)) || s.materials.some((m) => normalizeName(m.materialName).includes(normalizeName(q))));

  return (
    <div>
      <PageHeader
        title="Proveedores"
        subtitle={prices ? "Contactos, materiales que provee cada uno y su último precio con el historial." : "Directorio compartido con Compras: contactos y materiales que provee cada uno."}
        actions={<PendingAction label="Agregar proveedor" reason="El alta queda para cuando la base guarde proveedores." />}
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input aria-label="Buscar proveedor" placeholder="Buscar por proveedor o material…" className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {example && <OriginTag origin="example" />}
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Nombre</TH>
                <TH>Contacto</TH>
                <TH>Teléfono</TH>
                <TH>Correo</TH>
                <TH className="text-right">Materiales</TH>
                {prices && <TH>Última compra</TH>}
              </TR>
            </THead>
            <TBody>
              {list.length === 0 && <TR><TD colSpan={6} className="text-slate-500">Ningún proveedor con esa búsqueda.</TD></TR>}
              {list.map((s) => {
                const d = details(s);
                return (
                  <TR key={s.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setOpen(s)}>
                    <TD><button type="button" className="font-medium text-blue-700 hover:underline" onClick={() => setOpen(s)}>{s.name}</button></TD>
                    <TD>{d.contact ?? "—"}</TD>
                    <TD className="tabular">{d.phone ?? "—"}</TD>
                    <TD>{d.email ?? "—"}</TD>
                    <TD className="text-right tabular">{s.materials.length}</TD>
                    {prices && <TD className="tabular">{s.lastPurchase ? formatDate(s.lastPurchase) : "—"}</TD>}
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent side="right">
          {open && (
            <>
              <DialogHeader>
                <DialogTitle>{open.name}</DialogTitle>
                <DialogDescription>{open.orders} {open.orders === 1 ? "orden de compra" : "órdenes de compra"}{example ? " · contactos de ejemplo" : ""}.</DialogDescription>
              </DialogHeader>
              <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2 text-sm">
                {(["contact", "phone", "email", "address"] as const).map((k) => (
                  <div key={k} className="contents">
                    <dt className="text-slate-500">{{ contact: "Contacto", phone: "Teléfono", email: "Correo", address: "Dirección" }[k]}</dt>
                    <dd className="text-slate-900">{details(open)[k] ?? "—"}</dd>
                  </div>
                ))}
                <dt className="text-slate-500">Catálogo</dt>
                <dd>{details(open).catalogUrl ? <span className="text-slate-700">{details(open).catalogUrl}</span> : "—"}</dd>
              </dl>
              <h3 className="mt-5 text-sm font-semibold text-slate-900">Materiales que provee</h3>
              {open.materials.length === 0 ? (
                <p className="text-sm text-slate-500">Todavía no hay compras registradas a este proveedor.</p>
              ) : (
                <ul className="mt-1 divide-y divide-slate-100 text-sm">
                  {open.materials.map((m) => (
                    <li key={m.materialName} className="py-2">
                      <div className="flex flex-wrap justify-between gap-2">
                        <span className="font-medium text-slate-900">{m.materialName}</span>
                        {prices && (
                          <span className="tabular">
                            {formatCurrency(m.lastPrice)} / {m.unit} <span className="text-xs text-slate-500">({formatDate(m.lastDate)})</span>
                          </span>
                        )}
                      </div>
                      {prices && m.history.length > 1 && (
                        <ul className="mt-1 space-y-0.5 text-xs text-slate-500">
                          {m.history.slice(0, 5).map((h) => (
                            <li key={h.id} className="tabular">
                              {formatDate(h.date)} · {formatCurrency(h.unitCost)} · {h.destination}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-5 flex flex-wrap gap-3">
                <PendingAction label="Editar" />
                {prices && <PendingAction label="Registrar precio" reason="Los precios nuevos se guardan con historial cuando el backend lo habilite; las compras anteriores no cambian." />}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
