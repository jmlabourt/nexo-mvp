// Lote 1B — baja de operarios y navegación.
import { describe, expect, it } from "vitest";
import type { Operator } from "@/types";
import {
  activeOperators,
  createOperator,
  deactivateOperator,
  deleteOperator,
  operatorAccessForUser,
  operatorHasRecords,
  projectsForOperator,
  reactivateOperator,
  updateOperator,
  visibleOperators,
} from "@/lib/operators";
import { assignOperators } from "@/lib/project-operations";
import { breadcrumbTrail, parentHref } from "@/lib/navigation";
import { project } from "./helpers";

const NOW = "2026-10-08T12:00:00.000Z";
const juan: Operator = { id: "op-juan", name: "Juan", role: "Armado", hourlyCost: 10, active: true, email: "juan@x.com", createdAt: NOW };
const ana: Operator = { id: "op-ana", name: "Ana", role: "Carpintería", hourlyCost: 12, active: true, createdAt: NOW };
const hours = {
  id: "h1", projectId: "p", date: "2026-10-01", type: "labor" as const, category: "labor" as const, description: "Armado",
  amount: 100, operatorId: "op-juan", labor: { role: "Armado", hours: 10, hourlyCost: 10 }, createdBy: "t", createdAt: NOW,
};

describe("dar de baja operarios", () => {
  it("baja lógica: activo = false + fecha de baja, sin tocar las horas", () => {
    const p = project({ status: "production", actualEntries: [hours], assignedOperatorIds: ["op-juan"] });
    const ops = deactivateOperator([juan, ana], "op-juan", NOW);
    const j = ops.find((o) => o.id === "op-juan")!;
    expect(j.active).toBe(false);
    expect(j.deactivatedAt).toBe(NOW);
    expect(p.actualEntries).toEqual([hours]);
  });
  it("no aparece en selectores, Taller ni en la lista por defecto; sí con el filtro", () => {
    const ops = deactivateOperator([juan, ana], "op-juan", NOW);
    expect(activeOperators(ops).map((o) => o.id)).toEqual(["op-ana"]);
    expect(visibleOperators(ops, false).map((o) => o.id)).toEqual(["op-ana"]);
    expect(visibleOperators(ops, true)).toHaveLength(2);
    const p = project({ status: "production", assignedOperatorIds: ["op-juan"] });
    expect(projectsForOperator([p], "op-juan", ops)).toHaveLength(0);
    expect(projectsForOperator([p], "op-juan", [juan])).toHaveLength(1);
  });
  it("un operario de baja que inicia sesión no ve proyectos", () => {
    const ops = deactivateOperator([juan], "op-juan", NOW);
    expect(operatorAccessForUser(ops, null, "JUAN@x.com")).toBe("deactivated");
    expect(operatorAccessForUser([juan], null, "juan@x.com")).toBe("active");
    expect(operatorAccessForUser([juan], null, "otro@x.com")).toBe("unlinked");
  });
  it("al guardar el equipo, los dados de baja dejan de estar asignados", () => {
    const ops = deactivateOperator([juan, ana], "op-juan", NOW);
    const p = assignOperators(project({ status: "production" }), ["op-juan", "op-ana"], ops, { actor: "G", now: NOW, role: "owner" });
    expect(p.assignedOperatorIds).toEqual(["op-ana"]);
  });
  it("reactivar devuelve al operario y borra la fecha de baja", () => {
    const back = reactivateOperator(deactivateOperator([juan], "op-juan", NOW), "op-juan")[0];
    expect(back.active).toBe(true);
    expect(back.deactivatedAt).toBeUndefined();
  });
  it("editar no cambia el alta/baja (no hay dos formas de hacerlo)", () => {
    const ops = deactivateOperator([juan], "op-juan", NOW);
    const edited = updateOperator(ops, "op-juan", { name: "Juan P.", role: "Armado", hourlyCost: 11 })[0];
    expect(edited.active).toBe(false);
    expect(createOperator({ name: "Nuevo", role: "Armado", hourlyCost: 5 }, NOW).active).toBe(true);
  });
});

describe("eliminar operarios", () => {
  it("solo si no tiene ningún registro de horas", () => {
    const withHours = project({ actualEntries: [hours] });
    expect(operatorHasRecords([withHours], "op-juan")).toBe(true);
    expect(() => deleteOperator([juan, ana], [withHours], "op-juan")).toThrow(/solo dar de baja/);
  });
  it("sin horas: se elimina y se quita de los equipos", () => {
    const p = project({ assignedOperatorIds: ["op-ana", "op-juan"] });
    const r = deleteOperator([juan, ana], [p], "op-ana");
    expect(r.operators.map((o) => o.id)).toEqual(["op-juan"]);
    expect(r.projects[0].assignedOperatorIds).toEqual(["op-juan"]);
  });
});

describe("navegación", () => {
  it("breadcrumbs: cada nivel es link salvo el último", () => {
    expect(breadcrumbTrail("/projects/p-1053", () => "P-1053")).toEqual([
      { label: "Proyectos", href: "/projects" },
      { label: "P-1053" },
    ]);
    expect(breadcrumbTrail("/projects/new", () => undefined)).toEqual([{ label: "Proyectos", href: "/projects" }, { label: "Nuevo proyecto" }]);
    expect(breadcrumbTrail("/stock", () => undefined)).toEqual([{ label: "Stock" }]);
  });
  it("Volver sin historial va a la lista padre", () => {
    expect(parentHref("/projects/p-1053")).toBe("/projects");
    expect(parentHref("/projects/new")).toBe("/projects");
    expect(parentHref("/stock", "?material=mdf-18")).toBe("/stock");
    expect(parentHref("/operators", "?op=op-juan")).toBe("/operators");
    expect(parentHref("/quotes")).toBe("/dashboard");
  });
});
