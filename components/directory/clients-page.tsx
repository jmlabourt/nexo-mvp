"use client";
// Administración → Clientes: la base central de clientes. Hoy sale de los proyectos cargados (sin duplicar nombres);
// los contactos de la demo son datos de ejemplo. Alta, edición y baja quedan para cuando la base devuelva y guarde la
// tabla de clientes (PENDIENTES_BACKEND.md): no se simula ningún guardado.
import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { clientsFrom, type ClientSummary } from "@/lib/directory";
import { exampleClientDetails } from "@/lib/demo/ejemplos";
import { GENERAL_STATE_LABELS, generalState } from "@/lib/gerencia";
import { formatDate } from "@/lib/formatting";
import { useAppStore } from "@/store/use-app-store";
import { useLedgerBacked } from "@/store/selectors";
import { useExampleData } from "@/store/session-data";
import { LedgerDirectory } from "./ledger-directory";
import { PageHeader } from "@/components/shared/page-header";
import { OriginTag, PendingAction } from "@/components/shared/data-origin";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { normalizeName } from "@/lib/directory";

export function ClientsPage() {
  const ledgerBacked = useLedgerBacked();
  return ledgerBacked ? <LedgerDirectory kind="clients" /> : <ExampleClientsPage />;
}

function ExampleClientsPage() {
  const projects = useAppStore((s) => s.projects);
  const example = useExampleData();
  const clients = useMemo(() => clientsFrom(projects), [projects]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<ClientSummary | null>(null);
  const details = (c: ClientSummary) => (example ? exampleClientDetails(c.name, clients.indexOf(c)) : {});
  const list = clients.filter((c) => !q.trim() || normalizeName(c.name).includes(normalizeName(q)) || c.projects.some((p) => normalizeName(p.code).includes(normalizeName(q))));

  return (
    <div>
      <PageHeader
        title="Clientes"
        subtitle="Base central de clientes. Al crear un proyecto se elige de esta lista para no escribir el mismo nombre dos veces."
        actions={<PendingAction label="Agregar cliente" reason="El alta queda para cuando la base guarde clientes." />}
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input aria-label="Buscar cliente" placeholder="Buscar por nombre o proyecto…" className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} />
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
                <TH className="text-right">Proyectos</TH>
              </TR>
            </THead>
            <TBody>
              {list.length === 0 && <TR><TD colSpan={5} className="text-slate-500">Ningún cliente con esa búsqueda.</TD></TR>}
              {list.map((c) => {
                const d = details(c);
                return (
                  <TR key={c.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setOpen(c)}>
                    <TD><button type="button" className="font-medium text-blue-700 hover:underline" onClick={() => setOpen(c)}>{c.name}</button></TD>
                    <TD>{d.contact ?? "—"}</TD>
                    <TD className="tabular">{d.phone ?? "—"}</TD>
                    <TD>{d.email ?? "—"}</TD>
                    <TD className="text-right tabular">{c.projects.length}{c.activeProjects > 0 && <span className="text-xs text-slate-500"> ({c.activeProjects} en curso)</span>}</TD>
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
                <DialogDescription>Ficha del cliente{example ? " · contactos de ejemplo" : ""}.</DialogDescription>
              </DialogHeader>
              <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2 text-sm">
                {(["contact", "phone", "email", "address"] as const).map((k) => (
                  <div key={k} className="contents">
                    <dt className="text-slate-500">{{ contact: "Contacto", phone: "Teléfono", email: "Correo", address: "Dirección" }[k]}</dt>
                    <dd className="text-slate-900">{details(open)[k] ?? "—"}</dd>
                  </div>
                ))}
                <dt className="text-slate-500">Notas</dt>
                <dd className="text-slate-500">—</dd>
              </dl>
              <h3 className="mt-5 text-sm font-semibold text-slate-900">Proyectos</h3>
              <ul className="mt-1 divide-y divide-slate-100 text-sm">
                {open.projects.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                    <Link href={`/projects/${p.id}`} className="text-blue-700 hover:underline">{p.code} {p.name}</Link>
                    <span className="flex items-center gap-2 text-xs text-slate-500">
                      entrega {formatDate(p.dueDate)} <Badge tone="gray">{GENERAL_STATE_LABELS[generalState(p)]}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-5 flex flex-wrap gap-3">
                <PendingAction label="Editar" />
                <PendingAction label="Desactivar" reason="" />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
