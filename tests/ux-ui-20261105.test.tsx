// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppShell } from "@/components/layout/app-shell";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmployeeForm } from "@/components/operators/employee-form";
import { FrozenQuote } from "@/components/budget/frozen-quote";
import { EconomicSummary } from "@/components/projects/economic-summary";
import { FinancialCorrections } from "@/components/projects/financial-corrections";
import { computeCalculator, initialCalcState, newMaterialRow, newProductRow } from "@/components/budget/calculator-state";
import { commercialQuotePdf } from "@/lib/commercial-quote";
import { projectEconomics } from "@/lib/calculations";
import { EMPTY_LEDGER } from "@/lib/ledger";
import { useAppStore } from "@/store/use-app-store";
import { DEFAULT_HOUR_RATES, DEFAULT_SETTINGS } from "@/lib/constants";
import { DEFAULT_COST_SETTINGS } from "@/lib/supabase/workspace";
import { line, project } from "./helpers";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/operators" }));
const categories = [{ id: "craft", name: "Operario", category: "labor" as const, hourlyCost: 10000 }, { id: "sales", name: "Comercial", category: "admin" as const, hourlyCost: 8000 }];
beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({ demoLocal: true, isDemo: true, role: "owner", currentMode: "gerencia", projects: [], operators: [], ledger: { ...EMPTY_LEDGER, financialMonthlyRatePct: 0, staffCategories: categories }, priceHistory: [], assignments: [], dayExceptions: [], costSettings: { ...DEFAULT_COST_SETTINGS }, settings: { ...DEFAULT_SETTINGS }, hourRates: DEFAULT_HOUR_RATES });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("UX: el formato responsive conserva datos y acciones", () => {
  it("menú móvil: foco en el cierre, Escape y regreso al botón de apertura", async () => {
    const user = userEvent.setup();
    render(<AppShell><h1>Contenido de prueba</h1></AppShell>);
    const opener = screen.getByRole("button", { name: "Abrir menú" });
    await user.click(opener);
    expect(opener).toHaveAttribute("aria-expanded", "true");
    const close = screen.getByRole("button", { name: "Cerrar menú" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Menú" })).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
  it("rotula celdas con encabezados condicionales, sin duplicar handlers", () => {
    const action = vi.fn();
    render(<Table><THead><TR><TH>Proyecto</TH><><TH>Presupuesto</TH><TH>Real</TH></><TH>Acciones</TH></TR></THead><TBody><TR><TD>Proyecto ficticio</TD><><TD>$100</TD><TD>$80</TD></><TD><button onClick={action}>Ver detalle</button></TD></TR></TBody></Table>);
    expect(screen.getByText("$100").closest("td")).toHaveAttribute("data-label", "Presupuesto");
    expect(screen.getByText("$80").closest("td")).toHaveAttribute("data-label", "Real");
    expect(screen.getAllByRole("button", { name: "Ver detalle" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Ver detalle" }));
    expect(action).toHaveBeenCalledTimes(1);
  });
  it("conserva el alcance de columnas combinadas y encabezados compuestos", () => {
    render(<Table><THead><TR><TH><span>Código</span> visible</TH><TH>Concepto</TH><TH>Total</TH></TR></THead><TBody><TR><TD colSpan={2}>Subtotal original</TD><TD>$80</TD></TR></TBody></Table>);
    expect(screen.getByText("Subtotal original").closest("td")).toHaveAttribute("colspan", "2");
    expect(screen.getByText("$80").closest("td")).toHaveAttribute("data-label", "Total");
  });
  it("el editor conserva campos, distinción de acceso y cancelación sin escrituras", () => {
    const cancel = vi.fn(), before = JSON.stringify(useAppStore.getState().ledger);
    render(<Dialog open><DialogContent><DialogHeader><DialogTitle>Editar empleado</DialogTitle></DialogHeader><EmployeeForm onCancel={cancel}/></DialogContent></Dialog>);
    expect(screen.getByLabelText("Categorías laborales")).toHaveAttribute("multiple");
    expect(screen.getByLabelText("Vista de Blerp")).toBeInTheDocument();
    expect(screen.getByLabelText("Empleado activo")).toBeInTheDocument();
    expect(screen.getByLabelText("Acceso habilitado")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(useAppStore.getState().ledger)).toBe(before);
  });
  it("avisa costo real ausente sin ocultar ni alterar la ganancia parcial", () => {
    const p = project({ salesPrice: 200000, budgetLines: [line("labor", 10, 10000)] });
    render(<EconomicSummary project={p} econ={projectEconomics(p)}/>);
    expect(screen.getByRole("status")).toHaveTextContent("Todavía no se registraron costos reales");
    expect(screen.getByText(/Ganancia parcial al/)).toHaveTextContent("200.000");
    expect(screen.getByText("Costo real acumulado")).toBeInTheDocument();
    expect(p.actualEntries).toEqual([]);
  });
  it("un registro de costo cero no se presenta como ausencia de registros", () => {
    const p = project({ actualEntries: [{ id: "historical-zero", projectId: "p", date: "2026-01-01", type: "other", category: "admin", amount: 0, description: "Registro histórico con importe cero", createdBy: "Prueba", createdAt: "2026-01-01T12:00:00Z" }] });
    render(<EconomicSummary project={p} econ={projectEconomics(p)}/>);
    expect(screen.queryByText(/Todavía no se registraron costos reales/)).not.toBeInTheDocument();
    expect(p.actualEntries).toHaveLength(1);
  });
  it("presupuesto congelado distingue generales legítimos de producción no atribuida", () => {
    const p = project({ baseline: { capturedAt: "2026-11-05T12:00:00Z", capturedBy: "Prueba", dueDate: "2026-12-05", lines: [line("admin", 5, 8000), line("financial", null, 100)], items: [], budgetTotal: 40100, salesPrice: 60000 } });
    const before = JSON.stringify(p.baseline);
    const { unmount } = render(<FrozenQuote project={p}/>);
    expect(screen.getAllByText("Costos generales del proyecto").length).toBeGreaterThan(0);
    expect(screen.getByText(/Solo lectura/)).toBeInTheDocument();
    unmount();
    const mixed = { ...p, baseline: { ...p.baseline!, lines: [line("labor", 1, 10000)] } };
    render(<FrozenQuote project={mixed}/>);
    expect(screen.getByText("Sin mueble identificado")).toBeInTheDocument();
    expect(JSON.stringify(p.baseline)).toBe(before);
  });
  it("historial financiero muestra antes/después, fecha, autor y motivo sin cambiar registros", () => {
    const ledger = { ...useAppStore.getState().ledger, financialCorrections: [{ id: "history-test", entity: "collection" as const, targetId: "collection-test", before: { amount: 80000, date: "2026-11-03" }, after: { amount: 70000, date: "2026-11-04" }, reason: "Corregir importe duplicado", by: "Administración ficticia", at: "2026-11-05T12:00:00Z" }] };
    useAppStore.setState({ ledger, currentMode: "administracion" });
    const before = JSON.stringify(ledger);
    render(<FinancialCorrections project={project()}/>);
    fireEvent.click(screen.getByText("Correcciones y anulaciones con historial"));
    expect(screen.getByText("Cobro corregido")).toBeInTheDocument();
    expect(screen.getByText(/Administración ficticia/)).toHaveTextContent("Corregir importe duplicado");
    expect(screen.getByText("$ 80.000")).toBeInTheDocument(); expect(screen.getByText("$ 70.000")).toBeInTheDocument();
    expect(screen.getByText("03/11/2026")).toBeInTheDocument(); expect(screen.getByText("04/11/2026")).toBeInTheDocument();
    expect(JSON.stringify(useAppStore.getState().ledger)).toBe(before);
  });
});

describe("Cotización y PDF: mismos datos comerciales y económicos", () => {
  it("mantiene 100.000 productivos + 40.000 Comercial + 50.000 materiales, una sola partida comercial", () => {
    const state = initialCalcState(0); state.products = [newProductRow("Mesa ficticia")];
    state.products[0].rubros[0].hours = "10";
    state.products[0].rubros[0].materials = [{ ...newMaterialRow(), name: "Placa ficticia", materialId: "m", quantity: "1", unitCost: "50000", wastePct: "0" }];
    state.staffHours = [{ categoryId: "sales", hours: "5" }];
    const result = computeCalculator(state, "", { projects: [], rates: DEFAULT_HOUR_RATES, overtimeMultiplier: 1.5, hoursPerDay: 8, salesPrice: 300000, isDemo: false, staffCategories: categories });
    expect(result.total).toBe(190000);
    expect(result.lines.filter(l => l.staffCategoryId === "sales")).toHaveLength(1);
    expect(result.products[0].total).toBe(150000);
  });
  it("A4 mantiene total sin IVA, cantidades y condiciones sin inventar vendedor o IVA", () => {
    const pdf = Buffer.from(commercialQuotePdf({ title: "Oferta ficticia", client: "Cliente ficticio", price: 345865, items: [{ name: "Mesa comercial", quantity: 3 }], conditions: "Anticipo: 20%" })).toString("latin1");
    expect(pdf).toContain("/MediaBox [0 0 595 842]");
    expect(pdf).toContain("345.865"); expect(pdf).toContain("Cantidad: 3"); expect(pdf).toContain("Anticipo: 20%");
    for (const forbidden of ["Blerp", "CUIT", "Rentabilidad", "Costo financiero", "/EmbeddedFiles", "/Metadata", "418.496"]) expect(pdf).not.toContain(forbidden);
  });
  it("pagina nombres largos sin perder muebles ni corromper offsets", () => {
    const items = Array.from({ length: 110 }, (_, i) => ({ name: `Mueble ${i} (${"descripción ".repeat(10)})`, quantity: i + 1 }));
    const pdf = Buffer.from(commercialQuotePdf({ title: "Oferta multipágina", price: 100000, items })).toString("latin1");
    const count = Number(/\/Count (\d+)/.exec(pdf)![1]); expect(count).toBeGreaterThan(1);
    items.forEach((_, i) => expect(pdf).toContain(`Mueble ${i} `));
    expect(pdf).toContain(`Cotización - ${count} de ${count}`);
    const xref = Number(/startxref\n(\d+)/.exec(pdf)![1]); expect(pdf.slice(xref, xref + 4)).toBe("xref");
    for (const [, offset] of pdf.matchAll(/^(\d{10}) 00000 n /gm)) expect(pdf.slice(Number(offset))).toMatch(/^\d+ 0 obj/);
  });
});
