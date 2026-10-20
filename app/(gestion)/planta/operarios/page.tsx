import { PlantOperatorsPage } from "@/components/plant/plant-pages";

export default async function Page({ searchParams }: PageProps<"/planta/operarios">) {
  const sp = await searchParams;
  const tab = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  return <PlantOperatorsPage tab={tab} />;
}
