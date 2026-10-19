"use client";
// Ingreso con un código de un solo uso que llega por mail. Para las personas invitadas: no necesitan cuenta
// de Google. El código lo manda Supabase Auth (la plantilla "Magic Link" tiene que incluir {{ .Token }}).
//
// Pensado para entrar rápido desde el celular o la tablet del taller:
// - si vienen desde su link de invitación, el mail ya está puesto (un solo toque para pedir el código);
// - se recuerda el último mail usado en este dispositivo;
// - el código se puede reenviar (con espera de 60 s, que es lo que permite Supabase) y se puede cambiar de mail.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { authErrorMessage } from "@/lib/users";

const inputClass =
  "h-12 w-full rounded-full border border-line bg-white px-5 text-[15px] text-ink outline-none placeholder:text-ink-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const buttonClass =
  "flex h-12 w-full items-center justify-center gap-2 rounded-full bg-ink text-[15px] font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60";
const linkButtonClass =
  "w-full text-center text-sm text-ink-soft underline-offset-2 hover:underline disabled:no-underline disabled:opacity-60";

const LAST_EMAIL_KEY = "blerp:last-email";
const RESEND_SECONDS = 60;
const MIN_CODE_LENGTH = 6;

function readLastEmail(): string {
  try {
    return window.localStorage.getItem(LAST_EMAIL_KEY) ?? "";
  } catch {
    return "";
  }
}

function rememberEmail(email: string) {
  try {
    window.localStorage.setItem(LAST_EMAIL_KEY, email);
  } catch {
    // Sin almacenamiento (modo privado, etc.): simplemente no se recuerda.
  }
}

export function CodeSignIn({ next, initialEmail = "" }: { next: string; initialEmail?: string }) {
  const [email, setEmail] = useState(initialEmail);
  // Con el mail que vino en el link de invitación no hace falta escribirlo (se puede cambiar con "No soy yo").
  const [invited, setInvited] = useState(initialEmail !== "");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  const disabled = pending || !isSupabaseConfigured;
  const address = email.trim().toLowerCase();

  useEffect(() => {
    if (initialEmail) return;
    const last = readLastEmail();
    // Lee el almacenamiento del navegador recién al montar (en el servidor no existe).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (last) setEmail(last);
  }, [initialEmail]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft]);

  useEffect(() => {
    if (sent) codeRef.current?.focus();
  }, [sent]);

  async function requestCode(): Promise<boolean> {
    setPending(true);
    setError(null);
    const { error: err } = await createClient().auth.signInWithOtp({ email: address, options: { shouldCreateUser: true } });
    setPending(false);
    if (err) {
      setError(authErrorMessage(err.message));
      return false;
    }
    rememberEmail(address);
    setSecondsLeft(RESEND_SECONDS);
    return true;
  }

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    if (await requestCode()) setSent(true);
  }

  async function resend() {
    setCode("");
    await requestCode();
    codeRef.current?.focus();
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const { error: err } = await createClient().auth.verifyOtp({ email: address, token: code, type: "email" });
    if (err) {
      setPending(false);
      setCode("");
      codeRef.current?.focus();
      return setError(authErrorMessage(err.message));
    }
    // Navegación completa: así el servidor lee la sesión recién guardada en las cookies.
    window.location.assign(next);
  }

  function changeEmail() {
    setSent(false);
    setInvited(false);
    setCode("");
    setError(null);
    setSecondsLeft(0);
  }

  return (
    <div className="w-full text-left">
      {!sent ? (
        <form onSubmit={sendCode} className="space-y-3" noValidate>
          {invited ? (
            <p className="rounded-2xl bg-white px-4 py-3 text-center text-sm text-ink-soft ring-1 ring-line">
              Vas a entrar con <strong className="break-all text-ink">{address}</strong>
            </p>
          ) : (
            <>
              <label htmlFor="login-email" className="sr-only">Tu mail</label>
              <input
                id="login-email"
                className={inputClass}
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                placeholder="tu@mail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </>
          )}
          <button type="submit" disabled={disabled || address === ""} className={buttonClass}>
            {pending && <Loader2 className="size-5 animate-spin" aria-hidden />}
            Enviarme un código por mail
          </button>
          {invited && (
            <button type="button" onClick={changeEmail} className={linkButtonClass}>
              No soy yo, usar otro mail
            </button>
          )}
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-3" noValidate>
          <p role="status" className="text-sm text-ink-soft">
            Te mandamos un código a <strong className="break-all text-ink">{address}</strong>. Puede tardar un minuto: si no aparece, mirá en spam.
          </p>
          <label htmlFor="login-code" className="sr-only">Código</label>
          <input
            id="login-code"
            ref={codeRef}
            className={`${inputClass} text-center text-lg tracking-[0.4em]`}
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={10}
            autoComplete="one-time-code"
            placeholder="······"
            value={code}
            // Solo números: sirve pegar el código con espacios o guiones.
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            required
          />
          <button type="submit" disabled={disabled || code.length < MIN_CODE_LENGTH} className={buttonClass}>
            {pending && <Loader2 className="size-5 animate-spin" aria-hidden />}
            Entrar
          </button>
          <button type="button" onClick={() => void resend()} disabled={disabled || secondsLeft > 0} className={linkButtonClass}>
            {secondsLeft > 0 ? `Reenviar código en ${secondsLeft} s` : "Reenviar código"}
          </button>
          <button type="button" onClick={changeEmail} className={linkButtonClass}>
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
