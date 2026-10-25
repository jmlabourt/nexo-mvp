import { ProjectDetail } from "@/components/projects/project-detail";
import { ProjectPageDemo } from "@/components/demo/project-page";
import { DemoOr } from "@/components/demo/switch";

export default async function Page({ params, searchParams }: PageProps<"/projects/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  return <DemoOr demo={<ProjectPageDemo id={id} tab={one(sp.tab)} />} real={<ProjectDetail id={id} tab={one(sp.tab)} purchase={one(sp.purchase)} />} />;
}
