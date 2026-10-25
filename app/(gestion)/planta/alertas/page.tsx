import { PlantAlertsPage } from "@/components/plant/plant-pages";
import { PlantaAlertasDemo } from "@/components/demo/planta/alertas";
import { DemoOr } from "@/components/demo/switch";

export default function Page() {
  return <DemoOr demo={<PlantaAlertasDemo />} real={<PlantAlertsPage />} />;
}
