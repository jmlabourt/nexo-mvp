// @vitest-environment jsdom
// Cotizador por mueble: una sola estructura (cada mueble con sus rubros, y en cada rubro horas, operarios, materiales,
// diseño y administración). Los totales calculan igual que antes, el precio total es la suma de los muebles por su
// cantidad y los presupuestos de los proyectos existentes no cambian.
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { buildSeed } from "@/lib/seed-data";
import { DEFAULT_HOUR_RATES } from "@/lib/constants";
import { budgetTotal } from "@/lib/calculations";
import { rubroTable } from "@/lib/budget-calculator";
import {
  computeCalculator,
  furnitureSubtotals,
  initialCalcState,
  newMaterialRow,
  newProductRow,
  newRubroRow,
  productInputs,
  type CalcState,
  type MaterialRow,
  type ProductRow,
} from "@/components/budget/calculator-state";
import { QuoteWorkspace } from "@/components/budget/quote-workspace";
import { useAppStore } from "@/store/use-app-store";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }), usePathname: () => "/" }));
afterEach(cleanup);

const ctx = { projects: [], rates: DEFAULT_HOUR_RATES, overtimeMultiplier: 2, hoursPerDay: 9.5, salesPrice: 10_000_000, isDemo: false };
const placa = (cost: string): MaterialRow => ({ ...newMaterialRow(), name: "Placa MDF 18 mm", unit: "placa", quantity: "4", unitCost: cost });
const mueble = (name: string, qty: string, hours: string, extra: Partial<ProductRow["rubros"][number]> = {}): ProductRow => ({
  ...newProductRow(name),
  quantity: qty,
  rubros: [{ key: `${name}-r`, rubro: "carpinteria_madera", hours, workers: "1", materials: [], designHours: "", adminHours: "", ...extra }],
});

// Cómo se cargaba antes: materiales y diseño en un rubro general, la mano de obra en el mueble.
const before: CalcState = {
  ...initialCalcState(5),
  products: [mueble("Mesa", "10", "60"), mueble("Silla", "100", "220")],
  rubros: [{ ...newRubroRow("carpinteria_madera"), materials: [placa("25000")], designHours: "4", adminHours: "2" }, { ...newRubroRow("transporte"), amount: "250000" }],
};
// Cómo se carga ahora: todo dentro del rubro del mueble.
const now: CalcState = {
  ...before,
  products: [mueble("Mesa", "10", "60", { materials: [placa("25000")], designHours: "4", adminHours: "2" }), mueble("Silla", "100", "220")],
  rubros: [before.rubros[1]],
};

