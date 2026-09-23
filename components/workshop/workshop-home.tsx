"use client";
import Link from "next/link";
import { ChevronRight, QrCode } from "lucide-react";
import { APP_NAME, DEMO_USERS } from "@/lib/constants";
import { useAppStore } from "@/store/use-app-store";
import { StatusBadge } from "@/components/shared/badges";
import { ModeSwitch } from "@/components/layout/mode-switch";

/** Vista de modo Taller: sin datos económicos, solo elegir proyecto para registrar. */
export function WorkshopHome() {
  const projects = useAppStore((s) => s.projects).filter((p) => ["purchasing", "production", "installation"].includes(p.status));
  return (
    <div className="mx-auto min-h-screen max-w-md bg-white px-4 pb-10">
      <header className="flex items-center justify-between py-4">
        <div>
          <div className="text-lg font-semibold tracking-tight">{APP_NAME}</div>
          <div className="text-xs text-slate-500">Modo taller · {DEMO_USERS.workshop.name}</div>
        </div>
      </header>
      <div className="mb-4 flex items-start gap-3 rounded-lg bg-blue-50 p-3 text-sm text-blue-900">
        <QrCode className="mt-0.5 size-5 shrink-0" aria-hidden />
        Escaneá el QR de la orden de producción o elegí el proyecto.
      </div>
      <h1 className="mb-3 text-xl font-semibold">¿En qué proyecto trabajás?</h1>
      <ul className="space-y-2">
        {projects.map((p) => (
          <li key={p.id}>
            <Link
              href={`/registro/${p.id}`}
              className="flex min-h-16 items-center gap-3 rounded-lg border border-slate-200 p-4 hover:bg-slate-50"
            >
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-slate-500">{p.code}</div>
                <div className="truncate font-medium text-slate-900">{p.name}</div>
              </div>
              <StatusBadge status={p.status} />
              <ChevronRight className="size-5 text-slate-400" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-8 border-t border-slate-200 pt-4">
        <ModeSwitch />
      </div>
    </div>
  );
}
