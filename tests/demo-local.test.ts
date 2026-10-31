// @vitest-environment jsdom
// Modo demostración local: guardado versionado en el navegador, un único estado compartido, restaurar y salir sin
// tocar ninguna empresa real.
import { beforeEach, describe, expect, it } from "vitest";
import { DEMO_ACTIVE_KEY, DEMO_DATA_KEY, DEMO_SCHEMA_VERSION, backupDemoScenario, createDemoScenario, demoDataChanged, isDemoActive, parseDemoScenario, pickDemoData, readDemo, restoreDemoScenario, validateDemoScenario, writeDemo, type DemoStorage } from "@/store/demo-local";
import { useAppStore } from "@/store/use-app-store";
import type { Ledger } from "@/types";
import { EMPTY_LEDGER } from "@/lib/ledger";

const memory = (): DemoStorage & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
};

describe("almacenamiento de la demo (funciones puras)", () => {
  it("guarda con versión de esquema y descarta copias de otra versión o dañadas", () => {
    const st = memory();
    expect(writeDemo({ projects: [] }, st, "2026-10-21T00:00:00Z")).toBe(true);
    expect(JSON.parse(st.map.get(DEMO_DATA_KEY)!).version).toBe(DEMO_SCHEMA_VERSION);
    expect(readDemo(st)).toEqual({ projects: [] });
    st.setItem(DEMO_DATA_KEY, JSON.stringify({ version: DEMO_SCHEMA_VERSION - 1, data: { projects: [1] } }));
    expect(readDemo(st)).toBeNull();
    st.setItem(DEMO_DATA_KEY, "{roto");
    expect(readDemo(st)).toBeNull();
    expect(readDemo(null)).toBeNull();
  });

  it("solo guarda datos (nunca identidad ni sesión) y detecta cambios por referencia", () => {
    const projects: unknown[] = [];
    const state = { projects, userEmail: "persona@empresa.com", organizationId: "org", currentMode: "gerencia" };
    expect(pickDemoData(state)).toEqual({ projects });
    expect(demoDataChanged({ ...state }, state)).toBe(false);
    expect(demoDataChanged({ ...state, projects: [] }, state)).toBe(true);
  });

  it("exporta e importa un escenario demo con versión y estructura válidas", () => {
    const st = memory();
    const data = {
      projects: [{ id: "p-ot1060", code: "OT1060", name: "AUDIT-001", status: "production", budgetLines: [], items: [] }],
      assignments: [{ id: "asg-1", projectId: "p-ot1060", itemId: "itm-1", rubro: "carpinteria_madera", operatorId: "op-juan", date: "2026-10-30", plannedHours: 8 }],
      orders: [],
      dayExceptions: [],
      deliveries: [],
      operators: [{ id: "op-juan", name: "Juan", role: "operario", active: true }],
      stock: [],
      requests: [],
      settings: { name: "Demo test" },
      resolvedAlertIds: [],
      reviewedHoursKeys: [],
      costSettings: { laborValuation: "operator", hoursPerDay: 8 },
      hourRates: [{ id: "labor", name: "Labor", hourlyRate: 15000 }],
      priceHistory: [],
      corrections: [],
      ledger: { ...EMPTY_LEDGER },
    };

    writeDemo(data, st, "2026-10-30T00:00:00Z");
    const scenario = createDemoScenario(data, "audit-ot1060", "2026-10-30T00:00:00Z", "http://127.0.0.1:3000");
    expect(validateDemoScenario(scenario)).toEqual(scenario);
    expect(parseDemoScenario(JSON.stringify(scenario))).toEqual(scenario);

    const st2 = memory();
    expect(restoreDemoScenario(scenario, st2, scenario.savedAt)).toBe(true);
    expect(readDemo(st2)).toEqual(data);
  });

  it("rechaza archivos inválidos y crea respaldo antes de importar", () => {
    const st = memory();
    const validData = {
      projects: [{ id: "p-1", code: "P-1", name: "Proyecto", status: "approved", budgetLines: [], items: [] }],
      assignments: [],
      orders: [],
      dayExceptions: [],
      deliveries: [],
      operators: [],
      stock: [],
      requests: [],
      settings: {},
      resolvedAlertIds: [],
      reviewedHoursKeys: [],
      costSettings: { laborValuation: "operator", hoursPerDay: 8 },
      hourRates: [],
      priceHistory: [],
      corrections: [],
      ledger: { ...EMPTY_LEDGER },
    };
    writeDemo(validData, st, "2026-10-30T00:00:00Z");

    expect(validateDemoScenario({ kind: "demo-scenario", version: DEMO_SCHEMA_VERSION - 1, savedAt: "2026-10-30", name: "x", data: validData })).toBeNull();
    expect(validateDemoScenario({ kind: "demo-scenario", version: DEMO_SCHEMA_VERSION, savedAt: "2026-10-30", name: "x", data: {} })).toBeNull();

    const backup = backupDemoScenario(st, "2026-10-30T00:00:00Z");
    expect(backup).not.toBeNull();
    expect(backup?.data).toEqual(validData);
    expect(backup?.kind).toBe("demo-scenario");
  });
});

