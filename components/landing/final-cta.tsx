import { ArrowRight } from "lucide-react";
import { DEMO_HREF, PILOT_CONTACT_HREF } from "@/lib/landing-content";
import { Container, CtaLink } from "./primitives";

export function FinalCta() {
  return (
    <section className="pb-20 sm:pb-24">
      <Container>
        <div className="relative overflow-hidden rounded-[32px] bg-ink px-6 py-16 text-center text-white sm:px-16 sm:py-24">
          <div className="landing-glow pointer-events-none absolute inset-0" aria-hidden />
          <div className="landing-grid pointer-events-none absolute inset-0 opacity-40 invert" aria-hidden />
          <div className="relative mx-auto max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-[-0.04em] text-balance sm:text-5xl sm:leading-[1.05]">
              ¿Estás ganando lo que pensaste que ibas a ganar?
            </h2>
            <p className="mt-5 text-base text-pretty text-white/65 sm:text-lg">
              Respondelo en menos de 10 segundos. Explorá la demo o sumá tu fábrica al piloto.
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <CtaLink href={DEMO_HREF} variant="light" className="w-full sm:w-auto">
                Explorar la demo <ArrowRight />
              </CtaLink>
              <CtaLink
                href={PILOT_CONTACT_HREF}
                className="w-full border border-white/15 bg-white/5 shadow-none hover:bg-white/10 sm:w-auto"
              >
                Sumarme al piloto
              </CtaLink>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
