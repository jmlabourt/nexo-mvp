import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/supabase/safe-next";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/** Google vuelve acá con ?code=…; lo cambiamos por una sesión (cookies) y seguimos. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  // Si el alta se rechaza (mail sin empresa autorizada ni invitación), Supabase vuelve acá con el error en la URL.
  const detail = `${searchParams.get("error_description") ?? ""} ${searchParams.get("error") ?? ""}`.toLowerCase();
  if (detail.includes("database error") || detail.includes("saving new user")) {
    return NextResponse.redirect(`${origin}/login?error=unauthorized`);
  }

  if (code && isSupabaseConfigured) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
