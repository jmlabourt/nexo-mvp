// Cinco sesiones (reemplaza el mapa de cuatro roles del Lote 5A): menú, rutas, datos y acciones de cada sesión.
// Los permisos REALES siguen en la base con cuatro roles; Gerencia y Administración son dos sesiones del rol
// Administrativo y su separación es solo de pantalla (PENDIENTES_BACKEND.md).
import { describe, expect, it } from "vitest";
import type { AppRole } from "@/types";
import {
  can,
  canAccess,
  canSee,
  dbRoleOf,
  homeFor,
  navFor,
  resolveSession,
  ROLE_KEYS,
  ROLE_LABELS,
  roleKeyOf,
  SESSION_KEYS,
  sessionRole,
  sessionsFor,
  type DataField,
  type SessionKey,
} from "@/lib/permissions";
import { effectiveIdentity } from "@/store/use-app-store";

const menu = (s: SessionKey) => navFor(s).map((i) => i.label);

describe("cada sesión ve exactamente sus pestañas (23 en total)", () => {
  it("Gerencia: 5", () => {
    expect(menu("gerencia")).toEqual(["Dashboard", "Proyectos", "Personal", "Stock", "Configuración"]);
  });
  it("Administración / Comercial / Diseño: 7", () => {
    expect(menu("administracion")).toEqual(["Dashboard", "Proyectos", "Cotizador", "Stock", "Clientes", "Proveedores", "Configuración"]);
  });
  it("Compras: 6", () => {
    expect(menu("compras")).toEqual(["Dashboard", "Necesidades", "Órdenes de compra", "Stock", "Alertas", "Proveedores"]);
  });
  it("Jefe de planta: 4 (las asignaciones están dentro de Operarios)", () => {
    expect(menu("jefe_planta")).toEqual(["Dashboard", "Proyectos", "Operarios", "Alertas"]);
  });
  it("Operario: 1", () => {
    expect(menu("operario")).toEqual(["Mi día"]);
  });
  it("total: 23 pestañas", () => {
    expect(SESSION_KEYS.reduce((s, k) => s + navFor(k).length, 0)).toBe(23);
  });
  it("el inicio de cada sesión es su primera pestaña; el de un rol de la base, el de su primera sesión", () => {
    expect(SESSION_KEYS.map(homeFor)).toEqual(["/dashboard", "/administracion", "/compras", "/planta", "/taller"]);
    expect(ROLE_KEYS.map(homeFor)).toEqual(["/dashboard", "/compras", "/planta", "/taller"]);
  });
});

describe("guards de ruta", () => {
  const cases: Array<[SessionKey, string, boolean]> = [
    ["gerencia", "/settings", true],
    ["gerencia", "/projects/p-1", true],
    ["gerencia", "/operators", true],
    ["gerencia", "/alerts", true], // detalle desde el Dashboard
    ["gerencia", "/quotes", false],
    ["gerencia", "/compras", false],
    ["administracion", "/administracion", true],
    ["administracion", "/projects/new", true],
    ["administracion", "/clientes", true],
    ["administracion", "/dashboard", false], // el Dashboard gerencial
    ["administracion", "/operators", false], // Personal: costos privados
    ["administracion", "/horas", false],
    ["compras", "/compras/proveedores", true],
    ["compras", "/compras/cotizador", false], // ya no es una pestaña: los precios están en Proveedores
    ["compras", "/stock", false],
    ["compras", "/projects", false],
    ["jefe_planta", "/planta/operarios", true],
    ["jefe_planta", "/planta/asignaciones", false], // dentro de Operarios
    ["jefe_planta", "/dashboard", false],
    ["operario", "/taller/p-1", true],
    ["operario", "/projects", false],
  ];
  it.each(cases)("%s en %s → %s", (session, path, ok) => {
    expect(canAccess(session, path)).toBe(ok);
  });
  it("solo Gerencia administra usuarios y cierra proyectos; Administración crea proyectos", () => {
    expect(can("gerencia", "manageUsers")).toBe(true);
    expect(can("gerencia", "closeProjects")).toBe(true);
    for (const s of ["administracion", "compras", "jefe_planta", "operario"] as const) {
      expect(can(s, "manageUsers")).toBe(false);
      expect(can(s, "closeProjects")).toBe(false);
    }
    expect(can("administracion", "createProjects")).toBe(true);
  });
});

