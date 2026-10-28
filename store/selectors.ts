"use client";
// Hooks derivados: combinan estado + funciones puras. Memoizados para no recalcular en cada render.
import { withPublishedBom } from "@/lib/bom-needs";
import { useCallback, useMemo } from "react";
import type { Alert, EconomicHealth, HourRate, Project } from "@/types";
import { allAlerts, openAlertCount, projectHealth, sortAlerts, splitAlerts } from "@/lib/alerts";
import { designChangeAlerts } from "@/lib/circuit";
import { plantAlerts } from "@/lib/plant";
import { materialNeeds, materialsState, plantMaterialAlerts, purchasingAlerts, type MaterialNeed, type MaterialsState } from "@/lib/purchasing";
import type { RoleKey } from "@/lib/permissions";
import { projectEconomics, type ProjectEconomics } from "@/lib/calculations";
import { todayISO } from "@/lib/formatting";
import { isBuyer, isManager } from "@/lib/project-rules";
import { catalogPriceAt } from "@/lib/material-options";
import { withEconomicImpact } from "@/lib/deviations";
import { deliveryReviewAlerts } from "@/lib/plant-materials";
import { effectiveIdentity, useAppStore } from "./use-app-store";

/**
 * ¿Se pueden cargar y ver los registros de la empresa (facturas, cobros, BOM, contrato, tarifas, directorios…)?
 * Sí en el modo demostración (se guardan en el navegador) y en una empresa real cuya base ya los guarda.
 */
export function useLedgerBacked(): boolean {
  return useAppStore((s) => s.demoLocal || s.ledgerReady);
}

export function useToday(): string {
  return useMemo(() => todayISO(), []);
}

/**
 * Alertas de planta (desvío de horas, sobrecarga, rubros sin asignar, obra que arranca sin material): sin importes.
 * Jefe de planta y Administrativo (que ve la de material con detalle en las de Compras, no esta).
 */
export function usePlantAlerts(): Alert[] {
  const projects = useAppStore((s) => s.projects);
  const assignments = useAppStore((s) => s.assignments);
  const operators = useAppStore((s) => s.operators);
  const settings = useAppStore((s) => s.settings);
  const hoursPerDay = useAppStore((s) => s.costSettings.hoursPerDay);
  const dayExceptions = useAppStore((s) => s.dayExceptions);
  const stateOf = useMaterialsStateOf();
  const today = useToday();
  return useMemo(
    () =>
      sortAlerts([
        ...plantAlerts({ projects, assignments, operators, settings, hoursPerDay, today, dayExceptions }),
        ...plantMaterialAlerts(projects, stateOf, today, settings.purchaseLeadDays),
      ]),
    [projects, assignments, operators, settings, hoursPerDay, today, dayExceptions, stateOf],
  );
}

/** Alertas de Compras (Lote 5C): material sin comprar a pocos días y compras más caras que lo presupuestado. */
export function usePurchasingAlerts(): Alert[] {
  const projects = useNeedsProjects();
  const orders = useAppStore((s) => s.orders);
  const stock = useAppStore((s) => s.stock);
  const settings = useAppStore((s) => s.settings);
  const corrections = useAppStore((s) => s.corrections);
  const today = useToday();
  // "Diseño cambió materiales" es una sola alerta: la ven Compras y (por estas alertas) Gerencia, con su impacto.
  return useMemo(
    () => sortAlerts([...purchasingAlerts({ projects, orders, stock, settings, today }), ...designChangeAlerts(projects, corrections)]),
    [projects, orders, stock, settings, today, corrections],
  );
}

/**
 * Estado de materiales de cada proyecto: el que calculó la base (Jefe de planta) o el derivado de las necesidades.
 * La función que devuelve no lee el estado: se puede usar en listas.
 */
export function useMaterialsStateOf(): (project: Project) => MaterialsState | null {
  const needs = useMaterialNeeds();
  return useCallback((project: Project) => (project.materialsState !== undefined ? project.materialsState : materialsState(needs, project.id)), [needs]);
}

/** Necesidades de compra de los proyectos aprobados (Lote 6): por comprar, en orden de compra o recibido. */
/**
 * Proyectos tal como los ve Compras: los materiales salen del BOM publicado de cada mueble (lib/bom-needs.ts); si la base
 * de la empresa todavía no guarda los BOM, de las líneas de materiales del presupuesto (como hasta ahora).
 */
export function useNeedsProjects(): Project[] {
  const projects = useAppStore((s) => s.projects);
  const ledgerBacked = useLedgerBacked();
  const boms = useAppStore((s) => s.ledger.boms);
  return useMemo(() => (ledgerBacked ? projects.map((p) => withPublishedBom(p, { boms })) : projects), [projects, ledgerBacked, boms]);
}

