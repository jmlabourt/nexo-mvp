"use client";
// Hooks derivados: combinan estado + funciones puras. Memoizados para no recalcular en cada render.
import { useMemo } from "react";
import type { Alert, EconomicHealth, Project } from "@/types";
import { allAlerts, closedHealth, economicHealth, projectAlerts } from "@/lib/alerts";
import { projectEconomics, type ProjectEconomics } from "@/lib/calculations";
import { todayISO } from "@/lib/formatting";
import { effectiveIdentity, useAppStore } from "./use-app-store";

export function useToday(): string {
  return useMemo(() => todayISO(), []);
}

export function useAlerts(): { open: Alert[]; resolved: Alert[] } {
  const projects = useAppStore((s) => s.projects);
  const settings = useAppStore((s) => s.settings);
  const resolvedIds = useAppStore((s) => s.resolvedAlertIds);
  const stock = useAppStore((s) => s.stock);
  const today = useToday();
  return useMemo(() => {
    const all = allAlerts(projects, settings, today, stock);
    const set = new Set(resolvedIds);
    return { open: all.filter((a) => !set.has(a.id)), resolved: all.filter((a) => set.has(a.id)) };
  }, [projects, settings, resolvedIds, today, stock]);
}

export function useProjectAlerts(project: Project | undefined): Alert[] {
  const settings = useAppStore((s) => s.settings);
  const resolvedIds = useAppStore((s) => s.resolvedAlertIds);
  const stock = useAppStore((s) => s.stock);
  const today = useToday();
  return useMemo(() => {
    if (!project) return [];
    const set = new Set(resolvedIds);
    return projectAlerts(project, settings, today, stock).filter((a) => !set.has(a.id));
  }, [project, settings, resolvedIds, today, stock]);
}

export interface ProjectView {
  project: Project;
  econ: ProjectEconomics;
  health: EconomicHealth;
}

export function useProjectViews(): ProjectView[] {
  const projects = useAppStore((s) => s.projects);
  const settings = useAppStore((s) => s.settings);
  const today = useToday();
  return useMemo(
    () =>
      projects.map((project) => {
        const econ = projectEconomics(project);
        const health =
          project.status === "completed"
            ? closedHealth(econ.marginDeltaPp === null ? null : -econ.marginDeltaPp, settings)
            : economicHealth(project, settings, today);
        return { project, econ, health };
      }),
    [projects, settings, today],
  );
}

export function useProjectView(id: string): ProjectView | undefined {
  const views = useProjectViews();
  return views.find((v) => v.project.id === id);
}

/** Quién opera ahora: rol, operario (si corresponde) y nombre para los registros. */
export function useIdentity() {
  const role = useAppStore((s) => s.role);
  const currentMode = useAppStore((s) => s.currentMode);
  const operators = useAppStore((s) => s.operators);
  const userId = useAppStore((s) => s.userId);
  const userEmail = useAppStore((s) => s.userEmail);
  const actingOperatorId = useAppStore((s) => s.actingOperatorId);
  const userName = useAppStore((s) => s.userName);
  return useMemo(
    () => {
      const id = effectiveIdentity({ role, currentMode, operators, userId, userEmail, actingOperatorId, userName });
      return { ...id, isManager: id.role !== "operator", realRole: role };
    },
    [role, currentMode, operators, userId, userEmail, actingOperatorId, userName],
  );
}
