"use client";
import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn("flex w-full min-w-0 flex-wrap gap-1 border-b border-slate-200", className)}
      {...props}
    />
  );
}
export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "min-h-11 max-w-full border-b-2 border-transparent px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-800 data-[state=active]:border-blue-700 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-800",
        className,
      )}
      {...props}
    />
  );
}
export function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("pt-5 focus:outline-none", className)} {...props} />;
}
