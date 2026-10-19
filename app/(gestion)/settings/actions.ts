"use server";
// Invitación de usuarios (Lote 5A). La invitación la registra la base con la sesión de quien invita
// (admin_invite_member exige un usuario Administrativo activo); el mail lo manda Supabase Auth con la
// service role, que solo existe en el servidor.
import { headers } from "next/headers";
import { dbRoleOf, homeFor } from "@/lib/permissions";
import { inviteLink, newUserSchema, type NewUser } from "@/lib/users";
import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";

export interface InviteResult {
  ok: boolean;
  message: string;
  /** Link para pasarle a la persona: abre el login con su mail y la lleva a la pantalla de su rol. */
  link?: string;
}

export interface BulkInviteResult extends InviteResult {
  email: string;
  displayName: string;
}

async function currentOrigin(): Promise<string> {
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
}

/** Registra la invitación (con la sesión de quien invita) y manda el mail. Lo comparten el alta individual y la masiva. */
async function inviteOne(u: NewUser, origin: string): Promise<InviteResult> {
  const db = await createClient();
  const { error } = await db.rpc("admin_invite_member", {
    p: { email: u.email, display_name: u.displayName, role: dbRoleOf(u.role), operator_id: u.role === "operario" ? u.operatorId : null },
  });
  if (error) return { ok: false, message: error.message };

  const link = inviteLink(origin, u.email, u.role);
  const admin = serviceClient();
  if (!admin) {
    return { ok: true, link, message: `Invitación guardada. Todavía no está configurado el envío de mails: pasale el link a ${u.displayName}.` };
  }
  const { error: mailError } = await admin.auth.admin.inviteUserByEmail(u.email, {
    redirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(homeFor(u.role))}`,
    data: { full_name: u.displayName },
  });
  if (mailError) {
    return { ok: true, link, message: `Invitación guardada, pero no se pudo mandar el mail (${mailError.message}). Pasale el link a ${u.displayName}.` };
  }
  return { ok: true, link, message: `Invitación enviada a ${u.email}.` };
}

export async function inviteUser(input: unknown): Promise<InviteResult> {
  const parsed = newUserSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Revisá los datos." };
  return inviteOne(parsed.data, await currentOrigin());
}

const MAX_BULK = 100;

/** Alta masiva: una invitación por fila; si una falla, las demás siguen. Devuelve el resultado de cada una. */
export async function inviteUsers(input: unknown): Promise<BulkInviteResult[]> {
  if (!Array.isArray(input)) return [];
  const origin = await currentOrigin();
  const out: BulkInviteResult[] = [];
  for (const item of input.slice(0, MAX_BULK)) {
    const parsed = newUserSchema.safeParse(item);
    if (!parsed.success) {
      const raw = (item ?? {}) as { email?: unknown; displayName?: unknown };
      out.push({ ok: false, message: parsed.error.issues[0]?.message ?? "Revisá los datos.", email: String(raw.email ?? ""), displayName: String(raw.displayName ?? "") });
      continue;
    }
    out.push({ ...(await inviteOne(parsed.data, origin)), email: parsed.data.email, displayName: parsed.data.displayName });
  }
  return out;
}
