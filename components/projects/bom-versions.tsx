"use client";
// BOM versionado de un mueble (modo demostración). Se arma desde los materiales cotizados del MISMO mueble (nunca se
// reparte en partes iguales); se guarda como borrador y solo la versión "Finalizado y enviado" alimenta Compras y
// Planta. Republicar crea otra versión: las órdenes de compra y los consumos ya hechos no se tocan.
import { useState } from "react";
import type { BomVersionLine, Project, ProjectItem } from "@/types";
import { bomChanges, draftBom, publishBom, publishedBom, saveBomDraft, startBomDraft } from "@/lib/ledger";
import { formatDate, formatNumber } from "@/lib/formatting";
import { createId } from "@/lib/activity";
import { useIdentity } from "@/store/selectors";
import { useMaterialCatalog } from "@/store/selectors";
import { useAppStore } from "@/store/use-app-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

const SESSIONS = ["administracion", "gerencia"] as const;

export function BomVersions({ project, item, canEdit: editable }: { project: Project; item: ProjectItem; canEdit: boolean }) {
  const allowed = useIdentity().session === "administracion";
  const canEdit = editable && allowed;
  const catalog = useMaterialCatalog().filter((m) => m.active !== false);
  const ledger = useAppStore((s) => s.ledger);
  const record = useAppStore((s) => s.recordLedger);
  const published = publishedBom(ledger, project.id, item.id);
  const draft = draftBom(ledger, project.id, item.id);
  const [lines, setLines] = useState<BomVersionLine[] | null>(null);
  const [error, setError] = useState("");
  const [cancelled, setCancelled] = useState(false);
  const editing = lines ?? draft?.lines ?? [];
  const changes = bomChanges(ledger, project.id, item.id);
  const run = (fn: Parameters<typeof record>[1]) => {
    const r = record([...SESSIONS], fn);
    setError(r.ok ? "" : r.error);
    return r.ok;
  };
  const setLine = (i: number, patch: Partial<BomVersionLine>) => setLines(editing.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <div className="space-y-2">
      <h4 className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Lista de materiales (BOM)
        {published ? <Badge tone="green">v{published.version} · Finalizado y enviado</Badge> : <Badge tone="gray">Sin publicar</Badge>}
        {draft && <Badge tone="yellow">Borrador v{draft.version}</Badge>}
      </h4>
      {published && (!draft || cancelled) && (
        <>
          <Table>
            <THead>
              <TR>
                <TH>Material</TH>
                <TH className="text-right">Cantidad</TH>
                <TH>Unidad</TH>
              </TR>
            </THead>
            <TBody>
              {published.lines.map((l) => (
                <TR key={l.id}>
                  <TD>{l.material}</TD>
                  <TD className="text-right tabular">{formatNumber(l.quantity)}</TD>
                  <TD>{l.unit}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <p className="text-xs text-slate-500">Publicado el {formatDate(published.publishedAt)}. Es la versión que ven Compras y Planta.</p>
          {changes.length > 0 && (
            <p className="text-xs text-amber-800">
              Cambios contra la versión anterior: {changes.map((c) => `${c.material} ${formatNumber(c.before)} → ${formatNumber(c.after)} ${c.unit}`).join(" · ")}.
            </p>
          )}
        </>
      )}
      {draft && !cancelled && (
        <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50/40 p-3">
          <p className="text-xs text-slate-600">Borrador: Compras y Planta todavía no lo ven{published ? ` (siguen con la v${published.version})` : ""}.</p>
          <Table>
            <THead>
              <TR>
                <TH>Material</TH>
                <TH className="text-right">Cantidad</TH>
                <TH>Unidad</TH>
                <TH><span className="sr-only">Quitar</span></TH>
              </TR>
            </THead>
            <TBody>
              {editing.map((l, i) => (
                <TR key={l.id}>
                  <TD>
                    <Select aria-label={`Material ${i + 1}`} value={l.materialId ?? ""} disabled={!canEdit} onChange={(e)=>{const m=catalog.find((m)=>m.id===e.target.value);if(m) setLine(i,{material:m.name,materialId:m.id,unit:m.unit});}}><option value="">{l.material ? `${l.material} · Histórico sin catálogo` : "Seleccioná material…"}</option>{l.materialId && !catalog.some((m)=>m.id===l.materialId) && <option value={l.materialId} disabled>{l.material} · Histórico</option>}{catalog.map((m)=><option key={m.id} value={m.id}>{m.name}</option>)}</Select>
                  </TD>
                  <TD>
                    <Input aria-label={`Cantidad de ${l.material || `material ${i + 1}`}`} inputMode="decimal" className="w-24 text-right" disabled={!canEdit} value={String(l.quantity)} onChange={(e) => setLine(i, { quantity: Number(e.target.value.replace(",", ".")) })} />
                  </TD>
                  <TD>
                    <Input aria-label={`Unidad de ${l.material || `material ${i + 1}`}`} className="w-20" readOnly value={l.unit} />
                  </TD>
                  <TD>
                    {canEdit && (
                      <Button size="sm" variant="ghost" onClick={() => setLines(editing.filter((_, j) => j !== i))}>Quitar</Button>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => { setLines(null); setError(""); setCancelled(true); }}>Cancelar</Button>
              <Button size="sm" variant="ghost" onClick={() => setLines([...editing, { id: createId("bomL"), material: "", quantity: 1, unit: "u" }])}>Agregar material</Button>
              <Button size="sm" variant="outline" disabled={!lines} onClick={() => run((l) => saveBomDraft(l, draft.id, editing)) && setLines(null)}>Guardar borrador</Button>
              <Button
                size="sm"
                onClick={() => {
                  if (run((l, ctx) => publishBom(lines ? saveBomDraft(l, draft.id, editing) : l, draft.id, ctx))) setLines(null);
                }}
              >
                Finalizar y enviar BOM
              </Button>
            </div>
          )}
        </div>
      )}
      {draft && cancelled && canEdit && <Button size="sm" variant="outline" onClick={() => setCancelled(false)}>Retomar borrador del BOM</Button>}
      {!draft && canEdit && !project.isClosed && (
        <Button size="sm" variant="outline" onClick={() => { if (run((l, ctx) => startBomDraft(l, project, item.id, ctx))) setCancelled(false); }}>
          {published ? "Nueva versión del BOM" : "Armar BOM desde lo cotizado"}
        </Button>
      )}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