export function useMaterialNeeds(): MaterialNeed[] {
  const projects = useNeedsProjects();
  const orders = useAppStore((s) => s.orders);
  const stock = useAppStore((s) => s.stock);
  const today = useToday();
  return useMemo(() => materialNeeds(projects, orders, stock, today), [projects, orders, stock, today]);
}

/** Número del menú "Alertas" de cada rol (el Operario no tiene alertas). */
export function useAlertCount(role: RoleKey): number {
  const admin = useAlerts().count;
  const plant = usePlantAlerts().length;
  const buying = usePurchasingAlerts().length;
  return role === "admin" ? admin : role === "jefe_planta" ? plant : role === "compras" ? buying : 0;
}

/**
 * Alertas del Administrativo, abiertas y resueltas: las económicas, las de planta (Lote 5B) y las de compras (Lote 5C).
 * Es la única cuenta: globo, pestaña "Todas", alertas del proyecto y salud.
 */
export function useAlerts(): { open: Alert[]; resolved: Alert[]; count: number } {
  const projects = useAppStore((s) => s.projects);
  const settings = useAppStore((s) => s.settings);
  const resolvedKeys = useAppStore((s) => s.resolvedAlertIds);
  const assignments = useAppStore((s) => s.assignments);
  const plant = usePlantAlerts();
  const buying = usePurchasingAlerts();
  const stock = useAppStore((s) => s.stock);
  const deliveries = useAppStore((s) => s.deliveries);
  const today = useToday();
  return useMemo(() => {
    // El Administrativo ve cuánto cuesta cada alerta (horas de más × costo por hora, puntos de margen).
    // "Falta material" del Jefe es la misma situación que "material sin pedir" / "pedido y no llegó" de Compras.
    const fromPlant = plant.filter((a) => a.kind !== "material_missing");
    // Entregas y cierres del Jefe de planta, con su costo (solo el Administrativo lo ve).
    const planta = deliveryReviewAlerts(projects, stock, deliveries, today);
    const all = withEconomicImpact([...allAlerts(projects, settings, today), ...fromPlant, ...buying, ...planta], projects, assignments, today);
    const split = splitAlerts(sortAlerts(all), resolvedKeys);
    return { ...split, count: openAlertCount(split.open) };
  }, [projects, settings, resolvedKeys, today, plant, buying, assignments, stock, deliveries]);
}

export function useProjectAlerts(project: Project | undefined): Alert[] {
  const { open } = useAlerts();
  return useMemo(() => (project ? open.filter((a) => a.projectId === project.id) : []), [project, open]);
}

export interface ProjectView {
  project: Project;
  econ: ProjectEconomics;
  /** null en los finalizados: no llevan chip de salud. */
  health: EconomicHealth | null;
}

export function useProjectViews(): ProjectView[] {
  const projects = useAppStore((s) => s.projects);
  const { open } = useAlerts();
  return useMemo(
    () => projects.map((project) => ({ project, econ: projectEconomics(project), health: projectHealth(project, open) })),
    [projects, open],
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
  const isDemo = useAppStore((s) => s.isDemo);
  const operators = useAppStore((s) => s.operators);
  const userId = useAppStore((s) => s.userId);
  const userEmail = useAppStore((s) => s.userEmail);
  const actingOperatorId = useAppStore((s) => s.actingOperatorId);
  const userName = useAppStore((s) => s.userName);
  return useMemo(
    () => {
      const id = effectiveIdentity({ role, currentMode, isDemo, operators, userId, userEmail, actingOperatorId, userName });
      return { ...id, isManager: isManager(id.role), isBuyer: isBuyer(id.role), realRole: role };
    },
    [role, currentMode, isDemo, operators, userId, userEmail, actingOperatorId, userName],
  );
}

/** Precio de catálogo vigente hoy de un material (precios con vigencia): lo usan las cotizaciones nuevas. */
export function useCatalogPrice(): (materialId: string) => number {
  const history = useAppStore((s) => s.priceHistory);
  return useCallback((materialId: string) => catalogPriceAt(history, materialId, todayISO()), [history]);
}

/**
 * Tarifa por hora vigente de una categoría (Configuración → Costos horarios). Es el único lugar donde se define el
 * costo de una hora de operario, de diseño o de administración: todos cobran lo mismo.
 */
export function useCategoryRate(category: HourRate["category"]): number {
  return useAppStore((s) => s.hourRates.find((r) => r.category === category)?.hourlyRate ?? 0);
}
