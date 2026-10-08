"use client";
import { ArrowRightLeft, Boxes, CircleDot, Flag, Layers, NotebookPen, Package, Receipt, ShoppingCart, TrendingUp, TriangleAlert } from "lucide-react";
import type { ActivityKind, Project } from "@/types";
import { formatDateTime } from "@/lib/formatting";
import { activityTimeline } from "@/lib/activity";

const ICONS: Record<ActivityKind, typeof CircleDot> = {
  created: Flag,
  status: ArrowRightLeft,
  budget: Receipt,
  purchase: ShoppingCart,
  usage: Package,
  cost: Receipt,
  leftover: Layers,
  deviation: TriangleAlert,
  progress: TrendingUp,
  stock: Boxes,
  stage: NotebookPen,
  closed: Flag,
};

export function ActivityTab({ project }: { project: Project }) {
  const events = activityTimeline(project.activity, new Date().toISOString());
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">Del registro más reciente al más antiguo.</p>
      <ol className="relative space-y-4 border-l border-slate-200 pl-6" aria-label="Actividad del proyecto">
        {events.map((e) => {
          const Icon = ICONS[e.kind];
          return (
            <li key={e.id} className="relative">
              <span
                className={`absolute -left-[35px] flex size-6 items-center justify-center rounded-full border bg-white ${e.kind === "deviation" ? "border-red-200 text-red-600" : "border-slate-200 text-slate-500"}`}
                aria-hidden
              >
                <Icon className="size-3.5" />
              </span>
              <p className="text-sm text-slate-800">{e.message}</p>
              <p className="text-xs text-slate-500">
                {e.actor} · {formatDateTime(e.at)}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
