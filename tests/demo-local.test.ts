// @vitest-environment jsdom
// Modo demostración local (esquema 3): un único estado de dominio (lib/core) compartido por las cinco sesiones,
// guardado versionado en el navegador, restaurar exacto y salir sin tocar ninguna empresa real.
import { beforeEach, describe, expect, it } from "vitest";
import { DEMO_ACTIVE_KEY, DEMO_DATA_KEY, DEMO_SCHEMA_VERSION, demoDataChanged, isDemoActive, pickDemoData, readDemo, writeDemo, type DemoStorage } from "@/store/demo-local";
import { useAppStore } from "@/store/use-app-store";
import { buildDemoWorld } from "@/lib/core/seed";
import * as op from "@/lib/core/ops";

const memory = (): DemoStorage & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
};

describe("almacenamiento de la demo (funciones puras)", () => {
  it("guarda con versión de esquema y descarta copias de otra versión o dañadas", () => {
    const st = memory();
    expect(writeDemo({ core: { schema: 3 } }, st, "2026-10-21T00:00:00Z")).toBe(true);
    expect(JSON.parse(st.map.get(DEMO_DATA_KEY)!).version).toBe(DEMO_SCHEMA_VERSION);
    expect(readDemo(st)).toEqual({ core: { schema: 3 } });
    st.setItem(DEMO_DATA_KEY, JSON.stringify({ version: DEMO_SCHEMA_VERSION - 1, data: { projects: [1] } }));
    expect(readDemo(st)).toBeNull();
    st.setItem(DEMO_DATA_KEY, "{roto");
    expect(readDemo(st)).toBeNull();
    expect(readDemo(null)).toBeNull();
  });

  it("solo guarda el estado de la demo (nunca identidad ni sesión) y detecta cambios por referencia", () => {
    const core = { schema: 3 };
    const state = { core, projects: [], userEmail: "persona@empresa.com", organizationId: "org", currentMode: "gerencia" };
    expect(pickDemoData(state)).toEqual({ core });
    expect(demoDataChanged({ ...state }, state)).toBe(false);
    expect(demoDataChanged({ ...state, core: { schema: 3 } }, state)).toBe(true);
  });
});

describe("modo demostración en la app", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useAppStore.setState({ demoLocal: false, core: null, organizationId: "org-real", projects: [], role: "owner", isDemo: false, currentMode: "gerencia" });
  });

  it("al abrirlo carga el escenario base, sin empresa (nada va a la base) y lo guarda en el navegador", () => {
    useAppStore.getState().enterLocalDemo();
    const s = useAppStore.getState();
    expect(s.demoLocal).toBe(true);
    expect(s.organizationId).toBeNull();
    expect(s.core?.projects.length).toBe(11);
    expect(s.core?.config.asOf).toBe("2026-10-20");
    expect(isDemoActive()).toBe(true);
    expect(window.localStorage.getItem(DEMO_ACTIVE_KEY)).toBe("1");
    expect(readDemo()?.core).toBeTruthy();
  });

  it("un cambio de una sesión se ve en las otras y sigue ahí después de recargar", () => {
    useAppStore.getState().enterLocalDemo();
    useAppStore.setState({ currentMode: "administracion" });
    const r = useAppStore.getState().coreAct((w, ctx) => op.upsertClient(w, { name: "Cliente nuevo de prueba" }, ctx));
    expect(r.ok).toBe(true);
    useAppStore.setState({ currentMode: "gerencia" });
    expect(useAppStore.getState().core!.clients.some((c) => c.name === "Cliente nuevo de prueba")).toBe(true);
    useAppStore.setState({ demoLocal: false, core: null });
    useAppStore.getState().enterLocalDemo();
    expect(useAppStore.getState().core!.clients.some((c) => c.name === "Cliente nuevo de prueba")).toBe(true);
  });

  it("cada sesión hace solo lo suyo: Compras no aprueba cotizaciones", () => {
    useAppStore.getState().enterLocalDemo();
    useAppStore.setState({ currentMode: "compras" });
    const r = useAppStore.getState().coreAct((w, ctx) => op.approveQuote(w, "ot-4309", ctx));
    expect(r).toEqual({ ok: false, error: "Esta acción no corresponde a tu sesión." });
  });

  it("restaurar vuelve exactamente al escenario base; salir apaga la demo", () => {
    useAppStore.getState().enterLocalDemo();
    useAppStore.setState({ currentMode: "administracion" });
    useAppStore.getState().coreAct((w, ctx) => op.upsertClient(w, { name: "Otro cliente" }, ctx));
    useAppStore.getState().restoreLocalDemo();
    expect(JSON.stringify(useAppStore.getState().core)).toBe(JSON.stringify(buildDemoWorld()));
    useAppStore.getState().exitLocalDemo();
    expect(useAppStore.getState().demoLocal).toBe(false);
    expect(useAppStore.getState().core).toBeNull();
    expect(isDemoActive()).toBe(false);
  });

  it("fuera de la demo las operaciones nuevas no hacen nada (pendiente de backend)", () => {
    const r = useAppStore.getState().coreAct((w) => w);
    expect(r.ok).toBe(false);
  });
});
