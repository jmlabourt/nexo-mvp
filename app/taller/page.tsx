import { WorkshopHome } from "@/components/workshop/workshop-home";
import { MiDiaDemo } from "@/components/demo/operario/mi-dia";
import { DemoOr } from "@/components/demo/switch";

export default function Page() {
  return <DemoOr demo={<MiDiaDemo />} real={<WorkshopHome />} />;
}