describe("datos que ve cada sesión", () => {
  const visible = (s: SessionKey) => (["salesPrice", "margin", "laborValue", "hourlyCost", "materialCost", "purchasePrice", "hours", "projects"] as DataField[]).filter((f) => canSee(s, f));
  it("Gerencia ve todo", () => {
    expect(visible("gerencia")).toHaveLength(8);
  });
  it("Administración: precio ofrecido y costos de materiales; nunca margen ni remuneraciones", () => {
    expect(visible("administracion")).toEqual(["salesPrice", "materialCost", "purchasePrice", "hours", "projects"]);
  });
  it("Compras: costos de materiales y precios de compra", () => {
    expect(visible("compras")).toEqual(["materialCost", "purchasePrice", "projects"]);
  });
  it("Jefe de planta y Operario: horas y proyectos, ningún importe", () => {
    expect(visible("jefe_planta")).toEqual(["hours", "projects"]);
    expect(visible("operario")).toEqual(["hours", "projects"]);
  });
});

describe("rol de la base ↔ sesiones", () => {
  it("owner y member son Administrativo; operator es Operario", () => {
    const roles: AppRole[] = ["owner", "member", "compras", "jefe_planta", "operator"];
    expect(roles.map((r) => ROLE_LABELS[roleKeyOf(r)])).toEqual(["Administrativo", "Administrativo", "Compras", "Jefe de planta", "Operario"]);
  });
  it("un Administrativo usa Gerencia y Administración; cada otro rol, la suya", () => {
    expect(sessionsFor("admin")).toEqual(["gerencia", "administracion"]);
    expect(sessionsFor("compras")).toEqual(["compras"]);
    expect(sessionRole("administracion")).toBe("admin");
    expect(resolveSession("admin", "administracion")).toBe("administracion");
    expect(resolveSession("admin", "compras")).toBe("gerencia");
    expect(resolveSession("compras", "gerencia")).toBe("compras");
  });
  it("un usuario nuevo Administrativo se guarda como member (owner queda para quien creó la empresa)", () => {
    expect(ROLE_KEYS.map(dbRoleOf)).toEqual(["member", "compras", "jefe_planta", "operator"]);
  });
});

describe("sesión efectiva", () => {
  const base = { role: "owner" as AppRole, operators: [], userId: "u", userEmail: "laura@x.com", actingOperatorId: null, userName: "Laura" };
  it("en la demo, un Administrativo mira cualquiera de las cinco sesiones con su usuario de ejemplo", () => {
    expect(effectiveIdentity({ ...base, isDemo: true, currentMode: "compras" })).toMatchObject({ role: "compras", roleKey: "compras", session: "compras", actor: "Martín Ruiz" });
    expect(effectiveIdentity({ ...base, isDemo: true, currentMode: "jefe_planta" })).toMatchObject({ role: "jefe_planta", actor: "María Ruiz" });
    expect(effectiveIdentity({ ...base, isDemo: true, currentMode: "operario" })).toMatchObject({ role: "operator", roleKey: "operario" });
    expect(effectiveIdentity({ ...base, isDemo: true, currentMode: "administracion" })).toMatchObject({ role: "owner", roleKey: "admin", session: "administracion" });
  });
  it("en una empresa real, un Administrativo solo elige entre Gerencia y Administración", () => {
    expect(effectiveIdentity({ ...base, isDemo: false, currentMode: "compras" })).toMatchObject({ role: "owner", roleKey: "admin", session: "gerencia", actor: "Laura" });
    expect(effectiveIdentity({ ...base, isDemo: false, currentMode: "administracion" })).toMatchObject({ roleKey: "admin", session: "administracion" });
  });
  it("un usuario de Compras real es Compras aunque tenga guardada otra sesión", () => {
    expect(effectiveIdentity({ ...base, role: "compras", isDemo: true, currentMode: "gerencia" })).toMatchObject({ role: "compras", session: "compras", actor: "Laura" });
  });
});
