"use client";
// Proyectos: la misma tabla original para Gerencia y Administración, con las columnas de cada sesión.
//  · Gerencia: precio de venta, costo presupuestado y proyectado, ganancia y rentabilidad proyectadas.
//  · Administración / Comercial / Diseño: estado, entrega, muebles y avance (sin importes gerenciales).
// Cuatro estados generales: En cotización, Aprobado, En proceso (Compras, Producción e Instalación) y Cerrado.
import { useMemo, useState } from "react";
import { FolderSearch, Search } from "lucide-react";
import { GENERAL_STATE_LABELS, generalState, type GeneralState } from "@/lib/gerencia";
import { daysBetween, todayISO } from "@/lib/formatting";
import { useIdentity, useProjectViews } from "@/store/selectors";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProjectsTable } from "./projects-table";
import { EmptyState } from "@/components/shared/empty-state";

const TABS: Array<{ value: GeneralState | "all"; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "quotation", label: GENERAL_STATE_LABELS.quotation },
  { value: "approved", label: GENERAL_STATE_LABELS.approved },
  { value: "in_progress", label: GENERAL_STATE_LABELS.in_progress },
  { value: "closed", label: GENERAL_STATE_LABELS.closed },
];

type DateFilter = "all" | "overdue" | "7" | "30";

export function ProjectsPage({ initialQuery = "" }: { initialQuery?: string }) {
  const views = useProjectViews();
  const { session } = useIdentity();
  const [tab, setTab] = useState<GeneralState | "all">("all");
  const [q, setQ] = useState(initialQuery);
  const [date, setDate] = useState<DateFilter>("all");
  const today = todayISO();

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: views.length };
    for (const v of views) c[generalState(v.project)] = (c[generalState(v.project)] ?? 0) + 1;
    return c;
  }, [views]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return views.filter(({ project: p }) => {
      if (tab !== "all" && generalState(p) !== tab) return false;
      if (needle && ![p.name, p.client, p.code].some((s) => s.toLowerCase().includes(needle))) return false;
      if (date !== "all") {
        if (generalState(p) === "closed") return false;
        const d = daysBetween(today, p.dueDate);
        if (date === "overdue" && d >= 0) return false;
        if ((date === "7" || date === "30") && (d < 0 || d > Number(date))) return false;
      }
      return true;
    });
  }, [views, tab, q, date, today]);

  return (
    <div>
      <PageHeader
        title="Proyectos"
        subtitle={
          session === "gerencia"
            ? "Precio de venta, costos y ganancia de cada proyecto. Al abrirlo se ve de dónde sale cada número."
            : "Cada proyecto con sus muebles, su estado y su avance."
        }
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as GeneralState | "all")}>
        <TabsList aria-label="Filtrar por estado">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label} <span className="ml-1 text-xs text-slate-400 tabular">{counts[t.value] ?? 0}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className="my-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <label htmlFor="project-search" className="sr-only">Buscar</label>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input id="project-search" className="pl-8" placeholder="Buscar por código, cliente o proyecto" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <label htmlFor="date-filter" className="sr-only">Fecha de entrega</label>
        <Select id="date-filter" value={date} onChange={(e) => setDate(e.target.value as DateFilter)} className="w-48">
          <option value="all">Cualquier entrega</option>
          <option value="7">Entrega en 7 días</option>
          <option value="30">Entrega en 30 días</option>
          <option value="overdue">Entrega vencida</option>
        </Select>
      </div>
      {filtered.length === 0 ? (
        <EmptyState icon={FolderSearch} title="No hay proyectos con estos filtros" description="Probá con otra búsqueda o limpiá los filtros." />
      ) : (
        <Card>
          <ProjectsTable views={filtered} economic={session === "gerencia"} />
        </Card>
      )}
    </div>
  );
}
