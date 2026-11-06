"use client";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/store/use-app-store";
import { personnelViews } from "@/lib/personnel";
import { Select } from "@/components/ui/input";
import { Choice } from "@/components/ui/choice";
import { DEMO_USERS } from "@/lib/constants";
import { homeFor, roleKeyOf, SESSION_KEYS, SESSION_LABELS, sessionsFor, type SessionKey } from "@/lib/permissions";
import { useIdentity } from "@/store/selectors";

/**
 * Sesión con la que se trabaja.
 *  · Empresa demo, usuario Administrativo: "Demo: ver como" con las cinco sesiones, cada una con su usuario de ejemplo.
 *  · Empresa real, usuario Administrativo: elige entre Gerencia y Administración (preparado para el multirrol).
 * Es una elección de pantalla: los permisos reales los aplica la base (ver PENDIENTES_BACKEND.md).
 */
export function ModeSwitch({ onSwitch }: { onSwitch?: () => void } = {}) {
  const setMode = useAppStore((s) => s.setMode);
  const isDemo = useAppStore((s) => s.isDemo);
  const role = useAppStore((s) => s.role);
  const operators = useAppStore((s) => s.operators);
  const profiles = useAppStore((s) => s.ledger.personnel);
  const selected = useAppStore((s) => s.actingOperatorId);
  const setPerson = useAppStore((s) => s.setActingOperator);
  const { session,operator } = useIdentity();
  const router = useRouter();
  const operatorName = operator?.name;
  const real = roleKeyOf(role);
  if (real !== "admin") return null;
  const options = isDemo ? SESSION_KEYS : sessionsFor(real);
  const who: Record<SessionKey, string> = {
    gerencia: DEMO_USERS.admin.name,
    administracion: DEMO_USERS.admin.name,
    compras: DEMO_USERS.compras.name,
    jefe_planta: DEMO_USERS.jefe_planta.name,
    operario: operatorName ?? "el primer operario activo",
  };
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium text-slate-500">{isDemo ? "Demo: ver como" : "Sesión"}</div>
      <Choice<SessionKey>
        name={isDemo ? "Ver la demo como" : "Sesión"}
        value={session}
        size="sm"
        // Cada sesión arranca en su pantalla de inicio.
        onChange={(m) => {
          setMode(m);
          router.push(homeFor(m));
          onSwitch?.(); // en el celular, cierra el menú
        }}
        columns={2}
        options={options.map((k) => ({ value: k, label: SESSION_LABELS[k] }))}
      />
      {isDemo && profiles?.length ? <label className="block mt-2 text-xs">Persona de demostración<Select value={selected ?? ""} onChange={(e) => setPerson(e.target.value)}><option value="">Usuario de ejemplo</option>{operators.filter((o) => o.active && profiles.some((p) => p.employeeId === o.id && p.enabled && personnelViews(p).includes(session))).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></label> : null}
      {isDemo && <p className="mt-1.5 text-xs text-slate-500">Usuario de ejemplo: {who[session]}.</p>}
    </div>
  );
}
