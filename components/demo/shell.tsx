"use client";
// Partes del marco (menú, breadcrumb, "Ver como") cuando está abierto el modo demostración.
import { useMemo } from "react";
import { comprasAlerts, gerenciaAlerts, plantaAlerts } from "@/lib/core/alerts";
import { sessionPerson, workers } from "@/lib/core/lookup";
import type { SessionKey } from "@/lib/permissions";
import { useAppStore } from "@/store/use-app-store";
import { Select } from "@/components/ui/input";

/** Alertas de la pestaña "Alertas" (o del dashboard en Gerencia) de cada sesión en la demo. null = no es demo. */
export function useDemoAlertCount(session: SessionKey): number | null {
  const core = useAppStore((s) => (s.demoLocal ? s.core : null));
  return useMemo(() => {
    if (!core) return null;
    const today = core.config.asOf;
    if (session === "compras") return comprasAlerts(core, today).length;
    if (session === "jefe_planta") return plantaAlerts(core, today).length;
    if (session === "gerencia") return gerenciaAlerts(core, today).length;
    return 0;
  }, [core, session]);
}

/** OT pública de un proyecto de la demo (para el breadcrumb). */
export function useDemoOt(): ((id: string) => string | undefined) | null {
  const core = useAppStore((s) => (s.demoLocal ? s.core : null));
  return core ? (id: string) => core.projects.find((p) => p.id === id)?.ot : null;
}

/** Persona de ejemplo de la sesión y, como Operario, el selector de operario. */
export function DemoPerson({ session }: { session: SessionKey }) {
  const core = useAppStore((s) => (s.demoLocal ? s.core : null));
  const acting = useAppStore((s) => s.actingOperatorId);
  const setActing = useAppStore((s) => s.setActingOperator);
  if (!core) return null;
  const person = sessionPerson(core, session, acting);
  if (session !== "operario") return <p className="mt-1.5 text-xs text-slate-500">Persona: {person?.name ?? "sin asignar"}.</p>;
  return (
    <label className="mt-1.5 block text-xs text-slate-500">
      Operario
      <Select className="mt-1 h-8 text-xs" value={person?.id ?? ""} onChange={(e) => setActing(e.target.value)}>
        {workers(core).map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
          </option>
        ))}
      </Select>
    </label>
  );
}
