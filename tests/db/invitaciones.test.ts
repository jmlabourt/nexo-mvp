// Invitaciones por WhatsApp (migración 20261023130000) en un Postgres real (PGlite):
// quién puede invitar, cómo se vincula el celular al rol y qué pasa con un número sin invitación.
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { asUser, createDb, errorAs, signUp, signUpPhone } from "./harness";

let db: PGlite;
let laura = ""; // Administrativo (owner)
let org = "";

const invite = (userId: string, p: Record<string, unknown>) =>
  asUser(db, userId, async (tx) => (await tx.query<{ r: string }>("select admin_invite_member($1::jsonb) as r", [JSON.stringify(p)])).rows[0].r);
const inviteError = (userId: string, p: Record<string, unknown>) =>
  errorAs(db, userId, (tx) => tx.query("select admin_invite_member($1::jsonb)", [JSON.stringify(p)]));
const roleOf = async (userId: string) =>
  (await db.query<{ organization_id: string; role: string; display_name: string }>("select organization_id, role, display_name from organization_members where user_id = $1", [userId])).rows[0];

beforeAll(async () => {
  db = await createDb();
  laura = await signUp(db, "laura@demo.com", "Laura Gómez");
  org = (await roleOf(laura)).organization_id;
}, 120_000);

describe("invitación por celular", () => {
  it("un celular invitado entra a la empresa con el rol elegido (Jefe de planta)", async () => {
    await invite(laura, { phone: "+54 9 11 5555-1234", display_name: "Carla Sosa", role: "jefe_planta" });
    const carla = await signUpPhone(db, "5491155551234", "");
    expect(await roleOf(carla)).toEqual({ organization_id: org, role: "jefe_planta", display_name: "Carla Sosa" });
    const inv = await db.query<{ accepted_user_id: string }>("select accepted_user_id from member_invitations where phone = '5491155551234'");
    expect(inv.rows[0].accepted_user_id).toBe(carla);
  });

  it("un Operario invitado por celular queda vinculado a su persona de Operarios", async () => {
    await db.query("insert into operators (organization_id, id, name, role, hourly_cost, active) values ($1, 'op-test', 'Juan Pérez', 'Carpintero', 1000, true)", [org]);
    await invite(laura, { phone: "5491166667777", display_name: "Juan Pérez", role: "operator", operator_id: "op-test" });
    const juan = await signUpPhone(db, "5491166667777", "");
    expect((await roleOf(juan)).role).toBe("operator");
    const op = await db.query<{ user_id: string }>("select user_id from operators where id = 'op-test'");
    expect(op.rows[0].user_id).toBe(juan);
  });

  it("se puede invitar con mail y celular a la vez, y entra por cualquiera de los dos", async () => {
    await invite(laura, { email: "marta@demo.com", phone: "5491188889999", display_name: "Marta", role: "compras" });
    const porCelular = await signUpPhone(db, "5491188889999", "");
    expect((await roleOf(porCelular)).role).toBe("compras");
  });

  it("un celular sin invitación NO crea una empresa nueva: se rechaza", async () => {
    const before = (await db.query<{ n: number }>("select count(*)::int n from organizations")).rows[0].n;
    await expect(signUpPhone(db, "5491100000000", "")).rejects.toThrow(/no tiene una invitación/);
    expect((await db.query<{ n: number }>("select count(*)::int n from organizations")).rows[0].n).toBe(before);
  });

  it("una invitación cancelada ya no sirve", async () => {
    const id = await invite(laura, { phone: "5491122223333", display_name: "Lucía", role: "jefe_planta" });
    await asUser(db, laura, (tx) => tx.query("select admin_revoke_invitation($1::uuid)", [id]));
    await expect(signUpPhone(db, "5491122223333", "")).rejects.toThrow(/no tiene una invitación/);
  });

  it("la misma persona no se puede invitar dos veces como usuario, ni con un celular de otra empresa pendiente", async () => {
    await invite(laura, { phone: "5491133334444", display_name: "Pablo", role: "compras" });
    const otra = await signUp(db, "otra@empresa.com", "Otra Persona");
    expect(await inviteError(otra, { phone: "5491133334444", display_name: "Pablo", role: "compras" })).toMatch(/otra empresa/);
  });

  it("valida contacto, celular y rol", async () => {
    expect(await inviteError(laura, { display_name: "Sin contacto", role: "compras" })).toMatch(/mail o un celular/);
    expect(await inviteError(laura, { phone: "123", display_name: "Corto", role: "compras" })).toMatch(/código de país/);
    expect(await inviteError(laura, { phone: "5491144445555", display_name: "Rol malo", role: "owner" })).toMatch(/rol válido/);
  });

  it("solo un Administrativo puede invitar", async () => {
    const carla = (await db.query<{ user_id: string }>("select user_id from organization_members where role = 'jefe_planta' limit 1")).rows[0].user_id;
    expect(await inviteError(carla, { phone: "5491155556666", display_name: "X", role: "compras" })).not.toBeNull();
  });

  it("admin_members muestra el celular de los usuarios y de las invitaciones pendientes", async () => {
    await invite(laura, { phone: "5491177778888", display_name: "Pendiente", role: "compras" });
    const r = await asUser(db, laura, async (tx) =>
      (await tx.query<{ r: { members: { phone: string | null }[]; invitations: { phone: string | null }[] } }>("select admin_members() as r")).rows[0].r,
    );
    expect(r.members.some((m) => m.phone === "5491155551234")).toBe(true);
    expect(r.invitations.some((i) => i.phone === "5491177778888")).toBe(true);
  });

  it("el mail sigue funcionando igual: invitado entra con su rol, desconocido crea su empresa", async () => {
    await invite(laura, { email: "nuevo@demo.com", display_name: "Nuevo", role: "jefe_planta" });
    expect((await roleOf(await signUp(db, "nuevo@demo.com", "Nuevo"))).organization_id).toBe(org);
    const solo = await signUp(db, "solo@empresa.com", "Solo");
    expect((await roleOf(solo)).role).toBe("owner");
    expect((await roleOf(solo)).organization_id).not.toBe(org);
  });
});
