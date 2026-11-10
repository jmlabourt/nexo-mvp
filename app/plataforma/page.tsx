import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { APP_NAME } from "@/lib/constants";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { AuthorizationsPanel } from "@/components/platform/authorizations-panel";

export const metadata: Metadata = { title: `Empresas autorizadas · ${APP_NAME}`, robots: { index: false } };

/** Solo para el equipo de Blerp (platform_admins). Para cualquier otra persona la ruta no existe. */
export default async function PlataformaPage() {
  if (!isSupabaseConfigured) notFound();
  const supabase = await createClient();
  const { data } = await supabase.rpc("platform_is_admin");
  if (data !== true) notFound();

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-8">
      <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-medium text-ink-soft hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Volver a {APP_NAME}
      </Link>
      <h1 className="mt-6 mb-8 text-2xl font-semibold tracking-[-0.03em] text-ink">Empresas autorizadas</h1>
      <AuthorizationsPanel />
    </main>
  );
}
