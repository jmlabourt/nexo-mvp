import { SuppliersPage } from "@/components/directory/suppliers-page";
import { SuppliersDemo } from "@/components/demo/directory";
import { DemoOr } from "@/components/demo/switch";

export default function Page() {
  return <DemoOr demo={<SuppliersDemo />} real={<SuppliersPage prices />} />;
}
