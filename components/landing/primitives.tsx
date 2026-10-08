import { APP_NAME } from "@/lib/constants";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function Container({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6", className)}>{children}</div>;
}

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-ink-soft shadow-[0_1px_2px_rgb(11_13_23/0.04)]",
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-accent" aria-hidden />
      {children}
    </span>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  className,
}: {
  eyebrow: string;
  title: React.ReactNode;
  subtitle?: string;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto flex max-w-2xl flex-col items-center text-center", className)}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-5 text-3xl font-semibold tracking-[-0.035em] text-balance text-ink sm:text-[2.75rem] sm:leading-[1.1]">
        {title}
      </h2>
      {subtitle && <p className="mt-4 text-base leading-relaxed text-pretty text-ink-soft sm:text-lg">{subtitle}</p>}
    </div>
  );
}

const CTA_VARIANTS = {
  primary:
    "bg-ink text-white shadow-[0_1px_0_rgb(255_255_255/0.15)_inset,0_8px_20px_-6px_rgb(11_13_23/0.45)] hover:bg-ink/90",
  secondary: "border border-line bg-white text-ink shadow-[0_1px_2px_rgb(11_13_23/0.05)] hover:bg-canvas",
  light: "bg-white text-ink hover:bg-white/90",
};

export function CtaLink({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
}: {
  href: string;
  variant?: keyof typeof CTA_VARIANTS;
  size?: "sm" | "md";
  className?: string;
  children: React.ReactNode;
}) {
  const classes = cn(
    "inline-flex items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap transition-[background-color,transform] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&_svg]:size-4",
    size === "sm" ? "h-9 px-4 text-sm" : "h-12 px-6 text-[15px]",
    CTA_VARIANTS[variant],
    className,
  );
  if (href.startsWith("/")) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} className={classes}>
      {children}
    </a>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-[17px] font-semibold tracking-tight text-ink", className)}>
      <span
        className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-violet text-white shadow-[0_4px_12px_-2px_rgb(79_91_255/0.5)]"
        aria-hidden
      >
        <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M4 2v12h5a3 3 0 0 0 0-6H4h4a3 3 0 0 0 0-6H4" />
        </svg>
      </span>
      {APP_NAME}
    </span>
  );
}
