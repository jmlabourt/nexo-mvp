"use client";
// Ingreso con un código de un solo uso que llega por mail. Para las personas invitadas: no necesitan cuenta
// de Google. El código lo manda Supabase Auth (la plantilla "Magic Link" tiene que incluir {{ .Token }}).
import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { authErrorMessage } from "@/lib/users";

const inputClass =
  "h-12 w-full rounded-full border border-line bg-white px-5 text-[15px] text-ink outline-none placeholder:text-ink-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const buttonClass =
  "flex h-12 w-full items-center justify-center gap-2 rounded-full bg-ink text-[15px] font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60";

export function CodeSignIn({ next, initialEmail = "" }: { next: string; initialEmail?: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disabled = pending || !isSupabaseConfigured;
  const address = email.trim().toLowerCase();

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const { error: err } = await createClient().auth.signInWithOtp({ email: address, options: { shouldCreateUser: true } });
    setPending(false);
    if (err) return setError(authErrorMessage(err.message));
    setSent(true);
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const { error: err } = await createClient().auth.verifyOtp({ email: address, token: code.replace(/\s/g, ""), type: "email" });
    if (err) {
      setPending(false);
      return setError(authErrorMessage(err.message));
    }
    // Navegación completa: así el servidor lee la sesión recién guardada en las cookies.
    window.location.assign(next);
  }

  return (
    <div className="w-full text-left">
      {!sent ? (
        <form onSubmit={sendCode} className="space-y-3" noValidate>
          <label htmlFor="login-email" className="sr-only">Tu mail</label>
          <input
            id="login-email"
            className={inputClass}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="tu@mail.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button type="submit" disabled={disabled || address === ""} className={buttonClass}>
            {pending && <Loader2 className="size-5 animate-spin" aria-hidden />}
            Enviarme un código por mail
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-3" noValidate>
          <p role="status" className="text-sm text-ink-soft">
            Te mandamos un código a <strong className="break-all text-ink">{address}</strong>. Ingresalo para entrar.
          </p>
          <label htmlFor="login-code" className="sr-only">Código</label>
          <input
            id="login-code"
            className={`${inputClass} text-center tracking-[0.4em]`}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="······"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
          <button type="submit" disabled={disabled || code.replace(/\s/g, "").length < 6} className={buttonClass}>
            {pending && <Loader2 className="size-5 animate-spin" aria-hidden />}
            Entrar
          </button>
          <button
            type="button"
            onClick={() => {
              setSent(false);
              setCode("");
              setError(null);
            }}
            className="w-full text-center text-sm text-ink-soft underline-offset-2 hover:underline"
          >
            Usar otro mail
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-3 text-center text-sm text-bad">
          {error}
        </p>
      )}
    </div>
  );
}