describe("modo demostración en la app", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useAppStore.setState({ demoLocal: false, organizationId: "org-real", projects: [], role: "compras", isDemo: false });
  });

  it("al abrirlo carga el escenario de prueba, sin empresa (nada va a la base) y lo guarda en el navegador", () => {
    useAppStore.getState().enterLocalDemo();
    const s = useAppStore.getState();
    expect(s.demoLocal).toBe(true);
    expect(s.organizationId).toBeNull();
    expect(s.role).toBe("owner");
    expect(s.projects.length).toBeGreaterThanOrEqual(5);
    expect(s.ledger.salesInvoices.length).toBeGreaterThan(0);
    expect(isDemoActive()).toBe(true);
    expect(window.localStorage.getItem(DEMO_ACTIVE_KEY)).toBe("1");
    expect(readDemo()).not.toBeNull();
  });

  it("un cambio sigue ahí después de 'recargar' (volver a abrir la demo)", () => {
    useAppStore.getState().enterLocalDemo();
    const id = useAppStore.getState().projects.find((p) => p.status === "quotation")!.id;
    expect(useAppStore.getState().updateProject(id, { name: "Proyecto editado en la demo" }).ok).toBe(true);
    // Recarga: el estado en memoria se pierde y se vuelve a abrir desde el navegador.
    useAppStore.setState({ demoLocal: false, projects: [] });
    useAppStore.getState().enterLocalDemo();
    expect(useAppStore.getState().projects.find((p) => p.id === id)?.name).toBe("Proyecto editado en la demo");
  });

  it("restaurar vuelve al escenario inicial; salir apaga la demo", () => {
    useAppStore.getState().enterLocalDemo();
    const id = useAppStore.getState().projects[0].id;
    const original = useAppStore.getState().projects[0].name;
    useAppStore.getState().updateProject(id, { name: "Cambio" });
    useAppStore.getState().restoreLocalDemo();
    expect(useAppStore.getState().projects.find((p) => p.id === id)?.name).toBe(original);
    useAppStore.getState().exitLocalDemo();
    expect(useAppStore.getState().demoLocal).toBe(false);
    expect(isDemoActive()).toBe(false);
  });

  it("los registros nuevos (ledger) se guardan solo en la demo y respetan la sesión", () => {
    const add = (l: Ledger) => ({ ...l, internalHours: [...l.internalHours, { id: "h1", employeeId: "e", date: "2026-10-21", hours: 2, task: "Orden", createdAt: "" }] });
    expect(useAppStore.getState().recordLedger(["gerencia"], add)).toMatchObject({ ok: false, error: expect.stringMatching(/Pendiente de backend/) });
    useAppStore.getState().enterLocalDemo();
    useAppStore.setState({ currentMode: "operario" });
    expect(useAppStore.getState().recordLedger(["gerencia"], add).ok).toBe(false);
    useAppStore.setState({ currentMode: "gerencia" });
    expect(useAppStore.getState().recordLedger(["gerencia"], add).ok).toBe(true);
    useAppStore.setState({ demoLocal: false, ledger: { ...useAppStore.getState().ledger, internalHours: [] } });
    useAppStore.getState().enterLocalDemo();
    expect(useAppStore.getState().ledger.internalHours.map((h) => h.id)).toContain("h1");
  });

  it("una empresa real que carga nunca usa los datos de la demo", () => {
    useAppStore.getState().enterLocalDemo();
    // Empresa real cuya base todavía no guarda los registros (ledger null): queda vacío, nunca el de la demo.
    const ws = { ...useAppStore.getState(), organizationId: "org-real", isDemo: false, corrections: [], ledger: null } as unknown as Parameters<ReturnType<typeof useAppStore.getState>["loadWorkspace"]>[0];
    useAppStore.getState().loadWorkspace(ws);
    expect(useAppStore.getState().demoLocal).toBe(false);
    expect(useAppStore.getState().ledgerReady).toBe(false);
    expect(useAppStore.getState().ledger.salesInvoices).toEqual([]);
    // Con los registros de su base (ledger_workspace): son los suyos, y queda habilitado cargarlos.
    const own = { ...EMPTY_LEDGER, rubroCatalog: [{ id: "rubro_x", name: "X", active: true }] };
    useAppStore.getState().loadWorkspace({ ...ws, ledger: own });
    expect(useAppStore.getState().ledgerReady).toBe(true);
    expect(useAppStore.getState().ledger.rubroCatalog).toHaveLength(1);
    expect(useAppStore.getState().ledger.salesInvoices).toEqual([]);
  });
});
