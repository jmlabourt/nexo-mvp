"use client";
// Modo demostración local: abrirlo, el rótulo discreto mientras está activo, restaurar el escenario y salir.
// Todo queda en este navegador (store/demo-local.ts); ninguna cuenta ni empresa real cambia.
import { useRef, useState } from "react";
import { Download, FlaskConical, LogOut, RotateCcw, Upload } from "lucide-react";
import { readDemo, backupDemoScenario, createDemoScenario, downloadDemoScenario, parseDemoScenario, restoreDemoScenario, browserStorage } from "@/store/demo-local";
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
  const [importError, setImportError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const exportScenario = () => {
    const data = readDemo();
    if (!data) {
      setImportError("No hay un escenario demo válido para exportar.");
      return;
    }
    const scenario = createDemoScenario(data, "demo-auditoria", undefined, typeof window !== "undefined" ? window.location.origin : undefined);
    if (!downloadDemoScenario(scenario)) {
      setImportError("No se pudo generar el archivo JSON del escenario demo.");
    } else {
      setImportError(null);
    }
  };

  const importScenario = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const raw = await file.text();
      const scenario = parseDemoScenario(raw);
      if (!scenario) {
        setImportError("El archivo no es un escenario demo válido o no coincide con la versión esperada.");
        event.target.value = "";
        return;
      }
      const current = readDemo();
      if (current) {
        const saveBackup = window.confirm("Se generará un respaldo descargable del escenario actual y luego se reemplazará el estado demo. ¿Continuás?");
        if (!saveBackup) {
          event.target.value = "";
          return;
        }
        const backup = backupDemoScenario(browserStorage(), new Date().toISOString());
        if (backup) {
          downloadDemoScenario(backup, `blerp-demo-backup-${Date.now()}.json`);
        } else {
          setImportError("No se pudo crear el respaldo antes de importar. La importación se canceló.");
          event.target.value = "";
          return;
        }
      }
      const ok = restoreDemoScenario(scenario, browserStorage());
      event.target.value = "";
      if (!ok) {
        setImportError("La importación falló: no se pudo guardar el estado demo importado.");
        return;
      }
      setImportError(null);
      window.location.assign("/dashboard?demo=1");
    } catch {
      setImportError("No se pudo leer el archivo de escenario demo.");
      event.target.value = "";
    }
  };

  if (!demoLocal) return null;
  return (
    <>
      <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <span className="flex items-center gap-1.5">
          <FlaskConical className="size-3.5" aria-hidden /> Modo demostración — guardado en este navegador · Datos de ejemplo
        </span>
        <span className="flex gap-1 flex-wrap">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={exportScenario}>
            <Download /> Exportar JSON
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => inputRef.current?.click()}>
            <Upload /> Importar JSON
          </Button>
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
      <input ref={inputRef} type="file" accept="application/json,.json" className="hidden" onChange={importScenario} />
      {importError && <div role="alert" className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{importError}</div>}
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
