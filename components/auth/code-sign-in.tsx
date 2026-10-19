"use client";
// Ingreso con código de un solo uso: por mail o por WhatsApp (celular). Para las personas invitadas:
// no necesitan cuenta de Google. El código lo manda Supabase Auth (mail) o Twilio vía Supabase (WhatsApp).
import { useState, type FormEvent } from "react";
import { Loader2, Mail, MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { authErrorMessage, normalizePhone } from "@/lib/users";

type Channel = "email" | "whatsapp";

const TABS: { id: Channel; label: string; Icon: typeof Mail }[] = [
  { id: "email", label: "Mail", Icon: Mail },
  { id: "whatsapp", label: "WhatsApp", Icon: MessageCircle },
];

const inputClass =
  "h-12 w-full rounded-full border border-line bg-white px-5 text-[15px] text-ink outline-none placeholder:text-ink-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const buttonClass =
  "flex h-12 w-full items-center justify-center gap-2 rounded-full bg-ink text-[15px] font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60";

export function CodeSignIn({ next }: { next: string }) {
  const [channel, setChannel] = useState<Channel>("email");
  const [contact, setContact] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disabled = pending || !isSupabaseConfigured;
  const phone = `+${normalizePhone(contact)}`;

  function pick(c: Channel) {
    setChannel(c);
    setContact("");
    setCode("");
    setSent(false);
    setError(null);
  }

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const auth = createClient().auth;
    const { error: err } =
      channel === "email"
        ? await auth.signInWithOtp({ email: contact.trim().toLowerCase(), options: { shouldCreateUser: true } })
        : await auth.signInWithOtp({ phone, options: { channel: "whatsapp", shouldCreateUser: true } });
    setPending(false);
    if (err) return setError(authErrorMessage(err.message, channel));
    setSent(true);
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const auth = createClient().auth;
    const token = code.replace(/\s/g, "");
    const { error: err } =
      channel === "email"
        ? await auth.verifyOtp({ email: contact.trim().toLowerCase(), token, type: "email" })
        : await auth.verifyOtp({ phone, token, type: "sms" });
    if (err) {
      setPending(false);
      return setError(authErrorMessage(err.message, channel));
    }
    // Navegación completa: así el servidor lee la sesión recién guardada en las cookies.
    window.location.assign(next);
  }

  return (
    <div className="w-full text-left">
      <div role="tablist" aria-label="Cómo querés entrar" className="mb-4 grid grid-cols-2 gap-1 rounded-full bg-canvas p-1">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={channel === id}
            onClick={() => pick(id)}
            className={`flex h-10 items-center justify-center gap-2 rounded-full text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
              channel === id ? "bg-white text-ink shadow-sm" : "text-ink-soft hover:text-ink"
            }`}
          >
            <Icon className="size-4" aria-hidden /> {label}
          </button>
        ))}
      </div>

      {!sent ? (
        <form onSubmit={sendCode} className="space-y-3" noValidate>
          <label htmlFor="login-contact" className="sr-only">
            {channel === "email" ? "Tu mail" : "Tu celular de WhatsApp"}
          </label>
          <input
            id="login-contact"
            key={channel}
            className={inputClass}
            type={channel === "email" ? "email" : "tel"}
            inputMode={channel === "email" ? "email" : "tel"}
            autoComplete={channel === "email" ? "email" : "tel"}
            placeholder={channel === "email" ? "tu@mail.com" : "+54 9 11 5555 1234"}
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            required
          />
          <button type="submit" disabled={disabled || contact.trim() === ""} className={buttonClass}>
            {pending && <Loader2 className="size-5 animate-spin" aria-hidden />}
            {channel === "email" ? "Enviarme un código por mail" : "Enviarme un código por WhatsApp"}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-3" noValidate>
          <p role="status" className="text-sm text-ink-soft">
            Te mandamos un código a <strong className="break-all text-ink">{channel === "email" ? contact.trim() : phone}</strong>. Ingresalo para entrar.
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
          <button type="button" onClick={() => pick(channel)} className="w-full text-center text-sm text-ink-soft underline-offset-2 hover:underline">
            Usar otro {channel === "email" ? "mail" : "número"}
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
