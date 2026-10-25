import { PurchasingProjectsPage } from "@/components/purchasing/purchasing-projects";
import { PorComprarDemo } from "@/components/demo/compras/pages";
import { DemoOr } from "@/components/demo/switch";

export default async function Page({ searchParams }: PageProps<"/compras/proyectos">) {
  const sp = await searchParams;
  const p = Array.isArray(sp.p) ? sp.p[0] : sp.p;
  return <DemoOr demo={<PorComprarDemo key={p} projectId={p} />} real={<PurchasingProjectsPage projectId={p} />} />;
}
