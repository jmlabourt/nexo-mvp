import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { APP_NAME, APP_SUBTITLE } from "@/lib/constants";

export const metadata: Metadata = {
  title: `${APP_NAME} · ${APP_SUBTITLE}`,
  description: "MVP de investigación: presupuesto → ejecución → captura → costo → desvío → margen por proyecto.",
};

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-AR" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full">
        {children}
      </body>
    </html>
  );
}
