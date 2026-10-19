"use client";
// Aviso para el Administrativo mientras la empresa muestra los datos de ejemplo, con el botón para empezar con los
// datos propios. Es la misma acción que "Vaciar todos los datos" de Configuración → Datos, pero a la vista y con
// una confirmación que explica qué se borra y qué se conserva.
import { useState } from "react";
import { Info, Rocket } from "lucide-react";
import { COMPANY_NAME } from "@/lib/constants";
import { useAppStore } from "@/store/use-app-store";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function DemoBanner() {
  const clearData = useAppStore((s) => s.clearData);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    setBusy(true);
    setError("");
    const res = await clearData();
    setBusy(false);
    if (!res.ok) return setError(res.error);
    // La empresa ya no está en modo demo: el aviso desaparece solo.
    setOpen(false);
  }

  return (
    <>
      <div role="status" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
        <p className="flex min-w-0 items-start gap-2">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Estás viendo datos de ejemplo de <strong>{COMPANY_NAME}</strong>. Cuando quieras, empezá con los de tu empresa.
          </span>
        </p>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Rocket /> Empezar con mis datos
        </Button>
      </div>

      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Empezar con tus datos?</DialogTitle>
            <DialogDescription>
              Se borran los proyectos, registros, stock y operarios de ejemplo, y las alertas vuelven a sus valores iniciales. Los usuarios que invitaste se
              conservan. No se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
          <DialogFooter className="mt-4">
            <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cancelar</Button>
            <Button disabled={busy} onClick={() => void start()}>{busy ? "Preparando…" : "Sí, empezar con mis datos"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
