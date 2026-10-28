// ─────────────────────────────────────────────────────────────
// Roles y permisos — UN solo mapa, funciones puras.
// De acá salen el menú lateral, los guards de ruta y lo que cada rol puede ver o hacer.
// La seguridad real está en la base (RLS y funciones por rol): este mapa es el mismo
// criterio, aplicado a la pantalla. Ver docs/ROLES_Y_PERMISOS.md.
// ─────────────────────────────────────────────────────────────
import type { AppRole } from "@/types";

/**
 * Los cinco roles que ve la gente. Administrativo = owner/member en la base (ver docs/ROLES_Y_PERMISOS.md).
 * "comercial" es Administración / Comercial / Diseño: cotiza y aprueba, pero no ve el costo real de la mano de obra,
 * ni facturas ni cobros, y no avanza la producción.
 */
export type RoleKey = "admin" | "comercial" | "compras" | "jefe_planta" | "operario";

export const ROLE_KEYS: RoleKey[] = ["admin", "comercial", "compras", "jefe_planta", "operario"];

export const ROLE_LABELS: Record<RoleKey, string> = {
  admin: "Administrativo",
  comercial: "Administración",
  compras: "Compras",
  jefe_planta: "Jefe de planta",
  operario: "Operario",
};

export function roleKeyOf(role: AppRole): RoleKey {
  if (role === "owner" || role === "member") return "admin";
  if (role === "operator") return "operario";
  return role;
}

/** Sesión (pantalla) de cada rol; un Administrativo arranca en Gerencia. */
const sessionOfWho = (who: SessionKey | RoleKey): SessionKey => (who === "admin" ? "gerencia" : who === "comercial" ? "administracion" : who);

/** Valor que se guarda en la base para un rol nuevo (owner queda solo para quien creó la empresa). */
export function dbRoleOf(role: RoleKey): Exclude<AppRole, "owner"> {
  if (role === "admin") return "member";
  if (role === "operario") return "operator";
  return role;
}

/** Ícono del ítem de menú (el componente lo traduce a un ícono real; acá no hay React). */
export type NavIcon =
  | "dashboard"
  | "projects"
  | "alerts"
  | "quotes"
  | "orders"
  | "stock"
  | "operators"
  | "settings"
  | "hours"
  | "assign"
  | "day"
  | "needs"
  | "clients"
  | "suppliers"
  | "people";

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
}

// ── Cinco sesiones (pantalla) ─────────────────────────────────
//
// La sesión decide qué pestañas ve una persona. Los permisos REALES están en la base (cinco roles: Administrativo,
// Administración, Compras, Jefe de planta, Operario). Quien tiene el rol Administración ve solo su sesión y la base le
// entrega solo lo suyo. Un Administrativo puede además mirar la sesión Administración (con sus propios permisos).

export type SessionKey = "gerencia" | "administracion" | "compras" | "jefe_planta" | "operario";

export const SESSION_KEYS: SessionKey[] = ["gerencia", "administracion", "compras", "jefe_planta", "operario"];

export const SESSION_LABELS: Record<SessionKey, string> = {
  gerencia: "Gerencia",
  administracion: "Administración",
  compras: "Compras",
  jefe_planta: "Jefe de planta",
  operario: "Operario",
};

/** Nombre largo (encabezados y ayudas). */
export const SESSION_TITLES: Record<SessionKey, string> = {
  gerencia: "Gestión / Gerencia",
  administracion: "Administración / Comercial / Diseño",
  compras: "Compras / Abastecimiento",
  jefe_planta: "Jefe de planta",
  operario: "Operario",
};

/** Rol de la base con el que trabaja cada sesión (para escrituras y permisos reales). */
export function sessionRole(session: SessionKey): RoleKey {
  return session === "gerencia" || session === "administracion" ? "admin" : session;
}

/** ¿Es Administración de verdad (rol propio, no un Administrativo mirando esa pantalla)? */
export const isComercialRole = (role: AppRole): boolean => role === "comercial";

/** Sesiones que puede usar una persona según su rol en la base. */
export function sessionsFor(role: RoleKey): SessionKey[] {
  if (role === "admin") return ["gerencia", "administracion"];
  return role === "comercial" ? ["administracion"] : [role];
}

/** Sesión válida: la elegida si la persona la puede usar; si no, la primera que le corresponde. */
export function resolveSession(role: RoleKey, wanted: string | null | undefined): SessionKey {
  const allowed = sessionsFor(role);
  return allowed.includes(wanted as SessionKey) ? (wanted as SessionKey) : allowed[0];
}

