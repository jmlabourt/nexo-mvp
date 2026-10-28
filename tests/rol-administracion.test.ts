// Rol Administración / Comercial / Diseño (lado app): qué operaciones permite, a qué función de la base escribe y
// cómo se arma su workspace. La base lo vuelve a validar (tests/db/comercial.test.ts).
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Workspace } from "@/lib/supabase/workspace";
import type { AppRole, Project } from "@/types";
import { buildSeed, STAR_PROJECT_ID } from "@/lib/seed-data";
import { DEFAULT_SETTINGS } from "@/lib/constants";
import { assertTransition, canQuoteProject, isQuoter, RuleError } from "@/lib/project-rules";

vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
const remote = vi.hoisted(() => ({
  commitChange: vi.fn(),
  commitComercialChange: vi.fn(),
  syncStock: vi.fn(),
  syncOperators: vi.fn(),
  syncRequests: vi.fn(),
  loadWorkspace: vi.fn(),
}));
vi.mock("@/lib/supabase/workspace", async (importOriginal) => ({ ...(await importOriginal<object>()), ...remote }));
const { useAppStore } = await import("@/store/use-app-store");
const real = await vi.importActual<typeof import("@/lib/supabase/workspace")>("@/lib/supabase/workspace");

const seed = buildSeed(new Date());
const QUOTE = seed.projects.find((p) => p.status === "quotation")!;
const ACTIVE = seed.projects.find((p) => p.id === STAR_PROJECT_ID)!;

const workspace = (role: AppRole): Workspace =>
  ({
    ...useAppStore.getState(),
    ...seed,
    organizationId: "org",
    userId: "u",
    userEmail: "ana@test",
    userName: "Ana",
    organizationName: "Test",
    role,
    isDemo: false,
    demoSeeded: true,
    stockMigrated: false,
    settings: DEFAULT_SETTINGS,
    requests: [],
    resolvedAlertIds: [],
    assignments: [],
  }) as Workspace;

const store = () => useAppStore.getState();
const settle = () => new Promise((r) => setTimeout(r, 20));

describe("reglas puras", () => {
  const stage = (status: Project["status"]) => ({ status, isClosed: false });
  it("Administración cotiza solo en cotización o aprobado; el Administrativo, siempre", () => {
    expect(isQuoter("comercial")).toBe(true);
    expect(isQuoter("compras")).toBe(false);
    expect(canQuoteProject("comercial", stage("quotation"))).toBe(true);
    expect(canQuoteProject("comercial", stage("approved"))).toBe(true);
    expect(canQuoteProject("comercial", stage("production"))).toBe(false);
    expect(canQuoteProject("comercial", { status: "quotation", isClosed: true })).toBe(false);
    expect(canQuoteProject("owner", stage("production"))).toBe(true);
  });
  it("aprueba una cotización, pero no avanza más allá", () => {
    expect(assertTransition(stage("quotation"), "approved", { role: "comercial" })).toBe("forward");
    expect(() => assertTransition(stage("approved"), "purchasing", { role: "comercial" })).toThrow(RuleError);
    expect(() => assertTransition(stage("production"), "installation", { role: "comercial" })).toThrow(/Gerencia/);
    expect(assertTransition(stage("approved"), "purchasing", { role: "owner" })).toBe("forward");
  });
});

