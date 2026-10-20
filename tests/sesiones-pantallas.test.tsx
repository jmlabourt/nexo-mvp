// @vitest-environment jsdom
// Cinco sesiones — pantallas de Gerencia y Administración: qué ve cada una en Proyectos, Stock y Configuración.
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { buildSeed } from "@/lib/seed-data";
import { DEFAULT_HOUR_RATES } from "@/lib/constants";
import { useAppStore } from "@/store/use-app-store";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

const { ProjectsPage } = await import("@/components/projects/projects-page");
const { StockPage } = await import("@/components/stock/stock-page");
const { SettingsPage } = await import("@/components/settings/settings-page");
const { ProjectDetail } = await import("@/components/projects/project-detail");

const seed = buildSeed(new Date());
// jsdom no implementa scrollIntoView (Indicadores y cálculos lo usa para llegar al ancla).
Element.prototype.scrollIntoView = vi.fn();

beforeEach(() => {
  useAppStore.setState({
    projects: seed.projects,
    operators: seed.operators,
    stock: seed.stock,
    role: "owner",
    isDemo: true,
    currentMode: "gerencia",
    organizationId: null,
    hourRates: DEFAULT_HOUR_RATES.map((r) => ({ ...r })),
    priceHistory: [],
  });
  window.location.hash = "";
});
afterEach(cleanup);

describe("Proyectos por sesión", () => {
  it("Gerencia ve precio, costos, ganancia y rentabilidad proyectadas", () => {
    render(<ProjectsPage />);
    expect(screen.getAllByRole("columnheader", { name: "Rentabilidad proyectada" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("columnheader", { name: "Costo proyectado" }).length).toBeGreaterThan(0);
  });

  it("Administración no ve ganancia, rentabilidad ni costos proyectados", () => {
    useAppStore.setState({ currentMode: "administracion" });
    render(<ProjectsPage />);
    expect(screen.queryByRole("columnheader", { name: /Rentabilidad|Ganancia|Costo proyectado/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("columnheader", { name: "Muebles" }).length).toBeGreaterThan(0);
  });

  it("la ficha de Administración no tiene pestañas económicas ni Cerrar proyecto", () => {
    useAppStore.setState({ currentMode: "administracion" });
    const p = seed.projects.find((x) => !x.isClosed && x.status !== "quotation")!;
    render(<ProjectDetail id={p.id} />);
    const tabs = screen.getAllByRole("tab").map((t) => t.textContent);
    expect(tabs).not.toContain("Resumen");
    expect(tabs).not.toContain("Facturación");
    expect(screen.queryByRole("button", { name: /Cerrar proyecto/ })).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Rentabilidad|Ganancia/);
  });
});

describe("Stock por sesión", () => {
  it("Gerencia solo ingresa stock: sin asignar, ubicación ni devolución al proveedor", async () => {
    const user = userEvent.setup();
    render(<StockPage />);
    expect(screen.getByRole("button", { name: /Ingresar stock/ })).toBeInTheDocument();
    for (const b of screen.getAllByRole("button", { name: "Ver lotes" }).slice(0, 3)) await user.click(b);
    expect(screen.queryByRole("button", { name: /Asignar|Ubicación|proveedor/i })).not.toBeInTheDocument();
  });

  it("Administración y Compras solo consultan", () => {
    for (const mode of ["administracion", "compras"] as const) {
      useAppStore.setState({ currentMode: mode });
      const { unmount } = render(<StockPage />);
      expect(screen.getByRole("heading", { name: "Stock" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Ingresar stock/ })).not.toBeInTheDocument();
      unmount();
    }
  });
});

describe("Configuración por sesión", () => {
  it("Gerencia tiene sus secciones y el ancla de un indicador abre Indicadores y cálculos", () => {
    window.location.hash = "#ind-billing_project";
    render(<SettingsPage />);
    const tabs = screen.getAllByRole("tab").map((t) => t.textContent);
    expect(tabs).toEqual([
      "Rubros y capacidad",
      "Costos horarios",
      "Costos",
      "Alertas",
      "Indicadores y cálculos",
      "Inflación y nomenclatura",
      "Usuarios y permisos",
      "Datos",
    ]);
    expect(screen.getByRole("tab", { name: "Indicadores y cálculos" })).toHaveAttribute("aria-selected", "true");
    expect(document.getElementById("ind-billing_project")).toHaveAttribute("open");
  });

  it("la nomenclatura avisa un código repetido y los parámetros sin backend no se guardan", async () => {
    const user = userEvent.setup();
    window.location.hash = "#nomenclatura";
    render(<SettingsPage />);
    expect(screen.getByRole("button", { name: "Guardar formato" })).toBeDisabled();
    const pattern = screen.getByLabelText("Formato");
    await user.clear(pattern);
    await user.type(pattern, "OT{{numero}");
    // Con un formato sin {cliente} ni {nombre}, el código es OT + número.
    expect(screen.getByText("OT4300")).toBeInTheDocument();
    await user.clear(pattern);
    await user.type(pattern, "OT");
    expect(screen.getByRole("alert")).toHaveTextContent("{numero}");
  });

  it("Administración no ve costos horarios, alertas ni usuarios", () => {
    useAppStore.setState({ currentMode: "administracion" });
    render(<SettingsPage />);
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Nomenclatura", "Rubros"]);
    expect(screen.queryByRole("button", { name: /Guardar/ })).not.toBeInTheDocument();
  });
});
