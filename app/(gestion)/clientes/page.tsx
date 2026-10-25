import { ClientsPage } from "@/components/directory/clients-page";
import { ClientsDemo } from "@/components/demo/directory";
import { DemoOr } from "@/components/demo/switch";

export default function Page() {
  return <DemoOr demo={<ClientsDemo />} real={<ClientsPage />} />;
}
