import { GerenciaDashboard } from "@/components/gerencia/gerencia-dashboard";
import { GerenciaDashboardDemo } from "@/components/demo/gerencia/dashboard";
import { DemoOr } from "@/components/demo/switch";

export default function Page() {
  return <DemoOr demo={<GerenciaDashboardDemo />} real={<GerenciaDashboard />} />;
}
