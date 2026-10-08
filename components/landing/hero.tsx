import { APP_NAME } from "@/lib/constants";
import { ArrowRight, Play } from "lucide-react";
import { DEMO_HREF, SEGMENTS } from "@/lib/landing-content";
import { Container, CtaLink, Eyebrow } from "./primitives";
import { DashboardMockup } from "./dashboard-mockup";

export function Hero() {
  return (
    <section className="relative -mt-20 overflow-hidden pt-36 sm:pt-44">
      <div className="landing-grid pointer-events-none absolute inset-0" aria-hidden />
      <div className="landing-glow pointer-events-none absolute inset-x-0 top-0 h-[720px]" aria-hidden />

      <Container className="relative">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <div className="animate-fade-up">
            <Eyebrow>Tesis ITBA · Piloto abierto para PyMEs que fabrican por proyecto</Eyebrow>
          </div>
          <h1 className="mt-6 animate-fade-up text-[2.6rem] leading-[1.05] font-semibold tracking-[-0.045em] text-balance text-ink [animation-delay:80ms] sm:text-6xl md:text-7xl">
            Sabé si cada proyecto <span className="text-gradient">sigue siendo rentable</span>
          </h1>
          <p className="mt-6 max-w-xl animate-fade-up text-base leading-relaxed text-pretty text-ink-soft [animation-delay:160ms] sm:text-lg">
            {APP_NAME} conecta lo que presupuestaste con lo que realmente ocurre en el taller, para que veas la rentabilidad mientras se
            fabrica y no cuando ya es tarde.
          </p>
          <div className="mt-9 flex w-full animate-fade-up flex-col items-center justify-center gap-3 [animation-delay:240ms] sm:w-auto sm:flex-row">
            <CtaLink href={DEMO_HREF} className="w-full sm:w-auto">
              Explorar la demo <ArrowRight />
            </CtaLink>
            <CtaLink href="#como-funciona" variant="secondary" className="w-full sm:w-auto">
              <Play className="fill-current" /> Cómo funciona
            </CtaLink>
          </div>
          <p className="mt-4 animate-fade-up text-xs text-ink-faint [animation-delay:300ms]">
            Entrás con tu cuenta de Google · La demo usa datos ficticios de Madera Sur S.R.L.
          </p>
        </div>

        <div className="relative mx-auto mt-14 max-w-5xl animate-fade-up [animation-delay:380ms] sm:mt-20">
          <div className="absolute -inset-x-10 -top-10 bottom-10 rounded-[40px] bg-gradient-to-b from-accent/15 via-violet/10 to-transparent blur-2xl" aria-hidden />
          <DashboardMockup className="relative" />
        </div>
      </Container>

      <div className="relative mt-16 border-y border-line bg-white/60 py-6 sm:mt-24">
        <Container>
          <p className="text-center text-xs font-medium tracking-wide text-ink-faint uppercase">
            Pensado para fábricas que trabajan por proyecto
          </p>
          <ul className="mt-4 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
            {SEGMENTS.map((s) => (
              <li key={s} className="text-[15px] font-semibold tracking-tight text-ink/45">
                {s}
              </li>
            ))}
          </ul>
        </Container>
      </div>
    </section>
  );
}
