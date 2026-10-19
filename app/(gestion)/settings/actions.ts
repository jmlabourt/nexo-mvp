"use server";
// Invitación de usuarios (Lote 5A). La invitación la registra la base con la sesión de quien invita
// (admin_invite_member exige un usuario Administrativo activo); el mail lo manda Supabase Auth con la
// service role, que solo existe en el servidor.
import { headers } from "next/headers";
import { dbRoleOf, ROLE_LABELS } from "@/lib/permissions";
import { newUserSchema, whatsappInviteLink } from "@/lib/users";
import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";

export interface InviteResult {
  ok: boolean;
  message: string;
  /** Link de WhatsApp (wa.me) con la invitación escrita, cuando se invitó por celular. */
  whatsappUrl?: string;
}

export async function inviteUser(input: unknown): Promise<InviteResult> {
  const parsed = newUserSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Revisá los datos." };
  const u = parsed.data;

  const db = await createClient();
  const { error } = await db.rpc("admin_invite_member", {
    p: {
      email: u.email || null,
      phone: u.phone || null,
      display_name: u.displayName,
      role: dbRoleOf(u.role),
      operator_id: u.role === "operario" ? u.operatorId : null,
    },
  });
  if (error) return { ok: false, message: error.message };

  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const whatsappUrl = u.phone
    ? whatsappInviteLink({ phone: u.phone, displayName: u.displayName, roleLabel: ROLE_LABELS[u.role], loginUrl: `${origin}/login` })
    : undefined;
  const waNote = whatsappUrl ? " Mandale el mensaje por WhatsApp con el botón de abajo." : "";

  if (!u.email) return { ok: true, message: `Invitación guardada.${waNote}`, whatsappUrl };

  const admin = serviceClient();
  if (!admin) {
    return { ok: true, message: `Invitación guardada. Todavía no está configurado el envío de mails: avisale a ${u.displayName} que entre con ${u.email}.${waNote}`, whatsappUrl };
  }
  const { data: invited, error: mailError } = await admin.auth.admin.inviteUserByEmail(u.email, {
    redirectTo: `${origin}/auth/confirm?next=/dashboard`,
    data: { full_name: u.displayName },
  });
  // Con mail y celular a la vez es una sola cuenta: se le agrega el celular para que pueda entrar por cualquiera de los dos.
  if (!mailError && u.phone && invited.user) {
    const { error: phoneError } = await admin.auth.admin.updateUserById(invited.user.id, { phone: u.phone, phone_confirm: true });
    if (phoneError) {
      return { ok: true, message: `Invitación enviada a ${u.email}, pero no se pudo asociar el celular (${phoneError.message}).${waNote}`, whatsappUrl };
    }
  }
  if (mailError) {
    return { ok: true, message: `Invitación guardada, pero no se pudo mandar el mail (${mailError.message}). ${u.displayName} puede entrar con ${u.email}.${waNote}`, whatsappUrl };
  }
  return { ok: true, message: `Invitación enviada a ${u.email}.${waNote}`, whatsappUrl };
}
