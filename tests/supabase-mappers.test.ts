import { describe, expect, it } from "vitest";
import { buildSeed } from "@/lib/seed-data";
import { CHILD_TABLES, childrenToRows, projectToRow, projectsFromRows, reusableFromRow, reusableToRow, type ChildKey } from "@/lib/supabase/mappers";

const ORG = "00000000-0000-0000-0000-000000000001";

/** Simula lo que devuelve Postgres: timestamps con "+00:00" en vez de "Z". */
function asPostgres(rows: Record<string, unknown>[]) {
  return rows.map((r) =>
    Object.fromEntries(
      Object.entries(r).map(([k, v]) => [k, typeof v === "string" && /T\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) ? v.replace("Z", "+00:00") : v]),
    ),
  );
}

describe("mappers de Supabase", () => {
  const seed = buildSeed(new Date("2026-10-03T12:00:00Z"));

  it("proyectos: dominio → filas → dominio sin pérdida", () => {
    const keys = Object.keys(CHILD_TABLES) as ChildKey[];
    const children = Object.fromEntries(
      keys.map((k) => [k, asPostgres(seed.projects.flatMap((p) => childrenToRows(k, ORG, p.id, p[k])))]),
    ) as Record<ChildKey, Record<string, unknown>[]>;
    const rebuilt = projectsFromRows({ projects: asPostgres(seed.projects.map((p) => projectToRow(ORG, p))), ...children });
    expect(rebuilt).toEqual(JSON.parse(JSON.stringify(seed.projects)));
  });

  it("pool de sobrantes: ida y vuelta", () => {
    const rows = asPostgres(seed.reusableMaterials.map((m, i) => reusableToRow(ORG, m, i)));
    expect(rows.map(reusableFromRow)).toEqual(seed.reusableMaterials);
  });
});
