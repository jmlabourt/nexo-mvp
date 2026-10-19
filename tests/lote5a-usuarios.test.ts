// Lote 5A — usuarios: reglas de rol y baja, y el formulario de alta (Zod).
import { describe, expect, it } from "vitest";
import {
  authErrorMessage,
  deactivateError,
  duplicateOperatorError,
  inviteLink,
  membersFromJson,
  newOperatorOf,
  NEW_OPERATOR,
  newUserSchema,
  parseRole,
  parseUserList,
  roleChangeError,
  userFormSchema,
  type Member,
} from "@/lib/users";
import { SESSION_MAX_AGE_SECONDS, sessionCookieOptions } from "@/lib/supabase/session";

const m = (userId: string, role: Member["role"], extra: Partial<Member> = {}): Member => ({
  userId,
  displayName: userId,
  email: `${userId}@x.com`,
  role,
  createdAt: "2026-01-01",
  isSelf: false,
  ...extra,
});

describe("cambiar de rol y dar de baja", () => {
  const laura = m("laura", "owner", { isSelf: true });
  const sofia = m("sofia", "member");
  const martin = m("martin", "compras");

  it("un administrador no puede quitarse a sí mismo el rol ni darse de baja", () => {
    expect(roleChangeError([laura, sofia], laura, "compras")).toMatch(/propio rol/);
    expect(deactivateError([laura, sofia], laura)).toMatch(/a vos mismo/);
  });
  it("no se puede dejar a la empresa sin Administrativo activo", () => {
    const solo = m("sofia", "member");
    const others = [m("laura", "owner", { deactivatedAt: "2026-02-01" }), solo, martin];
    expect(roleChangeError(others, solo, "compras")).toMatch(/al menos un usuario Administrativo/);
    expect(deactivateError(others, solo)).toMatch(/último usuario Administrativo/);
  });
  it("con otro Administrativo activo, se puede", () => {
    expect(roleChangeError([laura, sofia, martin], sofia, "jefe_planta")).toBeNull();
    expect(deactivateError([laura, sofia, martin], sofia)).toBeNull();
    expect(deactivateError([laura, sofia, martin], martin)).toBeNull();
  });
  it("owner y member son el mismo rol (Administrativo): no es un cambio", () => {
    expect(roleChangeError([laura, sofia], sofia, "admin")).toBeNull();
  });
});

describe("alta de usuario", () => {
  it("pide nombre, mail válido y rol; el mail se guarda en minúsculas", () => {
    const ok = newUserSchema.safeParse({ displayName: "Martín Ruiz", email: " Martin@Demo.com ", role: "compras" });
    expect(ok.success && ok.data.email).toBe("martin@demo.com");
    const bad = newUserSchema.safeParse({ displayName: "M", email: "no", role: "x" });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues.map((i) => i.path[0])).toEqual(["displayName", "email", "role"]);
  });
  it("un Operario se vincula a una persona de Operarios", () => {
    expect(newUserSchema.safeParse({ displayName: "Juan", email: "juan@x.com", role: "operario" }).error?.issues[0].message).toMatch(/qué operario/);
    expect(newUserSchema.safeParse({ displayName: "Juan", email: "juan@x.com", role: "operario", operatorId: "op-juan" }).success).toBe(true);
  });
});

describe("lectura de admin_members()", () => {
  it("traduce usuarios e invitaciones", () => {
    const r = membersFromJson({
      members: [{ user_id: "u1", display_name: "Laura", email: "l@x.com", role: "owner", deactivated_at: null, created_at: "2026-01-01", operator_id: null, is_self: true }],
      invitations: [{ id: "i1", email: "m@x.com", display_name: "Martín", role: "compras", operator_id: null, created_at: "2026-02-01" }],
    });
    expect(r.members[0]).toEqual({ canViewCommercial: false, userId: "u1", displayName: "Laura", email: "l@x.com", role: "owner", deactivatedAt: undefined, createdAt: "2026-01-01", operatorId: undefined, isSelf: true });
    expect(r.invitations[0]).toMatchObject({ id: "i1", role: "compras", displayName: "Martín" });
  });
});

