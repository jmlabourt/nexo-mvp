"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Clock, Package, Receipt } from "lucide-react";
import type { ActualEntryType, MaterialSource } from "@/types";
import { ACTUAL_TYPE_LABELS, APP_NAME, DEMO_USERS, OTHER_MATERIAL_ID, SOURCE_LABELS } from "@/lib/constants";
import { projectMaterialOptions } from "@/lib/material-options";
import { materialKey, slugify } from "@/lib/material-reconciliation";
import { poolAvailableFor } from "@/lib/reusable-pool";
import { resolveHourlyCost } from "@/lib/project-operations";
import { parseDecimal } from "@/lib/schemas";
import { formatQty, todayISO } from "@/lib/formatting";
import { useAppStore, useProject } from "@/store/use-app-store";
import { Button } from "@/components/ui/button";
import { Choice } from "@/components/ui/choice";
import { Input } from "@/components/ui/input";
import { QuantityInput } from "./quantity-input";
import { cn } from "@/lib/utils";

type View = "menu" | "material" | "hours" | "other" | "done";
const ACTOR = DEMO_USERS.workshop.name;

export function WorkshopRecorder({ projectId }: { projectId: string }) {
  const project = useProject(projectId);
  const [view, setView] = useState<View>("menu");
  const [lastSummary, setLastSummary] = useState("");

  if (!project) {
    return (
      <Shell>
        <p className="py-10 text-center text-slate-600">No encontramos este proyecto. Revisá el QR.</p>
      </Shell>
    );
  }

  const done = (summary: string) => {
    setLastSummary(summary);
    setView("done");
    window.scrollTo({ top: 0 });
  };

  return (
    <Shell>
      <div className="mb-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="text-sm font-medium text-slate-500">Proyecto {project.code}</div>
        <div className="text-lg font-semibold leading-snug text-slate-900">{project.name}</div>
      </div>

      {project.isClosed ? (
        <p className="rounded-md bg-slate-100 p-4 text-slate-700">Este proyecto ya está cerrado y no admite registros.</p>
      ) : view === "menu" ? (
        <div>
          <h1 className="mb-4 text-2xl font-semibold">¿Qué querés registrar?</h1>
          <div className="grid gap-3">
            <BigOption icon={Package} label="Material" hint="Placas, perfiles, herrajes…" onClick={() => setView("material")} />
            <BigOption icon={Clock} label="Horas" hint="Horas trabajadas en el proyecto" onClick={() => setView("hours")} />
            <BigOption icon={Receipt} label="Otro costo" hint="Flete, tercerización, imprevisto…" onClick={() => setView("other")} />
          </div>
        </div>
      ) : view === "done" ? (
        <div className="flex flex-col items-center py-8 text-center" role="status">
          <CheckCircle2 className="mb-3 size-16 text-emerald-600" aria-hidden />
          <h1 className="text-2xl font-semibold">✓ Registrado correctamente</h1>
          <p className="mt-2 text-slate-600">{lastSummary}</p>
          <Button size="xl" className="mt-8 w-full" onClick={() => setView("menu")}>
            Registrar otra cosa
          </Button>
        </div>
      ) : (
        <div>
          <button type="button" onClick={() => setView("menu")} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-blue-700">
            <ArrowLeft className="size-4" /> Volver
          </button>
          {view === "material" && <MaterialFlow projectId={projectId} onDone={done} />}
          {view === "hours" && <HoursFlow projectId={projectId} onDone={done} />}
          {view === "other" && <OtherFlow projectId={projectId} onDone={done} />}
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const setMode = useAppStore((s) => s.setMode);
  const mode = useAppStore((s) => s.currentMode);
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-md px-4 pb-16">
        <header className="flex items-center justify-between py-4">
          <span className="text-lg font-semibold tracking-tight">{APP_NAME}</span>
          {mode === "management" ? (
            <Link href="/" className="text-sm text-blue-700" onClick={() => setMode("management")}>
              Ir a gestión
            </Link>
          ) : (
            <Link href="/" className="text-sm text-blue-700">
              Proyectos
            </Link>
          )}
        </header>
        {children}
      </div>
    </div>
  );
}

function BigOption({ icon: Icon, label, hint, onClick }: { icon: typeof Package; label: string; hint: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-20 items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm active:bg-slate-50">
      <span className="flex size-12 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
        <Icon className="size-6" aria-hidden />
      </span>
      <span>
        <span className="block text-lg font-semibold text-slate-900">{label}</span>
        <span className="block text-sm text-slate-500">{hint}</span>
      </span>
    </button>
  );
}

function YesNo({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-base font-medium text-slate-800">{label}</legend>
      <Choice<"no" | "si">
        name={label}
        size="lg"
        value={value ? "si" : "no"}
        onChange={(v) => onChange(v === "si")}
        options={[
          { value: "no", label: "No" },
          { value: "si", label: "Sí" },
        ]}
      />
    </fieldset>
  );
}

function positive(v: string) {
  const n = parseDecimal(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ── Material ──────────────────────────────────────────────────
function MaterialFlow({ projectId, onDone }: { projectId: string; onDone: (s: string) => void }) {
  const project = useProject(projectId)!;
  const pool = useAppStore((s) => s.reusableMaterials);
  const addMaterialUsage = useAppStore((s) => s.addMaterialUsage);
  const options = useMemo(() => projectMaterialOptions(project), [project]);

  const [materialId, setMaterialId] = useState("");
  const [customName, setCustomName] = useState("");
  const [customUnit, setCustomUnit] = useState("u");
  const [source, setSource] = useState<MaterialSource>("purchased_for_project");
  const [reusableId, setReusableId] = useState("");
  const [qty, setQty] = useState("");
  const [hasWaste, setHasWaste] = useState(false);
  const [waste, setWaste] = useState("");
  const [hasLeftover, setHasLeftover] = useState(false);
  const [leftover, setLeftover] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isOther = materialId === OTHER_MATERIAL_ID;
  const selected = options.find((o) => o.id === materialId);
  const unit = isOther ? customUnit || "u" : selected?.unit ?? "u";
  const resolvedId = isOther ? materialKey(undefined, customName) : materialId;
  const poolItems = materialId && !isOther ? poolAvailableFor(pool, materialId) : [];

  const submit = () => {
    const e: Record<string, string> = {};
    const q = parseDecimal(qty || "0");
    const w = hasWaste ? positive(waste) : 0;
    const l = hasLeftover ? positive(leftover) : 0;
    if (!materialId) e.material = "Elegí un material";
    if (isOther && customName.trim().length < 2) e.customName = "Escribí el nombre del material";
    if (!Number.isFinite(q) || q < 0) e.qty = "Cantidad inválida";
    if (hasWaste && w === null) e.waste = "Indicá cuánto se desperdició";
    if (hasLeftover && l === null) e.leftover = "Indicá cuánto quedó reutilizable";
    if (Number.isFinite(q) && q + (w ?? 0) <= 0) e.qty = "Indicá cuánto usaste";
    if (source === "reused_leftover" && !reusableId) e.reusable = "Elegí qué sobrante usaste";
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    const name = isOther ? customName.trim() : selected!.name;
    const res = addMaterialUsage(
      projectId,
      {
        materialId: isOther ? `custom:${slugify(customName)}` : resolvedId,
        materialName: name,
        unit,
        source,
        reusableMaterialId: source === "reused_leftover" ? reusableId : undefined,
        quantityConsumed: q,
        wasteQuantity: w ?? 0,
        reusableLeftoverQuantity: l ?? 0,
        date: todayISO(),
      },
      ACTOR,
    );
    if (!res.ok) {
      setErrors({ form: res.error });
      return;
    }
    const parts = [`${formatQty(q, unit)} de ${name}`];
    if (w) parts.push(`${formatQty(w, unit)} de desperdicio`);
    if (l) parts.push(`${formatQty(l, unit)} reutilizable`);
    onDone(parts.join(" · "));
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Material utilizado</h1>

      <fieldset>
        <legend className="mb-2 text-base font-medium text-slate-800">¿Qué material?</legend>
        <div className="grid gap-2" role="radiogroup" aria-label="Material">
          {[...options, { id: OTHER_MATERIAL_ID, name: "Otro material", unit: "u", inBudget: false }].map((o) => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={materialId === o.id}
              onClick={() => {
                setMaterialId(o.id);
                setReusableId("");
                if (source === "reused_leftover") setSource("purchased_for_project");
              }}
              className={cn(
                "flex min-h-12 items-center justify-between rounded-md border px-4 py-3 text-left text-base",
                materialId === o.id ? "border-blue-600 bg-blue-50 font-medium text-blue-900 ring-1 ring-blue-600" : "border-slate-300 bg-white",
              )}
            >
              {o.name}
              {o.inBudget && <span className="text-xs text-slate-500">del proyecto</span>}
            </button>
          ))}
        </div>
        {errors.material && <p role="alert" className="mt-1 text-sm text-red-600">{errors.material}</p>}
      </fieldset>

      {isOther && (
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <label htmlFor="w-custom" className="mb-1.5 block text-sm font-medium">Nombre</label>
            <Input id="w-custom" className="h-12 text-base" value={customName} onChange={(e) => setCustomName(e.target.value)} aria-invalid={!!errors.customName} />
            {errors.customName && <p role="alert" className="mt-1 text-sm text-red-600">{errors.customName}</p>}
          </div>
          <div>
            <label htmlFor="w-unit" className="mb-1.5 block text-sm font-medium">Unidad</label>
            <Input id="w-unit" className="h-12 text-base" value={customUnit} onChange={(e) => setCustomUnit(e.target.value)} />
          </div>
        </div>
      )}

      {materialId && (
        <>
          <fieldset>
            <legend className="mb-2 text-base font-medium text-slate-800">¿De dónde salió?</legend>
            <Choice<MaterialSource>
              name="Origen"
              columns={1}
              size="lg"
              value={source}
              onChange={setSource}
              options={(["purchased_for_project", "existing_stock", "reused_leftover"] as MaterialSource[])
                .filter((s) => s !== "reused_leftover" || poolItems.length > 0)
                .map((s) => ({ value: s, label: SOURCE_LABELS[s] }))}
            />
          </fieldset>

          {source === "reused_leftover" && (
            <fieldset>
              <legend className="mb-2 text-base font-medium text-slate-800">¿Qué sobrante usaste?</legend>
              <div className="grid gap-2">
                {poolItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={reusableId === item.id}
                    onClick={() => setReusableId(item.id)}
                    className={cn(
                      "rounded-md border px-4 py-3 text-left",
                      reusableId === item.id ? "border-blue-600 bg-blue-50 ring-1 ring-blue-600" : "border-slate-300",
                    )}
                  >
                    <div className="font-medium">{formatQty(item.quantity, item.unit)} disponibles</div>
                    <div className="text-sm text-slate-500">Quedó de {item.originProjectName}</div>
                  </button>
                ))}
              </div>
              {errors.reusable && <p role="alert" className="mt-1 text-sm text-red-600">{errors.reusable}</p>}
            </fieldset>
          )}

          <QuantityInput id="w-qty" label="Cantidad utilizada" value={qty} onChange={setQty} unit={unit} error={errors.qty} />

          <YesNo label="¿Hubo desperdicio?" value={hasWaste} onChange={setHasWaste} />
          {hasWaste && (
            <QuantityInput id="w-waste" label="Cantidad desperdiciada" value={waste} onChange={setWaste} unit={unit} step={0.1} error={errors.waste} />
          )}

          <YesNo label="¿Quedó material reutilizable?" value={hasLeftover} onChange={setHasLeftover} />
          {hasLeftover && (
            <QuantityInput id="w-left" label="Cantidad reutilizable" value={leftover} onChange={setLeftover} unit={unit} step={0.1} error={errors.leftover} />
          )}

          {errors.form && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{errors.form}</p>}
          <Button size="xl" className="w-full" onClick={submit}>
            Guardar
          </Button>
        </>
      )}
    </div>
  );
}

// ── Horas ─────────────────────────────────────────────────────
const ROLES = ["Carpintería", "Armado", "Oficina técnica", "Pintura", "Instalación"];

function HoursFlow({ projectId, onDone }: { projectId: string; onDone: (s: string) => void }) {
  const project = useProject(projectId)!;
  const addActualEntry = useAppStore((s) => s.addActualEntry);
  const [role, setRole] = useState("");
  const [worker, setWorker] = useState("");
  const [hours, setHours] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = () => {
    const e: Record<string, string> = {};
    const h = positive(hours);
    if (!role) e.role = "Elegí la tarea";
    if (h === null || h > 24 * 7) e.hours = "Indicá las horas (máx. 168)";
    setErrors(e);
    if (Object.keys(e).length) return;
    const res = addActualEntry(
      projectId,
      {
        type: "labor",
        description: "",
        date: todayISO(),
        // El costo/hora lo define gestión (tarifa presupuestada); el taller no lo ve.
        labor: { role, workerName: worker.trim() || undefined, hours: h!, hourlyCost: resolveHourlyCost(project) },
      },
      worker.trim() || ACTOR,
    );
    if (!res.ok) return setErrors({ form: res.error });
    onDone(`${formatQty(h!, "h")} de ${role}${worker.trim() ? ` · ${worker.trim()}` : ""}`);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Horas trabajadas</h1>
      <fieldset>
        <legend className="mb-2 text-base font-medium">¿Qué tarea?</legend>
        <div className="grid grid-cols-2 gap-2">
          {ROLES.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={role === r}
              onClick={() => setRole(r)}
              className={cn("min-h-12 rounded-md border px-3 text-base", role === r ? "border-blue-600 bg-blue-50 font-medium ring-1 ring-blue-600" : "border-slate-300")}
            >
              {r}
            </button>
          ))}
        </div>
        {errors.role && <p role="alert" className="mt-1 text-sm text-red-600">{errors.role}</p>}
      </fieldset>
      <div>
        <label htmlFor="w-worker" className="mb-1.5 block text-sm font-medium">¿Quién? (opcional)</label>
        <Input id="w-worker" className="h-12 text-base" value={worker} onChange={(e) => setWorker(e.target.value)} placeholder="Nombre" />
      </div>
      <QuantityInput id="w-hours" label="Horas" value={hours} onChange={setHours} unit="h" step={0.5} error={errors.hours} />
      {errors.form && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{errors.form}</p>}
      <Button size="xl" className="w-full" onClick={submit}>Guardar</Button>
    </div>
  );
}

