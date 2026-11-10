// Empresas autorizadas (migración 20261110120000) en un Postgres real (PGlite):
// el equipo de Blerp autoriza a la Gerencia de una empresa; esa Gerencia invita a su gente con el rol de cada uno;
// cualquier otro mail se rechaza.
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { asUser, createDb, errorAs, signUp } from "./harness";

let db: PGlite;
let equipo = ""; // miembro del equipo de Blerp (platform_admins)
let tercero = ""; // usuario común de otra empresa

const authorize = (userId: string, p: Record<string, unknown>) =>
  asUser(db, userId, async (tx) => (await tx.query<{ r: string }>("select platform_authorize_company($1::jsonb) as r", [JSON.stringify(p)])).rows[0].r);
const authorizeError = (userId: string, p: Record<string, unknown>) =>
  errorAs(db, userId, (tx) => tx.query("select platform_authorize_company($1::jsonb)", [JSON.stringify(p)]));
const list = (userId: string) =>
  asUser(db, userId, async (tx) => (await tx.query<{ r: Array<Record<string, unknown>> }>("select platform_authorizations() as r")).rows[0].r);
const membership = async (userId: string) =>
  (await db.query<{ organization_id: string; role: string; name: string }>(
    "select m.organization_id, m.role, o.name from organization_members m join organizations o on o.id = m.organization_id where m.user_id = $1",
    [userId],
  )).rows[0];

beforeAll(async () => {
  db = await createDb();
  // El equipo de Blerp: se carga por SQL en platform_admins (la migración ya trae a jmlabourt@gmail.com).
  equipo = await signUp(db, "jmlabourt@gmail.com", "Juanita Labourt");
  tercero = await signUp(db, "otra@empresa.com", "Otra Persona");
}, 120_000);

describe("quién puede autorizar", () => {
  it("el equipo de Blerp es administrador de la plataforma; el resto no", async () => {
    expect(await asUser(db, equipo, async (tx) => (await tx.query<{ r: boolean }>("select platform_is_admin() as r")).rows[0].r)).toBe(true);
    expect(await asUser(db, tercero, async (tx) => (await tx.query<{ r: boolean }>("select platform_is_admin() as r")).rows[0].r)).toBe(false);
  });

  it("un usuario común no puede autorizar, ver ni revocar", async () => {
    expect(await authorizeError(tercero, { email: "x@y.com", company_name: "X S.A." })).toMatch(/equipo de Blerp/);
    expect(await errorAs(db, tercero, (tx) => tx.query("select platform_authorizations()"))).toMatch(/equipo de Blerp/);
    expect(await errorAs(db, tercero, (tx) => tx.query("select platform_revoke_authorization(gen_random_uuid())"))).toMatch(/equipo de Blerp/);
  });

  it("las tablas no se leen ni se escriben directo desde la API", async () => {
    const read = await errorAs(db, equipo, (tx) => tx.query("select * from company_authorizations"));
    const write = await errorAs(db, tercero, (tx) => tx.query("insert into company_authorizations (email, company_name) values ('z@z.com', 'Z S.A.')"));
    const admins = await errorAs(db, tercero, (tx) => tx.query("insert into platform_admins (email) values ('tercero@x.com')"));
    // Sin permisos de tabla o sin políticas: no devuelve filas / falla.
    if (read === null) {
      const rows = await asUser(db, equipo, async (tx) => (await tx.query("select * from company_authorizations")).rows);
      expect(rows).toEqual([]);
    }
    expect(write).not.toBeNull();
    expect(admins).not.toBeNull();
  });
});

describe("autorizar una empresa", () => {
  it("valida mail y nombre", async () => {
    expect(await authorizeError(equipo, { email: "no-es-mail", company_name: "Muebles Sur" })).toMatch(/mail válido/);
    expect(await authorizeError(equipo, { email: "gerente@muebles.com", company_name: " " })).toMatch(/nombre de la empresa/);
  });

  it("el mail autorizado entra y se crea la empresa con el nombre autorizado, como Administrativo", async () => {
    const id = await authorize(equipo, { email: "Gerente@Muebles.com ", company_name: "Muebles del Sur S.R.L." });
    expect((await list(equipo)).find((a) => a.id === id)?.status).toBe("pending");

    const gerente = await signUp(db, "gerente@muebles.com", "Gerardo Gómez", { authorized: false });
    const m = await membership(gerente);
    expect(m.role).toBe("owner");
    expect(m.name).toBe("Muebles del Sur S.R.L.");

    const a = (await list(equipo)).find((x) => x.id === id);
    expect(a?.status).toBe("used");
    expect(a?.members).toBe(1);
  });

  it("la autorización se usa una sola vez: no se puede volver a autorizar un mail que ya tiene cuenta", async () => {
    expect(await authorizeError(equipo, { email: "gerente@muebles.com", company_name: "Otra empresa" })).toMatch(/ya tiene una cuenta/);
  });

  it("no se puede autorizar dos veces el mismo mail pendiente", async () => {
    await authorize(equipo, { email: "doble@pyme.com", company_name: "Pyme Doble" });
    expect(await authorizeError(equipo, { email: "doble@pyme.com", company_name: "Pyme Doble 2" })).toMatch(/ya está autorizado/);
  });

  it("un mail con invitación pendiente de otra empresa no se autoriza (se uniría a esa empresa)", async () => {
    const gerente = (await db.query<{ id: string }>("select id from auth.users where email = 'gerente@muebles.com'")).rows[0].id;
    await asUser(db, gerente, (tx) =>
      tx.query("select admin_invite_member($1::jsonb)", [JSON.stringify({ email: "pendiente@otra.com", display_name: "Pendiente", role: "compras" })]),
    );
    expect(await authorizeError(equipo, { email: "pendiente@otra.com", company_name: "Otra S.A." })).toMatch(/invitación pendiente/);
  });
});

