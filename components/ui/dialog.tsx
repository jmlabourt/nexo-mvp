"use client";
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  side = "center",
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { side?: "center" | "right" }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px]" />
      <DialogPrimitive.Content
        className={cn(
          "blerp-dialog fixed z-50 flex flex-col bg-white shadow-xl focus:outline-none",
          side === "center" &&
            "left-1/2 top-1/2 max-h-[92dvh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-slate-200 p-4 sm:p-6",
          side === "right" && "inset-y-0 right-0 h-full w-full max-w-xl overflow-y-auto border-l border-slate-200 p-6",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-2 top-2 z-30 flex size-10 items-center justify-center rounded-md bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900">
          <X className="size-4" />
          <span className="sr-only">Cerrar</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("blerp-dialog-header sticky -top-4 z-20 mb-4 flex shrink-0 flex-col gap-1 bg-white pb-3 pr-8 pt-1 sm:-top-6", className)} {...props} />;
}
export function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("text-lg font-semibold text-slate-900", className)} {...props} />;
}
export function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn("text-sm text-slate-500", className)} {...props} />;
}
export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("sticky -bottom-4 z-20 mt-6 flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-200 bg-white py-3 sm:-bottom-6", className)} {...props} />;
}
