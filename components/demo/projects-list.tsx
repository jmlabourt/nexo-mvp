"use client";
// Proyectos (modo demostración). Gerencia ve contrato, costo real, ganancia y rentabilidad (parcial si sigue abierta);
// Administración ve datos comerciales y físicos, nunca costos reales ni rentabilidad.
import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import type { CoreStatus } from "@/lib/core/types";
import { STATUS_LABELS, QUOTE_STATE_LABELS } from "@/lib/core/ops";
import { contractAt } from "@/lib/core/contract";
import { economics, STAGE_LABEL } from "@/lib/core/economics";
import { clientName } from "@/lib/core/lookup";
import { draftBom, publishedBom } from "@/lib/core/needs";
import { normalize, sumBy } from "@/lib/core/util";
import { useIdentity } from "@/store/selectors";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { day, Empty, money, pct, StatusBadge, useCore, useDemoToday } from "./kit";

const STATUSES: CoreStatus[] = ["quotation", "approved", "purchasing", "production", "closed"];

export function ProjectsListDemo() {
  const w = useCore();
  const today = useDemoToday();
  const { session } = useIdentity();
  const gerencia = session === "gerencia";
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"" | CoreStatus>("");
  const [due, setDue] = useState("");
  const rows = useMemo(
    () =>
      w.projects
        .filter((p) => !status || p.status === status)
        .filter((p) => !due || p.dueDate <= due)
        .filter((p) => !q || normalize(`${p.ot} ${clientName(w, p.clientId)} ${p.description}`).includes(normalize(q)))
        .sort((a, b) => b.otNumber - a.otNumber),
    [w, q, status, due],
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Proyectos"
        actions={
          session === "administracion" && (
            <Button asChild>
              <Link href="/quotes?nuevo=1">
                <Plus /> Nuevo proyecto
              </Link>
            </Button>
          )
        }
      />
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Buscar
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="OT o cliente" className="w-56" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Estado
          <Select value={status} onChange={(e) => setStatus(e.target.value as CoreStatus | "")} className="w-44">
            <option value="">Todos</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Entrega hasta
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="w-44" />
        </label>
      </div>
      {rows.length === 0 ? (
        <Empty>No hay proyectos con ese filtro.</Empty>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white">
          <Table>
            <THead>
              <TR>
                <TH>OT</TH>
                <TH>Estado</TH>
                <TH>Entrega</TH>
                {gerencia ? (
                  <>
                    <TH className="text-right">Contrato</TH>
                    <TH className="text-right">Costo real</TH>
                    <TH className="text-right">Ganancia hasta hoy</TH>
                    <TH className="text-right">Rentabilidad hasta hoy</TH>
                  </>
                ) : (
                  <>
                    <TH className="text-right">Precio</TH>
                    <TH className="text-right">Unidades terminadas</TH>
                    <TH>BOM</TH>
                  </>
                )}
              </TR>
            </THead>
            <TBody>
              {rows.map((p) => {
                const e = gerencia && p.baseline ? economics(w, p, today) : null;
                const units = `${sumBy(p.items, (i) => i.completedUnits)}/${sumBy(p.items, (i) => i.quantity)}`;
                const pub = publishedBom(w, p.id);
                const late = p.status !== "closed" && p.status !== "quotation" && p.dueDate < today && !w.handovers.some((h) => h.projectId === p.id);
                return (
                  <TR key={p.id} className="hover:bg-slate-50">
                    <TD className="min-w-[14rem]">
                      <Link href={`/projects/${p.id}`} className="break-all font-medium text-blue-800 hover:underline">
                        {p.ot}
                      </Link>
                      <span className="block text-xs text-slate-500">{clientName(w, p.clientId)}</span>
                    </TD>
                    <TD>
                      <StatusBadge status={p.status} />
                      {p.status === "quotation" && <span className="mt-0.5 block text-xs text-slate-500">{QUOTE_STATE_LABELS[p.quote.state]}</span>}
                    </TD>
                    <TD className={cn("whitespace-nowrap", late && "font-medium text-red-700")}>{day(p.dueDate)}</TD>
                    {gerencia ? (
                      <>
                        <TD className="text-right tabular">{money(contractAt(w, p, today))}</TD>
                        <TD className="text-right tabular">{e ? money(e.realCost) : "—"}</TD>
                        <TD className="text-right tabular">{e ? money(e.profit) : "—"}</TD>
                        <TD className="text-right tabular">
                          {e ? (
                            <>
                              {pct(e.marginPct)}
                              <span className="block text-xs text-slate-500">{STAGE_LABEL[e.stage]}</span>
                            </>
                          ) : (
                            "—"
                          )}
                        </TD>
                      </>
                    ) : (
                      <>
                        <TD className="text-right tabular">{p.baseline ? money(contractAt(w, p, today)) : "—"}</TD>
                        <TD className="text-right tabular">{units}</TD>
                        <TD className="text-xs text-slate-600">{!p.baseline ? "—" : pub ? `v${pub.version} publicado${draftBom(w, p.id) ? " · borrador" : ""}` : draftBom(w, p.id) ? "Borrador" : "Pendiente"}</TD>
                      </>
                    )}
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </div>
      )}
    </div>
  );
}
