import { PurchasingAlertsPage } from "@/components/purchasing/purchasing-pages";
import { ComprasAlertasDemo } from "@/components/demo/compras/pages";
import { DemoOr } from "@/components/demo/switch";

export default function Page() {
  return <DemoOr demo={<ComprasAlertasDemo />} real={<PurchasingAlertsPage />} />;
}
