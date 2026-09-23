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
  it("entrega próxima con avance < 80%", () => {
    const p = project({ dueDate: "2026-01-14", progressPercent: 50 });
    expect(projectAlerts(p, S, "2026-01-11").some((x) => x.kind === "due")).toBe(true);
    expect(projectAlerts({ ...p, progressPercent: 85 }, S, "2026-01-11").some((x) => x.kind === "due")).toBe(false);
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