describe("operaciones de Administración en la app", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    remote.commitComercialChange.mockResolvedValue(undefined);
    remote.commitChange.mockResolvedValue(undefined);
    store().loadWorkspace(workspace("comercial"));
    remote.loadWorkspace.mockResolvedValue(workspace("comercial"));
  });

  it("aprueba una cotización y la guarda con su propia función (no con la de Gerencia)", async () => {
    const r = await store().confirmOperation(() => store().changeProjectStatus(QUOTE.id, "approved"));
    expect(r.ok).toBe(true);
    await settle();
    expect(remote.commitComercialChange).toHaveBeenCalledTimes(1);
    const saved = (remote.commitComercialChange.mock.calls[0][3] as { projects: Project[] }).projects;
    expect(saved.find((p) => p.id === QUOTE.id)?.status).toBe("approved");
    expect(remote.commitChange).not.toHaveBeenCalled();
  });
  it("edita el presupuesto de una cotización y el valor derivado cambia", async () => {
    const before = store().projects.find((p) => p.id === QUOTE.id)!.budgetLines.length;
    const r = store().addBudgetLine(QUOTE.id, { category: "materials", description: "Herrajes", quantity: 2, unit: "u", unitCost: 1500 });
    expect(r.ok).toBe(true);
    expect(store().projects.find((p) => p.id === QUOTE.id)!.budgetLines.length).toBe(before + 1);
  });
  it("crea un proyecto nuevo (queda en cotización)", () => {
    const r = store().createProject({ code: "P-9001", name: "Cocina Pérez", client: "Pérez", projectType: "Cocina", description: "", startDate: "2026-11-01", dueDate: "2026-12-01", owner: "Ana", salesPrice: 1000, budgetLines: [] });
    expect(r.ok).toBe(true);
    expect(store().projects.some((p) => p.code === "P-9001" && p.status === "quotation")).toBe(true);
  });
  it("no toca un proyecto en marcha ni avanza la producción, y no manda nada al servidor", async () => {
    expect(store().changeProjectStatus(ACTIVE.id, "installation").ok).toBe(false);
    expect(store().updateProject(ACTIVE.id, { name: "Otro" }).ok).toBe(false);
    expect(store().addBudgetLine(ACTIVE.id, { category: "materials", description: "x", quantity: 1, unit: "u", unitCost: 1 }).ok).toBe(false);
    await settle();
    expect(remote.commitComercialChange).not.toHaveBeenCalled();
    expect(remote.commitChange).not.toHaveBeenCalled();
  });
  it("no carga operarios, ni compras de stock, ni horas de otros", () => {
    expect(store().createOperator({ name: "Nuevo", position: "Carpintero" } as never).ok).toBe(false);
    expect(store().logHours(ACTIVE.id, { hours: 1 } as never).ok).toBe(false);
  });
  it("un Administrativo sigue guardando con la función de siempre", async () => {
    store().loadWorkspace(workspace("owner"));
    await store().confirmOperation(() => store().changeProjectStatus(QUOTE.id, "approved"));
    await settle();
    expect(remote.commitChange).toHaveBeenCalledTimes(1);
    expect(remote.commitComercialChange).not.toHaveBeenCalled();
  });
});

describe("carga del workspace de Administración", () => {
  const json = {
    status: "active",
    organization_id: "org",
    organization_name: "Mueblería Test",
    display_name: "Ana Torres",
    projects: [{ id: "p-1", code: "P-1", name: "Cocina", client: "Pérez", project_type: "Cocina", description: "", status: "quotation", start_date: "2026-11-01", due_date: "2026-12-01", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z", sales_price: 5000, owner: "Ana", is_closed: false, assigned_operator_ids: [] }],
    budget_lines: [{ id: "bl-1", project_id: "p-1", position: 0, category: "labor", rubro: "carpinteria_madera", description: "Carpintería", quantity: 10, unit: "h", unit_cost: 500, total: 5000 }],
    actual_entries: [{ id: "ae-1", project_id: "p-1", position: 0, type: "labor", category: "labor", description: "Horas", amount: 0, date: "2026-10-02", created_by: "Juan", created_at: "2026-10-02T10:00:00Z", labor: { hours: 3, operatorId: "op-1" } }],
    operators: [{ id: "op-1", position: 0, name: "Juan", role: "Carpintero", active: true, created_at: "2026-01-01T00:00:00Z" }],
    hour_rates: [],
    price_history: [],
    cost_settings: null,
  };
  const db = (membershipRole: string) =>
    ({
      auth: { getUser: async () => ({ data: { user: { id: "u", email: "ana@test" } }, error: null }) },
      from: () => {
        const q: Record<string, unknown> = {};
        for (const m of ["select", "eq", "order", "limit"]) q[m] = () => q;
        q.maybeSingle = async () => ({ data: { organization_id: "org", display_name: "Ana Torres", role: membershipRole, can_view_commercial: false, deactivated_at: null, organizations: { name: "Mueblería Test", demo_seeded: true, is_demo: false, alert_settings: null } }, error: null });
        return q;
      },
      rpc: async (fn: string) => (fn === "comercial_workspace" ? { data: json, error: null } : { data: null, error: { code: "PGRST202", message: "could not find the function" } }),
    }) as unknown as SupabaseClient;

  it("arma proyectos con precio y presupuesto, y deja en 0 lo que la base no entrega (importe de horas)", async () => {
    const ws = await real.loadWorkspace(db("comercial"));
    expect(ws.role).toBe("comercial");
    expect(ws.userName).toBe("Ana Torres");
    const p = ws.projects[0];
    expect(p.salesPrice).toBe(5000);
    expect(p.budgetLines[0].total).toBe(5000);
    expect(p.actualEntries[0].amount).toBe(0);
    expect(ws.operators[0].hourlyCost).toBe(0);
    expect(ws.hourRates.length).toBeGreaterThan(0);
  });
});
