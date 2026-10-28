// ─────────────────────────────────────────────────────────────
// Usuarios de la empresa (Lote 5A) — funciones puras.
// "Usuario" = cuenta para entrar (organization_members). "Persona" = operario con su costo por hora
// (operators): un operario puede existir sin usuario. Las mismas reglas las aplica la base
// (admin_* y el trigger guard_members); acá se validan antes para avisar en pantalla.
// ─────────────────────────────────────────────────────────────
import { z } from "zod";
import type { AppRole } from "@/types";
import { homeFor, roleKeyOf, ROLE_KEYS, type RoleKey } from "./permissions";
import { parseDecimal } from "./schemas";

export interface Member {
  userId: string;
  displayName: string;
  email: string;
  role: AppRole;
  deactivatedAt?: string;
  createdAt: string;
  /** Persona de Operarios vinculada (solo Operario). */
  operatorId?: string;
  isSelf: boolean;
  canViewCommercial?: boolean;
}

export interface Invitation {
  id: string;
  email: string;
  displayName: string;
  role: AppRole;
  operatorId?: string;
  createdAt: string;
}

const plain = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const isAdmin = (m: Pick<Member, "role" | "deactivatedAt">) => roleKeyOf(m.role) === "admin" && !m.deactivatedAt;

/** Por qué no se puede cambiar el rol de un usuario (o null si se puede). */
export function roleChangeError(members: Member[], target: Member, to: RoleKey): string | null {
  if (target.isSelf) return "No podés cambiar tu propio rol.";
  if (roleKeyOf(target.role) === to) return null;
  if (isAdmin(target) && !members.some((m) => m.userId !== target.userId && isAdmin(m))) {
    return "La empresa tiene que tener al menos un usuario Administrativo activo.";
  }
  return null;
}

/** Por qué no se puede dar de baja a un usuario (o null si se puede). */
export function deactivateError(members: Member[], target: Member): string | null {
  if (target.isSelf) return "No podés darte de baja a vos mismo.";
  if (isAdmin(target) && !members.some((m) => m.userId !== target.userId && isAdmin(m))) {
    return "No se puede dar de baja al último usuario Administrativo.";
  }
  return null;
}

/** Alta de un usuario: nombre, rol y mail de invitación. Un Operario se vincula a una persona de Operarios. */
export const newUserSchema = z
  .object({
    displayName: z.string().trim().min(2, "Ingresá el nombre."),
    email: z.string().trim().toLowerCase().email("Ingresá un mail válido."),
    role: z.enum(ROLE_KEYS as [RoleKey, ...RoleKey[]], { error: "Elegí un rol." }),
    operatorId: z.string().optional(),
  })
  .refine((v) => v.role !== "operario" || !!v.operatorId, { path: ["operatorId"], message: "Elegí qué operario es." });

export type NewUser = z.infer<typeof newUserSchema>;

// ── Formulario de alta (pantalla) ─────────────────────────────

/** Valor del selector de operario para "es una persona nueva": se la crea en Operarios al invitarla. */
export const NEW_OPERATOR = "new";

/**
 * Lo que se completa en pantalla. Para un Operario hay dos caminos, sin pedir el dato dos veces:
 * - persona nueva (NEW_OPERATOR): el nombre es el que se escribe; además hace falta puesto y costo por hora, porque
 *   las horas que cargue se valorizan con ese costo;
 * - persona ya cargada en Operarios: se elige de la lista y su nombre sale de ahí.
 */
export const userFormSchema = z
  .object({
    displayName: z.string().trim().min(2, "Ingresá el nombre."),
    email: z.string().trim().toLowerCase().email("Ingresá un mail válido."),
    role: z.enum(ROLE_KEYS as [RoleKey, ...RoleKey[]], { error: "Elegí un rol." }),
    operatorId: z.string().optional(),
    position: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.role !== "operario") return;
    if (!v.operatorId) {
      ctx.addIssue({ code: "custom", path: ["operatorId"], message: "Elegí si es un operario nuevo o uno ya cargado." });
      return;
    }
    if (v.operatorId !== NEW_OPERATOR) return;
    if ((v.position ?? "").trim().length < 2) ctx.addIssue({ code: "custom", path: ["position"], message: "Ingresá el puesto o la especialidad." });
  });

