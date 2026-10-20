"use client";
// Jefe de planta → Avance de proyectos: material en planta, "Entregar material" y "Cierre del día"
// (docs/PLANTA_MATERIALES.md). Solo cantidades: el Jefe nunca ve ni manda costos.
import { useState } from "react";
import { PackageOpen, ClipboardCheck } from "lucide-react";
import type { MaterialDelivery, Project } from "@/types";
import { activeOperators } from "@/lib/operators";
import { formatDate, formatQty } from "@/lib/formatting";
import { closeDayError, deliveryError, deliveryOptions, openDeliveries, type CloseDeliveryInput } from "@/lib/plant-materials";
import { parseDecimal } from "@/lib/schemas";
import { useAppStore } from "@/store/use-app-store";
import { useConfirmedAction } from "@/store/confirmed-action";
import { useToday } from "@/store/selectors";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UnitsCounter } from "./plant-projects";

const qty = (s: string) => {
  const v = parseDecimal(s);
  return Number.isFinite(v) ? v : NaN;
};

/** Material entregado y sin cerrar, con los botones de entrega y cierre. */
export function ProjectMaterials({ project }: { project: Project }) {
  const deliveries = useAppStore((s) => s.deliveries);
  const operators = useAppStore((s) => s.operators);
  const [dialog, setDialog] = useState<"deliver" | "close" | null>(null);
  const open = openDeliveries(deliveries, project.id);
  const itemName = (id?: string) => project.items.find((i) => i.id === id)?.name ?? "—";
  const who = (id?: string) => operators.find((o) => o.id === id)?.name;
  const canWork = !project.isClosed && ["approved", "purchasing", "production", "installation"].includes(project.status);

  return (
    <section aria-label={`Material en planta de ${project.code}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Material en planta</h3>
        {canWork && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setDialog("deliver")}>
              <PackageOpen /> Entregar material
            </Button>
            <Button size="sm" onClick={() => setDialog("close")}>
              <ClipboardCheck /> Cierre del día
            </Button>
          </div>
        )}
      </div>
      {open.length === 0 ? (
        <p className="mt-1 text-sm text-slate-500">Nada entregado sin cerrar.</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-200 text-sm">
          {open.map((d) => (
            <li key={d.id} className="flex flex-wrap justify-between gap-2 py-1.5">
              <span>
                <strong className="tabular">{formatQty(d.quantity, d.unit)}</strong> de {d.materialName} → {itemName(d.itemId)}
                {who(d.operatorId) ? ` · ${who(d.operatorId)}` : ""}
              </span>
              <span className="text-xs text-slate-500">
                {formatDate(d.date)} · {d.source === "warehouse" ? "del depósito" : "de lo asignado al proyecto"}
              </span>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          {dialog === "deliver" && <DeliveryForm project={project} onDone={() => setDialog(null)} />}
          {dialog === "close" && <CloseDayForm project={project} open={open} onDone={() => setDialog(null)} />}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function DeliveryForm({ project, onDone }: { project: Project; onDone: () => void }) {
  const today = useToday();
  const stock = useAppStore((s) => s.stock);
  const deliveries = useAppStore((s) => s.deliveries);
  const operators = activeOperators(useAppStore((s) => s.operators));
  const deliver = useConfirmedAction("deliverMaterial");
  const options = deliveryOptions(stock, deliveries, project.id);
  const [materialId, setMaterialId] = useState(options[0]?.materialId ?? "");
  const option = options.find((o) => o.materialId === materialId);
  const [source, setSource] = useState<"warehouse" | "project">(option && option.project > 0 ? "project" : "warehouse");
  const [quantity, setQuantity] = useState("");
  const [itemId, setItemId] = useState(project.items[0]?.id ?? "");
  const [operatorId, setOperatorId] = useState("");
  const [error, setError] = useState("");
  const input = { projectId: project.id, itemId, operatorId: operatorId || undefined, materialId, quantity: qty(quantity), source, date: today };
  const problem = quantity.trim() ? deliveryError(project, stock, deliveries, input, today) : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await deliver(input);
    if (!r.ok) return setError(r.error);
    onDone();
  };

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>Entregar material · {project.code}</DialogTitle>
        <DialogDescription>Qué material sale y para qué producto. Solo cantidades: todavía no es costo (lo es lo que se consume).</DialogDescription>
      </DialogHeader>
      {options.length === 0 ? (
        <p className="text-sm text-slate-600">No hay material libre en el depósito ni asignado a este proyecto.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Material" htmlFor="dl-material" className="sm:col-span-2">
            <Select
              id="dl-material"
              value={materialId}
              onChange={(e) => {
                setMaterialId(e.target.value);
                const o = options.find((x) => x.materialId === e.target.value);
                setSource(o && o.project > 0 ? "project" : "warehouse");
              }}
            >
              {options.map((o) => (
                <option key={o.materialId} value={o.materialId}>
                  {o.materialName}
                </option>
              ))}
            </Select>
          </Field>
          {option && (
            <fieldset className="sm:col-span-2">
              <legend className="mb-1 text-sm font-medium text-slate-700">Sale de</legend>
              <div className="flex flex-col gap-1.5 text-sm sm:flex-row sm:gap-4">
                <label className="flex items-center gap-2">
                  <input type="radio" name="dl-source" checked={source === "project"} disabled={option.project <= 0} onChange={() => setSource("project")} />
                  Asignado al proyecto ({formatQty(option.project, option.unit)})
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="dl-source" checked={source === "warehouse"} disabled={option.warehouse <= 0} onChange={() => setSource("warehouse")} />
                  Depósito libre ({formatQty(option.warehouse, option.unit)})
                </label>
              </div>
            </fieldset>
          )}
          <Field label={`Cantidad${option ? ` (${option.unit})` : ""}`} htmlFor="dl-qty" error={problem ?? undefined}>
            <Input id="dl-qty" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} aria-invalid={!!problem} aria-describedby={problem ? "dl-qty-error" : undefined} />
          </Field>
          <Field label="Producto" htmlFor="dl-item">
            <Select id="dl-item" value={itemId} onChange={(e) => setItemId(e.target.value)}>
              {project.items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} × {i.quantity}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Operario (opcional)" htmlFor="dl-op" className="sm:col-span-2">
            <Select id="dl-op" value={operatorId} onChange={(e) => setOperatorId(e.target.value)}>
              <option value="">Sin operario</option>
              {operators.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>Cancelar</Button>
        <Button type="submit" disabled={options.length === 0 || !quantity.trim() || !!problem}>Registrar entrega</Button>
      </DialogFooter>
    </form>
  );
}

interface Draft {
  consumed: string;
  waste: string;
  leftover: string;
}

function CloseDayForm({ project, open, onDone }: { project: Project; open: MaterialDelivery[]; onDone: () => void }) {
  const today = useToday();
  const deliveries = useAppStore((s) => s.deliveries);
  const close = useConfirmedAction("closeDay");
  // Por defecto: todo lo entregado se consumió (lo más común); se corrige lo que sobró o se desperdició.
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => Object.fromEntries(open.map((d) => [d.id, { consumed: String(d.quantity).replace(".", ","), waste: "0", leftover: "0" }])));
  const [error, setError] = useState("");
  const input = {
    projectId: project.id,
    date: today,
    units: [],
    deliveries: open.map((d): CloseDeliveryInput => ({ id: d.id, consumed: qty(drafts[d.id].consumed), waste: qty(drafts[d.id].waste), leftover: qty(drafts[d.id].leftover) })),
  };
  const problem = open.length > 0 ? closeDayError(project, deliveries, input, today) : null;
  const set = (id: string, patch: Partial<Draft>) => setDrafts({ ...drafts, [id]: { ...drafts[id], ...patch } });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (open.length === 0) return onDone();
    const r = await close(input);
    if (!r.ok) return setError(r.error);
    onDone();
  };

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>Cierre del día · {project.code}</DialogTitle>
        <DialogDescription>Unidades terminadas por producto y qué pasó con el material entregado. Solo cantidades.</DialogDescription>
      </DialogHeader>
      <section aria-label="Unidades terminadas" className="space-y-2">
        <h4 className="text-sm font-semibold text-slate-900">Unidades terminadas</h4>
        {project.items.map((item) => (
          <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 p-2 text-sm">
            <span>
              {item.name} <span className="text-slate-500">· quedan {item.quantity - item.completedUnits}</span>
            </span>
            <UnitsCounter project={project} item={item} />
          </div>
        ))}
      </section>
      <section aria-label="Material entregado" className="mt-4 space-y-3">
        <h4 className="text-sm font-semibold text-slate-900">Material entregado</h4>
        {open.length === 0 && <p className="text-sm text-slate-500">No hay material entregado sin cerrar.</p>}
        {open.map((d) => {
          const c = drafts[d.id];
          const rest = d.quantity - (qty(c.consumed) || 0) - (qty(c.waste) || 0) - (qty(c.leftover) || 0);
          return (
            <fieldset key={d.id} className="rounded-md border border-slate-200 p-2">
              <legend className="px-1 text-sm font-medium text-slate-800">
                {formatQty(d.quantity, d.unit)} de {d.materialName} ({formatDate(d.date)})
              </legend>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Consumido" htmlFor={`cl-c-${d.id}`}>
                  <Input id={`cl-c-${d.id}`} inputMode="decimal" value={c.consumed} onChange={(e) => set(d.id, { consumed: e.target.value })} />
                </Field>
                <Field label="Desperdicio" htmlFor={`cl-w-${d.id}`}>
                  <Input id={`cl-w-${d.id}`} inputMode="decimal" value={c.waste} onChange={(e) => set(d.id, { waste: e.target.value })} />
                </Field>
                <Field label="Sobrante reutilizable" htmlFor={`cl-l-${d.id}`}>
                  <Input id={`cl-l-${d.id}`} inputMode="decimal" value={c.leftover} onChange={(e) => set(d.id, { leftover: e.target.value })} />
                </Field>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {rest > 1e-6 ? `Sigue en planta: ${formatQty(rest, d.unit)} (no es costo todavía).` : "Se cierra todo lo entregado."} El sobrante vuelve al depósito.
              </p>
            </fieldset>
          );
        })}
      </section>
      {(problem || error) && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error || problem}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>Cancelar</Button>
        <Button type="submit" disabled={!!problem}>{open.length === 0 ? "Listo" : "Cerrar el día"}</Button>
      </DialogFooter>
    </form>
  );
}
