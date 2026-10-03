"use client";
// ─────────────────────────────────────────────────────────────
// Store global (Zustand). Los datos viven en Supabase: el store los carga
// al entrar (WorkspaceGate), aplica las operaciones puras de lib/ en memoria
// (la UI sigue siendo síncrona) y encola la escritura de lo que cambió.
// Solo el modo Gestión/Taller se guarda en localStorage.
// ─────────────────────────────────────────────────────────────
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { AlertSettings, AppMode, Project, ProjectStatus, ReusableMaterial } from "@/types";
import { DEFAULT_SETTINGS } from "@/lib/constants";
import { buildSeed } from "@/lib/seed-data";
import * as ops from "@/lib/project-operations";
import { consumeFromPool } from "@/lib/reusable-pool";
import { createClient } from "@/lib/supabase/client";
import * as remote from "@/lib/supabase/workspace";
import type { Workspace, WorkspaceData } from "@/lib/supabase/workspace";

export type Result<T = undefined> = { ok: true; value: T } | { ok: false; error: string };

export type SyncStatus = "idle" | "saving" | "error";

interface AppState {
  projects: Project[];
  reusableMaterials: ReusableMaterial[];
  settings: AlertSettings;
  currentMode: AppMode;
  resolvedAlertIds: string[];

  /** Empresa y usuario de la sesión (null hasta que carga el workspace). */
  organizationId: string | null;
  organizationName: string;
  userName: string;
  userEmail: string;
  syncStatus: SyncStatus;
  syncError: string | null;

  loadWorkspace: (ws: Workspace) => void;
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
  /** Reemplaza los datos de la empresa por la demo de Madera Sur. */
  resetDemo: () => Promise<Result>;
  /** Borra todos los datos de la empresa para empezar de cero. */
  clearData: () => Promise<Result>;
  dismissSyncError: () => void;
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Ocurrió un error inesperado.";
}

export function demoData(): WorkspaceData {
  const seed = buildSeed(new Date());
  return {
    projects: seed.projects,
    reusableMaterials: seed.reusableMaterials,
    settings: { ...DEFAULT_SETTINGS },
    resolvedAlertIds: [],
  };
}