// ── Otro costo ────────────────────────────────────────────────
const OTHER_TYPES: Exclude<ActualEntryType, "labor">[] = ["outsourcing", "finishing", "logistics", "installation", "unexpected", "other"];

function OtherFlow({ projectId, onDone }: { projectId: string; onDone: (s: string) => void }) {
  const addActualEntry = useAppStore((s) => s.addActualEntry);
  const [type, setType] = useState<Exclude<ActualEntryType, "labor"> | "">("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = () => {
    const e: Record<string, string> = {};
    const a = positive(amount.replace(/\./g, ""));
    if (!type) e.type = "Elegí el tipo";
    if (description.trim().length < 2) e.description = "Contá brevemente qué fue";
    if (a === null) e.amount = "Indicá el monto pagado";
    setErrors(e);
    if (Object.keys(e).length || !type) return;
    const res = addActualEntry(projectId, { type, description: description.trim(), amount: a!, date: todayISO() }, ACTOR);
    if (!res.ok) return setErrors({ form: res.error });
    onDone(`${ACTUAL_TYPE_LABELS[type]}: ${description.trim()}`);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Otro costo</h1>
      <fieldset>
        <legend className="mb-2 text-base font-medium">¿Qué fue?</legend>
        <div className="grid grid-cols-2 gap-2">
          {OTHER_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={type === t}
              onClick={() => setType(t)}
              className={cn("min-h-12 rounded-md border px-3 text-base", type === t ? "border-blue-600 bg-blue-50 font-medium ring-1 ring-blue-600" : "border-slate-300")}
            >
              {ACTUAL_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
        {errors.type && <p role="alert" className="mt-1 text-sm text-red-600">{errors.type}</p>}
      </fieldset>
      <div>
        <label htmlFor="w-desc" className="mb-1.5 block text-sm font-medium">Descripción</label>
        <Input id="w-desc" className="h-12 text-base" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ej.: flete extra a obra" aria-invalid={!!errors.description} />
        {errors.description && <p role="alert" className="mt-1 text-sm text-red-600">{errors.description}</p>}
      </div>
      <div>
        <label htmlFor="w-amount" className="mb-1.5 block text-sm font-medium">Monto pagado ($)</label>
        <Input id="w-amount" inputMode="numeric" className="h-12 text-base" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={!!errors.amount} />
        {errors.amount && <p role="alert" className="mt-1 text-sm text-red-600">{errors.amount}</p>}
      </div>
      {errors.form && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{errors.form}</p>}
      <Button size="xl" className="w-full" onClick={submit}>Guardar</Button>
    </div>
  );
}
