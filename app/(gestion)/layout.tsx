import { AppShell } from "@/components/layout/app-shell";

export default function GestionLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
