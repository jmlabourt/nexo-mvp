// @vitest-environment jsdom
// Primer ingreso de una empresa nueva: elige empezar vacía o con datos de ejemplo (no se cargan datos solos).
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HydrationGate } from "@/components/layout/hydration-gate";
import { useAppStore } from "@/store/use-app-store";

const loadWorkspace = vi.fn();
const replaceWorkspace = vi.fn(async () => undefined);
const startEmptyWorkspace = vi.fn(async () => undefined);
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("@/lib/supabase/closures", () => ({ backfillClosures: vi.fn(async () => undefined) }));
vi.mock("@/lib/supabase/workspace", async (original) => ({
  ...(await original<typeof import("@/lib/supabase/workspace")>()),
  loadWorkspace: (...a: unknown[]) => loadWorkspace(...a),
  replaceWorkspace: (...a: unknown[]) => replaceWorkspace(...a),
  startEmptyWorkspace: (...a: unknown[]) => startEmptyWorkspace(...a),
}));

const base = { organizationId: "org-1", organizationName: "Empresa de Ana", role: "owner", projects: [], assignments: [], orders: [], operators: [], requests: [], resolvedAlertIds: [], isDemo: false, ledger: null };
const stock = { lots: [], movements: [] };

describe("primer ingreso", () => {
  afterEach(cleanup);
  beforeEach(() => {
    loadWorkspace.mockReset();
    replaceWorkspace.mockClear();
    startEmptyWorkspace.mockClear();
    useAppStore.setState({ organizationId: null });
  });

  it("una empresa sin datos pregunta cómo empezar y no carga nada sola", async () => {
    loadWorkspace.mockResolvedValue({ ...base, demoSeeded: false, stock });
    render(<HydrationGate><p>contenido de la app</p></HydrationGate>);
    expect(await screen.findByRole("button", { name: "Empezar vacía" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cargar datos de ejemplo" })).toBeTruthy();
    expect(screen.queryByText("contenido de la app")).toBeNull();
    expect(replaceWorkspace).not.toHaveBeenCalled();
    expect(startEmptyWorkspace).not.toHaveBeenCalled();
  });

  it("Empezar vacía deja la empresa vacía y entra a la app", async () => {
    loadWorkspace.mockResolvedValueOnce({ ...base, demoSeeded: false, stock });
    render(<HydrationGate><p>contenido de la app</p></HydrationGate>);
    loadWorkspace.mockResolvedValueOnce({ ...base, demoSeeded: true, stock });
    await userEvent.click(await screen.findByRole("button", { name: "Empezar vacía" }));
    await waitFor(() => expect(startEmptyWorkspace).toHaveBeenCalledWith(expect.anything(), "org-1"));
    expect(replaceWorkspace).not.toHaveBeenCalled();
    expect(await screen.findByText("contenido de la app")).toBeTruthy();
  });

  it("Cargar datos de ejemplo carga la demo de la empresa", async () => {
    loadWorkspace.mockResolvedValueOnce({ ...base, demoSeeded: false, stock });
    render(<HydrationGate><p>contenido de la app</p></HydrationGate>);
    loadWorkspace.mockResolvedValueOnce({ ...base, demoSeeded: true, stock });
    await userEvent.click(await screen.findByRole("button", { name: "Cargar datos de ejemplo" }));
    await waitFor(() => expect(replaceWorkspace).toHaveBeenCalledTimes(1));
    expect(replaceWorkspace.mock.calls[0][1]).toBe("org-1");
    expect(startEmptyWorkspace).not.toHaveBeenCalled();
  });

  it("si la base falla muestra el error y deja reintentar", async () => {
    loadWorkspace.mockResolvedValueOnce({ ...base, demoSeeded: false, stock });
    startEmptyWorkspace.mockRejectedValueOnce(new Error("Esto lo hace un usuario Administrativo."));
    render(<HydrationGate><p>contenido de la app</p></HydrationGate>);
    await userEvent.click(await screen.findByRole("button", { name: "Empezar vacía" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Administrativo/);
    expect(screen.getByRole("button", { name: "Empezar vacía" })).toBeTruthy();
  });

  it("quien no administra la cuenta espera y no puede elegir", async () => {
    loadWorkspace.mockResolvedValue({ ...base, role: "member_x", demoSeeded: false, stock });
    render(<HydrationGate><p>contenido de la app</p></HydrationGate>);
    expect(await screen.findByText(/no terminó la configuración inicial/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Empezar vacía" })).toBeNull();
  });
});
