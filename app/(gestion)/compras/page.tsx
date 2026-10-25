import { PurchasingDashboard } from "@/components/purchasing/purchasing-pages";
import { ComprasDashboardDemo } from "@/components/demo/compras/pages";
import { DemoOr } from "@/components/demo/switch";

export default function Page() {
  return <DemoOr demo={<ComprasDashboardDemo />} real={<PurchasingDashboard />} />;
}