describe("una sola estructura: mismos totales", () => {
  it("cargar materiales, diseño y administración dentro del mueble valoriza lo mismo que antes", () => {
    for (const deadlineDays of ["", "20"]) {
      const a = computeCalculator({ ...before, deadlineDays }, "", ctx);
      const b = computeCalculator({ ...now, deadlineDays }, "", ctx);
      expect(b.total).toBe(a.total);
      expect(b.breakdown).toEqual(a.breakdown);
      expect(b.schedule).toEqual(a.schedule);
      expect(rubroTable(b.lines).rows).toEqual(rubroTable(a.lines).rows);
    }
  });

  it("un rubro con solo materiales vale (no lleva horas de planta) y no se guarda como horas del mueble", () => {
    const s: CalcState = { ...now, products: [mueble("Mesa", "10", "60", { materials: [] })] };
    s.products[0].rubros.push({ key: "emb", rubro: "embalaje", hours: "", workers: "1", materials: [placa("1000")], designHours: "", adminHours: "" });
    const c = computeCalculator(s, "", ctx);
    expect(c.productsError).toBeNull();
    expect(productInputs(s)[0].rubros.map((r) => r.rubro)).toEqual(["carpinteria_madera"]);
    expect(c.products[0].rubros.map((r) => r.rubro)).toEqual(["carpinteria_madera", "embalaje"]);
  });

  it("un rubro sin nada cargado pide las horas", () => {
    const s: CalcState = { ...now, products: [{ ...mueble("Mesa", "10", ""), rubros: [{ key: "x", rubro: "carpinteria_madera", hours: "", workers: "1", materials: [], designHours: "", adminHours: "" }] }] };
    s.products[0].name = "Mesa";
    expect(computeCalculator(s, "", ctx).productsError).toBe("Mueble 1 (Mesa): Indicá las horas estimadas de Carpintería madera.");
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

describe("precio total = suma de los muebles por su cantidad", () => {
  it("costo directo de cada mueble = todo lo de sus rubros; lo demás es compartido", () => {
    const c = computeCalculator(now, "", ctx);
    const s = furnitureSubtotals(c, 10_000_000);
    expect(s.rows.map((r) => r.name)).toEqual(["Mesa", "Silla"]);
    expect(s.rows.map((r) => r.direct)).toEqual(c.products.map((p) => p.total));
    expect(s.shared).toBeCloseTo(c.total - s.rows[0].direct - s.rows[1].direct, 2);
  });

  it("la suma de los muebles (precio unitario × cantidad) da el precio total", () => {
    const c = computeCalculator(now, "", ctx);
    for (const price of [10_000_000, 9_999_999.99, 1_234_567]) {
      const s = furnitureSubtotals(c, price);
      // Exacto: la suma de los subtotales por mueble.
      expect(Math.round(s.rows.reduce((x, r) => x + r.price!, 0) * 100) / 100).toBe(price);
      // Precio unitario × cantidad = subtotal del mueble (salvo el redondeo a centavos del unitario).
      for (const r of s.rows) expect(Math.abs(r.unitPrice! * r.quantity - r.price!)).toBeLessThanOrEqual(0.005 * r.quantity);
      expect(s.rows[0].price! / s.rows[1].price!).toBeCloseTo(s.rows[0].direct / s.rows[1].direct, 3);
    }
  });
});

function Harness({ initial = now }: { initial?: CalcState }) {
  const [state, setState] = useState<CalcState>(initial);
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

describe("una sola estructura: pantalla", () => {
  beforeEach(() => useAppStore.setState({ role: "owner", isDemo: true, currentMode: "administracion", organizationId: null }));

  it("no queda el bloque de cotización por rubros ni el selector de mueble; el resumen no muestra días estimados", () => {
    render(<Harness />);
    expect(screen.queryByText("Cotización por rubros")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Mueble")).not.toBeInTheDocument();
    expect(within(screen.getByRole("complementary", { name: "Resumen de la cotización" })).queryByText(/Días de trabajo estimados/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Plazo (días hábiles)")).toBeInTheDocument();
  });

  it("el nombre se edita en el título y se usa en el subtotal; cada rubro va una sola vez por mueble", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const title = screen.getByLabelText("Nombre del mueble 1");
    await user.clear(title);
    await user.type(title, "Mesa ratona");
    const card = screen.getByRole("group", { name: "Mesa ratona" });
    expect(within(screen.getByRole("region", { name: "Subtotal por mueble" })).getByText("Mesa ratona")).toBeInTheDocument();
    // Carpintería madera ya está: no se ofrece.
    const add = within(card).getByLabelText("Agregar rubro a Mesa ratona");
    expect(within(add).queryByRole("option", { name: "Carpintería madera" })).toBeNull();
    await user.selectOptions(add, "embalaje");
    const emb = within(card).getByRole("region", { name: "Embalaje de Mesa ratona" });
    // Dentro del rubro, todo junto.
    for (const label of ["Horas", "Operarios", "Horas de diseño", "Horas de administración"]) expect(within(emb).getByLabelText(label)).toBeInTheDocument();
    expect(within(emb).getByRole("button", { name: "Material" })).toBeInTheDocument();
    expect(within(within(card).getByLabelText("Agregar rubro a Mesa ratona")).queryByRole("option", { name: "Embalaje" })).toBeNull();
  });

  it("Agregar mueble suma una tarjeta nueva", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Agregar mueble" }));
    expect(screen.getByRole("group", { name: "Mueble 3" })).toBeInTheDocument();
  });
});
