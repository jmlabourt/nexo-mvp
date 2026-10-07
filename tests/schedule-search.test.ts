import { describe, expect, it } from "vitest";
import { buildSeed } from "@/lib/seed-data";
import { projectAlerts } from "@/lib/alerts";
import { projectSchedule } from "@/lib/project-rules";
import { buildSearchIndex, searchAll } from "@/lib/search";
import { DEFAULT_SETTINGS as S } from "@/lib/constants";
import * as ops from "@/lib/project-operations";
import { project } from "./helpers";

const owner: ops.Ctx = { actor: "Gestión", now: "2026-02-01T10:00:00Z", role: "owner" };
const operator: ops.Ctx = { actor: "Juan", now: "2026-02-01T10:00:00Z", role: "operator", operatorId: "op-juan" };

describe("plazo transcurrido", () => {
  it("calcula días y % desde las fechas", () => {
    const s = projectSchedule({ startDate: "2026-01-01", dueDate: "2026-01-11" }, "2026-01-06");
    expect(s.totalDays).toBe(10);
    expect(s.elapsedDays).toBe(5);
    expect(s.remainingDays).toBe(5);
    expect(s.elapsedPct).toBe(50);
    expect(s.overdue).toBe(false);
  });
  it("alerta crítica si venció y aviso si pasó el % del plazo sin llegar a producción", () => {
    const late = project({ status: "production", dueDate: "2026-01-20" });
    expect(projectAlerts(late, S, "2026-02-01").some((a) => a.kind === "due" && a.level === "critical")).toBe(true);
    const slow = project({ status: "approved", startDate: "2026-01-01", dueDate: "2026-03-01" });
    expect(projectAlerts(slow, S, "2026-02-01").some((a) => a.id.includes(":deadline:") && a.level === "warning")).toBe(true);
    expect(projectAlerts(project({ status: "production", startDate: "2026-01-01", dueDate: "2026-03-01" }), S, "2026-02-15").some((a) => a.id.includes(":deadline:"))).toBe(false);
  });
});

describe("operarios", () => {
  it("un operario no puede cargar costos extra ('Otro costo')", () => {
    expect(() => ops.addActual(project(), { type: "logistics", description: "flete", amount: 1000, date: "2026-02-01" }, S, operator)).toThrow();
  });
});

describe("búsqueda tipada", () => {
  const seed = buildSeed(new Date());
  const index = buildSearchIndex({ projects: seed.projects, stock: seed.stock, operators: seed.operators });
  it("encuentra proyecto, material y operario y abre el elemento exacto", () => {
    expect(searchAll(index, "palermo")[0]).toMatchObject({ kind: "project", href: expect.stringContaining("/projects/") });
    expect(searchAll(index, "melamina").some((r) => r.kind === "material" || r.kind === "stock")).toBe(true);
    expect(searchAll(index, "Juan").find((r) => r.kind === "operator")?.href).toBe("/operators?op=op-juan");
    expect(searchAll(index, "x")).toEqual([]);
  });
  it("las compras abren la pestaña Materiales con la compra marcada", () => {
    const p = searchAll(index, "placas del plata").find((r) => r.kind === "purchase");
    expect(p?.href).toMatch(/tab=materials&purchase=/);
  });
  void owner;
});
