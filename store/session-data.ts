"use client";
// Datos de las cinco sesiones que la base todavía no guarda (PENDIENTES_BACKEND.md).
// En la demo se usan los DATOS DE EJEMPLO de lib/demo/ejemplos.ts (siempre con su etiqueta); en una empresa real,
// nada: la pantalla lo dice y no simula guardados.
import { useMemo } from "react";
import type { ClientInvoice, FurnitureDesign, ManagementParams, Opportunity, Project } from "@/types";
import { DEFAULT_MANAGEMENT_PARAMS, exampleFurnitureDesign, exampleInvoices, exampleOpportunities } from "@/lib/demo/ejemplos";
import { useAppStore } from "./use-app-store";
import { useToday } from "./selectors";

/** true = se muestran datos de ejemplo (empresa demo o la demo local sin empresa). */
export function useExampleData(): boolean {
  const isDemo = useAppStore((s) => s.isDemo);
  const org = useAppStore((s) => s.organizationId);
  return isDemo || !org;
}

export interface SourcedData<T> {
  data: T;
  /** "example" = datos de ejemplo de la demo · "pending" = todavía no hay registro en la base. */
  origin: "example" | "pending";
}

export function useInvoices(): SourcedData<ClientInvoice[]> {
  const example = useExampleData();
  const projects = useAppStore((s) => s.projects);
  const today = useToday();
  return useMemo(() => (example ? { data: exampleInvoices(projects, today), origin: "example" } : { data: [], origin: "pending" }), [example, projects, today]);
}

export function useOpportunityInfo(): SourcedData<Opportunity[]> {
  const example = useExampleData();
  const today = useToday();
  return useMemo(() => (example ? { data: exampleOpportunities(today), origin: "example" } : { data: [], origin: "pending" }), [example, today]);
}

/** Parámetros de Gerencia: los valores por defecto (todavía no se guardan). */
export function useManagementParams(): ManagementParams {
  const nomenclature = useAppStore((s) => s.ledger.projectNomenclature);
  return useMemo(() => nomenclature ? { ...DEFAULT_MANAGEMENT_PARAMS,projectCodePattern:nomenclature.pattern,projectCodePrefix:nomenclature.prefix } : DEFAULT_MANAGEMENT_PARAMS,[nomenclature]);
}

/** Diseño, etapas y BOM de los muebles de un proyecto. */
export function useFurnitureDesign(project: Project | undefined): SourcedData<FurnitureDesign[]> {
  const example = useExampleData();
  return useMemo(
    () => (example && project ? { data: exampleFurnitureDesign(project), origin: "example" } : { data: [], origin: "pending" }),
    [example, project],
  );
}
