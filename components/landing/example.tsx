import { APP_NAME } from "@/lib/constants";
import { EXAMPLE_STATS } from "@/lib/landing-content";
import { Container, SectionHeading } from "./primitives";

export function Example() {
  return (
    <section className="py-20 sm:py-24">
      <Container>
        <SectionHeading
          eyebrow="Compra ≠ consumo"
          title={
            <>
              Compraste $ 600.000. Al proyecto le corresponden <span className="text-gradient">$ 500.000</span>.
            </>
          }
          subtitle={`Imputar la compra completa infla el costo y esconde el sobrante. ${APP_NAME} separa cada cosa.`}
        />
        <div className="mt-14 grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-line bg-line lg:grid-cols-4">
          {EXAMPLE_STATS.map((s) => (
            <div key={s.label} className="bg-white p-6 sm:p-8">
              <div className="text-4xl font-semibold tracking-[-0.04em] text-ink tabular sm:text-5xl">{s.value}</div>
              <div className="mt-2 text-sm font-medium text-ink">{s.label}</div>
              <div className="mt-1 text-sm text-ink-faint tabular">{s.detail}</div>
            </div>
          ))}
        </div>
        <p className="mt-6 text-center text-sm text-ink-soft">
          <span className="font-semibold text-ink">Costo imputable = consumo + desperdicio.</span> El sobrante se valoriza y
          queda disponible para otro proyecto.
        </p>
      </Container>
    </section>
  );
}
