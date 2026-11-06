"use client";
// Clientes y Proveedores en el modo demostración: alta, edición y baja reales (lib/ledger.ts), sin duplicar nombres.
// Administración edita los dos; Compras edita proveedores. En una empresa real siguen como "Pendiente de backend".
import { useState } from "react";
import { Plus, Search } from "lucide-react";
import type { ClientEntry, SupplierEntry } from "@/types";
import { upsertClient, upsertSupplier } from "@/lib/ledger";
import { normalizeName } from "@/lib/directory";
import { useAppStore } from "@/store/use-app-store";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Kind = "clients" | "suppliers";
type Entry = ClientEntry | SupplierEntry;
type Form = { id?: string; name: string; contact: string; phone: string; email: string; address: string; notes: string; active: boolean; website: string };

const FIELDS: Array<{ key: keyof Omit<Form, "id" | "active" | "website">; label: string }> = [
  { key: "name", label: "Nombre" },
  { key: "contact", label: "Contacto" },
  { key: "phone", label: "Teléfono" },
  { key: "email", label: "Correo" },
  { key: "address", label: "Dirección" },
  { key: "notes", label: "Notas" },
];

const toForm = (e: Entry | null): Form => ({
  id: e?.id,
  name: e?.name ?? "",
  contact: e?.contact ?? "",
  phone: e?.phone ?? "",
  email: e?.email ?? "",
  address: e?.address ?? "",
  notes: e?.notes ?? "",
  active: (e as ClientEntry | null)?.active ?? true,
  website: (e as SupplierEntry | null)?.website ?? "",
});

export function LedgerDirectory({ kind }: { kind: Kind }) {
  const ledger = useAppStore((s) => s.ledger);
  const record = useAppStore((s) => s.recordLedger);
  const demoLocal = useAppStore((s) => s.demoLocal);
  const entries: Entry[] = kind === "clients" ? ledger.clients : ledger.suppliers;
  const [q, setQ] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const title = kind === "clients" ? "Clientes" : "Proveedores";
  const list = entries
    .filter((e) => showInactive || (e as ClientEntry).active !== false)
    .filter((e) => !q.trim() || normalizeName(e.name).includes(normalizeName(q)))
    .sort((a, b) => a.name.localeCompare(b.name));

  const save = () => {
    if (!form) return;
    const data = { id: form.id, name: form.name, contact: form.contact || undefined, phone: form.phone || undefined, email: form.email || undefined, address: form.address || undefined, notes: form.notes || undefined, active: form.active, ...(kind === "suppliers" ? { website:form.website || undefined } : {}) };
    const r = record(kind === "clients" ? ["administracion", "gerencia"] : ["administracion", "gerencia", "compras"], (l, ctx) => (kind === "clients" ? upsertClient(l, data, ctx) : upsertSupplier(l, data, ctx)));
    if (!r.ok) return setError(r.error);
    setError("");
    setForm(null);
  };

  return (
    <div>
      <PageHeader
        title={title}
        subtitle={kind === "clients" ? "Base central de clientes: al crear un proyecto se elige de esta lista." : "Directorio compartido entre Administración y Compras."}
        actions={
          <Button onClick={() => setForm(toForm(null))}>
            <Plus /> {kind === "clients" ? "Agregar cliente" : "Agregar proveedor"}
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input aria-label={`Buscar en ${title.toLowerCase()}`} placeholder="Buscar por nombre…" className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" className="size-4" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Mostrar dados de baja
        </label>
        {demoLocal && <span className="text-xs text-slate-500">Datos de ejemplo</span>}
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
                <TH>Dirección</TH>{kind === "suppliers" && <TH>Catálogo</TH>}
              </TR>
            </THead>
            <TBody>
              {list.length === 0 && (
                <TR>
                  <TD colSpan={5} className="text-slate-500">Sin resultados.</TD>
                </TR>
              )}
              {list.map((e) => (
                <TR key={e.id}>
                  <TD>
                    <button type="button" className="font-medium text-blue-700 hover:underline" onClick={() => setForm(toForm(e))}>{e.name}</button>
                    {(e as ClientEntry).active === false && <Badge tone="gray">De baja</Badge>}
                  </TD>
                  <TD>{e.contact ?? "—"}</TD>
                  <TD className="tabular">{e.phone ?? "—"}</TD>
                  <TD>{e.email ?? "—"}</TD>
                  <TD>{e.address ?? "Sin registro"}</TD>{kind === "suppliers" && <TD>{/^https?:\/\//i.test((e as SupplierEntry).website ?? "") ? <a href={(e as SupplierEntry).website} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">Ver catálogo</a> : "Sin registro"}</TD>}
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={form !== null} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent>
          {form && (
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
              className="space-y-3"
            >
              <DialogHeader>
                <DialogTitle>{form.id ? `Editar ${form.name}` : kind === "clients" ? "Nuevo cliente" : "Nuevo proveedor"}</DialogTitle>
                <DialogDescription>Se guarda en la demostración (este navegador).</DialogDescription>
              </DialogHeader>
              {FIELDS.map((f) => (
                <label key={f.key} className="block text-sm font-medium text-slate-700">
                  {f.label}
                  <Input className="mt-1" value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                </label>
              ))}
              {kind === "suppliers" && <label className="block text-sm">Enlace al catálogo<Input type="url" value={form.website} onChange={(e) => setForm({ ...form,website:e.target.value })} /></label>}
              {form.id && (
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" className="size-4" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Activo
                </label>
              )}
              {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setForm(null)}>Cancelar</Button>
                <Button type="submit">Guardar</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
