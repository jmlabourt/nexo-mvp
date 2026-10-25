import { OrdersPage } from "@/components/purchasing/purchasing-pages";
import { OrdenesDemo } from "@/components/demo/compras/pages";
import { DemoOr } from "@/components/demo/switch";

export default function Page() {
  return <DemoOr demo={<OrdenesDemo />} real={<OrdersPage />} />;
}
