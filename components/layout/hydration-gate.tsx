"use client";
import { useEffect, useSyncExternalStore } from "react";
import { useAppStore } from "@/store/use-app-store";
import { APP_NAME } from "@/lib/constants";

const subscribe = (cb: () => void) => useAppStore.persist.onFinishHydration(cb);
const getSnapshot = () => useAppStore.persist.hasHydrated();
const getServerSnapshot = () => false;

/**
 * El estado vive en localStorage: esperamos a rehidratar en el cliente antes de renderizar
 * para evitar diferencias servidor/cliente (hydration mismatch).
 */
export function HydrationGate({ children }: { children: React.ReactNode }) {
  const hydrated = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => {
    if (!useAppStore.persist.hasHydrated()) void useAppStore.persist.rehydrate();
  }, []);
  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500" aria-busy="true">
        <span className="font-semibold tracking-tight text-slate-900">{APP_NAME}</span>
        <span className="ml-2">cargando…</span>
      </div>
    );
  }
  return <>{children}</>;
}
