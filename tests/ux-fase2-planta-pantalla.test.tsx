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
import { applyChange,assignToProject } from "@/lib/stock";
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
  it("registra materiales sin entregar ni generar una entrega artificial", async () => {
    const target=seed.projects.find(p=>p.code==="P-1058")!;
    const stock=applyChange(seed.stock,assignToProject(seed.stock,{projectId:target.id,materialId:"mel-blanca-18",quantity:2,date:todayISO()},{actor:"Compras",now:new Date().toISOString()}));
    useAppStore.setState({ demoLocal:true,stock });
    const user = userEvent.setup();render(<PlantProjectsPage />);
    const section = screen.getByRole("region",{ name:"Material en planta de P-1058" });
    expect(within(section).queryByRole("button",{ name:/Entregar material/ })).not.toBeInTheDocument();
    await user.click(within(section).getByRole("button",{ name:/Registrar materiales/ }));
    const dialog = screen.getByRole("dialog");
    await user.selectOptions(within(dialog).getByLabelText("Material"),"mel-blanca-18");
    await user.type(within(dialog).getByLabelText("Consumido"),"1,5");
    await user.type(within(dialog).getByLabelText("Sobrante reutilizable"),"0,5");
    expect(dialog.textContent).not.toMatch(/\$/);
    await user.click(within(dialog).getByRole("button",{ name:"Guardar uso" }));
    expect(useAppStore.getState().deliveries).toHaveLength(0);
    const project = useAppStore.getState().projects.find((p) => p.code === "P-1058")!;
    expect(project.materialUsages.filter((u) => u.notes?.startsWith("Registro de materiales")).reduce((sum,u) => sum+u.quantityConsumed,0)).toBe(1.5);
  });
});

describe("Administrativo", () => {
  it("ve la entrega de ayer sin cierre, con su costo y qué revisar", () => {
    const star = seed.projects.find((p) => p.id === STAR_PROJECT_ID)!;
    const today = todayISO();
    const r = deliverMaterial(star, seed.stock, [], { projectId: star.id, itemId: "itm-mesas", materialId: "mel-blanca-18", quantity: 2, source: "warehouse", date: addDays(today, -1) }, { actor: "Carla", now: new Date().toISOString(), today });
    useAppStore.setState({ currentMode: "gerencia", stock: r.stock, deliveries: [r.delivery] });
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
