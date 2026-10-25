"use client";
// Piezas comunes de las pantallas del modo demostración (estado de lib/core). Mismos componentes y estética de Blerp.
import Link from "next/link";
import { useMemo, useState } from "react";
import type { CoreStatus, CoreWorld, OpCtx } from "@/lib/core/types";
import type { CoreAlert } from "@/lib/core/alerts";
import { STATUS_LABELS } from "@/lib/core/ops";
import { clientName, sessionPerson } from "@/lib/core/lookup";
import type { SessionKey } from "@/lib/permissions";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/formatting";
import { useAppStore, type Result } from "@/store/use-app-store";
import { useIdentity } from "@/store/selectors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Estado de la demo. Solo se usa dentro de pantallas que se muestran en el modo demostración. */
export function useCore(): CoreWorld {
  const core = useAppStore((s) => s.core);
  if (!core) throw new Error("La pantalla de demostración necesita el estado de la demo.");
  return core;
}

/** "Hoy" de la demo (fecha simulada fija, no el reloj del navegador). */
export function useDemoToday(): string {
  return useCore().config.asOf;
}

/** Aplica una operación de lib/core/ops.ts con la sesión activa. */
export function useAct() {
  const coreAct = useAppStore((s) => s.coreAct);
  return function act<T = undefined>(fn: (w: CoreWorld, ctx: OpCtx) => CoreWorld | [T, CoreWorld]): Result<T | undefined> {
    return coreAct<T>(fn);
  };
}

/** Persona con la que se trabaja en la sesión actual. */
export function useSessionPerson() {
  const core = useCore();
  const { session } = useIdentity();
  const acting = useAppStore((s) => s.actingOperatorId);
  return sessionPerson(core, session, acting);
}

export const money = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? "—" : formatCurrency(n).replace(" ", "\u00a0"));
export const pct = (n: number | null | undefined) => (n === null || n === undefined ? "—" : formatPercent(n));
export const num = (n: number, unit?: string) => `${formatNumber(n, 2)}${unit ? `\u00a0${unit.replace(/ /g, "\u00a0")}` : ""}`;

