import { STEPS } from "@/lib/landing-content";
import { Container, SectionHeading } from "./primitives";

export function HowItWorks() {
  return (
    <section id="como-funciona" className="scroll-mt-24 py-20 sm:py-24">
      <Container>
        <SectionHeading
          eyebrow="Cómo funciona"
          title="Mundo físico → dato → costo → rentabilidad"
          subtitle="Un flujo simple que separa a quien registra de quien decide."
        />
        <ol className="relative mt-14 grid gap-4 md:grid-cols-4">
          <div
            className="pointer-events-none absolute left-[12.5%] right-[12.5%] top-[38px] hidden h-px bg-gradient-to-r from-accent/0 via-accent/40 to-accent/0 md:block"
            aria-hidden
          />
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative rounded-3xl border border-line bg-white p-6 text-center shadow-[0_1px_2px_rgb(11_13_23/0.04)]">
              <span className="mx-auto flex size-10 items-center justify-center rounded-full bg-ink text-sm font-semibold text-white tabular shadow-[0_0_0_6px_var(--color-canvas)]">
                {i + 1}
              </span>
              <h3 className="mt-5 text-base font-semibold tracking-tight text-ink">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{s.body}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}
