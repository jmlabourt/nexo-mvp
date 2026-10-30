"use client";
// Administración → proyecto → Contrato y pagos (modo demostración). La aprobación congela el presupuesto y el contrato
// original; el contrato vigente cambia solo con motivo y queda auditado. Las condiciones de pago (seña, cuotas, días
// para pagar después de la entrega) alimentan lo previsto de facturar y el costo financiero.
import { useState } from "react";
import type { Project, ScheduledPayment } from "@/types";
import { currentContract, originalContract, reviseContract, setPaymentTerms, termsOf } from "@/lib/ledger";
import { createId } from "@/lib/activity";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/formatting";
import { useAppStore } from "@/store/use-app-store";
import { useLedgerBacked } from "@/store/selectors";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { OriginTag } from "@/components/shared/data-origin";

const num = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));
const SESSIONS = ["administracion", "gerencia"] as const;

export function ContractTerms({ project }: { project: Project }) {
  const ledgerBacked = useLedgerBacked();
  const ledger = useAppStore((s) => s.ledger);
  const record = useAppStore((s) => s.recordLedger);
  const [rev, setRev] = useState({ amount: "", reason: "" });
  const terms = termsOf(ledger, project.id);
  const [days, setDays] = useState(String(terms.daysAfterDelivery));
  const [schedule, setSchedule] = useState<ScheduledPayment[]>(terms.schedule);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  if (!ledgerBacked) {
    return (
      <p className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
        El contrato vigente y las condiciones de pago se guardan cuando el backend lo habilite. <OriginTag origin="pending" />
      </p>
    );
  }
  if (project.status === "quotation") {
    return <p className="text-sm text-slate-500">Una cotización todavía no tiene contrato: el precio se ajusta en la cotización y se congela al aprobarla.</p>;
  }
  const run = (fn: Parameters<typeof record>[1], ok: string) => {
    const r = record([...SESSIONS], fn);
    setError(r.ok ? "" : r.error);
    setSaved(r.ok ? ok : "");
    return r.ok;
  };
  const revisions = ledger.contractRevisions.filter((r) => r.projectId === project.id);
  const scheduled = schedule.reduce((s, x) => s + (x.amount || 0), 0);
  const contract = currentContract(project, ledger);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Contrato</CardTitle>
          <CardDescription>El monto aprobado queda congelado. Un cambio (adicional, quita) se registra con su motivo y no borra el original.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-md border border-slate-200 p-3">
              <dt className="text-xs text-slate-500">Contrato original (aprobado)</dt>
              <dd className="mt-1 text-base font-semibold tabular">{formatCurrency(originalContract(project))}</dd>
            </div>
            <div className="rounded-md border border-slate-200 p-3">
              <dt className="text-xs text-slate-500">Contrato vigente</dt>
              <dd className="mt-1 text-base font-semibold tabular">{formatCurrency(contract)}</dd>
            </div>
          </dl>
          {revisions.length > 0 && (
            <Table>
              <THead>
                <TR>
                  <TH>Cuándo</TH>
                  <TH className="text-right">Antes</TH>
                  <TH className="text-right">Después</TH>
                  <TH>Motivo</TH>
                  <TH>Quién</TH>
                </TR>
              </THead>
              <TBody>
                {revisions.map((r) => (
                  <TR key={r.id}>
                    <TD className="whitespace-nowrap">{formatDateTime(r.at)}</TD>
                    <TD className="text-right tabular">{formatCurrency(r.previous)}</TD>
                    <TD className="text-right tabular">{formatCurrency(r.next)}</TD>
                    <TD>{r.reason}</TD>
                    <TD>{r.by}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
          {!project.isClosed && (
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (run((l, ctx) => reviseContract(l, project, num(rev.amount), rev.reason, ctx), "Contrato actualizado.")) setRev({ amount: "", reason: "" });
              }}
            >
              <label className="text-sm font-medium text-slate-700">
                Nuevo monto vigente
                <Input className="mt-1 w-40" inputMode="decimal" value={rev.amount} onChange={(e) => setRev({ ...rev, amount: e.target.value })} />
              </label>
              <label className="min-w-56 flex-1 text-sm font-medium text-slate-700">
                Motivo
                <Input className="mt-1" value={rev.reason} onChange={(e) => setRev({ ...rev, reason: e.target.value })} placeholder="Adicional pedido por el cliente…" />
              </label>
              <Button type="submit" variant="outline">Registrar cambio</Button>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Condiciones de pago</CardTitle>
          <CardDescription>Seña, cuotas y saldo con su fecha prevista. Lo que no cubren las cuotas se cobra a los días indicados después de la entrega.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="text-sm font-medium text-slate-700">
            ¿A cuántos días de la entrega paga el cliente?
            <Input className="mt-1 w-32" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
          </label>
          <Table>
            <THead>
              <TR>
                <TH>Concepto</TH>
                <TH className="text-right">Importe</TH>
                <TH>Fecha prevista</TH>
                <TH><span className="sr-only">Quitar</span></TH>
              </TR>
            </THead>
            <TBody>
              {schedule.map((x, i) => (
                <TR key={x.id}>
                  <TD><Input aria-label={`Concepto ${i + 1}`} value={x.label} onChange={(e) => setSchedule(schedule.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} /></TD>
                  <TD><Input aria-label={`Importe ${i + 1}`} inputMode="decimal" className="w-36 text-right" value={String(x.amount)} onChange={(e) => setSchedule(schedule.map((y, j) => (j === i ? { ...y, amount: num(e.target.value) } : y)))} /></TD>
                  <TD><Input aria-label={`Fecha ${i + 1}`} type="date" className="w-40" value={x.date} onChange={(e) => setSchedule(schedule.map((y, j) => (j === i ? { ...y, date: e.target.value } : y)))} /></TD>
                  <TD><Button size="sm" variant="ghost" onClick={() => setSchedule(schedule.filter((_, j) => j !== i))}>Quitar</Button></TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <p className="text-xs text-slate-500">
            Cuotas: {formatCurrency(scheduled)} de {formatCurrency(contract)}. {scheduled < contract ? `El saldo (${formatCurrency(contract - scheduled)}) se cobra a ${days || 0} días de la entrega (${formatDate(project.dueDate)}).` : ""}
            {scheduled > contract ? " Las cuotas superan el contrato vigente." : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" onClick={() => setSchedule([...schedule, { id: createId("cuota"), label: schedule.length === 0 ? "Seña" : `Cuota ${schedule.length + 1}`, amount: 0, date: project.startDate }])}>
              Agregar seña o cuota
            </Button>
            <Button size="sm" onClick={() => run((l) => setPaymentTerms(l, { projectId: project.id, daysAfterDelivery: Number(days), schedule }), "Condiciones guardadas.")}>
              Guardar condiciones
            </Button>
          </div>
          {saved && <p role="status" className="text-sm text-emerald-700">{saved}</p>}
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