/** dd/mm/aaaa sin depender del huso del navegador. */
export function day(iso: string | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

const STATUS_TONE: Record<CoreStatus, "gray" | "blue" | "yellow" | "green"> = {
  quotation: "gray",
  approved: "blue",
  purchasing: "yellow",
  production: "blue",
  closed: "green",
};

export function StatusBadge({ status }: { status: CoreStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABELS[status]}</Badge>;
}

/** Link a una OT según la sesión (cada una ve su propia vista de la OT). */
export function otHref(session: SessionKey, projectId: string, tab?: string): string {
  if (session === "compras") return `/compras/proyectos?p=${encodeURIComponent(projectId)}`;
  if (session === "jefe_planta") return `/planta/proyectos?p=${encodeURIComponent(projectId)}`;
  return `/projects/${projectId}${tab ? `?tab=${tab}` : ""}`;
}

export function OtLink({ projectId, tab, className, withClient, short }: { projectId: string; tab?: string; className?: string; withClient?: boolean; short?: boolean }) {
  const core = useCore();
  const { session } = useIdentity();
  const p = core.projects.find((x) => x.id === projectId);
  if (!p) return <span className="text-slate-500">OT sin datos</span>;
  return (
    <span className={cn("min-w-0", className)}>
      <Link href={otHref(session, p.id, tab)} className="break-all font-medium text-blue-800 hover:underline">
        {short ? p.ot.split("_")[0] : p.ot}
      </Link>
      {(withClient || short) && <span className="block text-xs text-slate-500">{clientName(core, p.clientId)}</span>}
    </span>
  );
}

export function Section({ title, actions, children, className }: { title: string; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle>{title}</CardTitle>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">{children}</p>;
}

/** Lista de alertas: título, detalle y link a la OT u OC que la causa. */
export function AlertList({ alerts, hrefOf, limit }: { alerts: CoreAlert[]; hrefOf?: (a: CoreAlert) => string | undefined; limit?: number }) {
  const [all, setAll] = useState(false);
  if (alerts.length === 0) return <Empty>Sin alertas.</Empty>;
  const order = { critical: 0, warning: 1, info: 2 } as const;
  const sorted = [...alerts].sort((a, b) => order[a.level] - order[b.level]);
  const shown = limit && !all ? sorted.slice(0, limit) : sorted;
  return (
    <>
    <ul className="divide-y divide-slate-100">
      {shown.map((a) => {
        const href = hrefOf?.(a);
        const tone = a.level === "critical" ? "bg-red-500" : a.level === "warning" ? "bg-amber-500" : "bg-blue-500";
        const body = (
          <>
            <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", tone)} aria-hidden />
            <span className="min-w-0">
              <span className="block break-words text-sm font-medium text-slate-900">{a.title}</span>
              <span className="block break-words text-xs text-slate-600">{a.detail}</span>
            </span>
          </>
        );
        return (
          <li key={a.id} className="py-2.5">
            {href ? (
              <Link href={href} className="flex gap-2.5 rounded-md hover:bg-slate-50">
                {body}
              </Link>
            ) : (
              <div className="flex gap-2.5">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
    {limit && alerts.length > limit && (
      <button type="button" className="mt-2 text-xs font-medium text-blue-700 hover:underline" onClick={() => setAll(!all)}>
        {all ? "Ver menos" : `Ver las ${alerts.length} alertas`}
      </button>
    )}
    </>
  );
}

export interface Option {
  value: string;
  label: string;
  hint?: string;
}

/** Selector con búsqueda (para listas largas: clientes, materiales, OTs). */
export function SearchSelect({ id, value, onChange, options, placeholder = "Elegí…", disabled }: { id: string; value: string; onChange: (v: string) => void; options: Option[]; placeholder?: string; disabled?: boolean }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    const list = n ? options.filter((o) => `${o.label} ${o.hint ?? ""}`.toLowerCase().includes(n)) : options;
    const current = options.find((o) => o.value === value);
    return current && !list.includes(current) ? [current, ...list] : list;
  }, [q, options, value]);
  return (
    <div className="flex flex-col gap-1">
      {options.length > 8 && <Input aria-label="Buscar" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} disabled={disabled} className="h-8 text-xs" />}
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        <option value="">{placeholder}</option>
        {filtered.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
            {o.hint ? ` · ${o.hint}` : ""}
          </option>
        ))}
      </Select>
    </div>
  );
}

/** Diálogo con formulario: `onSubmit` devuelve un Result; si hay error queda abierto y lo muestra. */
export function FormDialog({
  trigger,
  title,
  submitLabel,
  onSubmit,
  children,
  note,
  open: controlledOpen,
  onOpenChange,
  wide,
}: {
  trigger?: React.ReactNode;
  title: string;
  submitLabel: string;
  onSubmit: () => Result<unknown>;
  children: React.ReactNode;
  /** Aclaración breve junto al botón (por ejemplo: registrar una OC no la envía al proveedor). */
  note?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  wide?: boolean;
}) {
  const [own, setOwn] = useState(false);
  const open = controlledOpen ?? own;
  const setOpen = (o: boolean) => {
    if (onOpenChange) onOpenChange(o);
    else setOwn(o);
  };
  const [error, setError] = useState("");
  return (
    <>
      {trigger && <span onClick={() => { setError(""); setOpen(true); }}>{trigger}</span>}
      <Dialog open={open} onOpenChange={(o) => { setError(""); setOpen(o); }}>
        <DialogContent className={wide ? "max-w-3xl" : undefined}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const r = onSubmit();
              if (!r.ok) setError(r.error);
              else setOpen(false);
            }}
          >
            {children}
            {note && <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">{note}</p>}
            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">{submitLabel}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Mensaje breve de resultado de una acción (confirmación o error). */
export function useFlash() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const show = (r: Result<unknown>, okText: string) => setMsg(r.ok ? { ok: true, text: okText } : { ok: false, text: r.error });
  const node = msg ? (
    <p role={msg.ok ? "status" : "alert"} className={cn("text-sm", msg.ok ? "text-emerald-700" : "text-red-600")}>
      {msg.text}
    </p>
  ) : null;
  return { show, node, clear: () => setMsg(null) };
}

export const num2 = (v: string) => {
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};
