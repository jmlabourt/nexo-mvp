/**
 * Cuánto dura la sesión iniciada: 7 días.
 * La cookie de Supabase se renueva cada vez que se refresca el token (el proxy lo hace al usar la app), así que son
 * 7 días desde la última vez que se usó: quien entra a diario no vuelve a loguearse; tras una semana sin entrar, sí.
 * (Por defecto @supabase/ssr la deja 400 días.)
 */
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

/** Opciones de cookie compartidas por el cliente del navegador, el del servidor y el proxy. */
export const sessionCookieOptions = { maxAge: SESSION_MAX_AGE_SECONDS } as const;
