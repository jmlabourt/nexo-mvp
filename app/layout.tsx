import type { Metadata, Viewport } from "next";
import "./globals.css";
import { APP_NAME, APP_SUBTITLE } from "@/lib/constants";
import { HydrationGate } from "@/components/layout/hydration-gate";

export const metadata: Metadata = {
  title: `${APP_NAME} · ${APP_SUBTITLE}`,
  description: "MVP de investigación: presupuesto → ejecución → costo → margen por proyecto.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-AR" className="h-full antialiased">
      <body className="min-h-full">
        <HydrationGate>{children}</HydrationGate>
      </body>
    </html>
  );
}
