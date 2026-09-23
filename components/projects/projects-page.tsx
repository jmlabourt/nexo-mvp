"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { FolderSearch, Plus, Search } from "lucide-react";
import type { EconomicHealth, ProjectStatus } from "@/types";
import { HEALTH_LABELS } from "@/lib/constants";
import { daysBetween, todayISO } from "@/lib/formatting";
import { useProjectViews } from "@/store/selectors";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProjectsTable } from "./projects-table";
import { EmptyState } from "@/components/shared/empty-state";

const TABS: Array<{ value: ProjectStatus | "all"; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "quotation", label: "Cotización" },
  { value: "approved", label: "Aprobados" },
  { value: "purchasing", label: "Compras" },
  { value: "production", label: "Producción" },
  { value: "installation", label: "Instalación" },
  { value: "completed", label: "Finalizados" },
];

type DateFilter = "all" | "overdue" | "7" | "30";

export function ProjectsPage({ initialQuery = "" }: { initialQuery?: string }) {
  const views = useProjectViews();
  const [tab, setTab] = useState<ProjectStatus | "all">("all");
  const [q, setQ] = useState(initialQuery);
  const [risk, setRisk] = useState<EconomicHealth | "all">("all");
  const [date, setDate] = useState<DateFilter>("all");
  const today = todayISO();

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: views.length };
    for (const v of views) c[v.project.status] = (c[v.project.status] ?? 0) + 1;
    return c;
  }, [views]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return views.filter(({ project: p, health }) => {
      if (tab !== "all" && p.status !== tab) return false;
      if (risk !== "all" && health !== risk) return false;
      if (needle && ![p.name, p.client, p.code].some((s) => s.toLowerCase().includes(needle))) return false;
      if (date !== "all") {
        if (p.status === "completed") return false;
        const d = daysBetween(today, p.dueDate);
        if (date === "overdue" && d >= 0) return false;
        if ((date === "7" || date === "30") && (d < 0 || d > Number(date))) return false;
      }
      return true;
    });
  }, [views, tab, risk, q, date, today]);

  return (
    <div>
      <PageHeader
        title="Proyectos"
        subtitle="Cada proyecto conecta su presupuesto con lo que realmente ocurre en fábrica."
        actions={
          <Button asChild>
            <Link href="/projects/new">
              <Plus /> Nuevo proyecto
            </Link>
          </Button>
        }
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as ProjectStatus | "all")}>
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
          <Input id="project-search" className="pl-8" placeholder="Buscar por proyecto, cliente o código" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex gap-3">
          <label htmlFor="risk-filter" className="sr-only">Riesgo</label>
          <Select id="risk-filter" value={risk} onChange={(e) => setRisk(e.target.value as EconomicHealth | "all")} className="w-44">
            <option value="all">Todo riesgo</option>
            {(Object.keys(HEALTH_LABELS) as EconomicHealth[]).map((h) => (
              <option key={h} value={h}>{HEALTH_LABELS[h]}</option>
            ))}
          </Select>
          <label htmlFor="date-filter" className="sr-only">Fecha de entrega</label>
          <Select id="date-filter" value={date} onChange={(e) => setDate(e.target.value as DateFilter)} className="w-48">
            <option value="all">Cualquier entrega</option>
            <option value="7">Entrega en 7 días</option>
            <option value="30">Entrega en 30 días</option>
            <option value="overdue">Entrega vencida</option>
          </Select>
        </div>
      </div>
      {filtered.length === 0 ? (
        <EmptyState icon={FolderSearch} title="No hay proyectos con estos filtros" description="Probá con otra búsqueda o limpiá los filtros." />
      ) : (
        <Card>
          <ProjectsTable views={filtered} />
        </Card>
      )}
    </div>
  );
}
