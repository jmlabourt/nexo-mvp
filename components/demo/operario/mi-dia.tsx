"use client";
// Operario → Mi día (modo demostración). Una sola pantalla, pensada para el celular: la persona y la fecha vienen
// solas; aparecen las tareas que asignó Planta (OT → mueble → rubro) y se cargan las horas trabajadas. Se puede cambiar
// a otra tarea válida o sumar Trabajo interno. Sin horas planificadas, precios, materiales ni rentabilidad.
import { useMemo, useState } from "react";
import { CheckCircle2, Plus, Trash2 } from "lucide-react";
import { APP_NAME } from "@/lib/constants";
import { enabledRubros } from "@/lib/core/needs";
import { clientName, itemName, rubroName } from "@/lib/core/lookup";
import { myDayTasks, isPlantProject } from "@/lib/core/plant";
import { saveDayHours } from "@/lib/core/ops";
import { r2, sumBy } from "@/lib/core/util";
import { ModeSwitch } from "@/components/layout/mode-switch";
import { LocalDemoBar } from "@/components/layout/local-demo";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { day, num2, useAct, useCore, useDemoToday, useSessionPerson } from "../kit";

interface Row {
  key: number;
  projectId: string;
  itemId: string;
  rubroId: string;
  hours: string;
}

const INTERNAL = "interno";

