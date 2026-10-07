import { WorkshopRecorder } from "@/components/workshop/workshop-recorder";

export default async function Page({ params }: PageProps<"/taller/[projectId]">) {
  const { projectId } = await params;
  return <WorkshopRecorder projectId={projectId} />;
}
