// Empresas autorizadas: llamadas a las funciones platform_* de la base. Solo el equipo de Blerp (platform_admins)
// puede usarlas; la base lo exige (ver supabase/migrations/20261110120000_empresas_autorizadas.sql).
import type { SupabaseClient } from "@supabase/supabase-js";

export type AuthorizationStatus = "pending" | "used" | "revoked";

export interface CompanyAuthorization {
  id: string;
  email: string;
  companyName: string;
  createdAt: string;
  usedAt: string | null;
  revokedAt: string | null;
  status: AuthorizationStatus;
  /** Personas en la empresa una vez creada (null si todavía no entró nadie). */
  members: number | null;
}

interface AuthorizationRow {
  id: string;
  email: string;
  company_name: string;
  created_at: string;
  used_at: string | null;
  revoked_at: string | null;
  status: AuthorizationStatus;
  members: number | null;
}

export function authorizationsFromJson(rows: AuthorizationRow[] | null): CompanyAuthorization[] {
  return (rows ?? []).map((r) => ({
    id: r.id,
    email: r.email,
    companyName: r.company_name,
    createdAt: r.created_at,
    usedAt: r.used_at,
    revokedAt: r.revoked_at,
    status: r.status,
    members: r.members,
  }));
}

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export async function loadAuthorizations(db: SupabaseClient): Promise<CompanyAuthorization[]> {
  return authorizationsFromJson(check(await db.rpc("platform_authorizations")) as AuthorizationRow[] | null);
}

export async function authorizeCompany(db: SupabaseClient, input: { email: string; companyName: string }): Promise<void> {
  check(await db.rpc("platform_authorize_company", { p: { email: input.email, company_name: input.companyName } }));
}

export async function revokeAuthorization(db: SupabaseClient, id: string): Promise<void> {
  check(await db.rpc("platform_revoke_authorization", { p_id: id }));
}