export type UserFormInput = z.input<typeof userFormSchema>;
export type UserFormValues = z.output<typeof userFormSchema>;

/**
 * Persona a crear en Operarios antes de invitarla (solo cuando se eligió "operario nuevo"). Su costo por hora no se
 * escribe: es la tarifa de su categoría en Configuración (todos los operarios cobran lo mismo).
 */
export function newOperatorOf(v: UserFormValues): { name: string; role: string; email: string } | null {
  if (v.role !== "operario" || v.operatorId !== NEW_OPERATOR) return null;
  return { name: v.displayName, role: (v.position ?? "").trim(), email: v.email };
}

/** Si el nombre de un operario nuevo ya está cargado (sin usuario), conviene elegirlo de la lista y no duplicarlo. */
export function duplicateOperatorError(name: string, free: { name: string }[]): string | null {
  const n = plain(name);
  return n && free.some((o) => plain(o.name) === n)
    ? "Ya hay un operario con ese nombre sin usuario: elegilo de la lista en vez de crearlo de nuevo."
    : null;
}

/** Filas que devuelve admin_members() → modelo. */
export function membersFromJson(json: { members?: Record<string, unknown>[]; invitations?: Record<string, unknown>[] }): { members: Member[]; invitations: Invitation[] } {
  const str = (v: unknown) => (v === null || v === undefined ? undefined : String(v));
  return {
    members: (json.members ?? []).map((m) => ({
      userId: String(m.user_id),
      displayName: String(m.display_name ?? ""),
      email: String(m.email ?? ""),
      role: m.role as AppRole,
      deactivatedAt: str(m.deactivated_at),
      createdAt: String(m.created_at),
      operatorId: str(m.operator_id),
      isSelf: Boolean(m.is_self),
      canViewCommercial: Boolean(m.can_view_commercial),
    })),
    invitations: (json.invitations ?? []).map((i) => ({
      id: String(i.id),
      email: String(i.email),
      displayName: String(i.display_name),
      role: i.role as AppRole,
      operatorId: str(i.operator_id),
      createdAt: String(i.created_at),
    })),
  };
}

/** Errores de Supabase Auth → texto claro para quien intenta entrar con un código por mail. */
export function authErrorMessage(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("database error")) return "No pudimos crear tu cuenta. Probá de nuevo.";
  if (m.includes("provider") || m.includes("not enabled") || m.includes("disabled")) return "El ingreso por mail no está disponible ahora.";
  if (m.includes("expired") || m.includes("invalid")) return "El código no es válido o venció. Pedí uno nuevo.";
  if (m.includes("rate") || m.includes("seconds")) return "Esperá un minuto antes de pedir otro código.";
  return "No pudimos validar tus datos. Probá de nuevo.";
}


// ── Alta masiva (listado nombre, mail, rol) y link de acceso por rol ──────────

/** Link que se le pasa a cada persona: abre el login con su mail y, al entrar, la lleva a la pantalla de su rol. */
export function inviteLink(origin: string, email: string, role: RoleKey): string {
  return `${origin}/login?next=${encodeURIComponent(homeFor(role))}&email=${encodeURIComponent(email)}`;
}

const ROLE_ALIASES: Record<string, RoleKey> = {
  admin: "admin",
  administrativo: "admin",
  administrador: "admin",
  administracion: "comercial",
  comercial: "comercial",
  diseno: "comercial",
  "administracion comercial diseno": "comercial",
  compras: "compras",
  compra: "compras",
  comprador: "compras",
  "jefe de planta": "jefe_planta",
  "jefe planta": "jefe_planta",
  jefe: "jefe_planta",
  planta: "jefe_planta",
  operario: "operario",
  operador: "operario",
  taller: "operario",
};

/** "Jefe de planta", "planta", "taller"… → rol (o undefined si no se reconoce). */
export function parseRole(raw: string): RoleKey | undefined {
  return ROLE_ALIASES[plain(raw)];
}

