"use client";
// Cotizador → condiciones de cobro: fechas de inicio y entrega, "¿A cuántos días de la entrega paga el cliente?",
// seña y cuotas. Con eso el gasto financiero se calcula (lib/financial.ts) como % del precio de venta sin IVA:
// precio × tasa mensual / 100 × días financiados / 30, por tramos sobre el saldo. Es una estimación, nunca un costo pagado.
import { quoteFinancialPct } from "@/lib/financial";
import { formatNumber, todayISO } from "@/lib/formatting";
import { useAppStore } from "@/store/use-app-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CalcState, QuoteFinanceForm } from "./calculator-state";

const num = (s: string) => Number(s.replace(",", "."));
const plusDays = (iso: string, d: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);

/** Tasa mensual: la de Configuración → Gasto financiero (en la demo) o el % configurado, leído como tasa mensual. */
export function useMonthlyRate(): number {
  const demoLocal = useAppStore((s) => s.demoLocal);
  const ledgerRate = useAppStore((s) => s.ledger.financialMonthlyRatePct);
  const settingsRate = useAppStore((s) => s.costSettings.financialPct);
  return demoLocal ? ledgerRate : settingsRate;
}

export function financePct(f: QuoteFinanceForm, rate: number) {
  return quoteFinancialPct(
    { startDate: f.startDate, deliveryDate: f.deliveryDate, daysAfterDelivery: Math.round(num(f.daysAfterDelivery)), seniaPct: num(f.seniaPct) || 0, installments: Math.round(num(f.installments)) || 1 },
    rate,
  );
}

export function FinanceFields({ state, onState }: { state: CalcState; onState: (patch: Partial<CalcState>) => void }) {
  const rate = useMonthlyRate();
  const f = state.finance;
  const update = (patch: Partial<QuoteFinanceForm>) => {
    const next = { ...(f as QuoteFinanceForm), ...patch };
    const r = financePct(next, rate);
    onState({ finance: next, ...(r.ok ? { financialPct: String(r.amount).replace(".", ",") } : {}) });
  };
  if (!f) {
    return (
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-md border border-dashed border-slate-300 p-3 text-sm text-slate-600">
        <span className="flex-1">Para calcular el gasto financiero, cargá las fechas y cómo paga el cliente.</span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            const start = todayISO();
            const init: QuoteFinanceForm = { startDate: start, deliveryDate: plusDays(start, 30), daysAfterDelivery: "30", seniaPct: "0", installments: "1" };
            const r = financePct(init, rate);
            onState({ finance: init, ...(r.ok ? { financialPct: String(r.amount).replace(".", ",") } : {}) });
          }}
        >
          Cargar condiciones de cobro
        </Button>
      </div>
    );
  }
  const r = financePct(f, rate);
  return (
    <fieldset className="mt-4 space-y-2 rounded-md border border-slate-200 p-3">
      <legend className="px-1 text-sm font-semibold text-slate-800">Condiciones de cobro y gasto financiero</legend>
      <div className="grid gap-2 sm:grid-cols-5">
        <label className="text-xs font-medium text-slate-600">
          Inicio
          <Input className="mt-1" type="date" value={f.startDate} onChange={(e) => update({ startDate: e.target.value })} />
        </label>
        <label className="text-xs font-medium text-slate-600">
          Entrega
          <Input className="mt-1" type="date" value={f.deliveryDate} onChange={(e) => update({ deliveryDate: e.target.value })} />
        </label>
        <label className="text-xs font-medium text-slate-600">
          ¿A cuántos días de la entrega paga el cliente?
          <Input className="mt-1" inputMode="numeric" value={f.daysAfterDelivery} onChange={(e) => update({ daysAfterDelivery: e.target.value })} />
        </label>
        <label className="text-xs font-medium text-slate-600">
          Seña al inicio (%)
          <Input className="mt-1" inputMode="decimal" value={f.seniaPct} onChange={(e) => update({ seniaPct: e.target.value })} />
        </label>
        <label className="text-xs font-medium text-slate-600">
          Saldo en cuotas (cada 30 días)
          <Input className="mt-1" inputMode="numeric" value={f.installments} onChange={(e) => update({ installments: e.target.value })} />
        </label>
      </div>
      <p className="text-xs text-slate-600" role="status">
        {r.ok
          ? `Tasa ${formatNumber(rate, 2)} % mensual · ${r.productionDays} días de producción + ${f.daysAfterDelivery || 0} de pago${r.tranches.length > 1 ? `, por tramos sobre el saldo (${r.tranches.length} tramos)` : ""} → gasto financiero ${formatNumber(r.amount, 2)} % del precio de venta sin IVA.`
          : r.reason}
      </p>
      <p className="text-xs text-slate-500">Es una estimación: al aprobar queda la foto en el presupuesto; nunca se muestra como un costo pagado.</p>
    </fieldset>
  );
}
