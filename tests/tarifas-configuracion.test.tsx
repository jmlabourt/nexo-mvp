// @vitest-environment jsdom
// Tarifas en un solo lugar: el costo por hora de operarios, diseño y administración se define solo en Configuración.
// En el resto de las pantallas se muestra calculado, pero no se escribe.
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { buildSeed } from "@/lib/seed-data";
import { DEFAULT_HOUR_RATES } from "@/lib/constants";
import { formatCurrency } from "@/lib/formatting";
import { useAppStore } from "@/store/use-app-store";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

const { OperatorsPage } = await import("@/components/operators/operators-page");
const { BudgetEditor } = await import("@/components/budget/budget-editor");
const { CorrectionButton } = await import("@/components/projects/correction-dialog");

const seed = buildSeed(new Date());
const LABOR = DEFAULT_HOUR_RATES.find((r) => r.category === "labor")!.hourlyRate;

beforeEach(() => {
  useAppStore.setState({
    projects: seed.projects,
    operators: seed.operators,
    role: "owner",
    isDemo: true,
    currentMode: "gerencia",
    organizationId: null,
    hourRates: DEFAULT_HOUR_RATES.map((r) => ({ ...r })),
    priceHistory: [],
  });
});
afterEach(cleanup);

describe("Personal", () => {
  it("muestra la tarifa de la categoría, de Configuración, en solo lectura", () => {
    render(<OperatorsPage />);
    expect(screen.getByRole("columnheader", { name: "Tarifa por hora" })).toBeInTheDocument();
    expect(screen.getAllByText(formatCurrency(LABOR)).length).toBeGreaterThan(0);
    expect(screen.queryByRole("textbox", { name: /Costo por hora/ })).toBeNull();
  });

  it("al agregar o editar a una persona no se escribe su costo por hora", async () => {
    const user = userEvent.setup();
    render(<OperatorsPage />);
    await user.click(screen.getByRole("button", { name: /Agregar empleado/ }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByLabelText(/Costo por hora/)).toBeNull();
    expect(dialog).toHaveTextContent(`Costo por hora: ${formatCurrency(LABOR)}`);
    await user.type(within(dialog).getByLabelText("Nombre"), "Persona Nueva");
    await user.type(within(dialog).getByLabelText("Rol o especialidad"), "Carpintería");
    await user.click(within(dialog).getByRole("button", { name: "Guardar" }));
    expect(useAppStore.getState().operators.find((o) => o.name === "Persona Nueva")?.hourlyCost).toBe(LABOR);
  });
});

describe("proyectos", () => {
  it("en el presupuesto, el costo de una línea de horas es la tarifa de Configuración y no se edita", async () => {
    const user = userEvent.setup();
    let lines = [{ key: "a", category: "labor" as const, rubro: "" as const, description: "Armado", quantity: "", unit: "h", unitCost: "" }];
    const { rerender } = render(<BudgetEditor lines={lines} onChange={(l) => (lines = l as typeof lines)} />);
    await user.type(screen.getByLabelText("Cantidad fila 1"), "8");
    rerender(<BudgetEditor lines={lines} onChange={(l) => (lines = l as typeof lines)} />);
    expect(lines[0].unitCost).toBe(String(LABOR));
    expect(screen.getByLabelText("Costo fila 1")).toHaveAttribute("readonly");
  });

  it("una corrección no ofrece cambiar el costo de las horas", async () => {
    const user = userEvent.setup();
    const p = seed.projects.find((x) => x.status !== "quotation" && x.budgetLines.some((l) => l.category === "labor" && l.quantity !== null))!;
    render(<CorrectionButton project={p} />);
    await user.click(screen.getByRole("button", { name: /Corregir/ }));
    const labor = p.budgetLines.find((l) => l.category === "labor" && l.quantity !== null)!;
    const options = within(screen.getByRole("dialog")).getAllByRole("option").map((o) => o.textContent);
    expect(options).toContain(`${labor.description} — cantidad`);
    expect(options).not.toContain(`${labor.description} — costo unitario`);
  });
});
