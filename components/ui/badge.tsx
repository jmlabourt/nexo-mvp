import * as React from "react";
import { cn } from "@/lib/utils";
import { TONE_CLASSES, type Tone } from "@/lib/constants";

export function Badge({ tone = "gray", className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 whitespace-normal rounded-md px-2 py-0.5 text-xs font-medium leading-relaxed ring-1 ring-inset",
        TONE_CLASSES[tone].badge,
        className,
      )}
      {...props}
    />
  );
}
