"use client";
// Clientes y Proveedores (modo demostración): catálogos únicos. Lo que se crea acá aparece al crear una OT o al
// registrar una OC.
import { useState } from "react";
import { ExternalLink, Plus } from "lucide-react";
import type { Client, Supplier } from "@/lib/core/types";
import * as op from "@/lib/core/ops";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { normalize } from "@/lib/core/util";
import { Empty, FormDialog, useAct, useCore } from "./kit";

export function ClientsDemo({ embedded }: { embedded?: boolean }) {
  const w = useCore();
  const [q, setQ] = useState("");
  const list = w.clients.filter((c) => !q || normalize(c.name).includes(normalize(q)));
  return (
    <div className="space-y-4">
      {!embedded && <PageHeader title="Clientes" actions={<ClientDialog trigger={<Button><Plus /> Nuevo cliente</Button>} />} />}
      {embedded && <div className="flex justify-end"><ClientDialog trigger={<Button size="sm"><Plus /> Nuevo cliente</Button>} /></div>}
      <Input placeholder="Buscar cliente" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
      {list.length === 0 ? <Empty>Sin clientes.</Empty> : (
        <div className="rounded-lg border border-slate-200 bg-white">
          <Table>
            <THead><TR><TH>Nombre</TH><TH>Contacto</TH><TH>Teléfono</TH><TH>Email</TH><TH>OTs</TH><TH /></TR></THead>
            <TBody>
              {list.map((c) => (
                <TR key={c.id}>
                  <TD className="font-medium">{c.name}{!c.active && <span className="ml-2 text-xs text-slate-500">inactivo</span>}</TD>
                  <TD>{c.contact}</TD>
                  <TD>{c.phone}</TD>
                  <TD>{c.email}</TD>
                  <TD className="tabular">{w.projects.filter((p) => p.clientId === c.id).length}</TD>
                  <TD><ClientDialog client={c} trigger={<Button size="sm" variant="ghost">Editar</Button>} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function ClientDialog({ client, trigger }: { client?: Client; trigger: React.ReactNode }) {
  const act = useAct();
  const [f, setF] = useState({ name: client?.name ?? "", contact: client?.contact ?? "", phone: client?.phone ?? "", email: client?.email ?? "", taxId: client?.taxId ?? "", active: client?.active ?? true });
  return (
    <FormDialog trigger={trigger} title={client ? "Editar cliente" : "Nuevo cliente"} submitLabel="Guardar" onSubmit={() => act((cw, ctx) => op.upsertClient(cw, { ...f, id: client?.id }, ctx))}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre" htmlFor="cl-n"><Input id="cl-n" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="CUIT (opcional)" htmlFor="cl-t"><Input id="cl-t" value={f.taxId} onChange={(e) => setF({ ...f, taxId: e.target.value })} /></Field>
        <Field label="Contacto" htmlFor="cl-c"><Input id="cl-c" value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} /></Field>
        <Field label="Teléfono" htmlFor="cl-p"><Input id="cl-p" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Email" htmlFor="cl-e"><Input id="cl-e" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        {client && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Activo</label>}
      </div>
    </FormDialog>
  );
}

export function SuppliersDemo({ embedded }: { embedded?: boolean }) {
  const w = useCore();
  const [q, setQ] = useState("");
  const list = w.suppliers.filter((s) => !q || normalize(s.name).includes(normalize(q)));
  return (
    <div className="space-y-4">
      {!embedded && <PageHeader title="Proveedores" actions={<SupplierDialog trigger={<Button><Plus /> Nuevo proveedor</Button>} />} />}
      {embedded && <div className="flex justify-end"><SupplierDialog trigger={<Button size="sm"><Plus /> Nuevo proveedor</Button>} /></div>}
      <Input placeholder="Buscar proveedor" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
      {list.length === 0 ? <Empty>Sin proveedores.</Empty> : (
        <div className="rounded-lg border border-slate-200 bg-white">
          <Table>
            <THead><TR><TH>Nombre</TH><TH>Contacto</TH><TH>Listas de precios y catálogos</TH><TH>OCs</TH><TH /></TR></THead>
            <TBody>
              {list.map((s) => (
                <TR key={s.id}>
                  <TD className="font-medium">{s.name}{!s.active && <span className="ml-2 text-xs text-slate-500">inactivo</span>}</TD>
                  <TD>{s.contact}{s.phone && <span className="block text-xs text-slate-500">{s.phone}</span>}</TD>
                  <TD className="text-sm">
                    {s.links.map((l) => (
                      <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="mr-3 inline-flex items-center gap-1 text-blue-700 hover:underline">{l.label}<ExternalLink className="size-3" /></a>
                    ))}
                  </TD>
                  <TD className="tabular">{w.orders.filter((o) => o.supplierId === s.id).length}</TD>
                  <TD><SupplierDialog supplier={s} trigger={<Button size="sm" variant="ghost">Editar</Button>} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function SupplierDialog({ supplier, trigger }: { supplier?: Supplier; trigger: React.ReactNode }) {
  const act = useAct();
  const [f, setF] = useState({ name: supplier?.name ?? "", contact: supplier?.contact ?? "", phone: supplier?.phone ?? "", email: supplier?.email ?? "", active: supplier?.active ?? true });
  const [links, setLinks] = useState(supplier?.links.length ? supplier.links : [{ label: "Lista de precios", url: "" }]);
  return (
    <FormDialog trigger={trigger} title={supplier ? "Editar proveedor" : "Nuevo proveedor"} submitLabel="Guardar" onSubmit={() => act((cw, ctx) => op.upsertSupplier(cw, { ...f, links, id: supplier?.id }, ctx))}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre" htmlFor="sp-n"><Input id="sp-n" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Contacto" htmlFor="sp-c"><Input id="sp-c" value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} /></Field>
        <Field label="Teléfono" htmlFor="sp-p"><Input id="sp-p" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Email" htmlFor="sp-e"><Input id="sp-e" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        {supplier && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Activo</label>}
      </div>
      <div className="space-y-2">
        {links.map((l, i) => (
          <div key={i} className="grid grid-cols-[10rem_1fr] gap-2">
            <Input aria-label="Nombre del link" value={l.label} onChange={(e) => setLinks(links.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} />
            <Input aria-label="URL" placeholder="https://…" value={l.url} onChange={(e) => setLinks(links.map((x, k) => (k === i ? { ...x, url: e.target.value } : x)))} />
          </div>
        ))}
        <Button type="button" size="sm" variant="ghost" onClick={() => setLinks([...links, { label: "Catálogo", url: "" }])}><Plus /> Link</Button>
      </div>
    </FormDialog>
  );
}
