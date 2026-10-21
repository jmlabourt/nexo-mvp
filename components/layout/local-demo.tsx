"use client";
// Modo demostración local: abrirlo, el rótulo discreto mientras está activo, restaurar el escenario y salir.
// Todo queda en este navegador (store/demo-local.ts); ninguna cuenta ni empresa real cambia.
import { useState } from "react";
import { FlaskConical, LogOut, RotateCcw } from "lucide-react";
import { useAppStore } from "@/store/use-app-store";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Para un usuario con su empresa real: abre el modo demostración (no toca sus datos). */
export function OpenLocalDemoButton() {
  const demoLocal = useAppStore((s) => s.demoLocal);
  const enter = useAppStore((s) => s.enterLocalDemo);
  if (demoLocal) return null;
  return (
    <Button
      variant="ghost"
      size="sm"
      className="w-full justify-start text-slate-500"
      onClick={() => {
        enter();
        window.location.assign("/dashboard");
      }}
    >
      <FlaskConical /> Abrir modo demostración
    </Button>
  );
}

/** Rótulo discreto mientras se usa la demo, con "Restaurar datos de prueba" y "Salir". */
export function LocalDemoBar() {
  const demoLocal = useAppStore((s) => s.demoLocal);
  const restore = useAppStore((s) => s.restoreLocalDemo);
  const exit = useAppStore((s) => s.exitLocalDemo);
  const [confirm, setConfirm] = useState(false);
  if (!demoLocal) return null;
  return (
    <>
      <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <span className="flex items-center gap-1.5">
          <FlaskConical className="size-3.5" aria-hidden /> Modo demostración — guardado en este navegador · Datos de ejemplo
        </span>
        <span className="flex gap-1">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setConfirm(true)}>
            <RotateCcw /> Restaurar datos de prueba
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              exit();
              window.location.assign("/dashboard");
            }}
          >
            <LogOut /> Salir de la demostración
          </Button>
        </span>
      </div>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Restaurar los datos de prueba?</DialogTitle>
            <DialogDescription>
              Se pierden los cambios hechos en esta demostración y vuelve el escenario inicial. Solo afecta a este navegador: ninguna empresa real cambia.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)}>Cancelar</Button>
            <Button
              onClick={() => {
                restore();
                setConfirm(false);
              }}
            >
              Restaurar datos de prueba
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
