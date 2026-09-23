import { Check } from "lucide-react";
import type { ProjectStatus } from "@/types";
import { STATUS_LABELS, STATUS_ORDER } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function StatusTimeline({ status }: { status: ProjectStatus }) {
  const idx = STATUS_ORDER.indexOf(status);
  return (
    <ol className="flex w-full items-center gap-1 overflow-x-auto" aria-label="Etapas del proyecto">
      {STATUS_ORDER.map((s, i) => {
        const done = i < idx || status === "completed";
        const current = i === idx;
        return (
          <li key={s} className="flex min-w-24 flex-1 items-center gap-1" aria-current={current ? "step" : undefined}>
            <div
              className={cn(
                "flex flex-1 items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium",
                current ? "bg-blue-700 text-white" : done ? "bg-blue-50 text-blue-800" : "bg-slate-100 text-slate-500",
              )}
            >
              {done && !current ? <Check className="size-3.5" aria-hidden /> : <span className="tabular">{i + 1}</span>}
              {STATUS_LABELS[s]}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
