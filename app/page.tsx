import { APP_NAME } from "@/lib/constants";
import type { Metadata } from "next";
import { Navbar } from "@/components/landing/navbar";
import { Hero } from "@/components/landing/hero";
import { Problem } from "@/components/landing/problem";
import { Features } from "@/components/landing/features";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Modes } from "@/components/landing/modes";
import { Example } from "@/components/landing/example";
import { Findings } from "@/components/landing/findings";
import { Pilot } from "@/components/landing/pilot";
import { Faq } from "@/components/landing/faq";
import { FinalCta } from "@/components/landing/final-cta";
import { Footer } from "@/components/landing/footer";

export const metadata: Metadata = {
  title: `${APP_NAME} · Sabé si cada proyecto sigue siendo rentable`,
  description:
    `${APP_NAME} conecta lo que presupuestaste con lo que realmente ocurre en el taller, para que PyMEs que fabrican por proyecto vean el margen mientras se fabrica.`,
};

export default function LandingPage() {
  return (
    <div className="landing min-h-screen">
      <Navbar />
      <main>
        <Hero />
        <Problem />
        <Features />
        <HowItWorks />
        <Modes />
        <Example />
        <Findings />
        <Pilot />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
