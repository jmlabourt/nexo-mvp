import { AppShell } from "@/components/layout/app-shell";
import { HydrationGate } from "@/components/layout/hydration-gate";

export default function GestionLayout({ children }: { children: React.ReactNode }) {
  return (
    <HydrationGate>
      <AppShell>{children}</AppShell>
    </HydrationGate>
  );
}
