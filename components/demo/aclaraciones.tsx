"use client";
// Aclaraciones del sistema: lo indispensable para usar Blerp, solo lo de la sesión actual.
import type { SessionKey } from "@/lib/permissions";
import { useIdentity } from "@/store/selectors";
import { PageHeader } from "@/components/shared/page-header";
import { Section } from "./kit";

const TEXT: Record<SessionKey, string[]> = {
  gerencia: [
    "La rentabilidad de una OT abierta es parcial: faltan costos por venir. La final es la de una OT cerrada.",
    "Material comprado no es costo: es costo lo consumido y lo desperdiciado, con el costo de su lote. El sobrante devuelto sigue en stock.",
    "«Registrar ingreso» es solo plata que entró. No hay facturas de venta pendientes en Blerp.",
    "El costo financiero usa supuestos declarados (horas pagadas el día trabajado; material sin pago cargado, invertido al recibir). Sigue creciendo mientras haya capital propio sin recuperar, aun con la OT cerrada.",
    "Una OT se cierra con todo terminado, el material rendido, la entrega registrada y las horas revisadas.",
    "Todas las fórmulas, con ejemplos de esta demo: Configuración → Indicadores y cálculos.",
  ],
  administracion: [
    "Aprobar una cotización la congela: los cambios posteriores van como adicionales o en el contrato vigente.",
    "Compras recibe necesidades solo cuando publicás el BOM. Publicar otra versión recalcula sin duplicar pedidos.",
    "Un rubro nuevo que pide Planta se aprueba acá como adicional; recién entonces se puede planificar.",
    "Corregir el estado a mano queda en el historial. Si una OT vuelve a Compras y le llega material, pasa sola a Producción.",
  ],
  compras: [
    "Registrar una orden de compra la deja solo en Blerp: no la crea ni la envía al proveedor.",
    "Lo recibido de una línea con OT queda asignado a esa OT y ya no cuenta como pedido.",
    "Asignar stock libre a una OT resta de Por comprar y habilita Producción.",
    "Una recepción mal cargada se revierte con motivo; se bloquea si ese material ya se usó.",
    "Los pagos a proveedores los registra Gerencia.",
  ],
  jefe_planta: [
    "Solo se planifican rubros cotizados para cada mueble o aprobados como adicional.",
    "Liberado = consumido + desperdicio + devuelto + sigue en producción. Lo devuelto vuelve al stock con su lote.",
    "Un mueble se finaliza cuando todas sus unidades están terminadas.",
    "Corregir horas cambia el mismo registro del operario (queda el valor anterior); la planificación no cambia.",
    "Material adicional ya presente en el BOM se pide directo a Compras; un rubro nuevo, a Administración.",
  ],
  operario: ["Cargá las horas que trabajaste en cada tarea. Si hiciste otra cosa, elegí la OT, el mueble y el rubro correctos, o Trabajo interno."],
};

export function AclaracionesDemo() {
  const { session } = useIdentity();
  return (
    <div className="space-y-4">
      <PageHeader title="Aclaraciones del sistema" />
      <Section title="Para tu sesión">
        <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">
          {TEXT[session].map((t) => <li key={t}>{t}</li>)}
        </ul>
      </Section>
    </div>
  );
}
