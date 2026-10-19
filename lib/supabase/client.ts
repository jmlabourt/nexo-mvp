import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./env";
import { sessionCookieOptions } from "./session";

let client: ReturnType<typeof createBrowserClient> | undefined;

/** Cliente del navegador (singleton). La sesión vive en cookies que refresca el proxy. */
export function createClient() {
  client ??= createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { cookieOptions: sessionCookieOptions });
  return client;
}
