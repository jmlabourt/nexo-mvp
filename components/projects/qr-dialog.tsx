"use client";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { ExternalLink, Printer } from "lucide-react";
import type { Project } from "@/types";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function QrDialog({ project, open, onOpenChange }: { project: Project; open: boolean; onOpenChange: (o: boolean) => void }) {
  const path = `/registro/${project.id}`;
  const url = typeof window !== "undefined" ? `${window.location.origin}${path}` : path;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>QR del proyecto</DialogTitle>
          <DialogDescription>Pegá este QR en la orden de producción. Al escanearlo se abrirá directamente el registro de este proyecto.</DialogDescription>
        </DialogHeader>
        <div id="qr-print" className="flex flex-col items-center rounded-lg border border-slate-200 p-6 text-center">
          <div className="text-sm font-medium text-slate-500">{project.code}</div>
          <div className="text-lg font-semibold text-slate-900">{project.name}</div>
          <div className="mb-4 text-sm text-slate-500">{project.client}</div>
          <QRCodeSVG value={url} size={200} marginSize={2} title={`QR de registro para ${project.code}`} />
          <div className="mt-3 break-all text-xs text-slate-400">{url}</div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer /> Imprimir
          </Button>
          <Button asChild>
            <Link href={path} target="_blank">
              <ExternalLink /> Abrir registro de taller
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
