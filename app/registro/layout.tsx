import { HydrationGate } from "@/components/layout/hydration-gate";

export default function RegistroLayout({ children }: { children: React.ReactNode }) {
  return <HydrationGate>{children}</HydrationGate>;
}
