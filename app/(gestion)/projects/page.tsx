import { ProjectsPage } from "@/components/projects/projects-page";
import { ProjectsListDemo } from "@/components/demo/projects-list";
import { DemoOr } from "@/components/demo/switch";

export default async function Page({ searchParams }: PageProps<"/projects">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  return <DemoOr demo={<ProjectsListDemo />} real={<ProjectsPage initialQuery={q} key={q} />} />;
}
