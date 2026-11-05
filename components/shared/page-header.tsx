import { BackButton } from "@/components/layout/back-button";

/** `back`: muestra el botón Volver; si es un string, es la lista padre cuando no hay historial. */
export function PageHeader({ title, subtitle, actions, back }: { title: string; subtitle?: string; actions?: React.ReactNode; back?: boolean | string }) {
  return (
    <div className="mb-6 flex min-w-0 flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0">
        {back && <BackButton fallback={typeof back === "string" ? back : undefined} />}
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">{subtitle}</p>}
      </div>
      {actions && <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2 md:max-w-[45%]">{actions}</div>}
    </div>
  );
}
