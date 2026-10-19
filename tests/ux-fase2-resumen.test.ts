// Ajustes al Resumen tras la Fase 1 (video de Juanita): sin signo en pesos, "podría quedar en ~X%" cuando el
// proyectado no cambia, rojo solo para lo grave (umbral de Configuración), "N proyectos en orden". Funciones puras.
import { describe, expect, it } from "vitest";
import type { ActualEntry } from "@/types";
import { buildSeed } from "@/lib/seed-data";
import { DEFAULT_SETTINGS as S } from "@/lib/constants";
import { deviationSeverity, profitOverview } from "@/lib/dashboard";
import { dailyHoursReviews, REVIEW_WINDOW_DAYS } from "@/lib/hours-review";
import { materialNeeds, materialsState, orderedNotReceivedAlerts, plantMaterialAlerts, purchasingAlerts } from "@/lib/purchasing";
import { project } from "./helpers";

const NOW = new Date("2026-10-19T12:00:00");
const today = "2026-10-19";
const seed = buildSeed(NOW);
const overview = (projects = seed.projects, severe = S.marginWarningPp) => profitOverview(projects, seed.assignments, today, S.dueSoonDays, severe);
const row = (o: ReturnType<typeof overview>, code: string) => o.rows.find((r) => r.project.code === code)!;

describe("gravedad: rojo solo para lo grave", () => {
  it("umbral en puntos de margen; sin precio de venta nunca es grave", () => {
    expect(deviationSeverity(8.8, 1_050_000, 5)).toBe("grave");
    expect(deviationSeverity(5, 1, 5)).toBe("grave");
    expect(deviationSeverity(4.4, 705_811, 5)).toBe("menor");
    expect(deviationSeverity(0, 10_000, 5)).toBe("menor");
    expect(deviationSeverity(0, 0, 5)).toBe("ok");
  });
  it("demo: P-1042 (−8,8) y P-1045 (−5,9) graves; P-1058 (≈4,4 detectado) y P-1039 (−0,1) menores", () => {
    const o = overview();
    expect(row(o, "P-1042").severity).toBe("grave");
    expect(row(o, "P-1045").severity).toBe("grave");
    expect(row(o, "P-1058").severity).toBe("menor");
    expect(row(o, "P-1039").severity).toBe("menor");
  });
  it("el umbral sale de Configuración: subirlo a 10 baja P-1042 y P-1045 a menor", () => {
    const o = overview(seed.projects, 10);
    expect(row(o, "P-1042").severity).toBe("menor");
    expect(row(o, "P-1045").severity).toBe("menor");
  });
});

describe("proyectado sin cambio + desvíos detectados (P-1058)", () => {
  it("muestra el proyectado actual y aparte 'podría quedar en ~X%'", () => {
    const r = row(overview(), "P-1058");
    expect(Math.abs(r.deltaPoints ?? 0)).toBeLessThan(0.05);
    expect(r.detected.points).not.toBeNull();
    expect(r.possibleMargin).toBeCloseTo((r.projectedMargin ?? 0) - (r.detected.points ?? 0), 6);
    expect(r.possibleMargin!).toBeLessThan(r.projectedMargin!);
  });
  it("sin desvíos detectados no hay 'podría quedar'", () => {
    expect(row(overview(), "P-1042").possibleMargin).toBeNull();
  });
});

describe("N proyectos en orden", () => {
  it("en orden = sin desvío económico y en tiempo", () => {
    const o = overview();
    expect(o.inOrder.map((r) => r.project.code)).toEqual(["P-1051"]);
    expect(o.inOrder.every((r) => r.impact === 0 && r.schedule.signal === "on_time")).toBe(true);
  });
  it("si a un proyecto en orden se le carga un costo de más, deja de estar en orden y sube la plata en riesgo", () => {
    const before = overview();
    const p = seed.projects.find((x) => x.code === "P-1051")!;
    const extra: ActualEntry = {
      id: "x-1",
      projectId: p.id,
      date: today,
      type: "other",
      category: "transport",
      description: "Flete extra",
      amount: 900_000,
      createdBy: "test",
      createdAt: `${today}T12:00:00Z`,
    };
    const after = overview(seed.projects.map((x) => (x.id === p.id ? { ...x, actualEntries: [...x.actualEntries, extra] } : x)));
    expect(after.inOrder.some((r) => r.project.id === p.id)).toBe(false);
    expect(after.atRisk).toBeGreaterThan(before.atRisk);
    expect(row(after, "P-1051").lostPoints).toBeGreaterThan(0);
  });
});

