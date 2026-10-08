"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { parentHref } from "@/lib/navigation";
import { Button } from "@/components/ui/button";

// Cuántas pantallas se recorrieron dentro de la app en esta pestaña.
// Si es la primera (entró por un link o recargó), "Volver" no puede usar el historial.
let visitedInApp = 0;

/** Se llama una vez en el layout: cuenta cada cambio de pantalla. */
export function useTrackNavigation() {
  const pathname = usePathname();
  useEffect(() => {
    visitedInApp += 1;
  }, [pathname]);
}

/** Volver: usa el historial del navegador; si no hay historial dentro de la app, va a la lista padre. */
export function BackButton({ fallback, label = "Volver" }: { fallback?: string; label?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="-ml-2 mb-2 text-slate-600"
      onClick={() => {
        if (visitedInApp > 1 && window.history.length > 1) router.back();
        else router.push(fallback ?? parentHref(pathname, window.location.search));
      }}
    >
      <ArrowLeft /> {label}
    </Button>
  );
}
