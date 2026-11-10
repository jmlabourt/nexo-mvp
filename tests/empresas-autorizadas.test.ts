// Empresas autorizadas: mapeo de la lista y mensajes cuando un mail no está autorizado.
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { authorizationsFromJson } from "@/lib/supabase/platform";
import { authErrorMessage, NOT_AUTHORIZED_MESSAGE } from "@/lib/users";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/env", async (original) => ({ ...(await original<typeof import("@/lib/supabase/env")>()), isSupabaseConfigured: true }));

describe("lista de empresas autorizadas", () => {
  it("convierte las filas de la base y tolera una lista vacía", () => {
    expect(authorizationsFromJson(null)).toEqual([]);
    const [a] = authorizationsFromJson([
      { id: "1", email: "g@m.com", company_name: "Muebles Sur", created_at: "2026-11-10T10:00:00Z", used_at: null, revoked_at: null, status: "pending", members: null },
    ]);
    expect(a).toMatchObject({ companyName: "Muebles Sur", status: "pending", members: null });
  });
});

describe("mail sin autorización", () => {
  it("el rechazo del alta (que Supabase enmascara) se explica con el camino a seguir", () => {
    expect(authErrorMessage("Database error saving new user")).toBe(NOT_AUTHORIZED_MESSAGE);
    expect(NOT_AUTHORIZED_MESSAGE).toMatch(/equipo de Blerp/);
    expect(NOT_AUTHORIZED_MESSAGE).toMatch(/Administrativo/);
  });

  it("el callback de Google lleva al login con el aviso cuando el alta fue rechazada", async () => {
    const { GET } = await import("@/app/auth/callback/route");
    const res = await GET(new NextRequest("https://app.blerpsolution.com/auth/callback?error=server_error&error_description=Database+error+saving+new+user"));
    expect(res.headers.get("location")).toBe("https://app.blerpsolution.com/login?error=unauthorized");
  });
});
