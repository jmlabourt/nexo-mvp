import { describe, expect, it } from "vitest";
import { buildSeed } from "@/lib/seed-data";
import {
  CHILD_TABLES,
  childrenToRows,
  lotFromRow,
  lotToRow,
  movementFromRow,
  movementToRow,
  operatorFromRow,
  operatorToRow,
  projectToRow,
  projectsFromRows,
  requestFromRow,
  requestToRow,
  type ChildKey,
} from "@/lib/supabase/mappers";

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

  it("operarios: ida y vuelta", () => {
    const rows = asPostgres(seed.operators.map((o, i) => operatorToRow(ORG, o, i)));
    expect(rows.map(operatorFromRow)).toEqual(JSON.parse(JSON.stringify(seed.operators)));
  });

  it("lotes y movimientos de stock: ida y vuelta", () => {
    const lots = asPostgres(seed.stock.lots.map((l) => lotToRow(ORG, l)));
    expect(lots.map(lotFromRow)).toEqual(JSON.parse(JSON.stringify(seed.stock.lots)));
    const movs = asPostgres(seed.stock.movements.map((m, i) => movementToRow(ORG, m, i)));
    expect(movs.map(movementFromRow)).toEqual(JSON.parse(JSON.stringify(seed.stock.movements)));
  });

  it("pedidos de material: ida y vuelta", () => {
    const q = { id: "req_1", projectId: "p", materialId: "m", materialName: "Placa", quantity: 2, unit: "placa", note: "urgente", requestedBy: "Juan", status: "open" as const, createdAt: "2026-10-01T10:00:00.000Z" };
    expect(requestFromRow(asPostgres([requestToRow(ORG, q, 0)])[0])).toEqual(q);
  });
});
