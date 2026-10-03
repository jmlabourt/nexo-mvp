import Link from "next/link";
import { ArrowRight, Menu } from "lucide-react";
import { DEMO_HREF, NAV_LINKS } from "@/lib/landing-content";
import { CtaLink, Logo } from "./primitives";

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 px-3 pt-3 sm:px-6 sm:pt-4">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 rounded-full border border-line/80 bg-white/75 pl-5 pr-2 shadow-[0_8px_30px_-12px_rgb(11_13_23/0.15)] backdrop-blur-xl">
        <Link href="/" aria-label="NEXO, inicio">
          <Logo />
        </Link>
        <nav aria-label="Secciones" className="mx-auto hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="rounded-full px-3.5 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-canvas hover:text-ink"
            >
              {l.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <CtaLink href={DEMO_HREF} size="sm" className="hidden sm:inline-flex">
            Ver la demo <ArrowRight />
          </CtaLink>
          <details className="group relative md:hidden">
            <summary
              className="flex size-10 cursor-pointer list-none items-center justify-center rounded-full text-ink hover:bg-canvas [&::-webkit-details-marker]:hidden"
              aria-label="Abrir menú"
            >
              <Menu className="size-5" />
            </summary>
            <div className="absolute right-0 top-12 w-60 rounded-2xl border border-line bg-white p-2 shadow-xl">
              {NAV_LINKS.map((l) => (
                <a key={l.href} href={l.href} className="block rounded-xl px-3 py-2.5 text-sm font-medium text-ink hover:bg-canvas">
                  {l.label}
                </a>
              ))}
              <CtaLink href={DEMO_HREF} size="sm" className="mt-2 w-full">
                Ver la demo <ArrowRight />
              </CtaLink>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
