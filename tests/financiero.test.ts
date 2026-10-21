import { describe, expect, it } from "vitest";
import { financialCost } from "@/lib/financial";

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
