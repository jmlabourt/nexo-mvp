import { describe, expect, it } from "vitest";
import { categoryAlertLevel, economicHealth, marginAlertLevel, projectAlerts } from "@/lib/alerts";
import { DEFAULT_SETTINGS as S } from "@/lib/constants";
import { line, project, usage } from "./helpers";

describe("umbrales", () => {
  it("categoría: ≤10 info, 10–20 warning, >20 critical", () => {
    expect(categoryAlertLevel(5, S)).toBe("info");
    expect(categoryAlertLevel(15, S)).toBe("warning");
    expect(categoryAlertLevel(25, S)).toBe("critical");
  });
  it("margen: <5 info, 5–10 warning, >10 critical", () => {
    expect(marginAlertLevel(3, S)).toBe("info");
    expect(marginAlertLevel(7, S)).toBe("warning");
    expect(marginAlertLevel(12, S)).toBe("critical");
  });
  it("thresholds configurables", () => {
    expect(categoryAlertLevel(15, { ...S, categoryCriticalPct: 12 })).toBe("critical");
  });
});

describe("alertas derivadas", () => {
  it("sin registros en producción por 7 días", () => {
    const p = project({ startDate: "2026-01-01", materialUsages: [usage({ date: "2026-01-02", quantityConsumed: 1 })] });
    const a = projectAlerts(p, S, "2026-01-12");
    expect(a.some((x) => x.kind === "stale" && x.message.includes("10 días"))).toBe(true);
  });
  it("entrega próxima y todavía en Compras", () => {
    const p = project({ status: "purchasing", dueDate: "2026-01-14" });
    expect(projectAlerts(p, S, "2026-01-11").some((x) => x.kind === "due" && /Compras/.test(x.title))).toBe(true);
    // Ya en Producción deja de ser esa alerta.
    expect(projectAlerts({ ...p, status: "production" }, S, "2026-01-11").some((x) => x.kind === "due")).toBe(false);
  });
  it("mucho plazo consumido y sin llegar a Producción", () => {
    const p = project({ status: "approved", startDate: "2026-01-01", dueDate: "2026-03-01" });
    expect(projectAlerts(p, S, "2026-01-10").some((x) => x.kind === "due")).toBe(false);
    expect(projectAlerts(p, S, "2026-02-05").some((x) => x.kind === "due" && /plazo/i.test(x.title))).toBe(true);
  });
  it("entrega vencida y no finalizado → crítica", () => {
    const p = project({ status: "production", dueDate: "2026-01-05" });
    const a = projectAlerts(p, S, "2026-01-11").find((x) => x.kind === "due");
    expect(a?.level).toBe("critical");
  });
  it("material asignado sin consumir en Instalación → aviso", () => {
    const p = project({ status: "installation", dueDate: "2026-06-01" });
    const stock = {
      lots: [{ id: "l1", materialId: "m", materialName: "Placa", unit: "placa", unitCost: 100, kind: "purchase" as const, createdBy: "t", createdAt: "2026-01-02T00:00:00Z" }],
      movements: [{ id: "m1", lotId: "l1", kind: "purchase_in" as const, quantity: 3, from: { type: "supplier" as const }, to: { type: "project" as const, projectId: "p" }, date: "2026-01-02", createdBy: "t", createdAt: "2026-01-02T00:00:00Z" }],
    };
    expect(projectAlerts(p, S, "2026-01-11", stock).some((x) => x.kind === "reconciliation" && x.level === "warning")).toBe(true);
    expect(projectAlerts(p, S, "2026-01-11").some((x) => x.kind === "reconciliation")).toBe(false);
  });
  it("salud económica: crítico → En riesgo", () => {
    const p = project({
      salesPrice: 2000,
      budgetLines: [line("materials", null, 1000)],
      materialUsages: [usage({ quantityConsumed: 1, unitCost: 1300, date: "2026-01-10" })],
    });
    expect(economicHealth(p, S, "2026-01-11")).toBe("risk");
  });
  it("proyecto finalizado no genera alertas", () => {
    const p = project({ status: "completed", isClosed: true, dueDate: "2020-01-01" });
    expect(projectAlerts(p, S, "2026-01-11")).toHaveLength(0);
  });
});