describe("ingreso con código por mail", () => {
  it("explica en castellano los errores de ingreso", () => {
    expect(authErrorMessage("Database error saving new user")).toMatch(/No pudimos crear tu cuenta/);
    expect(authErrorMessage("Token has expired or is invalid")).toMatch(/venció/);
    expect(authErrorMessage("For security purposes, you can only request this after 30 seconds")).toMatch(/Esperá/);
  });
});

describe("alta masiva: listado nombre, mail, rol", () => {
  const free = [{ id: "op-juan", name: "Juan Pérez" }, { id: "op-sofia", name: "Sofía Díaz" }];

  it("reconoce los roles con distintos nombres", () => {
    expect(parseRole("Administrativo")).toBe("admin");
    expect(parseRole(" jefe de PLANTA ")).toBe("jefe_planta");
    expect(parseRole("Planta")).toBe("jefe_planta");
    expect(parseRole("Taller")).toBe("operario");
    expect(parseRole("Compras")).toBe("compras");
    expect(parseRole("gerente")).toBeUndefined();
  });

  it("lee un listado con encabezado, separado por coma, tab o punto y coma", () => {
    const text = "Nombre, Mail, Rol\nMartín Ruiz, Martin@Empresa.com, Compras\nCarla Sosa;carla@empresa.com;Jefe de planta\nJuan Pérez\tjuan@empresa.com\tOperario\n";
    const rows = parseUserList(text, free, []);
    expect(rows.map((r) => [r.displayName, r.email, r.role, r.error])).toEqual([
      ["Martín Ruiz", "martin@empresa.com", "compras", undefined],
      ["Carla Sosa", "carla@empresa.com", "jefe_planta", undefined],
      ["Juan Pérez", "juan@empresa.com", "operario", undefined],
    ]);
    expect(rows[2].operatorId).toBe("op-juan");
  });

  it("respeta el orden de las columnas del encabezado", () => {
    const rows = parseUserList("Rol;Mail;Nombre\nCompras;ana@x.com;Ana Paz", free, []);
    expect(rows[0]).toMatchObject({ displayName: "Ana Paz", email: "ana@x.com", role: "compras" });
    expect(rows[0].error).toBeUndefined();
  });

  it("marca los errores fila por fila sin frenar las demás", () => {
    const text = [
      "Ana Paz, ana@x.com, Compras",
      "Sin Mail, no-es-mail, Compras",
      "Rol Raro, raro@x.com, Gerente",
      "Ana Otra, ANA@x.com, Compras",
      "Ya Existe, existe@x.com, Compras",
      "Pedro Nadie, pedro@x.com, Operario",
      "X, x@x.com, Compras",
    ].join("\n");
    const rows = parseUserList(text, free, ["existe@x.com"]);
    expect(rows.map((r) => !!r.error)).toEqual([false, true, true, true, true, true, true]);
    expect(rows[1].error).toMatch(/mail no es válido/);
    expect(rows[2].error).toMatch(/Rol no reconocido/);
    expect(rows[3].error).toMatch(/repetido/);
    expect(rows[4].error).toMatch(/ya es un usuario/);
    expect(rows[5].error).toMatch(/operario nuevo/);
    expect(rows[6].error).toMatch(/nombre/);
  });

  it("un mismo operario no se puede vincular a dos personas", () => {
    const rows = parseUserList("Juan Pérez, a@x.com, Operario\nJuan Perez, b@x.com, Operario", free, []);
    expect(rows[0].error).toBeUndefined();
    expect(rows[1].error).toBeDefined();
  });

  it("el link lleva al login con el mail y a la pantalla de cada rol", () => {
    expect(inviteLink("https://app.test", "juan@x.com", "operario")).toBe("https://app.test/login?next=%2Ftaller&email=juan%40x.com");
    expect(inviteLink("https://app.test", "a@x.com", "compras")).toContain("next=%2Fcompras");
    expect(inviteLink("https://app.test", "a@x.com", "jefe_planta")).toContain("next=%2Fplanta");
    expect(inviteLink("https://app.test", "a@x.com", "admin")).toContain("next=%2Fdashboard");
  });
});