describe("revisión de horas por jornada: últimos 7 días y tolerancia", () => {
  const t = { pct: 25, hours: 2 };
  const asg = (date: string, planned: number) => ({ id: `a-${date}`, projectId: "a", operatorId: "juan", date, rubro: "carpinteria_madera" as const, plannedHours: planned, createdAt: "", createdBy: "" });
  const entry = (date: string, h: number): ActualEntry => ({
    id: `e-${date}`, projectId: "a", assignmentId: `a-${date}`, operatorId: "juan", date, type: "labor", category: "labor", description: "",
    amount: h * 100, createdBy: "Juan", createdAt: "", labor: { hours: h, workerName: "Juan", hourlyCost: 100, role: "Producción" },
  });
  it("diferencias chicas no se revisan (7,5 de 8 h); las que pasan la tolerancia sí (5 de 8 h)", () => {
    const small = [project({ id: "a", actualEntries: [entry("2026-10-16", 7.5)] })];
    expect(dailyHoursReviews(small, [asg("2026-10-16", 8)], [], today, t)).toHaveLength(0);
    const big = [project({ id: "a", actualEntries: [entry("2026-10-16", 5)] })];
    expect(dailyHoursReviews(big, [asg("2026-10-16", 8)], [], today, t)[0].reason).toBe("missing");
  });
  it(`solo los últimos ${REVIEW_WINDOW_DAYS} días`, () => {
    const old = [project({ id: "a", actualEntries: [entry("2026-10-09", 20)] })];
    expect(dailyHoursReviews(old, [asg("2026-10-09", 8)], [], today, t)).toHaveLength(0);
    const recent = [project({ id: "a", actualEntries: [entry("2026-10-13", 20)] })];
    expect(dailyHoursReviews(recent, [asg("2026-10-13", 8)], [], today, t)[0].reason).toBe("excess");
  });
  it("con los datos de la demo (Restaurar datos demo) no queda ruido", () => {
    expect(dailyHoursReviews(seed.projects, seed.assignments, seed.operators, today, t)).toHaveLength(0);
  });
});

describe("material pedido y no llegó (P1-3)", () => {
  const needs = () => materialNeeds(seed.projects, seed.orders, seed.stock, today);
  it("Compras: P-1058 tiene caño y tapacanto pedidos y sin recibir; ya arrancó → 'Trabajando sin material'", () => {
    const [a] = orderedNotReceivedAlerts(seed.projects, needs(), today, S.purchaseLeadDays);
    expect(a.projectCode).toBe("P-1058");
    expect(a.kind).toBe("material_arrival");
    expect(a.level).toBe("critical");
    expect(a.title).toBe("Trabajando sin material: 2 materiales pedidos y sin recibir");
    expect(a.message).toMatch(/Caño estructural 40×40 \(faltan 120 m\)/);
    expect(a.action).toMatch(/OC-0002/);
  });
  it("al recibir todo lo pedido, la alerta desaparece", () => {
    const orders = seed.orders.map((o) => ({ ...o, received: "yes" as const, lines: o.lines.map((l) => ({ ...l, receivedQuantity: l.quantity })) }));
    const n = materialNeeds(seed.projects, orders, seed.stock, today);
    expect(orderedNotReceivedAlerts(seed.projects, n, today, S.purchaseLeadDays)).toHaveLength(0);
  });
  it("una obra que arranca en más días que el aviso no alerta; dentro del aviso es 'warning' con los días", () => {
    const p = seed.projects.find((x) => x.code === "P-1058")!;
    const later = seed.projects.map((x) => (x.id === p.id ? { ...x, startDate: "2026-11-30" } : x));
    expect(orderedNotReceivedAlerts(later, needs(), today, S.purchaseLeadDays)).toHaveLength(0);
    const soon = seed.projects.map((x) => (x.id === p.id ? { ...x, startDate: "2026-10-22" } : x));
    const [a] = orderedNotReceivedAlerts(soon, needs(), today, S.purchaseLeadDays);
    expect(a.level).toBe("warning");
    expect(a.title).toMatch(/arranca en 3 días/);
  });
  it("lo que falta pedir en obras que ya arrancaron dice 'Trabajando sin material', no 'se necesitaban desde'", () => {
    const due = purchasingAlerts({ projects: seed.projects, orders: seed.orders, stock: seed.stock, settings: S, today }).filter((a) => a.kind === "purchase_due");
    expect(due.some((a) => /Trabajando sin material: 1 material sin pedir \(arrancó el/.test(a.title))).toBe(true);
    expect(due.every((a) => !/se necesitaban desde/.test(a.title))).toBe(true);
  });
  it("Jefe de planta: alerta sin importes ni proveedores, solo con el estado de materiales", () => {
    const n = needs();
    const alerts = plantMaterialAlerts(seed.projects, (p) => materialsState(n, p.id), today, S.purchaseLeadDays);
    expect(alerts.find((a) => a.projectCode === "P-1051")?.title).toBe("Falta material: arranca en 5 días");
    expect(alerts.find((a) => a.projectCode === "P-1058")?.level).toBe("critical");
    for (const a of alerts) {
      expect(a.impactAmount).toBeUndefined();
      expect(`${a.title} ${a.message} ${a.action}`).not.toMatch(/\$|OC-|Hierros|Maderera/);
    }
    // Con todo completo no hay alerta.
    expect(plantMaterialAlerts(seed.projects, () => "complete", today, S.purchaseLeadDays)).toHaveLength(0);
  });
});
