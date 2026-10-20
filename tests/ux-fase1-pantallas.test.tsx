// @vitest-environment jsdom
// Auditoría UX · Fase 1 — pantallas: dashboard nuevo, desvíos detectados en el proyecto, alertas con costo y
// qué revisar, Jefe de planta sin importes y Operario sin material usado.
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { buildSeed, STAR_PROJECT_ID } from "@/lib/seed-data";
import { DEFAULT_SETTINGS } from "@/lib/constants";
import { useAppStore } from "@/store/use-app-store";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(),
}));

const { GerenciaDashboard } = await import("@/components/gerencia/gerencia-dashboard");
const { DetectedDeviationsCard } = await import("@/components/projects/detected-deviations");
const { AlertsPage } = await import("@/components/alerts/alerts-page");
const { PlantSummaryPage, PlantAlertsPage } = await import("@/components/plant/plant-pages");
const { WorkshopHome } = await import("@/components/workshop/workshop-home");

const seed = buildSeed(new Date());
const star = seed.projects.find((p) => p.id === STAR_PROJECT_ID)!;

beforeEach(() => {
  useAppStore.setState({
    projects: seed.projects,
    operators: seed.operators,
    assignments: seed.assignments,
    dayExceptions: seed.dayExceptions,
    orders: seed.orders,
    stock: seed.stock,
    requests: [],
    resolvedAlertIds: [],
    settings: { ...DEFAULT_SETTINGS },
    role: "owner",
    isDemo: true,
    currentMode: "gerencia",
    actingOperatorId: null,
    organizationId: null,
  });
});
afterEach(cleanup);

describe("Administrativo", () => {
  it("el Dashboard de Gerencia explica por qué se pierde, ordenado por pesos", () => {
    render(<GerenciaDashboard />);
    const why = screen.getByRole("heading", { name: /¿Por qué se pierde\?/ }).parentElement!;
    const items = within(why).getAllByRole("listitem");
    expect(items.length).toBeGreaterThan(0);
    const amounts = items.map((li) => Number(li.querySelector("strong")!.textContent!.replace(/\D/g, "")));
    expect([...amounts].sort((a, b) => b - a)).toEqual(amounts);
    expect(why.textContent).toMatch(/P-1042/);
  });
  it("el proyecto muestra los desvíos detectados aparte del margen, hasta sus registros", () => {
    render(<DetectedDeviationsCard project={star} />);
    const card = screen.getByLabelText("Desvíos detectados aún no proyectados");
    expect(card).toHaveTextContent(/Desvíos detectados aún no proyectados: \$ [\d.]+ \(≈ \d+,\d puntos de margen\)/);
    expect(card).toHaveTextContent("no se suma al Margen esperado, al Margen proyectado ni al Margen real final");
    expect(card).toHaveTextContent("Mesa de comedor · Carpintería madera: 14 h de más");
    expect(card).toHaveTextContent("Caño estructural 40×40: $ 10.500 contra $ 9.000 estimado");
  });
  it("un proyecto sin desvíos no muestra la tarjeta", () => {
    render(<DetectedDeviationsCard project={seed.projects.find((p) => p.id === "p-1051")!} />);
    expect(screen.queryByLabelText("Desvíos detectados aún no proyectados")).toBeNull();
  });
  it("cada alerta económica dice qué pasó, cuánto cuesta y qué revisar", () => {
    render(<AlertsPage />);
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/Pierde 8,8 puntos de margen: \$ 1\.050\.000/);
    expect(text).toMatch(/Cuesta: \$ 1\.050\.000 \(≈ 8,8 puntos de margen\)/);
    expect(text).toMatch(/Qué revisar: Proyecto → Materiales/);
    expect(text).toMatch(/Mesa de comedor · Carpintería madera: 14 h por encima de lo estimado/);
    expect(text).not.toMatch(/sin consumir|Proyecto sin operario asignado|superaron su costo presupuestado en 0%/);
  });
});

describe("Jefe de planta: sin importes", () => {
  beforeEach(() => useAppStore.setState({ currentMode: "jefe_planta" }));
  it("Resumen y Alertas no muestran plata, pero sí qué revisar", () => {
    render(<PlantSummaryPage />);
    expect(document.body.textContent).not.toMatch(/\$/);
    cleanup();
    render(<PlantAlertsPage />);
    expect(document.body.textContent).not.toMatch(/\$/);
    expect(document.body.textContent).toMatch(/Qué revisar:/);
  });
});

describe("Operario: solo lo de hoy y un campo de horas", () => {
  beforeEach(() => useAppStore.setState({ currentMode: "operario", actingOperatorId: "op-juan" }));
  it("Mi día no tiene materiales, plata ni unidades", () => {
    render(<WorkshopHome />);
    expect(screen.getAllByLabelText("Horas trabajadas").length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/\$|Material usado|desperdicio|sobrante|unidades/i);
  });
  it("Mi día no muestra horas estimadas ni el pedido de material o problemas", () => {
    render(<WorkshopHome />);
    expect(document.body.textContent).not.toMatch(/estimadas|previstas|planificadas|Pedir material|problema/i);
  });
  it("y si lo intenta igual, la app lo rechaza", () => {
    const r = useAppStore.getState().registerUsage(STAR_PROJECT_ID, { materialId: "multilaminado-18", materialName: "Multilaminado 18 mm", unit: "placa", consumed: 1, waste: 0, date: "2026-10-16" });
    expect(r.ok).toBe(false);
  });
});