export interface ParsedUserRow {
  /** Número de línea en el texto pegado (empieza en 1), para avisar dónde está el problema. */
  line: number;
  displayName: string;
  email: string;
  role?: RoleKey;
  operatorId?: string;
  /** Operario que no existe en Operarios: se crea con estos datos al invitar (el costo por hora sale de Configuración). */
  newOperator?: { position: string };
  /** Si tiene error, esta fila no se invita. */
  error?: string;
}

function splitLine(line: string): string[] {
  const sep = line.includes("\t") ? "\t" : line.includes(";") ? ";" : ",";
  return line.split(sep).map((c) => c.trim().replace(/^"(.*)"$/, "$1").trim());
}

/**
 * Listado pegado desde Excel o un CSV: una persona por línea con nombre, mail y rol (separados por tab, ; o coma).
 * La primera línea puede ser un encabezado (Nombre, Mail, Rol). Un Operario se vincula, por nombre, a una persona de
 * Operarios que todavía no tenga usuario; si no existe, se crea cuando la fila trae el Puesto. Una columna de costo se ignora: el
 * costo por hora es la tarifa de Configuración. Función pura: no invita a nadie.
 */
export function parseUserList(text: string, freeOperators: { id: string; name: string }[], existingEmails: string[]): ParsedUserRow[] {
  const taken = new Set(existingEmails.map((e) => e.trim().toLowerCase()));
  const seen = new Set<string>();
  const usedOperators = new Set<string>();
  const rows: ParsedUserRow[] = [];
  const newNames = new Set<string>();
  let cols: { name: number; email: number; role: number; position: number } = { name: 0, email: 1, role: 2, position: 3 };

  text.split(/\r?\n/).forEach((raw, i) => {
    if (raw.trim() === "") return;
    const cells = splitLine(raw);
    if (i === 0 || rows.length === 0) {
      const heads = cells.map(plain);
      const e = heads.findIndex((h) => h === "mail" || h === "email" || h === "correo");
      const r = heads.findIndex((h) => h === "rol" || h === "perfil");
      if (e >= 0 && r >= 0) {
        const n = heads.findIndex((h) => h === "nombre" || h === "name" || h === "persona");
        const pos = heads.findIndex((h) => h === "puesto" || h === "especialidad" || h === "cargo");
        cols = { name: n >= 0 ? n : [0, 1, 2].find((k) => k !== e && k !== r) ?? 0, email: e, role: r, position: pos };
        return;
      }
    }
    const displayName = (cells[cols.name] ?? "").trim();
    const email = (cells[cols.email] ?? "").trim().toLowerCase();
    const role = parseRole(cells[cols.role] ?? "");
    const row: ParsedUserRow = { line: i + 1, displayName, email, role };
    if (displayName.length < 2) row.error = "Falta el nombre.";
    else if (!z.email().safeParse(email).success) row.error = "El mail no es válido.";
    else if (!role) row.error = `Rol no reconocido: "${(cells[cols.role] ?? "").trim()}". Usá Administrativo, Compras, Jefe de planta u Operario.`;
    else if (taken.has(email)) row.error = "Ese mail ya es un usuario o tiene una invitación pendiente.";
    else if (seen.has(email)) row.error = "Mail repetido en el listado.";
    else if (role === "operario") {
      const n = plain(displayName);
      const matches = freeOperators.filter((o) => !usedOperators.has(o.id) && plain(o.name) === n);
      if (matches.length === 1) {
        row.operatorId = matches[0].id;
        usedOperators.add(matches[0].id);
      } else if (matches.length > 1) {
        row.error = "Hay más de un operario con ese nombre sin usuario.";
      } else {
        // Persona nueva: se crea en Operarios si el listado trae su puesto.
        const position = (cols.position >= 0 ? cells[cols.position] ?? "" : "").trim();
        if (position.length >= 2) {
          if (newNames.has(n)) row.error = "Operario repetido en el listado.";
          else {
            newNames.add(n);
            row.newOperator = { position };
          }
        } else {
          row.error = "Es un operario nuevo: agregá su Puesto (columna 4, o con ese encabezado). Si ya está cargado, revisá que el nombre coincida.";
        }
      }
    }
    if (email) seen.add(email);
    rows.push(row);
  });
  return rows;
}
