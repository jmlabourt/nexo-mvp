// @vitest-environment jsdom
// Cotizador por mueble (Administración / Comercial / Diseño): los rubros se agrupan por mueble sin cambiar ningún
// total, el precio se reparte entre muebles (la suma da el precio exacto) y Administración no ve ganancia ni
// rentabilidad.
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { buildSeed } from "@/lib/seed-data";
import { DEFAULT_HOUR_RATES } from "@/lib/constants";
import { budgetTotal } from "@/lib/calculations";
import {
  computeCalculator,
  furnitureSubtotals,
  initialCalcState,
  newMaterialRow,
  newProductRow,
  newRubroRow,
  type CalcState,
  type ProductRow,
  type RubroRow,
} from "@/components/budget/calculator-state";
import { QuoteWorkspace } from "@/components/budget/quote-workspace";
import { useAppStore } from "@/store/use-app-store";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }), usePathname: () => "/" }));
afterEach(cleanup);

const ctx = { projects: [], rates: DEFAULT_HOUR_RATES, overtimeMultiplier: 2, hoursPerDay: 9.5, salesPrice: 10_000_000, isDemo: false };
const prod = (name: string, qty: string, hours: string): ProductRow => ({
  ...newProductRow(name),
  quantity: qty,
  rubros: [{ key: `${name}-h`, rubro: "carpinteria_madera", hours, workers: "1" }],
});
const materials = (cost: string, productKey?: string): RubroRow => ({
  ...newRubroRow("carpinteria_madera", productKey),
  materials: [{ ...newMaterialRow(), name: "Placa MDF 18 mm", quantity: "1", unitCost: cost }],
  designHours: "4",
});

const mesa = prod("Mesa", "10", "60");
const silla = prod("Silla", "100", "220");
const general: CalcState = {
  ...initialCalcState(5),
  products: [mesa, silla],
  rubros: [materials("1000000"), { ...newRubroRow("transporte"), amount: "250000" }],
};
const byFurniture: CalcState = {
  ...general,
  rubros: [{ ...general.rubros[0], productKey: mesa.key }, general.rubros[1]],
};

describe("cotizador por mueble: mismos totales", () => {
  it("asignar un rubro a un mueble no cambia las líneas, el costo total ni el precio sugerido", () => {
    const a = computeCalculator(general, "", ctx);
    const b = computeCalculator(byFurniture, "", ctx);
    expect(b.lines).toEqual(a.lines);
    expect(b.total).toBe(a.total);
    expect(b.breakdown).toEqual(a.breakdown);
  });

  it("los presupuestos de los proyectos existentes no cambian (mismos totales que antes del cotizador por mueble)", () => {
    const seed = buildSeed(new Date("2026-10-20T12:00:00"));
    expect(Object.fromEntries(seed.projects.map((p) => [p.code, budgetTotal(p.budgetLines)]))).toMatchInlineSnapshot(`
      {
        "P-0987": 4060000,
        "P-0995": 9100000,
        "P-1003": 2480000,
        "P-1011": 6865000,
        "P-1039": 6240000,
        "P-1042": 7200000,
        "P-1045": 7848000,
        "P-1047": 3120000,
        "P-1048": 4400000,
        "P-1051": 5292000,
        "P-1053": 9100000,
        "P-1056": 4212000,
        "P-1058": 11706000,
      }
    `);
  });
});

describe("subtotal por mueble", () => {
  it("costo directo = mano de obra + rubros del mueble; lo demás queda como compartido", () => {
    const c = computeCalculator(byFurniture, "", ctx);
    const s = furnitureSubtotals(byFurniture, c, 10_000_000);
    const rubroMesa = c.rubros.find((r) => r.key === byFurniture.rubros[0].key)!.total;
    expect(s.rows.map((r) => r.name)).toEqual(["Mesa", "Silla"]);
    expect(s.rows[0].direct).toBe(c.products[0].total + rubroMesa);
    expect(s.rows[1].direct).toBe(c.products[1].total);
    expect(s.shared).toBeCloseTo(c.total - s.rows[0].direct - s.rows[1].direct, 2);
    expect(s.total).toBe(c.total);
  });

  it("el precio se reparte en proporción al costo directo y la suma da el precio exacto", () => {
    const c = computeCalculator(byFurniture, "", ctx);
    for (const price of [10_000_000, 9_999_999.99, 1_234_567]) {
      const s = furnitureSubtotals(byFurniture, c, price);
      const sum = s.rows.reduce((x, r) => x + (r.price ?? 0), 0);
      expect(Math.round(sum * 100) / 100).toBe(price);
      expect(s.rows[0].price! / s.rows[1].price!).toBeCloseTo(s.rows[0].direct / s.rows[1].direct, 3);
      expect(s.rows[1].unitPrice).toBeCloseTo(s.rows[1].price! / 100, 2);
    }
  });

  it("sin precio no se reparte nada", () => {
    const c = computeCalculator(byFurniture, "", ctx);
    expect(furnitureSubtotals(byFurniture, c, 0).rows.every((r) => r.price === null)).toBe(true);
  });
});

function Harness() {
  const [state, setState] = useState<CalcState>(general);
  return (
    <QuoteWorkspace
      state={state}
      onState={setState}
      result={computeCalculator(state, "", ctx)}
      projectType={{ value: "" }}
      salesPrice={10_000_000}
      onSalesPrice={() => undefined}
      actionLabel="Continuar"
      onAction={() => undefined}
    />
  );
}

describe("cotizador por mueble: pantalla", () => {
  beforeEach(() => useAppStore.setState({ role: "owner", isDemo: true, currentMode: "administracion", organizationId: null }));

  it("Administración cotiza sin ver ganancia ni rentabilidad", () => {
    render(<Harness />);
    const aside = screen.getByRole("complementary", { name: "Resumen de la cotización" });
    expect(within(aside).queryByText(/Rentabilidad|Ganancia/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Rentabilidad objetivo/)).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Si el trabajo se alarga" })).not.toBeInTheDocument();
    expect(within(aside).getByText("Precio (sin IVA)")).toBeInTheDocument();
  });

  it("Gerencia sí ve la rentabilidad", () => {
    useAppStore.setState({ currentMode: "gerencia" });
    render(<Harness />);
    expect(within(screen.getByRole("complementary", { name: "Resumen de la cotización" })).getByText("Rentabilidad total")).toBeInTheDocument();
  });

  it("Agregar mueble lo elige y el rubro nuevo queda en ese mueble; el subtotal lo muestra", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Agregar mueble" }));
    expect(screen.getByRole("group", { name: "Mueble 3" })).toBeInTheDocument();
    expect(screen.getByLabelText("Mueble")).toHaveDisplayValue("Mueble 3");
    expect(screen.getByText("Todavía no hay rubros en este mueble.")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Agregar rubro"), "carpinteria_metalica");
    await user.click(screen.getByRole("button", { name: /Agregar a Mueble 3/ }));
    expect(screen.getByRole("heading", { name: /Carpintería metálica · Mueble 3/ })).toBeInTheDocument();
    // En "Generales del proyecto" no aparece.
    await user.selectOptions(screen.getByLabelText("Mueble"), "general");
    expect(screen.queryByRole("heading", { name: /Carpintería metálica/ })).not.toBeInTheDocument();
    const table = within(screen.getByRole("region", { name: "Subtotal por mueble" }));
    expect(table.getByText("Mesa")).toBeInTheDocument();
    expect(table.getByText("Costos compartidos")).toBeInTheDocument();
  });
});
