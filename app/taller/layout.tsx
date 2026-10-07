import { HydrationGate } from "@/components/layout/hydration-gate";

export default function TallerLayout({ children }: { children: React.ReactNode }) {
  return <HydrationGate>{children}</HydrationGate>;
}