const EMPTY_DATA: WorkspaceData = { projects: [], reusableMaterials: [], settings: { ...DEFAULT_SETTINGS }, resolvedAlertIds: [] };

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => {
      const ctx = (actorOverride?: string): ops.Ctx => ({
        actor: actorOverride ?? get().userName,
        now: new Date().toISOString(),
      });

      // Cola de escrituras: se ejecutan en orden para que un proyecto exista antes que sus hijos.
      let queue: Promise<unknown> = Promise.resolve();
      let pending = 0;
      const persistRemote = (write: (db: ReturnType<typeof createClient>, org: string) => Promise<unknown>) => {
        const org = get().organizationId;
        if (!org) return queue;
        pending += 1;
        set({ syncStatus: "saving" });
        queue = queue
          .then(() => write(createClient(), org))
          .then(
            () => {
              pending -= 1;
              if (pending === 0 && get().syncStatus === "saving") set({ syncStatus: "idle" });
            },
            (e: unknown) => {
              pending -= 1;
              set({ syncStatus: "error", syncError: `No se pudo guardar: ${errorMessage(e)}. Recargá la página para ver el estado guardado.` });
            },
          );
        return queue;
      };

      /** Aplica una operación pura a un proyecto, guarda en memoria y encola la escritura. */
      const mutate = (id: string, fn: (p: Project) => Project): Result => {
        const project = get().projects.find((p) => p.id === id);
        if (!project) return { ok: false, error: "Proyecto no encontrado." };
        try {
          const next = fn(project);
          set({ projects: get().projects.map((p) => (p.id === id ? next : p)) });
          void persistRemote((db, org) => remote.syncProject(db, org, project, next));
          return { ok: true, value: undefined };
        } catch (e) {
          return { ok: false, error: errorMessage(e) };
        }
      };

      /** Reemplaza todos los datos de la empresa (reset demo / vaciar). Espera a las escrituras previas. */
      const replaceAll = (data: WorkspaceData): Promise<Result> => {
        const org = get().organizationId;
        if (!org) return Promise.resolve({ ok: false, error: "Todavía no cargó tu empresa." });
        set({ syncStatus: "saving" });
        const run = queue.then(async (): Promise<Result> => {
          try {
            await remote.replaceWorkspace(createClient(), org, data);
            set({ ...data, currentMode: "management", syncStatus: "idle", syncError: null });
            return { ok: true, value: undefined };
          } catch (e) {
            set({ syncStatus: "error", syncError: `No se pudo guardar: ${errorMessage(e)}` });
            return { ok: false, error: errorMessage(e) };
          }
        });
        queue = run;
        return run;
      };

      return {
        ...EMPTY_DATA,
        currentMode: "management",
        organizationId: null,
        organizationName: "",
        userName: "",
        userEmail: "",
        syncStatus: "idle",
        syncError: null,

        loadWorkspace: (ws) =>
          set({
            projects: ws.projects,
            reusableMaterials: ws.reusableMaterials,
            settings: ws.settings,
            resolvedAlertIds: ws.resolvedAlertIds,
            organizationId: ws.organizationId,
            organizationName: ws.organizationName,
            userName: ws.userName,
            userEmail: ws.userEmail,
            syncStatus: "idle",
            syncError: null,
          }),

        setMode: (mode) => set({ currentMode: mode }),

        createProject: (input) => {
          try {
            const project = ops.createProject(input, ctx());
            set({ projects: [project, ...get().projects] });
            void persistRemote((db, org) => remote.syncProject(db, org, undefined, project));
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
            const prevPool = get().reusableMaterials;
            const res = ops.addMaterialUsage(project, prevPool, input, get().settings, ctx(actorOverride));
            set({
              projects: get().projects.map((p) => (p.id === id ? res.project : p)),
              reusableMaterials: res.pool,
            });
            void persistRemote(async (db, org) => {
              await remote.syncProject(db, org, project, res.project);
              await remote.syncPool(db, org, prevPool, res.pool);
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
          void persistRemote((db, org) => remote.setAlertResolved(db, org, alertId, true));
        },
        reopenAlert: (alertId) => {
          set({ resolvedAlertIds: get().resolvedAlertIds.filter((a) => a !== alertId) });
          void persistRemote((db, org) => remote.setAlertResolved(db, org, alertId, false));
        },

        consumeReusableMaterial: (itemId, quantity) => {
          try {
            const prevPool = get().reusableMaterials;
            const next = consumeFromPool(prevPool, itemId, quantity);
            set({ reusableMaterials: next });
            void persistRemote((db, org) => remote.syncPool(db, org, prevPool, next));
            return { ok: true, value: undefined };
          } catch (e) {
            return { ok: false, error: errorMessage(e) };
          }
        },

        updateSettings: (patch) => {
          const settings = { ...get().settings, ...patch };
          set({ settings });
          void persistRemote((db, org) => remote.saveSettings(db, org, settings));
        },
        resetSettings: () => {
          const settings = { ...DEFAULT_SETTINGS };
          set({ settings });
          void persistRemote((db, org) => remote.saveSettings(db, org, settings));
        },

        resetDemo: () => replaceAll(demoData()),
        clearData: () => replaceAll({ ...EMPTY_DATA, settings: { ...DEFAULT_SETTINGS } }),
        dismissSyncError: () => set({ syncError: null, syncStatus: "idle" }),
      };
    },
    {
      name: "nexo-ui-v2",
      version: 2,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (s) => ({ currentMode: s.currentMode }),
    },
  ),
);

export function useProject(id: string): Project | undefined {
  return useAppStore((s) => s.projects.find((p) => p.id === id));
}
