// Auditoría UX · Fase 1 — desvíos detectados (P0-1 b), alertas con su costo (P0-2), una situación = una alerta (P0-3),
// "Marcar resuelta" hasta que cambie el dato (P0-4) y resumen económico del dashboard (P0-5). Funciones puras.
import { describe, expect, it } from "vitest";
import type { ActualEntry, Alert } from "@/types";
import { buildSeed, STAR_PROJECT_ID } from "@/lib/seed-data";
import { DEFAULT_SETTINGS as S } from "@/lib/constants";
import { allAlerts, alertResolutionKey, projectAlerts, sortAlerts, splitAlerts } from "@/lib/alerts";
import { projectEconomics } from "@/lib/calculations";
import { detectedDeviations, hoursOverruns, withEconomicImpact } from "@/lib/deviations";
import { profitOverview } from "@/lib/dashboard";
import { plantAlerts } from "@/lib/plant";
import { purchasingAlerts } from "@/lib/purchasing";

const NOW = new Date("2026-10-19T12:00:00");
const today = "2026-10-19";
const seed = buildSeed(NOW);
const byId = (id: string) => seed.projects.find((p) => p.id === id)!;
const star = byId(STAR_PROJECT_ID);
const plant = () => plantAlerts({ projects: seed.projects, assignments: seed.assignments, operators: seed.operators, settings: S, hoursPerDay: 9.5, today, dayExceptions: seed.dayExceptions });
const adminAlerts = () =>
  withEconomicImpact(
    [...allAlerts(seed.projects, S, today), ...plant(), ...purchasingAlerts({ projects: seed.projects, orders: seed.orders, stock: seed.stock, settings: S, today })],
    seed.projects,
    seed.assignments,
    today,
  );

describe("desvíos detectados aún no proyectados (P0-1 b)", () => {
  it("P-1058: horas de más por producto + rubro × costo por hora, y facturas contra lo estimado", () => {
    const d = detectedDeviations(star, seed.assignments, today);
    expect(d.hours.map((h) => [h.itemName, h.rubro, h.over])).toEqual([["Mesa de comedor", "carpinteria_madera", 14]]);
    const h = d.hours[0];
    // El costo por hora es el de esas mismas horas cargadas (monto ÷ horas): Juan $ 15.000 y Diego $ 12.500.
    const entries = star.actualEntries.filter((e) => e.itemId === h.itemId && e.rubro === h.rubro);
    const rate = entries.reduce((s, e) => s + e.amount, 0) / entries.reduce((s, e) => s + (e.labor?.hours ?? 0), 0);
    expect(h.cost).toBeCloseTo(14 * rate, 0);
    expect(d.invoicesCost).toBe(450_000 + 60_000); // caño y multilaminado
    expect(d.notProjected.total).toBeCloseTo(d.hoursCost + d.invoicesCost, 2);
    expect(d.points).toBeCloseTo((d.notProjected.total / star.salesPrice) * 100, 6);
  });
  it("NO cambia el Margen proyectado (opción b): se muestra al lado", () => {
    expect(projectEconomics(star).projectedMargin).toBeCloseTo(projectEconomics(star).expectedMargin!, 6);
  });
  it("no cuenta dos veces: si el proyectado ya cubre el sobrecosto de la categoría, no queda nada aparte", () => {
    const p1042 = detectedDeviations(byId("p-1042"), seed.assignments, today);
    expect(p1042.invoicesCost).toBeGreaterThan(0);
    expect(p1042.notProjected.materials).toBe(0); // Materiales ya se proyecta +$ 1.000.000
  });
  it("cambia de verdad al cargar más horas o registrar otra factura cara", () => {
    const base = detectedDeviations(star, seed.assignments, today);
    const extra: ActualEntry = { ...star.actualEntries.find((e) => e.itemId === "itm-mesas" && e.rubro === "carpinteria_madera")!, id: "x1", labor: { role: "Trabajo", workerName: "Juan", hours: 6, hourlyCost: 15_000 }, amount: 90_000 };
    const moreHours = detectedDeviations({ ...star, actualEntries: [...star.actualEntries, extra] }, seed.assignments, today);
    expect(moreHours.hours[0].over).toBe(20);
    expect(moreHours.notProjected.total).toBeGreaterThan(base.notProjected.total);
    const cara = { ...star.purchaseEntries[0], id: "pur-x", unitCost: star.purchaseEntries[0].unitCost + 1_000, quantity: 10, total: (star.purchaseEntries[0].unitCost + 1_000) * 10 };
    const moreInvoices = detectedDeviations({ ...star, purchaseEntries: [...star.purchaseEntries, cara] }, seed.assignments, today);
    expect(moreInvoices.invoicesCost).toBeGreaterThan(base.invoicesCost);
  });
  it("en cotización o cerrado no hay desvíos detectados", () => {
    expect(detectedDeviations(byId("p-1056"), seed.assignments, today).notProjected.total).toBe(0);
    expect(detectedDeviations(byId("p-0987"), seed.assignments, today).notProjected.total).toBe(0);
  });
});

describe("alertas: qué pasó, cuánto cuesta y qué revisar (P0-2)", () => {
  it("la de horas del Administrativo dice cuánto cuesta en $ y en puntos de margen", () => {
    const a = adminAlerts().find((x) => x.kind === "hours")!;
    const h = hoursOverruns(star, seed.assignments, today)[0];
    expect(a.impactAmount).toBe(h.cost);
    expect(a.impactPoints).toBeCloseTo((h.cost / star.salesPrice) * 100, 6);
    expect(a.message).toMatch(/Cuesta ≈ \$/);
    expect(a.action).toMatch(/Mesa de comedor/);
  });
  it("la misma alerta del Jefe de planta NO tiene importes", () => {
    for (const a of plant()) {
      expect(a.impactAmount).toBeUndefined();
      expect(`${a.title} ${a.message}`).not.toMatch(/\$/);
    }
  });
  it("toda alerta económica tiene importe y qué revisar", () => {
    for (const a of adminAlerts().filter((x) => x.kind === "margin" || x.kind === "purchase_cost" || x.kind === "hours")) {
      expect(a.impactAmount, a.id).toBeGreaterThan(0);
      expect(a.impactPoints, a.id).toBeGreaterThan(0);
      expect(a.action, a.id).toBeTruthy();
    }
  });
});

