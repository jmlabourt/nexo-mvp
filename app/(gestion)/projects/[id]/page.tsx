import { ProjectDetail } from "@/components/projects/project-detail";

export default async function Page({ params, searchParams }: PageProps<"/projects/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  return <ProjectDetail id={id} tab={one(sp.tab)} purchase={one(sp.purchase)} />;
}