/** Exactamente las pestañas de cada sesión: 5 + 7 + 6 + 4 + 1 = 23. */
const NAV: Record<SessionKey, NavItem[]> = {
  gerencia: [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/projects", label: "Proyectos", icon: "projects" },
    { href: "/operators", label: "Personal", icon: "people" },
    { href: "/stock", label: "Stock", icon: "stock" },
    { href: "/settings", label: "Configuración", icon: "settings" },
  ],
  administracion: [
    { href: "/administracion", label: "Dashboard", icon: "dashboard" },
    { href: "/projects", label: "Proyectos", icon: "projects" },
    { href: "/quotes", label: "Cotizador", icon: "quotes" },
    { href: "/stock", label: "Stock", icon: "stock" },
    { href: "/clientes", label: "Clientes", icon: "clients" },
    { href: "/proveedores", label: "Proveedores", icon: "suppliers" },
    { href: "/settings", label: "Configuración", icon: "settings" },
  ],
  compras: [
    { href: "/compras", label: "Dashboard", icon: "dashboard" },
    { href: "/compras/proyectos", label: "Necesidades", icon: "needs" },
    { href: "/compras/ordenes", label: "Órdenes de compra", icon: "orders" },
    { href: "/compras/stock", label: "Stock", icon: "stock" },
    { href: "/compras/alertas", label: "Alertas", icon: "alerts" },
    { href: "/compras/proveedores", label: "Proveedores", icon: "suppliers" },
  ],
  jefe_planta: [
    { href: "/planta", label: "Dashboard", icon: "dashboard" },
    { href: "/planta/proyectos", label: "Proyectos", icon: "projects" },
    { href: "/planta/operarios", label: "Operarios", icon: "operators" },
    { href: "/planta/alertas", label: "Alertas", icon: "alerts" },
  ],
  operario: [{ href: "/taller", label: "Mi día", icon: "day" }],
};

/**
 * Pantallas a las que se llega desde el contenido (no son pestañas): el detalle de un proyecto, las alertas y la mano
 * de obra completas de Gerencia, el alta de un proyecto en Administración.
 */
const DRILL_DOWN: Record<SessionKey, string[]> = {
  gerencia: ["/alerts", "/horas"],
  administracion: [],
  compras: [],
  jefe_planta: [],
  operario: [],
};

export function navFor(session: SessionKey): NavItem[] {
  return NAV[session];
}

/**
 * Link a un proyecto según la sesión: Compras va a sus necesidades (la ficha muestra precio de venta); el Jefe de
 * planta, a sus proyectos; el resto, a la ficha.
 */
export function projectHref(session: SessionKey | RoleKey, projectId: string, tab?: string): string {
  if (session === "compras") return `/compras/proyectos?p=${encodeURIComponent(projectId)}`;
  return `/projects/${projectId}${tab ? `?tab=${tab}` : ""}`;
}

/** Pantalla de inicio de un rol de la base (invitaciones) o de una sesión. */
export function homeFor(who: RoleKey | SessionKey): string {
  return NAV[sessionOfWho(who)][0].href;
}

const under = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

/**
 * ¿Puede entrar a esta ruta con esta sesión? Solo a sus pestañas (y lo que cuelga de ellas) y a sus pantallas de
 * detalle. "/planta" no habilita "/planta/x" por sí sola: cada sección está en el menú.
 */
export function canAccess(session: SessionKey, pathname: string): boolean {
  const hrefs = NAV[session].map((i) => i.href);
  // "/compras" es la pestaña Dashboard: no habilita "/compras/cotizador" (cada sección está en el menú).
  const parent = (h: string) => hrefs.some((x) => x !== h && x.startsWith(`${h}/`));
  return hrefs.some((h) => (parent(h) ? pathname === h : under(pathname, h))) || DRILL_DOWN[session].some((h) => under(pathname, h));
}

/** Datos económicos: qué ve cada sesión. Gerencia y Administración leen lo mismo de la base (ver PENDIENTES_BACKEND.md). */
export type DataField = "salesPrice" | "margin" | "laborValue" | "hourlyCost" | "materialCost" | "purchasePrice" | "hours" | "projects";

const DATA: Record<SessionKey, Record<DataField, boolean>> = {
  gerencia: { salesPrice: true, margin: true, laborValue: true, hourlyCost: true, materialCost: true, purchasePrice: true, hours: true, projects: true },
  // Cotiza: ve costos de materiales y el precio ofrecido al cliente; nunca ganancia, márgenes ni remuneraciones.
  administracion: { salesPrice: true, margin: false, laborValue: false, hourlyCost: false, materialCost: true, purchasePrice: true, hours: true, projects: true },
  compras: { salesPrice: false, margin: false, laborValue: false, hourlyCost: false, materialCost: true, purchasePrice: true, hours: false, projects: true },
  jefe_planta: { salesPrice: false, margin: false, laborValue: false, hourlyCost: false, materialCost: false, purchasePrice: false, hours: true, projects: true },
  operario: { salesPrice: false, margin: false, laborValue: false, hourlyCost: false, materialCost: false, purchasePrice: false, hours: true, projects: true },
};

export function canSee(who: SessionKey | RoleKey, field: DataField): boolean {
  return DATA[sessionOfWho(who)][field];
}

export type Action = "manageUsers" | "manageSettings" | "editProjects" | "createProjects" | "closeProjects" | "correctFrozenValues" | "logOwnHours";

const ACTIONS: Record<SessionKey, Action[]> = {
  gerencia: ["manageUsers", "manageSettings", "editProjects", "closeProjects", "correctFrozenValues"],
  administracion: ["editProjects", "createProjects"],
  compras: [],
  jefe_planta: [],
  operario: ["logOwnHours"],
};

export function can(who: SessionKey | RoleKey, action: Action): boolean {
  return ACTIONS[sessionOfWho(who)].includes(action);
}
