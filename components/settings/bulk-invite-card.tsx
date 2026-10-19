"use client";
// Alta masiva de usuarios: se pega (desde Excel) o se sube un listado nombre, mail, rol. Se ve una vista previa con los
// errores antes de invitar; cada persona recibe el mail y queda un link propio para pasarle por el canal que quieras.
import { useMemo, useState, useTransition } from "react";
import { Copy, Upload, Users } from "lucide-react";
import { formatCurrency } from "@/lib/formatting";
import { ROLE_LABELS } from "@/lib/permissions";
import { useConfirmedAction } from "@/store/confirmed-action";
import { parseUserList, type Invitation, type Member } from "@/lib/users";
import { inviteUsers, type BulkInviteResult } from "@/app/(gestion)/settings/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

const EXAMPLE =
  "Nombre; Mail; Rol; Puesto; Costo por hora\nLaura Gómez; laura@empresa.com; Administrativo\nMartín Ruiz; martin@empresa.com; Compras\nCarla Sosa; carla@empresa.com; Jefe de planta\nJuan Pérez; juan@empresa.com; Operario; Carpintero; 4500";

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function BulkInviteCard({ free, members, invitations, onDone }: {
  free: { id: string; name: string }[];
  members: Member[];
  invitations: Invitation[];
  onDone: () => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [results, setResults] = useState<BulkInviteResult[] | null>(null);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const createOperator = useConfirmedAction("createOperator");

  const existing = useMemo(() => [...members.map((m) => m.email), ...invitations.map((i) => i.email)].filter(Boolean), [members, invitations]);
  const rows = useMemo(() => parseUserList(text, free, existing), [text, free, existing]);
  const valid = rows.filter((r) => !r.error);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setText(await file.text());
    setResults(null);
    setNote("");
  }

  function send() {
    startTransition(async () => {
      // Los operarios nuevos se cargan primero en Operarios (con su costo por hora); después se invita a cada persona.
      const failed: BulkInviteResult[] = [];
      const toInvite: { displayName: string; email: string; role?: string; operatorId?: string }[] = [];
      for (const r of valid) {
        let operatorId = r.operatorId;
        if (r.newOperator) {
          const created = await createOperator({ name: r.displayName, role: r.newOperator.position, hourlyCost: r.newOperator.hourlyCost, email: r.email });
          if (!created.ok) {
            failed.push({ ok: false, message: created.error, email: r.email, displayName: r.displayName });
            continue;
          }
          operatorId = created.value;
        }
        toInvite.push({ displayName: r.displayName, email: r.email, role: r.role, operatorId });
      }
      const res = await inviteUsers(toInvite);
      setResults([...failed, ...res]);
      setText("");
      await onDone();
    });
  }

  async function copyAll() {
    const lines = (results ?? []).filter((r) => r.ok && r.link).map((r) => `${r.displayName}: ${r.link}`);
    setNote((await copy(lines.join("\n"))) ? "Links copiados." : "No se pudo copiar: copialos uno por uno.");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Users className="size-4" aria-hidden /> Cargar un listado de usuarios</CardTitle>
        <CardDescription>
          Pegá desde Excel o subí un CSV con una persona por línea: nombre, mail y rol (Administrativo, Compras, Jefe de planta u Operario).
          Cada una recibe un mail y un link que la lleva directo a la pantalla de su rol. Un Operario que ya está en Operarios se vincula por nombre;
          si es nuevo, agregá las columnas Puesto y Costo por hora y se carga en Operarios al invitarlo. Si usás coma decimal en el costo, separá las columnas con tab o punto y coma.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label htmlFor="bulk-text" className="mb-1 block text-sm font-medium text-slate-800">Listado</label>
          <Textarea id="bulk-text" rows={6} value={text} onChange={(e) => { setText(e.target.value); setResults(null); setNote(""); }} placeholder={EXAMPLE} className="font-mono text-xs" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 focus-within:outline-2 focus-within:outline-blue-700">
            <Upload className="size-4" aria-hidden /> Subir CSV
            <input type="file" accept=".csv,.txt,text/csv,text/plain" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
          </label>
          <Button type="button" variant="ghost" onClick={() => { setText(EXAMPLE); setResults(null); }}>Ver ejemplo</Button>
        </div>

        {rows.length > 0 && !results && (
          <section aria-label="Vista previa del listado" className="space-y-3">
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <Table>
                <THead>
                  <TR><TH>Nombre</TH><TH>Mail</TH><TH>Rol</TH><TH>Estado</TH></TR>
                </THead>
                <TBody>
                  {rows.map((r) => (
                    <TR key={r.line} className="align-top">
                      <TD className="font-medium text-slate-900">{r.displayName || "—"}</TD>
                      <TD className="break-all text-slate-600">{r.email || "—"}</TD>
                      <TD>{r.role ? ROLE_LABELS[r.role] : "—"}</TD>
                      <TD>{r.error ? (
                          <span role="alert" className="text-xs text-red-600">Línea {r.line}: {r.error}</span>
                        ) : (
                          <span className="flex flex-col items-start gap-1">
                            <Badge>Listo</Badge>
                            {r.newOperator && (
                              <span className="text-xs text-slate-600">Se carga en Operarios: {r.newOperator.position}, {formatCurrency(r.newOperator.hourlyCost)}/h</span>
                            )}
                          </span>
                        )}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" disabled={pending || valid.length === 0} onClick={send}>
                {pending ? "Invitando…" : `Invitar a ${valid.length} ${valid.length === 1 ? "persona" : "personas"}`}
              </Button>
              {valid.length < rows.length && <p className="text-sm text-slate-600">Las filas con error no se invitan: corregilas en el texto.</p>}
            </div>
          </section>
        )}

        {results && (
          <section aria-label="Resultado de las invitaciones" className="space-y-3">
            <p role="status" className="text-sm text-slate-700">
              {results.filter((r) => r.ok).length} de {results.length} invitaciones guardadas. Pasale a cada persona su link (o copiá todos).
            </p>
            <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
              {results.map((r, i) => (
                <li key={`${r.email}-${i}`} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                  <span className="min-w-0 break-words">
                    <strong>{r.displayName || r.email}</strong> · {r.email}
                    <span className={`block text-xs ${r.ok ? "text-slate-500" : "text-red-600"}`}>{r.message}</span>
                  </span>
                  {r.ok && r.link && (
                    <Button size="sm" variant="outline" onClick={async () => setNote((await copy(r.link ?? "")) ? `Link de ${r.displayName} copiado.` : "No se pudo copiar el link.")}>
                      <Copy /> Copiar link
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="outline" onClick={() => void copyAll()}><Copy /> Copiar todos los links</Button>
              {note && <p role="status" className="text-sm text-emerald-700">{note}</p>}
            </div>
          </section>
        )}
      </CardContent>
    </Card>
  );
}