describe("alta de Operario sin contradicciones", () => {
  const base = { displayName: "Juan Pérez", email: "juan@x.com", role: "operario" as const };

  it("un operario nuevo pide puesto y costo por hora, y no pide elegir a nadie de la lista", () => {
    const sin = userFormSchema.safeParse({ ...base, operatorId: NEW_OPERATOR });
    expect(sin.error?.issues.map((i) => i.path[0])).toEqual(["position", "hourlyCost"]);
    const cero = userFormSchema.safeParse({ ...base, operatorId: NEW_OPERATOR, position: "Carpintero", hourlyCost: "0" });
    expect(cero.error?.issues.map((i) => i.path[0])).toEqual(["hourlyCost"]);
    const ok = userFormSchema.safeParse({ ...base, operatorId: NEW_OPERATOR, position: "Carpintero", hourlyCost: "4500,50" });
    expect(ok.success).toBe(true);
    expect(ok.success && newOperatorOf(ok.data)).toEqual({ name: "Juan Pérez", role: "Carpintero", hourlyCost: 4500.5, email: "juan@x.com" });
  });

  it("un operario ya cargado se elige de la lista y no se crea de nuevo", () => {
    const ok = userFormSchema.safeParse({ ...base, operatorId: "op-juan" });
    expect(ok.success).toBe(true);
    expect(ok.success && newOperatorOf(ok.data)).toBeNull();
  });

  it("sin elegir nada para un Operario hay un error claro; otros roles no piden nada de operario", () => {
    expect(userFormSchema.safeParse({ ...base }).error?.issues[0].message).toMatch(/nuevo o uno ya cargado/);
    expect(userFormSchema.safeParse({ displayName: "Ana Paz", email: "ana@x.com", role: "compras" }).success).toBe(true);
  });

  it("avisa si el operario nuevo ya está cargado (sin importar tildes ni mayúsculas)", () => {
    const free = [{ name: "Juan Pérez" }];
    expect(duplicateOperatorError("juan perez", free)).toMatch(/elegilo de la lista/);
    expect(duplicateOperatorError("Pedro Gómez", free)).toBeNull();
    expect(duplicateOperatorError("  ", free)).toBeNull();
  });

  it("en el listado, un operario nuevo se crea si trae puesto y costo; sin eso, error", () => {
    const text = "Nombre; Mail; Rol; Puesto; Costo por hora\nPedro Gómez; pedro@x.com; Operario; Lustrador; 3800,5\nLuis Ríos; luis@x.com; Operario; ; \nJuan Pérez; juan@x.com; Operario";
    const rows = parseUserList(text, [{ id: "op-juan", name: "Juan Pérez" }], []);
    expect(rows[0].error).toBeUndefined();
    expect(rows[0].newOperator).toEqual({ position: "Lustrador", hourlyCost: 3800.5 });
    expect(rows[1].error).toMatch(/Puesto/);
    expect(rows[2].operatorId).toBe("op-juan");
    expect(rows[2].newOperator).toBeUndefined();
  });

  it("dos operarios nuevos con el mismo nombre en el listado no se crean duplicados", () => {
    const rows = parseUserList("A Uno; a@x.com; Operario; Carpintero; 1000\nA Uno; b@x.com; Operario; Carpintero; 1000", [], []);
    expect(rows[0].error).toBeUndefined();
    expect(rows[1].error).toMatch(/repetido/);
  });

  it("sin encabezado, las columnas 4 y 5 son puesto y costo por hora", () => {
    const rows = parseUserList("Pedro Gómez\tpedro@x.com\tOperario\tLustrador\t3800", [], []);
    expect(rows[0].newOperator).toEqual({ position: "Lustrador", hourlyCost: 3800 });
  });
});

describe("sesión iniciada una semana", () => {
  it("las cookies de Supabase duran 7 días", () => {
    expect(SESSION_MAX_AGE_SECONDS).toBe(604800);
    expect(sessionCookieOptions.maxAge).toBe(SESSION_MAX_AGE_SECONDS);
  });
});
