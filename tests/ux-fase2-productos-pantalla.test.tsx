// @vitest-environment jsdom
// Formulario de productos en la cotización / Nuevo proyecto: etiquetas accesibles, error al lado del producto y
// botón bloqueado sin productos.
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { DEFAULT_HOUR_RATES } from "@/lib/constants";
import { computeCalculator, initialCalcState, newProductRow, type CalcState } from "@/components/budget/calculator-state";
import { QuoteWorkspace } from "@/components/budget/quote-workspace";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }), usePathname: () => "/" }));
afterEach(cleanup);

const ctx = { projects: [], rates: DEFAULT_HOUR_RATES, overtimeMultiplier: 2, hoursPerDay: 9.5, salesPrice: 1_000_000, isDemo: false };
const view = (state: CalcState) =>
  render(
    <QuoteWorkspace
      state={state}
      onState={() => undefined}
      result={computeCalculator(state, "", ctx)}
      projectType={{ value: "" }}
      salesPrice={1_000_000}
      onSalesPrice={() => undefined}
      actionLabel="Continuar"
      onAction={() => undefined}
      requireProducts
    />,
  );

describe("productos en Nuevo proyecto", () => {
  it("cada producto es un grupo con campos etiquetados; sin productos no se puede continuar", () => {
    view(initialCalcState(5));
    const group = screen.getByRole("group", { name: "Producto 1" });
    expect(within(group).getByLabelText("Nombre")).toBeInTheDocument();
    expect(within(group).getByLabelText("Cantidad")).toBeInTheDocument();
    expect(within(group).getByLabelText("Horas")).toBeInTheDocument();
    expect(within(group).getByLabelText("Operarios")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
    expect(screen.getByText("Cargá al menos un producto con sus horas por rubro.")).toBeInTheDocument();
    // El rubro ya no pide operarios × horas: la mano de obra va en los productos.
    expect(screen.queryByLabelText("Horas por operario")).toBeNull();
  });
  it("un producto a medio cargar muestra el error al lado y no deja seguir", () => {
    const p = { ...newProductRow("Mesa"), quantity: "10" };
    view({ ...initialCalcState(5), products: [p] });
    const group = screen.getByRole("group", { name: "Producto 1" });
    expect(within(group).getByRole("alert")).toHaveTextContent("Indicá las horas estimadas de Carpintería madera.");
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
  });
  it("con un producto válido se ve su mano de obra y el total suma los productos", () => {
    const p = { ...newProductRow("Mesa"), quantity: "10" };
    p.rubros = [{ ...p.rubros[0], hours: "60", workers: "1" }];
    view({ ...initialCalcState(5), products: [p] });
    expect(screen.getByText(/Mano de obra presupuestada:/)).toHaveTextContent("(60 h, suma de 1 producto)");
    expect(screen.getByRole("button", { name: "Continuar" })).toBeEnabled();
  });
});
