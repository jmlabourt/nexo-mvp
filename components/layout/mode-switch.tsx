"use client";
import { useAppStore } from "@/store/use-app-store";
import { Choice } from "@/components/ui/choice";
import type { AppMode } from "@/types";

/** Rol demo (sin autenticación real). */
export function ModeSwitch() {
  const mode = useAppStore((s) => s.currentMode);
  const setMode = useAppStore((s) => s.setMode);
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium text-slate-500">Modo demo</div>
      <Choice<AppMode>
        name="Modo"
        value={mode}
        onChange={setMode}
        options={[
          { value: "management", label: "Gestión" },
          { value: "workshop", label: "Taller" },
        ]}
      />
    </div>
  );
}
