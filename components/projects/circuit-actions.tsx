"use client";
// Circuito entre sesiones en la ficha del proyecto (Gerencia y Administración): el siguiente paso del camino por
// defecto. En cotización: aprobado, renegociación de precio o no aprobado (con motivo). Aprobado = Diseño: enviar a
// Compras. Compras: enviar a planta. Listo: Administración define la entrega; Gerencia cierra.
// Todo se guarda con lo que ya existe: etapas del proyecto e historial (ver lib/circuit.ts).
import { useState } from "react";
import { ArrowRight, Check, Handshake, PackageCheck, X } from "lucide-react";
import type { Project } from "@/types";
import { CIRCUIT_LABELS, DELIVERY_LABELS, circuitStage, deliveryDecision, type DeliveryChoice } from "@/lib/circuit";
import { formatNumber } from "@/lib/formatting";
import { useConfirmedAction } from "@/store/confirmed-action";
import { useIdentity } from "@/store/selectors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Choice } from "@/components/ui/choice";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function CircuitBadge({ project }: { project: Project }) {
  const stage = circuitStage(project);
  const tone = stage === "rejected" ? "red" : stage === "negotiation" || stage === "ready" ? "yellow" : stage === "closed" ? "green" : "blue";
  return <Badge tone={tone}>{CIRCUIT_LABELS[stage]}</Badge>;
}

type Open = "renegotiate" | "reject" | "delivery" | null;

export function CircuitActions({ project, canClose }: { project: Project; canClose: boolean }) {
  const changeStatus = useConfirmedAction("changeProjectStatus");
  const { isManager } = useIdentity();
  const [open, setOpen] = useState<Open>(null);
  const [error, setError] = useState("");
  const stage = circuitStage(project);
  const go = async (to: Project["status"]) => {
    const r = await changeStatus(project.id, to);
    setError(r.ok ? "" : r.error);
  };
  const close = () => setOpen(null);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {(stage === "quotation" || stage === "negotiation") && (
          <>
            <Button onClick={() => go("approved")}>
              <Check /> Aprobado por el cliente
            </Button>
            <Button variant="outline" onClick={() => setOpen("renegotiate")}>
              <Handshake /> Renegociar precio
            </Button>
            <Button variant="outline" onClick={() => setOpen("reject")}>
              <X /> No aprobado
            </Button>
          </>
        )}
        {stage === "design" && isManager && (
          <Button onClick={() => go("purchasing")}>
            <ArrowRight /> Diseño listo: enviar a Compras
          </Button>
        )}
        {stage === "purchasing" && isManager && (
          <Button onClick={() => go("production")}>
            <ArrowRight /> Enviar a planta
          </Button>
        )}
        {stage === "ready" && isManager && (
          <Button onClick={() => setOpen("delivery")}>
            <PackageCheck /> Proyecto listo: ¿qué se hace?
          </Button>
        )}
        {stage === "delivery" && (
          <span className="text-sm text-slate-600">
            Entrega: <strong>{DELIVERY_LABELS[deliveryDecision(project) as DeliveryChoice]}</strong>.{" "}
            {canClose ? "Cuando corresponda, cerrá el proyecto." : "Gerencia cierra el proyecto."}
          </span>
        )}
      </div>
      {!isManager && stage !== "quotation" && stage !== "negotiation" && stage !== "rejected" && stage !== "closed" && (
        <p className="text-xs text-slate-500">Desde acá el proyecto lo avanza Gerencia.</p>
      )}
      {stage === "design" && <p className="text-xs text-slate-500">Diseño corrige en Muebles las cantidades de materiales que de verdad se necesitan y adjunta los planos.</p>}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {open === "renegotiate" && <RenegotiateDialog project={project} onClose={close} />}
      {open === "reject" && <RejectDialog project={project} onClose={close} />}
      {open === "delivery" && <DeliveryDialog project={project} onClose={close} />}
    </div>
  );
}

function RenegotiateDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const renegotiate = useConfirmedAction("renegotiatePrice");
  const [price, setPrice] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const value = Number(price.replace(/\D/g, "")) || 0;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await renegotiate(project.id, value, reason);
            if (!r.ok) return setError(r.error);
            onClose();
          }}
        >
          <DialogHeader>
            <DialogTitle>Renegociar precio</DialogTitle>
            <DialogDescription>El proyecto sigue en cotización con el precio nuevo. El anterior queda en el historial.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Precio nuevo (sin IVA)" htmlFor="neg-price" hint={project.salesPrice > 0 ? `Actual: $ ${formatNumber(project.salesPrice, 0)}` : undefined}>
              <Input id="neg-price" inputMode="numeric" value={value > 0 ? formatNumber(value, 0) : ""} onChange={(e) => setPrice(e.target.value)} />
            </Field>
            <Field label="Motivo" htmlFor="neg-reason">
              <Textarea id="neg-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit">Guardar renegociación</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const reject = useConfirmedAction("rejectQuote");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await reject(project.id, reason);
            if (!r.ok) return setError(r.error);
            onClose();
          }}
        >
          <DialogHeader>
            <DialogTitle>No aprobado</DialogTitle>
            <DialogDescription>{project.code}: el proyecto termina acá y el motivo queda en el historial.</DialogDescription>
          </DialogHeader>
          <Field label="Motivo" htmlFor="rej-reason">
            <Textarea id="rej-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit">Guardar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeliveryDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const define = useConfirmedAction("defineDelivery");
  const [choice, setChoice] = useState<DeliveryChoice>("pickup");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await define(project.id, choice, note);
            if (!r.ok) return setError(r.error);
            onClose();
          }}
        >
          <DialogHeader>
            <DialogTitle>Proyecto listo: ¿qué se hace?</DialogTitle>
            <DialogDescription>{project.code} · {project.name}. Planta terminó todas las unidades.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Choice<DeliveryChoice>
              name="Qué se hace con el proyecto"
              value={choice}
              columns={1}
              onChange={setChoice}
              options={(Object.keys(DELIVERY_LABELS) as DeliveryChoice[]).map((k) => ({ value: k, label: DELIVERY_LABELS[k] }))}
            />
            <Field label="Nota (opcional)" htmlFor="del-note">
              <Input id="del-note" value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <p className="text-xs text-slate-500">“Va con flete e instalación” pasa el proyecto a Instalación. Gerencia es quien cierra el proyecto.</p>
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit">Guardar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
