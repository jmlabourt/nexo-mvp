"use client";
// En el modo demostración se muestra la pantalla del flujo nuevo (lib/core); con una empresa real, la pantalla que ya
// usa la base. Así el flujo real no cambia hasta que el backend guarde los datos nuevos (PENDIENTES_BACKEND.md §8).
import { useAppStore } from "@/store/use-app-store";

export function DemoOr({ demo, real }: { demo: React.ReactNode; real: React.ReactNode }) {
  const on = useAppStore((s) => s.demoLocal && !!s.core);
  return <>{on ? demo : real}</>;
}

/** Pantalla nueva sin equivalente en la base real todavía. */
export function DemoOnly({ children, what }: { children: React.ReactNode; what: string }) {
  const on = useAppStore((s) => s.demoLocal && !!s.core);
  if (on) return <>{children}</>;
  return (
    <div className="mx-auto max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center">
      <h1 className="text-lg font-semibold text-slate-900">{what}</h1>
      <p className="mt-1 text-sm text-slate-600">Disponible en el modo demostración. Pendiente de backend para tu empresa.</p>
    </div>
  );
}
