"use client";
import { useCallback, useEffect, useState } from "react";
import { APP_NAME } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { backfillClosures } from "@/lib/supabase/closures";
import { DEMO_LOCAL_COOKIE, isLocalDemoAccessEnabled, isLocalDemoHost } from "@/lib/supabase/env";
import { loadWorkspace, replaceWorkspace, startEmptyWorkspace, type Workspace } from "@/lib/supabase/workspace";
import { demoWorkspace, useAppStore } from "@/store/use-app-store";
import { isDemoActive } from "@/store/demo-local";

type GateState = { status: "loading" } | { status: "ready" } | { status: "error"; message: string } | { status: "choose"; ws: Workspace };

/**
 * Carga la empresa del usuario desde Supabase antes de renderizar la app.
 * La primera vez que entra alguien, su empresa (creada por un trigger al registrarse) todavía no tiene datos:
 * se le pregunta si empieza vacía o con los datos de ejemplo de Madera Sur.
 */
export function HydrationGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GateState>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      void useAppStore.persist.rehydrate();

      const isExplicitLocalDemo = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("demo") === "1";
      const demoCookieActive = typeof document !== "undefined" && document.cookie.split(";").map((part) => part.trim()).some((part) => part.startsWith(`${DEMO_LOCAL_COOKIE}=`) && part.slice(DEMO_LOCAL_COOKIE.length + 1) === "1");
      const localDevDemoEnabled = typeof window !== "undefined" && isLocalDemoAccessEnabled && isLocalDemoHost(window.location.hostname);

      if (localDevDemoEnabled && isExplicitLocalDemo && !demoCookieActive) {
        document.cookie = `${DEMO_LOCAL_COOKIE}=1; path=/; SameSite=Lax`;
      }

      // Modo demostración local solo para desarrollo explícito desde localhost, sin tocar la auth real.
      if (isDemoActive() || (localDevDemoEnabled && (isExplicitLocalDemo || demoCookieActive))) {
        useAppStore.getState().enterLocalDemo();
        setState({ status: "ready" });
        return;
      }
      const db = createClient();
      const ws = await loadWorkspace(db);
      if (!ws.demoSeeded) {
        setState({ status: "choose", ws });
        return;
      }
      useAppStore.getState().loadWorkspace(ws);
      setState({ status: "ready" });
      // Completa el historial de cierres de proyectos finalizados antes de que existiera (no bloquea ni falla la carga).
      if (ws.role === "owner" || ws.role === "member") void backfillClosures(db, ws.projects);
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message : "No pudimos cargar tus datos." });
    }
  }, []);

  useEffect(() => {
    // Carga inicial desde Supabase: el setState ocurre después del await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    if (state.status !== "ready") return;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      void useAppStore.getState().refreshWorkspace().catch(() => {
        useAppStore.setState({ syncStatus: "error", syncError: "No pudimos actualizar los datos. Revisá la conexión y reintentá." });
      });
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(refresh, 30000);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.clearInterval(timer);
    };
  }, [state.status]);

  if (state.status === "error") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <span className="text-lg font-semibold tracking-tight text-slate-900">{APP_NAME}</span>
        <p role="alert" className="max-w-sm text-sm text-slate-600">
          {state.message}
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={load} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">
            Reintentar
          </button>
          <form action="/auth/signout" method="post">
            <button type="submit" className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">
              Cerrar sesión
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (state.status === "choose") {
    return <FirstRunChoice ws={state.ws} onDone={load} />;
  }

  if (state.status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500" aria-busy="true">
        <span className="font-semibold tracking-tight text-slate-900">{APP_NAME}</span>
        <span className="ml-2">cargando tus proyectos…</span>
      </div>
    );
  }

  return (
    <>
      {children}
      <SyncToast />
    </>
  );
}

function SyncToast() {
  const status = useAppStore((s) => s.syncStatus);
  const error = useAppStore((s) => s.syncError);
  const dismiss = useAppStore((s) => s.dismissSyncError);
  if (status === "error" && error) {
    return (
      <div role="alert" className="fixed bottom-4 left-1/2 z-[60] flex w-[min(92vw,32rem)] -translate-x-1/2 items-start gap-3 rounded-lg bg-red-700 px-4 py-3 text-sm text-white shadow-lg">
        <span className="flex-1">{error}</span>
        <button type="button" onClick={dismiss} className="font-medium underline underline-offset-2">
          Actualizar
        </button>
      </div>
    );
  }
  if (status === "saving") {
    return (
      <div role="status" className="fixed bottom-4 right-4 z-[60] rounded-full bg-slate-900/90 px-3 py-1.5 text-xs font-medium text-white shadow">
        Guardando…
      </div>
    );
  }
  return null;
}

/** Primer ingreso de una empresa nueva: empezar vacía o con datos de ejemplo. Lo decide un Administrativo (el resto espera). */
function FirstRunChoice({ ws, onDone }: { ws: Workspace; onDone: () => void }) {
  const [busy, setBusy] = useState<"empty" | "demo" | null>(null);
  const [error, setError] = useState("");
  const canChoose = ws.role === "owner" || ws.role === "member";

  const choose = async (kind: "empty" | "demo") => {
    setBusy(kind);
    setError("");
    try {
      const db = createClient();
      if (kind === "empty") await startEmptyWorkspace(db, ws.organizationId);
      else await replaceWorkspace(db, ws.organizationId, demoWorkspace());
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos preparar tu empresa. Probá de nuevo.");
      setBusy(null);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-10">
      <div className="max-w-xl text-center">
        <span className="text-lg font-semibold tracking-tight text-slate-900">{APP_NAME}</span>
        <h1 className="mt-3 text-2xl font-semibold text-slate-900">Bienvenida, {ws.organizationName}</h1>
        <p className="mt-2 text-sm text-slate-600">
          {canChoose
            ? "¿Cómo querés empezar? Podés cambiar de idea más tarde desde Configuración → Datos."
            : "Tu empresa todavía no terminó la configuración inicial. Pedile a quien administra la cuenta que entre primero."}
        </p>
      </div>
      {canChoose && (
        <div className="grid w-full max-w-3xl gap-4 sm:grid-cols-2">
          <section className="flex flex-col rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-base font-semibold text-slate-900">Empezar vacía</h2>
            <p className="mt-1 flex-1 text-sm text-slate-600">Para cargar tus propios proyectos, personas y precios. Quedan listos los rubros estándar para cotizar.</p>
            <button type="button" disabled={busy !== null} onClick={() => void choose("empty")} className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
              {busy === "empty" ? "Preparando…" : "Empezar vacía"}
            </button>
          </section>
          <section className="flex flex-col rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-base font-semibold text-slate-900">Cargar datos de ejemplo</h2>
            <p className="mt-1 flex-1 text-sm text-slate-600">Proyectos, operarios y compras de Madera Sur S.R.L. para recorrer la app. Se pueden vaciar cuando quieras.</p>
            <button type="button" disabled={busy !== null} onClick={() => void choose("demo")} className="mt-4 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-60">
              {busy === "demo" ? "Cargando…" : "Cargar datos de ejemplo"}
            </button>
          </section>
        </div>
      )}
      {error && <p role="alert" className="max-w-md text-center text-sm text-red-700">{error}</p>}
      <form action="/auth/signout" method="post">
        <button type="submit" className="text-sm text-slate-500 underline underline-offset-2">Cerrar sesión</button>
      </form>
    </main>
  );
}
