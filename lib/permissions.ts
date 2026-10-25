// ─────────────────────────────────────────────────────────────
// Roles y permisos — UN solo mapa, funciones puras.
// De acá salen el menú lateral, los guards de ruta y lo que cada rol puede ver o hacer.
// La seguridad real está en la base (RLS y funciones por rol): este mapa es el mismo
// criterio, aplicado a la pantalla. Ver docs/ROLES_Y_PERMISOS.md.
// ─────────────────────────────────────────────────────────────
import type { AppRole } from "@/types";

/** Los cuatro roles que ve la gente. Administrativo = owner/member en la base (ver docs/ROLES_Y_PERMISOS.md). */
export type RoleKey = "admin" | "compras" | "jefe_planta" | "operario";

export const ROLE_KEYS: RoleKey[] = ["admin", "compras", "jefe_planta", "operario"];

export const ROLE_LABELS: Record<RoleKey, string> = {
  admin: "Administrativo",
  compras: "Compras",
  jefe_planta: "Jefe de planta",
  operario: "Operario",
};

export function roleKeyOf(role: AppRole): RoleKey {
  if (role === "owner" || role === "member") return "admin";
  if (role === "operator") return "operario";
  return role;
}

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
// La sesión decide qué pestañas ve una persona. Los permisos REALES están en la base (cuatro roles: Administrativo,
// Compras, Jefe de planta, Operario). Gerencia y Administración / Comercial / Diseño son dos sesiones del mismo rol
// de la base (Administrativo): la separación entre las dos es SOLO VISUAL hasta que el backend la aplique
// (ver PENDIENTES_BACKEND.md). No es seguridad.

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

/**
 * Sesiones que puede usar una persona según su rol en la base. Un Administrativo puede usar Gerencia y
 * Administración (preparado para el multirrol; hoy la base no distingue entre las dos).
 */
export function sessionsFor(role: RoleKey): SessionKey[] {
  return role === "admin" ? ["gerencia", "administracion"] : [role];
}

/** Sesión válida: la elegida si la persona la puede usar; si no, la primera que le corresponde. */
export function resolveSession(role: RoleKey, wanted: string | null | undefined): SessionKey {
  const allowed = sessionsFor(role);
  return allowed.includes(wanted as SessionKey) ? (wanted as SessionKey) : allowed[0];
}

/**
 * Pestañas de cada sesión (decisiones del 24/10/2026): Gerencia 5 · Administración 8 · Compras 7 · Jefe de planta 4
 * (sin Dashboard) · Operario 1 (Mi día). "Registrar mis horas" es para todo el personal que no es operario.
 */
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
    { href: "/mis-horas", label: "Registrar mis horas", icon: "hours" },
  ],
  compras: [
    { href: "/compras", label: "Dashboard", icon: "dashboard" },
    { href: "/compras/proyectos", label: "Por comprar", icon: "needs" },
    { href: "/compras/ordenes", label: "Órdenes de compra", icon: "orders" },
    { href: "/compras/stock", label: "Stock", icon: "stock" },
    { href: "/compras/alertas", label: "Alertas", icon: "alerts" },
    { href: "/compras/proveedores", label: "Proveedores", icon: "suppliers" },
    { href: "/mis-horas", label: "Registrar mis horas", icon: "hours" },
  ],
  jefe_planta: [
    { href: "/planta/proyectos", label: "Proyectos", icon: "projects" },
    { href: "/planta/operarios", label: "Operarios", icon: "operators" },
    { href: "/planta/alertas", label: "Alertas", icon: "alerts" },
    { href: "/mis-horas", label: "Registrar mis horas", icon: "hours" },
  ],
  operario: [{ href: "/taller", label: "Mi día", icon: "day" }],
};

/**
 * Pantallas a las que se llega desde el contenido (no son pestañas): las alertas y la mano de obra completas de
 * Gerencia y sus horas propias (opcionales, desde Personal).
 */
const DRILL_DOWN: Record<SessionKey, string[]> = {
  gerencia: ["/alerts", "/horas", "/mis-horas", "/aclaraciones"],
  administracion: ["/aclaraciones"],
  compras: ["/aclaraciones"],
  jefe_planta: ["/aclaraciones"],
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
  if (session === "jefe_planta") return `/planta/proyectos?p=${encodeURIComponent(projectId)}`;
  return `/projects/${projectId}${tab ? `?tab=${tab}` : ""}`;
}

/** Pantalla de inicio de un rol de la base (invitaciones) o de una sesión. */
export function homeFor(who: RoleKey | SessionKey): string {
  const session: SessionKey = who === "admin" ? "gerencia" : who;
  return NAV[session][0].href;
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
  return DATA[who === "admin" ? "gerencia" : who][field];
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
  return ACTIONS[who === "admin" ? "gerencia" : who].includes(action);
}
