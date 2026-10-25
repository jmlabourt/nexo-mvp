"use client";
// Ficha de una OT en la demo: la de Gerencia o la de Administración según la sesión.
import { useIdentity } from "@/store/selectors";
import { AdminProjectDemo } from "./admin/project";
import { GerenciaProjectDemo } from "./gerencia/project";
import { Empty, useCore } from "./kit";

export function ProjectPageDemo({ id, tab }: { id: string; tab?: string }) {
  const w = useCore();
  const { session } = useIdentity();
  const project = w.projects.find((p) => p.id === id);
  if (!project) return <Empty>No encontramos esa OT en la demo.</Empty>;
  return session === "gerencia" ? <GerenciaProjectDemo project={project} tab={tab} /> : <AdminProjectDemo project={project} tab={tab} />;
}
