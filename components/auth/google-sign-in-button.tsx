"use client";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.45a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.57-5.17 3.57-8.8Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.93-2.9l-3.88-3.01c-1.07.72-2.45 1.15-4.05 1.15-3.12 0-5.76-2.1-6.7-4.94H1.3v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.6 4.58 1.8l3.44-3.44A11.97 11.97 0 0 0 1.3 6.6l4 3.1C6.24 6.87 8.88 4.77 12 4.77Z" />
    </svg>
  );
}

export function GoogleSignInButton({ next }: { next: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setPending(true);
    setError(null);
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await createClient().auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    if (error) {
      setError("No pudimos conectar con Google. Probá de nuevo.");
      setPending(false);
    }
  }

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={signIn}
        disabled={pending || !isSupabaseConfigured}
        className="flex h-12 w-full items-center justify-center gap-3 rounded-full border border-line bg-white text-[15px] font-medium text-ink shadow-[0_1px_2px_rgb(11_13_23/0.05)] transition-colors hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
      >
        {pending ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <GoogleIcon />}
        Continuar con Google
      </button>
      {error && (
        <p role="alert" className="mt-3 text-center text-sm text-bad">
          {error}
        </p>
      )}
    </div>
  );
}
