import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { DEMO_LOCAL_COOKIE, isLocalDemoAllowed, isSupabaseConfigured, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./env";
import { sessionCookieOptions } from "./session";
import { safeNext } from "./safe-next";

/** Rutas públicas: el landing, el login, el intercambio del código OAuth y la confirmación de una invitación. */
const PUBLIC_PATHS = ["/", "/login", "/auth/callback", "/auth/confirm"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => (p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(`${p}/`)));
}

/**
 * Refresca la sesión de Supabase en cada request y redirige a /login si una ruta privada
 * se pide sin sesión. Es un chequeo optimista: la autorización real la hace RLS en la base.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { pathname: currentPathname, hostname, searchParams } = request.nextUrl;
  const hasLocalDemoAccess = isLocalDemoAllowed(hostname, searchParams, request.headers.get("cookie"));

  // Modo demo local solo para desarrollo y localhost, con activación explícita por query param y persistencia por cookie.
  // Esto no toca la auth de producción ni cambia la lógica de negocio.
  if (hasLocalDemoAccess) {
    response.cookies.set(DEMO_LOCAL_COOKIE, "1", {
      path: "/",
      httpOnly: false,
      sameSite: "lax",
      secure: false,
      maxAge: 60 * 60 * 24 * 7,
    });
    return response;
  }

  // Sin variables de Supabase no hay sesión posible: el sitio público sigue andando
  // y las rutas privadas van a /login, que explica qué falta.
  if (!isSupabaseConfigured) {
    if (isPublic(currentPathname)) return response;
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookieOptions: sessionCookieOptions,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // No meter código entre createServerClient y getClaims (ver docs de @supabase/ssr).
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const { pathname: routePathname, search } = request.nextUrl;

  if (!signedIn && !isPublic(routePathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(routePathname + search)}`;
    return NextResponse.redirect(url);
  }

  // Quien ya tiene sesión y abre un link de invitación (/login?next=/taller…) va directo a la pantalla de su rol.
  if (signedIn && routePathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = safeNext(request.nextUrl.searchParams.get("next"));
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
