"use client";
// Hooks derivados: combinan estado + funciones puras. Memoizados para no recalcular en cada render.
import { useMemo } from "react";
import type { Alert, EconomicHealth, Project } from "@/types";
import { allAlerts, closedHealth, economicHealth, projectAlerts } from "@/lib/alerts";
import { projectEconomics, type ProjectEconomics } from "@/lib/calculations";
import { todayISO } from "@/lib/formatting";
import { useAppStore } from "./use-app-store";

export function useToday(): string {
  return useMemo(() => todayISO(), []);
}

export function useAlerts(): { open: Alert[]; resolved: Alert[] } {
  const projects = useAppStore((s) => s.projects);
  const settings = useAppStore((s) => s.settings);
  const resolvedIds = useAppStore((s) => s.resolvedAlertIds);
  const today = useToday();
  return useMemo(() => {
    const all = allAlerts(projects, settings, today);
    const set = new Set(resolvedIds);
    return { open: all.filter((a) => !set.has(a.id)), resolved: all.filter((a) => set.has(a.id)) };
  }, [projects, settings, resolvedIds, today]);
}

export function useProjectAlerts(project: Project | undefined): Alert[] {
  const settings = useAppStore((s) => s.settings);
  const resolvedIds = useAppStore((s) => s.resolvedAlertIds);
  const today = useToday();
  return useMemo(() => {
    if (!project) return [];
    const set = new Set(resolvedIds);
    return projectAlerts(project, settings, today).filter((a) => !set.has(a.id));
  }, [project, settings, resolvedIds, today]);
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
