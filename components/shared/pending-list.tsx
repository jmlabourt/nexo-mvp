"use client";
// Avisos entre sesiones: listas simples de pendientes en el Dashboard de cada sesión ("Proyectos nuevos para recibir",
// "Listos: ¿qué se hace?"…). No es un sistema de notificaciones: se calcula de los datos del proyecto.
import Link from "next/link";
import { useMemo } from "react";
import type { Project } from "@/types";
import { circuitPending, type CircuitSession } from "@/lib/circuit";
import { projectHref } from "@/lib/permissions";
import { useAppStore } from "@/store/use-app-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface PendingGroup {
  title: string;
  /** Qué tiene que hacer quien lo ve. */
  hint: string;
  items: Array<{ project: Project; detail?: string }>;
}

export function PendingLists({ groups, hrefOf, title = "Pendientes" }: { groups: PendingGroup[]; hrefOf: (p: Project) => string; title?: string }) {
  const withItems = groups.filter((g) => g.items.length > 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {withItems.length === 0 ? (
          <p className="text-sm text-slate-500">No hay nada pendiente del circuito para esta sesión.</p>
        ) : (
          withItems.map((g) => (
            <section key={g.title} aria-label={g.title}>
              <h3 className="text-sm font-semibold text-slate-900">
                {g.title} <span className="font-normal text-slate-500">({g.items.length})</span>
              </h3>
              <p className="text-xs text-slate-500">{g.hint}</p>
              <ul className="mt-1 divide-y divide-slate-100 text-sm">
                {g.items.map(({ project: p, detail }) => (
                  <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 py-1.5">
                    <Link href={hrefOf(p)} className="text-blue-700 hover:underline">
                      {p.code} · {p.name}
                    </Link>
                    {detail && <span className="text-xs text-slate-600">{detail}</span>}
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </CardContent>
    </Card>
  );
}

/** Pendientes del circuito para una sesión, con link a donde se resuelve cada uno. */
export function CircuitPending({ session }: { session: CircuitSession }) {
  const projects = useAppStore((s) => s.projects);
  const assignments = useAppStore((s) => s.assignments);
  const corrections = useAppStore((s) => s.corrections);
  const groups = useMemo(() => circuitPending(session, projects, { assignments, corrections }), [session, projects, assignments, corrections]);
  const hrefOf = (p: Project) => (session === "jefe_planta" ? "/planta/proyectos" : projectHref(session, p.id));
  return <PendingLists groups={groups} hrefOf={hrefOf} title="Pendientes del circuito" />;
}
