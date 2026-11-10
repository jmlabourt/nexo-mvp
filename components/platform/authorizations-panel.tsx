"use client";
// Pantalla del equipo de Blerp: autorizar empresas (mail de su Gerencia + nombre) y ver quién ya entró.
// Después, cada Gerencia invita a su gente desde Configuración → Usuarios.
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  authorizeCompany,
  loadAuthorizations,
  revokeAuthorization,
  type AuthorizationStatus,
  type CompanyAuthorization,
} from "@/lib/supabase/platform";

const inputClass =
  "h-11 w-full rounded-xl border border-line bg-white px-4 text-[15px] text-ink outline-none placeholder:text-ink-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const STATUS_LABEL: Record<AuthorizationStatus, string> = {
  pending: "Esperando que entre",
  used: "Ya entró",
  revoked: "Revocada",
};

const dateFormat = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });

export function AuthorizationsPanel() {
  const [items, setItems] = useState<CompanyAuthorization[] | null>(null);
  const [email, setEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setItems(await loadAuthorizations(createClient()));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos cargar la lista.");
      setItems([]);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      await authorizeCompany(createClient(), { email, companyName });
      setNotice(`Listo: ${companyName.trim()} quedó autorizada. Avisale a ${email.trim().toLowerCase()} que entre a app.blerpsolution.com con ese mismo mail.`);
      setEmail("");
      setCompanyName("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos autorizar la empresa.");
    } finally {
      setPending(false);
    }
  }

  async function revoke(id: string) {
    setError(null);
    setNotice(null);
    try {
      await revokeAuthorization(createClient(), id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos revocar la autorización.");
    }
  }

  return (
    <div className="space-y-8">
      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-line bg-white p-5" noValidate>
        <h2 className="text-lg font-semibold text-ink">Autorizar una empresa</h2>
        <p className="text-sm text-ink-soft">
          Cargá el mail de la persona de Gerencia (Administrativo). Cuando entre por primera vez se crea la empresa con este nombre y esa persona
          queda como Administrativo; desde Configuración → Usuarios invita a su equipo, cada uno con su rol.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="auth-company" className="mb-1 block text-sm font-medium text-ink">Nombre de la empresa</label>
            <input id="auth-company" className={inputClass} value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Muebles del Sur S.R.L." required />
          </div>
          <div>
            <label htmlFor="auth-email" className="mb-1 block text-sm font-medium text-ink">Mail de Gerencia</label>
            <input id="auth-email" className={inputClass} type="email" inputMode="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="gerencia@empresa.com" required />
          </div>
        </div>
        <button
          type="submit"
          disabled={pending || email.trim() === "" || companyName.trim().length < 2}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-ink px-6 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
        >
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Autorizar empresa
        </button>
        {error && <p role="alert" className="text-sm text-bad">{error}</p>}
        {notice && <p role="status" className="text-sm text-ink-soft">{notice}</p>}
      </form>

      <section aria-labelledby="auth-list">
        <h2 id="auth-list" className="mb-3 text-lg font-semibold text-ink">Empresas autorizadas</h2>
        {items === null ? (
          <p className="text-sm text-ink-soft">Cargando…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-ink-soft">Todavía no autorizaste ninguna empresa.</p>
        ) : (
          <ul className="divide-y divide-line rounded-2xl border border-line bg-white">
            {items.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{a.companyName}</p>
                  <p className="break-all text-sm text-ink-soft">{a.email}</p>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-ink-soft">
                    {STATUS_LABEL[a.status]}
                    {a.status === "used" && a.usedAt ? ` · ${dateFormat.format(new Date(a.usedAt))}` : ""}
                    {a.status === "used" && a.members !== null ? ` · ${a.members} ${a.members === 1 ? "persona" : "personas"}` : ""}
                  </span>
                  {a.status === "pending" && (
                    <button type="button" onClick={() => void revoke(a.id)} className="font-medium text-bad underline-offset-2 hover:underline">
                      Revocar
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
