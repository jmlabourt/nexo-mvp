import { CircleAlert, CircleCheck, Info } from "lucide-react";
import type { Insight } from "@/lib/insights";

export function InsightList({ insights, empty = "Sin observaciones por ahora." }: { insights: Insight[]; empty?: string }) {
  if (insights.length === 0) return <p className="text-sm text-slate-500">{empty}</p>;
  return (
    <ul className="space-y-2">
      {insights.map((i, idx) => {
        const Icon = i.tone === "negative" ? CircleAlert : i.tone === "positive" ? CircleCheck : Info;
        const color = i.tone === "negative" ? "text-red-600" : i.tone === "positive" ? "text-emerald-600" : "text-blue-600";
        return (
          <li key={idx} className="flex gap-2 text-sm text-slate-700">
            <Icon className={`mt-0.5 size-4 shrink-0 ${color}`} aria-hidden />
            <span>{i.text}</span>
          </li>
        );
      })}
    </ul>
  );
}
