import { PlantOperatorsPage } from "@/components/plant/plant-pages";
import { PlantaOperariosDemo } from "@/components/demo/planta/operarios";
import { DemoOr } from "@/components/demo/switch";

export default async function Page({ searchParams }: PageProps<"/planta/operarios">) {
  const sp = await searchParams;
  const tab = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  return <DemoOr demo={<PlantaOperariosDemo key={tab} tab={tab} />} real={<PlantOperatorsPage tab={tab} />} />;
}
