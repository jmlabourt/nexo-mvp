// @vitest-environment jsdom
// Jefe de planta: entrega de material y cierre del día desde "Proyectos" (demo, sin base). Sin un solo "$".
// Administrativo: lo ve resumido con costo en Alertas / "Para revisar hoy". Operario: nada de esto.
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { buildSeed, STAR_PROJECT_ID } from "@/lib/seed-data";
import { DEFAULT_SETTINGS } from "@/lib/constants";
import { todayISO } from "@/lib/formatting";
import { addDays } from "@/lib/plant";
import { deliverMaterial } from "@/lib/plant-materials";
import { useAppStore } from "@/store/use-app-store";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/planta/proyectos",
  useSearchParams: () => new URLSearchParams(),
}));

const { PlantProjectsPage } = await import("@/components/plant/plant-projects");
const { AlertsPage } = await import("@/components/alerts/alerts-page");
const { WorkshopHome } = await import("@/components/workshop/workshop-home");

const seed = buildSeed(new Date());

beforeEach(() => {
  useAppStore.setState({
    projects: seed.projects,
    operators: seed.operators,
    assignments: seed.assignments,
    dayExceptions: seed.dayExceptions,
    orders: seed.orders,
    stock: seed.stock,
    deliveries: [],
    requests: [],
    resolvedAlertIds: [],
    settings: { ...DEFAULT_SETTINGS },
    role: "owner",
    isDemo: true,
    currentMode: "jefe_planta",
    actingOperatorId: null,
    organizationId: null,
    syncStatus: "idle",
    syncError: null,
  });
});
afterEach(cleanup);

describe("Jefe de planta", () => {
  it("entrega material del depósito y cierra el día, solo con cantidades", async () => {
    const user = userEvent.setup();
    render(<PlantProjectsPage />);
    const section = screen.getByRole("region", { name: "Material en planta de P-1058" });
    expect(within(section).getByText("Nada entregado sin cerrar.")).toBeInTheDocument();

    await user.click(within(section).getByRole("button", { name: /Entregar material/ }));
    const dialog = await screen.findByRole("dialog");
    await user.selectOptions(within(dialog).getByLabelText("Material"), "mel-blanca-18");
    expect(within(dialog).getByLabelText(/Depósito libre \(3,5 placas\)/)).toBeChecked();
    await user.type(within(dialog).getByLabelText(/Cantidad/), "9");
    expect(within(dialog).getByRole("alert")).toHaveTextContent("No hay tanto material libre en el depósito (hay 3,5 placas).");
    await user.clear(within(dialog).getByLabelText(/Cantidad/));
    await user.type(within(dialog).getByLabelText(/Cantidad/), "2");
    await user.selectOptions(within(dialog).getByLabelText("Operario (opcional)"), "op-juan");
    expect(dialog.textContent).not.toMatch(/\$/);
    await user.click(within(dialog).getByRole("button", { name: "Registrar entrega" }));

    expect(useAppStore.getState().deliveries).toHaveLength(1);
    expect(within(section).getByText(/de Melamina blanca 18 mm → Mesa de comedor · Juan Pérez/)).toBeInTheDocument();

    await user.click(within(section).getByRole("button", { name: /Cierre del día/ }));
    const close = await screen.findByRole("dialog");
    expect(within(close).getByRole("region", { name: "Unidades terminadas" })).toBeInTheDocument();
    const consumed = within(close).getByLabelText("Consumido");
    await user.clear(consumed);
    await user.type(consumed, "1,5");
    await user.clear(within(close).getByLabelText("Sobrante reutilizable"));
    await user.type(within(close).getByLabelText("Sobrante reutilizable"), "0,5");
    expect(close.textContent).not.toMatch(/\$/);
    await user.click(within(close).getByRole("button", { name: "Cerrar el día" }));

    const [d] = useAppStore.getState().deliveries;
    expect(d).toMatchObject({ consumed: 1.5, waste: 0, leftover: 0.5 });
    expect(within(section).getByText("Nada entregado sin cerrar.")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\$/);
  });
});

describe("Administrativo", () => {
  it("ve la entrega de ayer sin cierre, con su costo y qué revisar", () => {
    const star = seed.projects.find((p) => p.id === STAR_PROJECT_ID)!;
    const today = todayISO();
    const r = deliverMaterial(star, seed.stock, [], { projectId: star.id, itemId: "itm-mesas", materialId: "mel-blanca-18", quantity: 2, source: "warehouse", date: addDays(today, -1) }, { actor: "Carla", now: new Date().toISOString(), today });
    useAppStore.setState({ currentMode: "admin", stock: r.stock, deliveries: [r.delivery] });
    render(<AlertsPage />);
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/Material entregado sin cierre del día desde el/);
    expect(text).toMatch(/Cuesta: \$ [\d.]+ \(≈ [\d,]+ puntos de margen\)/);
    expect(text).toMatch(/el Jefe de planta hace el Cierre del día/);
  });
});

describe("Operario", () => {
  it("no ve entregas ni cierres", () => {
    useAppStore.setState({ currentMode: "operario", actingOperatorId: "op-juan" });
    render(<WorkshopHome />);
    expect(document.body.textContent).not.toMatch(/Entregar material|Cierre del día|Material en planta/);
  });
});
