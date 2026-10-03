import { Quote } from "lucide-react";
import { FINDINGS } from "@/lib/landing-content";
import { Container, SectionHeading } from "./primitives";

/** Reemplaza a los testimonios: son observaciones de las entrevistas, no citas de clientes. */
export function Findings() {
  return (
    <section className="py-20 sm:py-24">
      <Container>
        <SectionHeading
          eyebrow="Investigación"
          title="Lo que vimos en las fábricas"
          subtitle="Empezamos investigando stock y sobrantes. En las entrevistas apareció un patrón que se repetía."
        />
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FINDINGS.map((f) => (
            <figure key={f} className="flex flex-col rounded-3xl border border-line bg-white p-7 shadow-[0_1px_2px_rgb(11_13_23/0.04)]">
              <Quote className="size-5 text-accent" aria-hidden />
              <blockquote className="mt-4 text-[17px] leading-snug font-medium tracking-tight text-ink">{f}</blockquote>
              <figcaption className="mt-auto pt-6 text-xs text-ink-faint">Observación de entrevistas</figcaption>
            </figure>
          ))}
        </div>
      </Container>
    </section>
  );
}
