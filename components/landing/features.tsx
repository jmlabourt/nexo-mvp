import { ArrowRight, BellRing, History, PackageCheck, QrCode, Recycle, TrendingDown } from "lucide-react";
import { FEATURES } from "@/lib/landing-content";
import { cn } from "@/lib/utils";
import { Container, SectionHeading } from "./primitives";

type FeatureKey = (typeof FEATURES)[number]["key"];

const META: Record<FeatureKey, { icon: typeof QrCode; span: string }> = {
  margin: { icon: TrendingDown, span: "md:col-span-4" },
  workshop: { icon: QrCode, span: "md:col-span-2" },
  purchase: { icon: PackageCheck, span: "md:col-span-2" },
  alerts: { icon: BellRing, span: "md:col-span-2" },
  leftovers: { icon: Recycle, span: "md:col-span-2" },
  history: { icon: History, span: "md:col-span-6" },
};

function MarginVisual() {
  const rows = [
    { label: "Materiales", budget: 62, real: 74, over: true },
    { label: "Mano de obra", budget: 48, real: 45 },
    { label: "Tercerizaciones", budget: 30, real: 30 },
    { label: "Instalación", budget: 22, real: 14 },
  ];
  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end" aria-hidden>
      <div className="space-y-2.5">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[96px_1fr] items-center gap-3 text-xs">
            <span className="text-ink-soft">{r.label}</span>
            <div className="relative h-2.5 rounded-full bg-canvas ring-1 ring-line">
              <div className="absolute inset-y-0 left-0 rounded-full bg-ink/10" style={{ width: `${r.budget}%` }} />
              <div
                className={cn("absolute inset-y-0 left-0 rounded-full", r.over ? "bg-bad" : "bg-accent")}
                style={{ width: `${r.real}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-line bg-canvas px-5 py-4">
        <div className="text-[11px] font-medium text-ink-faint">Margen proyectado</div>
        <div className="mt-1 flex items-baseline gap-2 tabular">
          <span className="text-sm text-ink-faint line-through">40,0%</span>
          <span className="text-3xl font-semibold tracking-tight text-ink">30,8%</span>
        </div>
        <div className="mt-1 text-[11px] font-medium text-bad">−9,2 pp · Materiales +$ 850.000</div>
      </div>
    </div>
  );
}

function QrVisual() {
  // Patrón fijo que evoca un QR; es decorativo.
  const cells = "1110111010110101011101001101110100010111011101001010111010110".split("");
  return (
    <div className="mt-6 flex items-center gap-4" aria-hidden>
      <div className="grid size-24 grid-cols-8 gap-0.5 rounded-xl bg-white p-2 ring-1 ring-line">
        {cells.concat(cells.slice(0, 3)).map((c, i) => (
          <span key={i} className={cn("rounded-[1px]", c === "1" ? "bg-ink" : "bg-transparent")} />
        ))}
      </div>
      <div className="text-xs text-ink-soft">
        <div className="font-semibold text-ink">P-1042</div>
        Local Palermo
        <div className="mt-2 inline-flex rounded-full bg-good/10 px-2 py-0.5 font-medium text-good">&lt; 30 s</div>
      </div>
    </div>
  );
}

function PurchaseVisual() {
  return (
    <div className="mt-6 space-y-2 text-xs tabular" aria-hidden>
      <div className="flex items-center justify-between rounded-xl bg-canvas px-3 py-2 ring-1 ring-line">
        <span className="text-ink-soft">Compra · 12 placas</span>
        <span className="text-ink-faint">sin impacto</span>
      </div>
      <div className="flex items-center justify-between rounded-xl bg-accent-soft px-3 py-2 ring-1 ring-accent/20">
        <span className="font-medium text-ink">Consumo + desperdicio</span>
        <span className="font-semibold text-accent">$ 500.000</span>
      </div>
    </div>
  );
}

function AlertsVisual() {
  const items = [
    { t: "Materiales +22%", c: "bg-bad" },
    { t: "Margen −9,2 pp", c: "bg-bad" },
    { t: "7 días sin registros", c: "bg-warn" },
  ];
  return (
    <div className="mt-6 space-y-2" aria-hidden>
      {items.map((i) => (
        <div key={i.t} className="flex items-center gap-2 rounded-xl bg-canvas px-3 py-2 text-xs text-ink ring-1 ring-line">
          <span className={cn("size-2 rounded-full", i.c)} /> {i.t}
        </div>
      ))}
    </div>
  );
}

function LeftoversVisual() {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-2 text-xs whitespace-nowrap" aria-hidden>
      <span className="rounded-xl bg-canvas px-3 py-2 font-medium text-ink ring-1 ring-line">P-1042</span>
      <ArrowRight className="size-3.5 text-ink-faint" />
      <span className="rounded-xl bg-good/10 px-3 py-2 font-medium text-good ring-1 ring-good/20">Pool · 2 placas</span>
      <ArrowRight className="size-3.5 text-ink-faint" />
      <span className="rounded-xl bg-canvas px-3 py-2 font-medium text-ink ring-1 ring-line">P-1051</span>
    </div>
  );
}

const VISUALS: Partial<Record<FeatureKey, () => React.ReactNode>> = {
  margin: MarginVisual,
  workshop: QrVisual,
  purchase: PurchaseVisual,
  alerts: AlertsVisual,
  leftovers: LeftoversVisual,
};

export function Features() {
  return (
    <section id="producto" className="scroll-mt-24 py-20 sm:py-24">
      <Container>
        <SectionHeading
          eyebrow="Producto"
          title="Del mundo físico al margen, sin planillas en el medio"
          subtitle="El dashboard es fácil. Lo difícil es capturar lo que pasó en la fábrica. NEXO está diseñado alrededor de eso."
        />
        <div className="mt-14 grid gap-4 md:grid-cols-6">
          {FEATURES.map((f) => {
            const { icon: Icon, span } = META[f.key];
            const Visual = VISUALS[f.key];
            const wide = f.key === "history";
            return (
              <article
                key={f.key}
                className={cn(
                  "group flex flex-col rounded-3xl border border-line bg-white p-7 shadow-[0_1px_2px_rgb(11_13_23/0.04)] transition-shadow hover:shadow-[0_20px_40px_-24px_rgb(39_45_120/0.25)]",
                  span,
                  wide && "md:flex-row md:items-center md:gap-8",
                )}
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                  <Icon className="size-5" aria-hidden />
                </span>
                <div className={cn(!wide && "mt-6")}>
                  <h3 className="text-lg font-semibold tracking-tight text-ink">{f.title}</h3>
                  <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-ink-soft">{f.body}</p>
                </div>
                {Visual && <Visual />}
              </article>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
