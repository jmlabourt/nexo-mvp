import { PlantProjectsPage } from "@/components/plant/plant-projects";
import { PlantaProyectosDemo } from "@/components/demo/planta/proyectos";
import { DemoOr } from "@/components/demo/switch";

export default async function Page({ searchParams }: PageProps<"/planta/proyectos">) {
  const sp = await searchParams;
  const p = Array.isArray(sp.p) ? sp.p[0] : sp.p;
  return <DemoOr demo={<PlantaProyectosDemo key={p} projectId={p} />} real={<PlantProjectsPage />} />;
}
