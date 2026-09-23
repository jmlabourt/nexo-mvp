import { ProjectsPage } from "@/components/projects/projects-page";

export default async function Page({ searchParams }: PageProps<"/projects">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  return <ProjectsPage initialQuery={q} key={q} />;
}
