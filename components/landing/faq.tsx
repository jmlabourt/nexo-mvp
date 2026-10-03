import { Plus } from "lucide-react";
import { FAQS } from "@/lib/landing-content";
import { Container, SectionHeading } from "./primitives";

export function Faq() {
  return (
    <section id="preguntas" className="scroll-mt-24 py-20 sm:py-24">
      <Container>
        <SectionHeading eyebrow="Preguntas" title="Preguntas frecuentes" />
        <div className="mx-auto mt-14 max-w-3xl space-y-3">
          {FAQS.map((f) => (
            <details
              key={f.q}
              className="group rounded-2xl border border-line bg-white px-6 shadow-[0_1px_2px_rgb(11_13_23/0.04)] open:shadow-[0_20px_40px_-28px_rgb(39_45_120/0.3)]"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-left text-base font-semibold tracking-tight text-ink [&::-webkit-details-marker]:hidden">
                {f.q}
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-canvas ring-1 ring-line transition-transform group-open:rotate-45">
                  <Plus className="size-4" aria-hidden />
                </span>
              </summary>
              <p className="pb-6 text-[15px] leading-relaxed text-ink-soft">{f.a}</p>
            </details>
          ))}
        </div>
      </Container>
    </section>
  );
}