export function MiDiaDemo() {
  const w = useCore();
  const today = useDemoToday();
  const person = useSessionPerson();
  const act = useAct();
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");

  const existing = useMemo(() => w.timeEntries.filter((t) => t.employeeId === person?.id && t.date === today), [w, person, today]);
  const reviewed = existing.some((t) => t.review);
  const initial = useMemo<Row[]>(() => {
    if (!person) return [];
    const saved = existing.map((t, i) => ({ key: i, projectId: t.projectId ?? INTERNAL, itemId: t.itemId ?? "", rubroId: t.rubroId ?? "", hours: String(t.hours).replace(".", ",") }));
    // Las tareas asignadas que todavía no tienen horas cargadas aparecen vacías.
    const pending = myDayTasks(w, person.id, today)
      .filter((t) => !existing.some((e) => e.projectId === t.projectId && e.itemId === t.itemId && e.rubroId === t.rubroId))
      .map((t, i) => ({ key: saved.length + i, projectId: t.projectId, itemId: t.itemId, rubroId: t.rubroId, hours: "" }));
    return [...saved, ...pending];
  }, [w, person, today, existing]);
  const [rows, setRows] = useState<Row[] | null>(null);
  const list = rows ?? initial;
  const projects = w.projects.filter(isPlantProject);
  const total = r2(sumBy(list, (r) => (Number.isFinite(num2(r.hours)) ? num2(r.hours) : 0)));

  const update = (key: number, patch: Partial<Row>) => {
    setSaved("");
    setRows(list.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  function save() {
    setError("");
    if (!person) return;
    const bad = list.find((r) => r.hours.trim() !== "" && !Number.isFinite(num2(r.hours)));
    if (bad) return setError("Revisá las horas: escribí un número (por ejemplo 7,5).");
    const res = act((cw, ctx) =>
      saveDayHours(
        cw,
        {
          employeeId: person.id,
          date: today,
          rows: list
            .filter((r) => r.hours.trim() !== "" && num2(r.hours) > 0)
            .map((r) => (r.projectId === INTERNAL ? { hours: num2(r.hours) } : { projectId: r.projectId, itemId: r.itemId || undefined, rubroId: r.rubroId || undefined, hours: num2(r.hours) })),
        },
        ctx,
      ),
    );
    if (!res.ok) return setError(res.error);
    setRows(null);
    setSaved(`Listo: guardaste ${String(total).replace(".", ",")} h de hoy.`);
  }

  return (
    <div className="mx-auto min-h-screen max-w-md bg-white px-4 pb-12">
      <header className="flex items-center justify-between gap-3 py-4">
        <div className="min-w-0">
          <div className="text-lg font-semibold tracking-tight">{APP_NAME}</div>
          <div className="break-words text-xs text-slate-500">Mi día{person ? ` · ${person.name}` : ""}</div>
        </div>
      </header>
      {!person ? (
        <p className="rounded-md bg-amber-50 p-4 text-sm text-amber-900">No hay operarios activos en la demo.</p>
      ) : (
        <>
          <h1 className="text-2xl font-semibold">Hoy, {day(today)}</h1>
          {saved && (
            <p role="status" className="mt-3 flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden /> {saved}
            </p>
          )}
          {reviewed && <p className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-slate-700">Planta ya revisó este día. Si hay que cambiar algo, pedíselo al Jefe de planta.</p>}
          <section aria-label="Tareas de hoy" className="mt-4 space-y-3">
            {list.length === 0 && <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-600">Hoy no tenés tareas asignadas. Podés cargar lo que hiciste con “Agregar tarea”.</p>}
            {list.map((r, i) => {
              const p = w.projects.find((x) => x.id === r.projectId);
              const rubros = p && r.itemId ? enabledRubros(w, p, r.itemId) : [];
              return (
                <div key={r.key} className="space-y-2 rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-500">Tarea {i + 1}</span>
                    {!reviewed && (
                      <button type="button" aria-label={`Quitar tarea ${i + 1}`} className="text-slate-400 hover:text-red-600" onClick={() => setRows(list.filter((x) => x.key !== r.key))}>
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </div>
                  <Select aria-label={`OT de la tarea ${i + 1}`} value={r.projectId} disabled={reviewed} onChange={(e) => update(r.key, { projectId: e.target.value, itemId: "", rubroId: "" })}>
                    <option value="">Elegí la OT…</option>
                    {projects.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.ot.split("_")[0]} · {clientName(w, x.clientId)}
                      </option>
                    ))}
                    <option value={INTERNAL}>Trabajo interno (limpieza, orden, mantenimiento…)</option>
                  </Select>
                  {p && (
                    <div className="grid grid-cols-2 gap-2">
                      <Select aria-label={`Mueble de la tarea ${i + 1}`} value={r.itemId} disabled={reviewed} onChange={(e) => update(r.key, { itemId: e.target.value, rubroId: "" })}>
                        <option value="">Mueble…</option>
                        {p.items.map((it) => (
                          <option key={it.id} value={it.id}>
                            {it.name}
                          </option>
                        ))}
                      </Select>
                      <Select aria-label={`Rubro de la tarea ${i + 1}`} value={r.rubroId} disabled={reviewed || !r.itemId} onChange={(e) => update(r.key, { rubroId: e.target.value })}>
                        <option value="">Rubro…</option>
                        {rubros.map((rb) => (
                          <option key={rb} value={rb}>
                            {rubroName(w, rb)}
                          </option>
                        ))}
                      </Select>
                    </div>
                  )}
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    Horas trabajadas
                    <Input inputMode="decimal" className="h-12 w-28 text-lg" aria-label={`Horas trabajadas en la tarea ${i + 1}`} value={r.hours} disabled={reviewed} onChange={(e) => update(r.key, { hours: e.target.value })} />
                  </label>
                  {p && r.itemId && <p className="text-xs text-slate-500">{p.ot.split("_")[0]} · {itemName(p, r.itemId)}{r.rubroId ? ` · ${rubroName(w, r.rubroId)}` : ""}</p>}
                </div>
              );
            })}
          </section>
          {!reviewed && (
            <div className="mt-4 space-y-3">
              <Button variant="outline" className="w-full" onClick={() => setRows([...list, { key: Date.now(), projectId: "", itemId: "", rubroId: "", hours: "" }])}>
                <Plus /> Agregar tarea
              </Button>
              <div className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm">
                <span className="text-slate-600">Total del día</span>
                <strong className="tabular">{String(total).replace(".", ",")} h</strong>
              </div>
              {error && (
                <p role="alert" className="text-sm text-red-600">
                  {error}
                </p>
              )}
              <Button size="xl" className="w-full" onClick={save}>
                Guardar registro del día
              </Button>
            </div>
          )}
        </>
      )}
      <div className="mt-10 space-y-3 border-t border-slate-200 pt-4">
        <LocalDemoBar />
        <ModeSwitch />
      </div>
    </div>
  );
}
