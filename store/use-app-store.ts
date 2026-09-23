"use client";
// ─────────────────────────────────────────────────────────────
// Store global (Zustand + persist/localStorage).
// Es la ÚNICA capa de persistencia: para migrar a API/DB se reemplazan
// estas acciones por llamadas remotas; el dominio (lib/) no cambia.
// ─────────────────────────────────────────────────────────────
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { AlertSettings, AppMode, Project, ProjectStatus, ReusableMaterial } from "@/types";
import { DEFAULT_SETTINGS, DEMO_USERS } from "@/lib/constants";
import { buildSeed } from "@/lib/seed-data";
import * as ops from "@/lib/project-operations";
import { consumeFromPool } from "@/lib/reusable-pool";

export type Result<T = undefined> = { ok: true; value: T } | { ok: false; error: string };

interface AppState {
  projects: Project[];
  reusableMaterials: ReusableMaterial[];
  settings: AlertSettings;
  currentMode: AppMode;
  resolvedAlertIds: string[];

  setMode: (mode: AppMode) => void;
  createProject: (input: ops.NewProjectInput) => Result<string>;
  updateProject: (
    id: string,
    patch: Partial<Pick<Project, "name" | "client" | "projectType" | "description" | "dueDate" | "owner" | "salesPrice">>,
  ) => Result;
  setProgress: (id: string, progress: number) => Result;
  changeProjectStatus: (id: string, status: ProjectStatus) => Result;
  addBudgetLine: (id: string, input: ops.BudgetLineInput) => Result;
  updateBudgetLine: (id: string, lineId: string, input: ops.BudgetLineInput) => Result;
  removeBudgetLine: (id: string, lineId: string) => Result;
  addPurchaseEntry: (id: string, input: ops.PurchaseInput) => Result;
  addMaterialUsage: (id: string, input: ops.MaterialUsageInput, actorOverride?: string) => Result;
  addActualEntry: (id: string, input: ops.ActualInput, actorOverride?: string) => Result;
  closeProject: (id: string) => Result;
  resolveAlert: (alertId: string) => void;
  reopenAlert: (alertId: string) => void;
  consumeReusableMaterial: (itemId: string, quantity: number) => Result;
  updateSettings: (patch: Partial<AlertSettings>) => void;
  resetSettings: () => void;
  resetDemo: () => void;
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Ocurrió un error inesperado.";
}

function initialData() {
  const seed = buildSeed(new Date());
  return {
    projects: seed.projects,
    reusableMaterials: seed.reusableMaterials,
    settings: { ...DEFAULT_SETTINGS },
    resolvedAlertIds: [] as string[],
  };
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => {
      const ctx = (actorOverride?: string): ops.Ctx => ({
        actor: actorOverride ?? DEMO_USERS[get().currentMode].name,
        now: new Date().toISOString(),
      });

      /** Aplica una operación pura a un proyecto y guarda. Convierte excepciones de dominio en Result. */
      const mutate = (id: string, fn: (p: Project) => Project): Result => {
        const project = get().projects.find((p) => p.id === id);
        if (!project) return { ok: false, error: "Proyecto no encontrado." };
        try {
          const next = fn(project);
          set({ projects: get().projects.map((p) => (p.id === id ? next : p)) });
          return { ok: true, value: undefined };
        } catch (e) {
          return { ok: false, error: errorMessage(e) };
        }
      };

      return {
        ...initialData(),
        currentMode: "management",

        setMode: (mode) => set({ currentMode: mode }),

        createProject: (input) => {
          try {
            const project = ops.createProject(input, ctx());
            set({ projects: [project, ...get().projects] });
            return { ok: true, value: project.id };
          } catch (e) {
            return { ok: false, error: errorMessage(e) };
          }
        },

        updateProject: (id, patch) =>
          mutate(id, (p) => ({ ...p, ...patch, updatedAt: new Date().toISOString() })),

        setProgress: (id, progress) => mutate(id, (p) => ops.setProgress(p, progress, ctx())),

        changeProjectStatus: (id, status) => mutate(id, (p) => ops.changeStatus(p, status, ctx())),

        addBudgetLine: (id, input) => mutate(id, (p) => ops.addBudgetLine(p, input, ctx())),
        updateBudgetLine: (id, lineId, input) => mutate(id, (p) => ops.updateBudgetLine(p, lineId, input, ctx())),
        removeBudgetLine: (id, lineId) => mutate(id, (p) => ops.removeBudgetLine(p, lineId, ctx())),

        addPurchaseEntry: (id, input) => mutate(id, (p) => ops.addPurchase(p, input, ctx())),

        addMaterialUsage: (id, input, actorOverride) => {
          const project = get().projects.find((p) => p.id === id);
          if (!project) return { ok: false, error: "Proyecto no encontrado." };
          try {
            const res = ops.addMaterialUsage(project, get().reusableMaterials, input, get().settings, ctx(actorOverride));
            set({
              projects: get().projects.map((p) => (p.id === id ? res.project : p)),
              reusableMaterials: res.pool,
            });
            return { ok: true, value: undefined };
          } catch (e) {
            return { ok: false, error: errorMessage(e) };
          }
        },

        addActualEntry: (id, input, actorOverride) =>
          mutate(id, (p) => ops.addActual(p, input, get().settings, ctx(actorOverride))),

        closeProject: (id) => mutate(id, (p) => ops.closeProject(p, ctx())),

        resolveAlert: (alertId) => {
          if (get().resolvedAlertIds.includes(alertId)) return;
          set({ resolvedAlertIds: [...get().resolvedAlertIds, alertId] });
        },
        reopenAlert: (alertId) => set({ resolvedAlertIds: get().resolvedAlertIds.filter((a) => a !== alertId) }),

        consumeReusableMaterial: (itemId, quantity) => {
          try {
            set({ reusableMaterials: consumeFromPool(get().reusableMaterials, itemId, quantity) });
            return { ok: true, value: undefined };
          } catch (e) {
            return { ok: false, error: errorMessage(e) };
          }
        },

        updateSettings: (patch) => set({ settings: { ...get().settings, ...patch } }),
        resetSettings: () => set({ settings: { ...DEFAULT_SETTINGS } }),

        resetDemo: () => set({ ...initialData(), currentMode: "management" }),
      };
    },
    {
      name: "nexo-demo-v1",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (s) => ({
        projects: s.projects,
        reusableMaterials: s.reusableMaterials,
        settings: s.settings,
        resolvedAlertIds: s.resolvedAlertIds,
        currentMode: s.currentMode,
      }),
    },
  ),
);

export function useProject(id: string): Project | undefined {
  return useAppStore((s) => s.projects.find((p) => p.id === id));
}
