// ─────────────────────────────────────────────────────────────
// Usuarios de la empresa (Lote 5A) — funciones puras.
// "Usuario" = cuenta para entrar (organization_members). "Persona" = operario con su costo por hora
// (operators): un operario puede existir sin usuario. Las mismas reglas las aplica la base
// (admin_* y el trigger guard_members); acá se validan antes para avisar en pantalla.
// ─────────────────────────────────────────────────────────────
import { z } from "zod";
import type { AppRole } from "@/types";
import { roleKeyOf, ROLE_KEYS, type RoleKey } from "./permissions";

export interface Member {
  userId: string;
  displayName: string;
  email: string;
  /** Celular (solo dígitos, con código de país) si entra por WhatsApp. */
  phone?: string;
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
  /** Vacío si se invitó solo por celular. */
  email: string;
  phone?: string;
  displayName: string;
  role: AppRole;
  operatorId?: string;
  createdAt: string;
}

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

/** Celular → solo dígitos con código de país (lo mismo que guarda Supabase Auth). "+54 9 11 5555-1234" → "5491155551234". */
export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

/** Celular para mostrar: "+5491155551234". */
export const formatPhone = (digits: string) => `+${digits}`;

/** Alta de un usuario: nombre, rol y mail y/o celular (WhatsApp). Un Operario se vincula a una persona de Operarios. */
export const newUserSchema = z
  .object({
    displayName: z.string().trim().min(2, "Ingresá el nombre."),
    email: z.string().trim().toLowerCase().refine((v) => v === "" || z.email().safeParse(v).success, "Ingresá un mail válido."),
    phone: z.string().trim().default("").transform(normalizePhone).refine((v) => v === "" || /^[0-9]{8,15}$/.test(v), "Ingresá el celular con código de país (ej. +54 9 11 5555 1234)."),
    role: z.enum(ROLE_KEYS as [RoleKey, ...RoleKey[]], { error: "Elegí un rol." }),
    operatorId: z.string().optional(),
  })
  .refine((v) => v.email !== "" || v.phone !== "", { path: ["email"], message: "Ingresá un mail o un celular." })
  .refine((v) => v.role !== "operario" || !!v.operatorId, { path: ["operatorId"], message: "Elegí qué operario es." });

export type NewUser = z.infer<typeof newUserSchema>;
export type NewUserInput = z.input<typeof newUserSchema>;

/**
 * Mensaje de invitación para mandar por WhatsApp (click-to-chat: lo manda el Administrativo desde su propio WhatsApp,
 * no hay envío automático). Link `wa.me` con el texto ya escrito.
 */
export function whatsappInviteLink(args: { phone: string; displayName: string; roleLabel: string; companyName?: string; loginUrl: string }): string {
  const empresa = args.companyName ? ` de ${args.companyName}` : "";
  const text =
    `Hola ${args.displayName}, te invité a Blerp${empresa} con el rol ${args.roleLabel}.\n` +
    `Entrá acá con este mismo número de WhatsApp (te llega un código): ${args.loginUrl}`;
  return `https://wa.me/${normalizePhone(args.phone)}?text=${encodeURIComponent(text)}`;
}

/** Filas que devuelve admin_members() → modelo. */
export function membersFromJson(json: { members?: Record<string, unknown>[]; invitations?: Record<string, unknown>[] }): { members: Member[]; invitations: Invitation[] } {
  const str = (v: unknown) => (v === null || v === undefined ? undefined : String(v));
  return {
    members: (json.members ?? []).map((m) => ({
      userId: String(m.user_id),
      displayName: String(m.display_name ?? ""),
      email: String(m.email ?? ""),
      phone: str(m.phone),
      role: m.role as AppRole,
      deactivatedAt: str(m.deactivated_at),
      createdAt: String(m.created_at),
      operatorId: str(m.operator_id),
      isSelf: Boolean(m.is_self),
      canViewCommercial: Boolean(m.can_view_commercial),
    })),
    invitations: (json.invitations ?? []).map((i) => ({
      id: String(i.id),
      email: String(i.email ?? ""),
      phone: str(i.phone),
      displayName: String(i.display_name),
      role: i.role as AppRole,
      operatorId: str(i.operator_id),
      createdAt: String(i.created_at),
    })),
  };
}

/** Errores de Supabase Auth → texto claro para quien intenta entrar (código por mail o WhatsApp). */
export function authErrorMessage(message: string, channel: "email" | "whatsapp"): string {
  const m = message.toLowerCase();
  if (m.includes("database error")) {
    return channel === "whatsapp"
      ? "Ese celular no tiene una invitación. Pedile al Administrativo de tu empresa que te invite."
      : "No pudimos crear tu cuenta. Probá de nuevo.";
  }
  if (m.includes("provider") || m.includes("not enabled") || m.includes("disabled") || m.includes("unsupported")) {
    return channel === "whatsapp" ? "El ingreso por WhatsApp todavía no está habilitado. Probá con tu mail." : "El ingreso por mail no está disponible ahora.";
  }
  if (m.includes("expired") || m.includes("invalid")) return "El código no es válido o venció. Pedí uno nuevo.";
  if (m.includes("rate") || m.includes("seconds")) return "Esperá un minuto antes de pedir otro código.";
  return "No pudimos validar tus datos. Probá de nuevo.";
}
