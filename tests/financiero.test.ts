import { describe, expect, it } from "vitest";
import { financialCost, quoteFinancialPct, quoteSchedule } from "@/lib/financial";

describe("gasto financiero", () => {
  it("$1.000.000, 30 días de producción + 30 de pago, 5 % mensual → $100.000", () => {
    const r = financialCost({ price: 1_000_000, monthlyRatePct: 5, startDate: "2026-11-01", deliveryDate: "2026-12-01", daysAfterDelivery: 30 });
    expect(r).toMatchObject({ ok: true, amount: 100_000, financedDays: 60, productionDays: 30 });
  });

  it("con seña del 50 % al inicio se financia solo el saldo", () => {
    const r = financialCost({
      price: 1_000_000,
      monthlyRatePct: 5,
      startDate: "2026-11-01",
      deliveryDate: "2026-12-01",
      daysAfterDelivery: 30,
      schedule: [{ amount: 500_000, date: "2026-11-01" }],
    });
    expect(r.ok && r.amount).toBe(50_000);
  });

  it("por tramos: cada cuota baja el saldo desde su fecha", () => {
    // 1.000.000 durante 30 días, 600.000 durante 30 días más (cuota de 400.000 a la entrega), saldo a 30 días.
    const r = financialCost({
      price: 1_000_000,
      monthlyRatePct: 3,
      startDate: "2026-11-01",
      deliveryDate: "2026-12-01",
      daysAfterDelivery: 30,
      schedule: [{ amount: 400_000, date: "2026-12-01" }],
    });
    expect(r.ok && r.tranches.map((t) => [t.balance, t.days, t.amount])).toEqual([
      [1_000_000, 30, 30_000],
      [600_000, 30, 18_000],
    ]);
    expect(r.ok && r.amount).toBe(48_000);
  });

  it("sin datos suficientes no inventa: explica qué falta", () => {
    expect(financialCost({ price: 0, monthlyRatePct: 5, startDate: "2026-11-01", deliveryDate: "2026-12-01", daysAfterDelivery: 0 })).toMatchObject({ ok: false });
    expect(financialCost({ price: 10, monthlyRatePct: 5, startDate: "", deliveryDate: "2026-12-01", daysAfterDelivery: 0 })).toMatchObject({ ok: false });
    expect(financialCost({ price: 10, monthlyRatePct: 5, startDate: "2026-12-02", deliveryDate: "2026-12-01", daysAfterDelivery: 0 })).toMatchObject({ ok: false });
    expect(financialCost({ price: 10, monthlyRatePct: 5, startDate: "2026-11-01", deliveryDate: "2026-12-01", daysAfterDelivery: 0, schedule: [{ amount: 20, date: "2026-11-01" }] })).toMatchObject({ ok: false });
  });
});

describe("gasto financiero en la cotización", () => {
  const base = { startDate: "2026-11-01", deliveryDate: "2026-12-01", daysAfterDelivery: 30, seniaPct: 0, installments: 1 };
  it("sin seña ni cuotas: 5 % mensual × 60 días = 10 % del precio", () => {
    const r = quoteFinancialPct(base, 5);
    expect(r.ok && r.amount).toBe(10);
  });
  it("seña del 50 % y saldo en 2 cuotas: por tramos sobre el saldo", () => {
    const s = quoteSchedule(1_000_000, { ...base, seniaPct: 50, installments: 2 });
    expect(s).toEqual([
      { label: "Seña 50 %", amount: 500_000, date: "2026-11-01" },
      { label: "Cuota 1 de 2", amount: 250_000, date: "2026-12-31" },
      { label: "Cuota 2 de 2", amount: 250_000, date: "2027-01-30" },
    ]);
    // 500.000 × 60 días + 250.000 × 30 días, al 5 % mensual = 50.000 + 12.500.
    expect(financialCost({ price: 1_000_000, monthlyRatePct: 5, ...base, schedule: s })).toMatchObject({ ok: true, amount: 62_500 });
    const pct = quoteFinancialPct({ ...base, seniaPct: 50, installments: 2 }, 5);
    expect(pct.ok && pct.amount).toBe(6.25);
  });
});
