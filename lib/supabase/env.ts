// NEXT_PUBLIC_* se incrustan en el build: si se cargan en Vercel después, hay que redeployar.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
// La integración Supabase ↔ Vercel carga NEXT_PUBLIC_SUPABASE_ANON_KEY; aceptamos ambas.
export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const DEMO_LOCAL_ACCESS = process.env.NEXT_PUBLIC_DEMO_LOCAL_ACCESS ?? "0";
export const isLocalDemoAccessEnabled = DEMO_LOCAL_ACCESS === "1";
export const DEMO_LOCAL_COOKIE = "blerp-demo-local";

export function isLocalDemoHost(hostname?: string): boolean {
  if (!hostname) return false;
  const normalized = hostname.replace(/\[|\]/g, "").toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized.startsWith("127.0.0.");
}

export function isExplicitLocalDemoActivation(url: URL): boolean {
  return url.searchParams.get("demo") === "1" || url.searchParams.get("dev-demo") === "1";
}

export function hasLocalDemoCookie(cookieHeader?: string | null): boolean {
  if (!cookieHeader) return false;
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .some((part) => part.startsWith(`${DEMO_LOCAL_COOKIE}=`) && part.slice(DEMO_LOCAL_COOKIE.length + 1) === "1");
}

export function isLocalDemoAllowed(hostname?: string, searchParams?: URLSearchParams, cookieHeader?: string | null): boolean {
  if (!isLocalDemoAccessEnabled) return false;
  if (!isLocalDemoHost(hostname)) return false;
  if (searchParams && (searchParams.get("demo") === "1" || searchParams.get("dev-demo") === "1")) return true;
  return hasLocalDemoCookie(cookieHeader);
}

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

export const SUPABASE_NOT_CONFIGURED =
  "Falta configurar Supabase: cargá NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY y volvé a deployar.";
