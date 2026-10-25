import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { AdminDashboardDemo } from "@/components/demo/admin/dashboard";
import { DemoOr } from "@/components/demo/switch";

export default function Page() {
  return <DemoOr demo={<AdminDashboardDemo />} real={<AdminDashboard />} />;
}