describe("una situación = una alerta (P0-3)", () => {
  it("P-1042: una sola tarjeta con la caída de margen y la causa principal en $", () => {
    const own = projectAlerts(byId("p-1042"), S, today);
    expect(own.filter((a) => a.kind === "category")).toHaveLength(0);
    const [m] = own.filter((a) => a.kind === "margin");
    expect(m.title).toBe("Pierde 8,8 puntos de margen: $ 1.050.000");
    expect(m.message).toMatch(/Margen esperado 40,0% → Margen proyectado 31,3%\. Causa principal: Materiales \+\$ 1\.000\.000/);
    expect(m.message).toMatch(/También: Transporte y fletes \+\$ 50\.000/);
    expect(m.action).toMatch(/Materiales/);
  });
  it("sin ruido: ni 0 % ni 0,1 puntos, ni \"sin consumir\", ni \"sin operario asignado\"", () => {
    expect(projectAlerts(byId("p-1039"), S, today)).toEqual(expect.not.arrayContaining([expect.objectContaining({ kind: "margin" })]));
    const all = adminAlerts();
    expect(all.some((a) => a.kind === "reconciliation" || a.kind === "staffing" || a.kind === "category")).toBe(false);
    expect(all.length).toBeLessThanOrEqual(13); // antes 27
  });
  it("ordenadas por gravedad y, dentro del mismo nivel, por lo que cuestan", () => {
    const rank = { critical: 2, warning: 1, info: 0 };
    const all = sortAlerts(adminAlerts());
    for (let i = 1; i < all.length; i++) {
      const [a, b] = [all[i - 1], all[i]];
      expect(rank[a.level]).toBeGreaterThanOrEqual(rank[b.level]);
      if (a.level === b.level) expect(a.impactAmount ?? 0).toBeGreaterThanOrEqual(b.impactAmount ?? 0);
    }
  });
});

describe("\"Marcar resuelta\" dura hasta que cambie el dato (P0-4)", () => {
  const alert: Pick<Alert, "id" | "title" | "impactAmount"> = { id: "p:margin:warning", title: "Pierde 5,9 puntos de margen: $ 648.000", impactAmount: 648_000 };
  it("la clave no depende del día ni de la última modificación del proyecto", () => {
    expect(alertResolutionKey(alert)).toBe(alertResolutionKey({ ...alert }));
    expect(alertResolutionKey(alert)).not.toMatch(/2026-/);
  });
  it("si cambia el monto o el título, es otra clave: la alerta vuelve", () => {
    expect(alertResolutionKey({ ...alert, impactAmount: 700_000 })).not.toBe(alertResolutionKey(alert));
    expect(alertResolutionKey({ ...alert, title: "Pierde 6,0 puntos de margen: $ 660.000" })).not.toBe(alertResolutionKey(alert));
  });
  it("una alerta resuelta sigue resuelta al día siguiente", () => {
    const p = byId("p-1045");
    const [a] = projectAlerts(p, S, today);
    expect(splitAlerts(projectAlerts(p, S, "2026-10-25"), [a.resolutionKey]).open.some((x) => x.id === a.id)).toBe(false);
  });
});

describe("resumen económico del dashboard (P0-5)", () => {
  const o = profitOverview(seed.projects, seed.assignments, today, S.dueSoonDays);
  it("proyectos ordenados por impacto en pesos, con la causa principal y su monto", () => {
    expect(o.rows.map((r) => r.project.code).slice(0, 3)).toEqual(["P-1042", "P-1058", "P-1045"]);
    expect(o.rows[0].mainCause).toMatchObject({ label: "Materiales", amount: 1_000_000, kind: "projected" });
    expect(o.rows[1].mainCause).toMatchObject({ label: "Facturas más caras", kind: "detected" });
    for (let i = 1; i < o.rows.length; i++) expect(o.rows[i - 1].impact).toBeGreaterThanOrEqual(o.rows[i].impact);
  });
  it("plazo separado de la plata: P-1047 está atrasado y no pierde margen", () => {
    const r = o.rows.find((x) => x.project.code === "P-1047")!;
    expect(r.schedule.signal).toBe("late");
    expect(r.overrun).toBe(0);
  });
  it("los tres márgenes no se mezclan: en curso (esperado → proyectado) y cerrados (real final) por separado", () => {
    expect(o.expected).toBeCloseTo(32.0, 0);
    expect(o.projected).toBeCloseTo(29.8, 0);
    expect(o.closed.every((c) => c.project.isClosed)).toBe(true);
    expect(o.rows.every((r) => !r.project.isClosed)).toBe(true);
    expect(o.closedMargin).toBeCloseTo(31.0, 0);
  });
  it("plata en riesgo = suma de los sobrecostos proyectados; detectado = suma de lo aún no proyectado", () => {
    expect(o.atRisk).toBe(o.rows.reduce((s, r) => s + r.overrun, 0));
    expect(o.detected).toBeCloseTo(o.rows.reduce((s, r) => s + r.detected.notProjected.total, 0), 2);
    expect(o.causes.find((c) => c.key === "hours")?.projects).toEqual(["P-1058"]);
  });
});
