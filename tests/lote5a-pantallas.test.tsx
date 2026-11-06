// @vitest-environment jsdom
// Lote 5A — pantallas: menú y guard por rol, demo con 4 roles y tarifas con "vigente desde".
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { buildSeed } from "@/lib/seed-data";
import { DEFAULT_HOUR_RATES } from "@/lib/constants";
import { useAppStore } from "@/store/use-app-store";

const nav = vi.hoisted(() => ({ pathname: "/dashboard", replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: nav.replace }),
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(),
}));

const { AppShell } = await import("@/components/layout/app-shell");
const { SettingsPage } = await import("@/components/settings/settings-page");

const seed = buildSeed(new Date());

beforeEach(() => {
  // Sin empresa cargada no se escribe en la base (persistRemote no hace nada): todo queda en memoria.
  useAppStore.setState({
    projects: seed.projects,
    operators: seed.operators,
    stock: seed.stock,
    role: "owner",
    isDemo: true,
    currentMode: "gerencia",
    organizationId: null,
    userName: "Laura Gómez",
    hourRates: DEFAULT_HOUR_RATES.map((r) => ({ ...r })),
    priceHistory: [],
  });
  nav.pathname = "/dashboard";
  nav.replace.mockClear();
});
afterEach(cleanup);

const menuItems = () => {
  const navEl = screen.getAllByRole("navigation", { name: "Principal" })[0];
  return within(navEl)
    .getAllByRole("link")
    .map((el) => el.querySelector("span")?.textContent?.trim()); // solo el nombre (sin el contador de alertas)
};

describe("menú y acceso por sesión", () => {
  it("Gerencia ve sus 5 pestañas y la demo ofrece las 5 sesiones", () => {
    render(<AppShell>contenido</AppShell>);
    expect(menuItems()).toEqual(["Dashboard", "Proyectos", "Personal", "Stock", "Configuración"]);
    const group = screen.getAllByRole("radiogroup", { name: "Ver la demo como" })[0];
    expect(within(group).getAllByRole("radio").map((r) => r.textContent)).toEqual(["Gerencia", "Administración", "Compras", "Jefe de planta", "Operario"]);
    expect(screen.getByText("contenido")).toBeInTheDocument();
  });

  it("en la demo como Compras: su menú, su usuario de ejemplo, y sin acceso a Proyectos", async () => {
    useAppStore.setState({ currentMode: "compras" });
    nav.pathname = "/projects";
    render(<AppShell>contenido secreto</AppShell>);
    expect(menuItems()).toEqual(["Dashboard", "Por comprar", "Órdenes de compra", "Stock", "Alertas", "Proveedores"]);
    expect(screen.getAllByText("Martín Ruiz")[0]).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("No tenés acceso a esta sección");
    expect(screen.queryByText("contenido secreto")).toBeNull();
    expect(screen.queryByRole("link", { name: /Nuevo proyecto/ })).toBeNull();
  });

  it("Jefe de planta que entra al dashboard va a su inicio", () => {
    useAppStore.setState({ role: "jefe_planta", isDemo: false });
    render(<AppShell>x</AppShell>);
    expect(menuItems()).toEqual(["Hoy", "Planificación", "Proyectos", "Operarios", "Alertas"]);
    expect(nav.replace).toHaveBeenCalledWith("/planta");
  });

  it("en una empresa real no aparece el selector de la demo: un Administrativo elige Gerencia o Administración", () => {
    useAppStore.setState({ isDemo: false, currentMode: "compras" });
    render(<AppShell>contenido</AppShell>);
    expect(screen.queryByRole("radiogroup", { name: "Ver la demo como" })).toBeNull();
    const group = screen.getAllByRole("radiogroup", { name: "Sesión" })[0];
    expect(within(group).getAllByRole("radio").map((r) => r.textContent)).toEqual(["Gerencia", "Administración"]);
    expect(menuItems()[0]).toBe("Dashboard");
  });

  it("Administración: 7 pestañas, sin el Dashboard gerencial", () => {
    useAppStore.setState({ currentMode: "administracion" });
    render(<AppShell>contenido</AppShell>);
    expect(menuItems()).toEqual(["Dashboard", "Proyectos", "Cotizador", "Facturación y pagos", "Stock", "Clientes", "Configuración"]);
    expect(nav.replace).toHaveBeenCalledWith("/administracion");
  });

  it("el Operario ve su día, sin menú de gestión", () => {
    useAppStore.setState({ currentMode: "operario" });
    render(<AppShell>contenido</AppShell>);
    expect(screen.queryByRole("navigation", { name: "Principal" })).toBeNull();
    // Preseleccionado con el primer operario activo (nunca "Elegí un operario…").
    expect(screen.getByLabelText("Demo: ver el día de")).toHaveValue("op-juan");
  });
});

describe("configuración sin criterios salariales paralelos", () => {
  it("conserva accesos reales y retira la configuración salarial duplicada", () => {
    render(<SettingsPage />);
    expect(screen.getByRole("tab",{ name:"Usuarios y permisos" })).toBeInTheDocument();
    expect(screen.queryByRole("tab",{ name:"Costos horarios" })).not.toBeInTheDocument();
    expect(screen.queryByText("Costo real de las horas")).not.toBeInTheDocument();
  });
});

describe("horas con el costo vigente ese día (store)", () => {
  it("un cambio de costo a mitad de mes no cambia las horas anteriores ni las de antes del cambio", () => {
    const daysAgo = (n: number) => {
      const d = new Date();
      d.setDate(d.getDate() - n);
      return d.toISOString().slice(0, 10);
    };
    const project = seed.projects.find((p) => p.status === "production" && p.assignedOperatorIds.includes("op-juan"))!;
    const before = project.actualEntries.map((e) => e.amount);
    const s = useAppStore.getState();
    // Juan pasa de 15.000 a 20.000 desde hace 5 días.
    expect(s.updateOperator("op-juan", { name: "Juan Pérez", role: "Carpintería", hourlyCost: 20_000 }, daysAgo(5)).ok).toBe(true);
    expect(useAppStore.getState().operators.find((o) => o.id === "op-juan")?.hourlyCost).toBe(20_000);
    // Carga manual del Administrativo: crea la asignación del día y carga contra ella.
    // confirmHighHours: según la fecha de hoy, la demo ya puede tener la jornada completa ese día (el test es sobre el costo).
    const manual = (date: string) => ({ operatorId: "op-juan", itemId: project.items[0].id, rubro: project.items[0].rubros[0].rubro, date, hours: 1, confirmHighHours: true });
    expect(s.logHoursManual(project.id, manual(daysAgo(8)))).toMatchObject({ ok: true });
    expect(s.logHoursManual(project.id, manual(daysAgo(2)))).toMatchObject({ ok: true });
    expect(useAppStore.getState().assignments.filter((a) => a.projectId === project.id && a.plannedHours === 1)).toHaveLength(2);
    const after = useAppStore.getState().projects.find((p) => p.id === project.id)!.actualEntries;
    expect(after.slice(0, before.length).map((e) => e.amount)).toEqual(before);
    expect(after.slice(-2).map((e) => [e.amount, e.labor?.hourlyCost])).toEqual([
      [15_000, 15_000],
      [20_000, 20_000],
    ]);
  });
});