describe("mails sin autorización", () => {
  it("un mail desconocido NO crea empresa: se rechaza con un mensaje claro", async () => {
    const before = (await db.query<{ n: number }>("select count(*)::int n from organizations")).rows[0].n;
    await expect(signUp(db, "curioso@gmail.com", "Curioso", { authorized: false })).rejects.toThrow(/todavía no está autorizada/);
    expect((await db.query<{ n: number }>("select count(*)::int n from organizations")).rows[0].n).toBe(before);
    expect((await db.query("select 1 from auth.users where email = 'curioso@gmail.com'")).rows).toHaveLength(0);
  });

  it("una autorización revocada ya no sirve", async () => {
    const id = await authorize(equipo, { email: "revocada@pyme.com", company_name: "Pyme Revocada" });
    await asUser(db, equipo, (tx) => tx.query("select platform_revoke_authorization($1::uuid)", [id]));
    expect((await list(equipo)).find((a) => a.id === id)?.status).toBe("revoked");
    await expect(signUp(db, "revocada@pyme.com", "Rev", { authorized: false })).rejects.toThrow(/todavía no está autorizada/);
    expect(await errorAs(db, equipo, (tx) => tx.query("select platform_revoke_authorization($1::uuid)", [id]))).toMatch(/ya estaba revocada|ya se usó/);
  });

  it("el equipo de Blerp puede abrir su propia empresa de prueba sin autorizarse", async () => {
    const yo = await signUp(db, "jmlabourt+prueba@gmail.com", "Prueba", { authorized: false }).catch((e: Error) => e);
    // El mail con "+" no es el del equipo: se rechaza.
    expect(yo).toBeInstanceOf(Error);
    await db.query("insert into platform_admins (email) values ('socia@blerp.com')");
    const socia = await signUp(db, "Socia@Blerp.com", "Socia Blerp", { authorized: false });
    expect((await membership(socia)).role).toBe("owner");
  });
});

describe("la Gerencia autoriza a su gente", () => {
  it("el Administrativo invita a cada empleado con su rol y cada uno entra a esa empresa con ese rol", async () => {
    const gerente = (await db.query<{ id: string }>("select id from auth.users where email = 'gerente@muebles.com'")).rows[0].id;
    const org = (await membership(gerente)).organization_id;
    const invite = (p: Record<string, unknown>) =>
      asUser(db, gerente, (tx) => tx.query("select admin_invite_member($1::jsonb)", [JSON.stringify(p)]));
    await invite({ email: "compras@muebles.com", display_name: "Carla Compras", role: "compras" });
    await invite({ email: "planta@muebles.com", display_name: "Pablo Planta", role: "jefe_planta" });
    await invite({ email: "ventas@muebles.com", display_name: "Vera Ventas", role: "comercial" });

    for (const [email, role] of [
      ["compras@muebles.com", "compras"],
      ["planta@muebles.com", "jefe_planta"],
      ["ventas@muebles.com", "comercial"],
    ] as const) {
      const id = await signUp(db, email, email.split("@")[0], { authorized: false });
      const m = await membership(id);
      expect(m.organization_id).toBe(org);
      expect(m.role).toBe(role);
    }
  });

  it("un mail que nadie invitó, aunque sea del mismo dominio, sigue rechazado", async () => {
    await expect(signUp(db, "intruso@muebles.com", "Intruso", { authorized: false })).rejects.toThrow(/todavía no está autorizada/);
  });

  it("los usuarios que ya existían no se tocan: tienen su empresa y no necesitan autorización", async () => {
    expect((await membership(tercero)).role).toBe("owner");
  });
});
