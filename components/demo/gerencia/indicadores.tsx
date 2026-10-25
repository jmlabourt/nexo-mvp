"use client";
// Gerencia → Configuración → Indicadores y cálculos (modo demostración). Para cada número de Blerp: definición,
// fórmula, de dónde sale cada dato, qué fecha usa, supuestos, qué pasa si falta información, cómo impacta una
// corrección y el desglose con los registros concretos de esta demo (se recalcula con lo que haya cambiado).
import Link from "next/link";
import { useState } from "react";
import type { CoreWorld, Project } from "@/lib/core/types";
import { gerenciaAlerts, comprasAlerts, plantaAlerts } from "@/lib/core/alerts";
import { capacityRows } from "@/lib/core/capacity";
import { contractAt, scheduleStatus } from "@/lib/core/contract";
import { collectedByProject, collectionSeries, costIndicators, dashboardCards, marginComparison, periodFor } from "@/lib/core/dashboard";
import { costEntry } from "@/lib/core/hours";
import { economics, financialEvents, laborCosts, materialCosts, updatedFinancial } from "@/lib/core/economics";
import { clientName, employeeName, materialName, materialUnit, rubroName } from "@/lib/core/lookup";
import { needRowsOf } from "@/lib/core/needs";
import { lineValue, paymentByLine } from "@/lib/core/orders";
import { assignedHours } from "@/lib/core/plant";
import { cons, waste } from "@/lib/core/stock";
import { sumBy } from "@/lib/core/util";
import { Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, TR } from "@/components/ui/table";
import { day, money, num, pct, useCore, useDemoToday } from "../kit";

interface Indicator {
  id: string;
  title: string;
  unit: string;
  definition: string;
  formula: string;
  origin: string;
  dates: string;
  incomplete: string;
  corrections: string;
  example: (w: CoreWorld, p: Project, today: string) => React.ReactNode;
}

const P90 = (today: string) => periodFor("last90", today);

const INDICATORS: Indicator[] = [
  {
    id: "ind-ot",
    title: "Número de OT",
    unit: "texto",
    definition: "Identificador público único de cada proyecto, armado con el nomenclador de Gerencia (prefijo + correlativo + cliente + descripción).",
    formula: "correlativo = último número usado + 1 · OT = partes elegidas unidas con «_» (sin tildes ni conectores).",
    origin: "Administración crea el proyecto eligiendo un cliente del directorio; el número lo asigna Blerp. Gerencia define prefijo y partes.",
    dates: "Fecha de creación de la OT.",
    incomplete: "No hay OT sin cliente ni descripción: el alta lo exige.",
    corrections: "Cambiar la descripción o el nombre comercial no cambia la OT. Un número borrado no se reutiliza. El id interno (ot-NNNN) nunca se muestra como OT.",
    example: (w, p) => <p>{p.ot}: número {p.otNumber}, cliente {clientName(w, p.clientId)}, descripción «{p.description}». Próximo número: {w.config.ot.lastNumber + 1}.</p>,
  },
  {
    id: "ind-precio",
    title: "Precio sugerido, descuento y contrato",
    unit: "$ sin IVA",
    definition: "Precio que cubre el costo cotizado con la rentabilidad objetivo (margen sobre el precio, no markup).",
    formula: "P = Materiales/(1 − mMat) + (Mano de obra + Personal)/(1 − mMO) + Costos generales + CF(P), resuelto por punto fijo · Precio final = precio de lista − descuento · Contrato vigente = última revisión o precio aprobado.",
    origin: "Cotizador (Administración): líneas por mueble y rubro, objetivos precargados desde Gerencia y editables. Revisiones de contrato: Administración.",
    dates: "Fecha de aprobación (foto congelada). Revisiones con su fecha.",
    incomplete: "Sin cuotas que sumen 100 %, sin fechas o con un mueble sin rubros no se puede aprobar.",
    corrections: "La cotización aprobada nunca se pisa: adicionales y revisiones quedan aparte y el contrato vigente las suma.",
    example: (w, p) => {
      const b = p.baseline;
      if (!b) return <p>La OT elegida no está aprobada.</p>;
      const mp = b.costs.materials / (1 - b.marginMaterialsPct / 100);
      const lp = (b.costs.labor + b.costs.staff) / (1 - b.marginLaborPct / 100);
      return (
        <p>
          {money(b.costs.materials)}/(1 − {b.marginMaterialsPct} %) = {money(mp)} · ({money(b.costs.labor)} + {money(b.costs.staff)})/(1 − {b.marginLaborPct} %) = {money(lp)} · generales {money(b.costs.general)} · CF {money(b.costs.financial)} → sugerido {money(b.suggestedPrice)}; lista {money(b.listPrice)} − descuento {money(b.discount)} = {money(b.agreedPrice)}. Contrato vigente hoy: {money(contractAt(w, p, w.config.asOf))}.
        </p>
      );
    },
  },
  {
    id: "ind-cotizada",
    title: "Costo cotizado y rentabilidad cotizada",
    unit: "$ y %",
    definition: "Costo total previsto al aprobar y margen esperado sobre el precio acordado.",
    formula: "Costo total = materiales + mano de obra + personal + costos generales + costo financiero previsto · Rentabilidad cotizada = (precio acordado − costo total)/precio acordado × 100.",
    origin: "Foto de la cotización aprobada (baseline).",
    dates: "Fecha de aprobación.",
    incomplete: "Una OT en cotización no tiene rentabilidad cotizada.",
    corrections: "No cambia nunca: los cambios posteriores se ven como desvíos.",
    example: (_w, p) => (p.baseline ? <p>({money(p.baseline.agreedPrice)} − {money(p.baseline.costs.total)}) / {money(p.baseline.agreedPrice)} = {pct(p.baseline.quotedMarginPct)}</p> : <p>Sin aprobar.</p>),
  },
  {
    id: "ind-cobrado",
    title: "Dinero cobrado (tarjeta 1 y gráficos 1 y 3)",
    unit: "$ sin IVA",
    definition: "Plata que realmente ingresó por cobros de clientes.",
    formula: "Σ ingresos con fecha dentro de [Desde, Hasta]. Gráfico 1: el mismo total agrupado por OT. Gráfico 3: agrupado por semana (rango ≤ 92 días) o por mes.",
    origin: "Gerencia → ficha de la OT → «Registrar ingreso» (fecha efectiva e importe). No hay facturas de venta pendientes en Blerp.",
    dates: "Fecha efectiva del ingreso.",
    incomplete: "Sin ingresos en el período el valor es $ 0 (no es un dato faltante: no entró plata).",
    corrections: "Cada ingreso se cuenta una sola vez; un anticipo es un ingreso más (no se vuelve a sumar al aplicarlo a una cuota).",
    example: (w, _p, today) => {
      const per = P90(today);
      const rows = collectedByProject(w, per);
      const series = collectionSeries(w, per);
      return (
        <>
          <p>Últimos 90 días ({day(per.from)} a {day(per.to)}): {rows.map((r) => `${w.projects.find((p) => p.id === r.projectId)?.ot.split("_")[0]} ${money(r.amount)}`).join(" + ")} = {money(sumBy(rows, (r) => r.amount))}.</p>
          <p className="mt-1 text-xs">Por {series.unit === "week" ? "semana" : "mes"}: {series.buckets.filter((b) => b.amount > 0).map((b) => `${day(b.from)} ${money(b.amount)}`).join(" · ")}</p>
        </>
      );
    },
  },
  {
    id: "ind-pendiente",
    title: "Pendiente de cobrar (tarjeta 2)",
    unit: "$ sin IVA",
    definition: "Saldo a la fecha de corte de todas las OTs aprobadas (no es la diferencia de movimientos del período).",
    formula: "Σ por OT aprobada a la fecha de corte de max(0, contrato vigente − ingresos acumulados hasta la fecha de corte).",
    origin: "Contrato (Administración) e ingresos (Gerencia).",
    dates: "Fecha de corte = mínimo entre Hasta y la fecha de la demo.",
    incomplete: "Las cotizaciones no cuentan: todavía no son contrato.",
    corrections: "Un ingreso o una revisión de contrato cambian el saldo al instante.",
    example: (w, _p, today) => {
      const c = dashboardCards(w, P90(today), today);
      return <p>Al {day(c.cutoff)}: {c.pendingRows.map((r) => `${w.projects.find((p) => p.id === r.projectId)?.ot.split("_")[0]} ${money(r.contract)} − ${money(r.collected)} = ${money(r.pending)}`).join(" · ")} → {money(c.pending)}</p>;
    },
  },
  {
    id: "ind-rentabilidad",
    title: "Rentabilidad total (tarjeta 3)",
    unit: "%",
    definition: "Margen agregado de las OTs cerradas en el período con información completa.",
    formula: "Σ ganancia / Σ contrato vigente × 100 (nunca promedio de porcentajes). Ganancia = contrato − costo operativo − costo financiero actualizado a la fecha de corte.",
    origin: "Cierre de Gerencia (fecha) y todos los costos de la OT.",
    dates: "OTs cerradas entre Desde y Hasta; costo financiero hasta la fecha de corte.",
    incomplete: "Una OT con datos faltantes (por ejemplo, horas sin costo por hora) se informa aparte y no entra en el cálculo.",
    corrections: "El costo financiero de una OT cerrada con saldo pendiente sigue creciendo hasta que se cobra: la rentabilidad puede seguir bajando sin reabrir la OT.",
    example: (w, _p, today) => {
      const c = dashboardCards(w, P90(today), today);
      return <p>{c.margin.projectIds.map((id) => { const e = economics(w, w.projects.find((p) => p.id === id) as Project, c.cutoff); return `${w.projects.find((p) => p.id === id)?.ot.split("_")[0]}: ${money(e.profit)} / ${money(e.contract)}`; }).join(" · ")} → {money(c.margin.profit)} / {money(c.margin.contract)} = {pct(c.margin.marginPct)}</p>;
    },
  },
  {
    id: "ind-ventas",
    title: "Ventas contratadas (tarjeta 4)",
    unit: "$ sin IVA",
    definition: "Valor contratado de las OTs aprobadas comercialmente en el período (no son ingresos).",
    formula: "Σ contrato vigente a la fecha de corte de las OTs con aprobación entre Desde y Hasta.",
    origin: "Aprobación de la cotización (Administración) y revisiones de contrato.",
    dates: "Fecha de aprobación.",
    incomplete: "—",
    corrections: "Una revisión de contrato posterior cambia el valor de esa OT.",
    example: (w, _p, today) => {
      const c = dashboardCards(w, P90(today), today);
      return <p>{c.salesRows.map((r) => `${w.projects.find((p) => p.id === r.projectId)?.ot.split("_")[0]} (${day(r.approvedAt)}) ${money(r.contract)}`).join(" + ")} = {money(c.sales)}</p>;
    },
  },
  {
    id: "ind-real",
    title: "Costo real, ganancia y rentabilidad (hasta hoy / final) · gráfico 2",
    unit: "$ y %",
    definition: "Lo que efectivamente costó la OT con los registros cargados. En una OT abierta es PARCIAL (faltan costos por venir).",
    formula: "Costo operativo = material (consumido + desperdiciado por lote) + mano de obra + horas de personal + otros costos · Costo real = operativo + costo financiero actualizado · Ganancia = contrato − costo real · Rentabilidad = ganancia / contrato × 100.",
    origin: "Planta (rendiciones, horas revisadas), operarios y personal (horas), Gerencia (otros costos, ingresos, pagos), Compras (lotes).",
    dates: "Hasta la fecha de corte. Final = OT cerrada.",
    incomplete: "Si falta el costo por hora de una persona, la OT queda marcada «Información incompleta» y no se completa con un número inventado.",
    corrections: "Corregir una hora o una rendición modifica el mismo registro y se recalcula todo; nada se suma dos veces.",
    example: (w, p, today) => {
      const e = economics(w, p, today);
      return <p>{money(e.materials)} + {money(e.labor)} + {money(e.staff)} + {money(e.other)} = {money(e.operatingCost)} operativo; + {money(e.financialUpdated)} financiero = {money(e.realCost)}. Ganancia {money(e.contract)} − {money(e.realCost)} = {money(e.profit)} → {pct(e.marginPct)} ({e.stage === "final" ? "final" : "parcial"}); cotizada {pct(e.quotedMarginPct)}. Gráfico 2: {marginComparison(w, P90(today), today).length} OTs.</p>;
    },
  },
  {
    id: "ind-materiales",
    title: "Materiales: costo por lote, desperdicio y sobrantes",
    unit: "$ y unidades",
    definition: "Comprar o recibir no es costo. Es costo lo consumido y lo desperdiciado, con el costo del lote del que salió. El sobrante reutilizable devuelto sigue siendo stock.",
    formula: "Costo material = Σ consumido × costo del lote + Σ desperdiciado × costo del lote.",
    origin: "Compras (recepciones → lotes con el precio de la OC; asignación de stock libre), Planta (entregas a producción y rendición: consumido, desperdicio, devuelto, sigue en producción).",
    dates: "Fecha de la rendición.",
    incomplete: "El material en producción sin rendir no es costo todavía: Planta lo tiene que rendir antes del cierre.",
    corrections: "Una recepción se revierte con su motivo; se bloquea si el material ya se entregó o se usó.",
    example: (w, p) => {
      const m = materialCosts(w, p.id);
      const movs = w.movements.filter((x) => x.to === cons(p.id) || x.to === waste(p.id)).slice(0, 8);
      return (
        <>
          <p>Consumido {money(m.consumed)} + desperdicio {money(m.waste)} = {money(m.total)}.</p>
          <ul className="mt-1 text-xs">
            {movs.map((x) => { const lot = w.lots.find((l) => l.id === x.lotId); return <li key={x.id}>{day(x.date)} · {materialName(w, lot?.materialId)} {num(x.quantity, materialUnit(w, lot?.materialId))} × {money(lot?.unitCost)} (lote {x.lotId}) · {x.kind === "consume" ? "consumido" : "desperdicio"}</li>; })}
          </ul>
        </>
      );
    },
  },
  {
    id: "ind-porcomprar",
    title: "Por comprar (neteo) y OC multi-OT",
    unit: "unidades de cada material",
    definition: "Lo que falta registrar en una OC para cubrir la demanda del BOM publicado y los pedidos adicionales de Planta.",
    formula: "Faltante físico = max(0, demanda − usado − asignado − en producción) · Pendiente de registrar en OC = max(0, faltante − pedido sin recibir). Un mueble finalizado deja de demandar más de lo que usó.",
    origin: "BOM publicado (Administración), pedidos de Planta, OCs y recepciones (Compras), stock por lote.",
    dates: "Fecha de necesidad = inicio de la OT.",
    incomplete: "Sin BOM publicado no hay necesidades (la OT figura como «BOM pendiente»).",
    corrections: "Una OC por lo que falta deja el pendiente de registrar en 0 aunque todavía falte recibir. Lo recibido y asignado no se cuenta además como pedido.",
    example: (w, p) => (
      <ul className="text-xs">
        {needRowsOf(w, p).map((n) => <li key={n.materialId}>{materialName(w, n.materialId)}: {num(n.demand)} − {num(n.used)} − {num(n.assigned)} − {num(n.inProduction)} = faltan {num(n.uncovered)}; − {num(n.pendingReceipt)} pedido = {num(n.toRegister)} por registrar</li>)}
        {needRowsOf(w, p).length === 0 && <li>La OT elegida no tiene necesidades abiertas.</li>}
      </ul>
    ),
  },
  {
    id: "ind-pagos",
    title: "Pagos a proveedores repartidos por OT",
    unit: "$",
    definition: "Atribución del desembolso real de una OC entre las OTs (no es costo de material).",
    formula: "Sin OT elegida: parte de la OT = pago × valor de sus líneas / valor de la OC (la última línea absorbe el redondeo). Con OT elegida: todo a esa OT.",
    origin: "Gerencia registra el pago; Compras cargó las líneas y el comprobante.",
    dates: "Fecha del pago.",
    incomplete: "No se puede pagar más que el comprobante (o el total de la OC).",
    corrections: "—",
    example: (w, p) => (
      <ul className="text-xs">
        {w.supplierPayments.filter((pay) => w.orders.find((o) => o.id === pay.orderId)?.lines.some((l) => l.projectId === p.id)).map((pay) => {
          const o = w.orders.find((x) => x.id === pay.orderId)!;
          const part = [...paymentByLine(o, pay)].filter(([lid]) => o.lines.find((l) => l.id === lid)?.projectId === p.id).reduce((s, [, v]) => s + v, 0);
          return <li key={pay.id}>{day(pay.date)} · {o.number} pagado {money(pay.amount)} → a esta OT {money(part)} (líneas {money(sumBy(o.lines.filter((l) => l.projectId === p.id), lineValue))} de {money(sumBy(o.lines, lineValue))})</li>;
        })}
      </ul>
    ),
  },
  {
    id: "ind-horas",
    title: "Horas: cotizadas, planificadas, asignadas, reales y corregidas · tarifa histórica y horas extra",
    unit: "h y $",
    definition: "Cada etapa de las horas es un dato distinto. El costo es el de la persona vigente el día trabajado.",
    formula: "Costo de un registro = costo/h vigente × (horas + horas extra × (multiplicador − 1)) · extra del día = max(0, horas del día − horas laborables del día), repartido entre los registros del día.",
    origin: "Cotización (horas por mueble y rubro), Planta (planificación y asignación), operarios (Mi día) y personal (Registrar mis horas), Planta (revisión), Gerencia (costos con vigencia y multiplicador).",
    dates: "Fecha del registro.",
    incomplete: "Horas asignadas sin registro y jornadas sin revisar generan alerta; nunca se toman como 0 silencioso.",
    corrections: "Planta corrige el mismo registro (queda el valor anterior). Un cambio de costo por hora vale desde su fecha: las horas anteriores no cambian.",
    example: (w, p) => {
      const { labor } = laborCosts(w, p.id);
      const planned = sumBy(w.plans.filter((x) => x.projectId === p.id), (x) => x.hours);
      const asg = assignedHours(w, (a) => a.projectId === p.id);
      const corrected = w.timeEntries.filter((t) => t.projectId === p.id && t.corrections.length);
      const ex = labor.entries.find((c) => c.overtimeHours > 0) ?? labor.entries[0];
      return (
        <p>
          Planificadas {num(planned, "h")} · asignadas {num(asg, "h")} · reales {num(labor.hours, "h")} · corregidas {corrected.length}.{" "}
          {ex && `Ejemplo: ${employeeName(w, ex.entry.employeeId)} ${day(ex.entry.date)} ${num(ex.entry.hours, "h")} × ${money(ex.rate)}${ex.overtimeHours ? ` + ${num(ex.overtimeHours, "h")} extra × (${ex.multiplier} − 1)` : ""} = ${money(costEntry(w, ex.entry).cost)}.`}
        </p>
      );
    },
  },
  {
    id: "ind-financiero",
    title: "Costo financiero (previsto normal, actualizado y adicional)",
    unit: "$",
    definition: "Costo de tener plata de la empresa inmovilizada en la OT hasta recuperarla con cobros.",
    formula: "Por tramo: max(0, invertido acumulado − cobrado acumulado) × tasa mensual/100 × días/30 · total = Σ tramos (interés simple, sin capitalizar). Adicional = max(0, actualizado − previsto a la misma fecha).",
    origin: "Tasa: Gerencia. Previsto: cotización (todo el costo directo invertido al inicio, cobros en las fechas pactadas). Actualizado: pagos a proveedor reales; material sin pago cargado, invertido al recibir (supuesto); horas, invertidas el día trabajado (supuesto); otros costos en su fecha; ingresos reales.",
    dates: "Hasta la fecha de corte; sigue después de la entrega y del cierre mientras quede capital propio sin recuperar.",
    incomplete: "Se basa en parte en supuestos declarados: no es una medición exacta de caja.",
    corrections: "Un ingreso cargado tarde o un pago corregido cambian los tramos. El saldo del precio (que incluye ganancia) no es la base: solo el capital no recuperado.",
    example: (w, p, today) => {
      const f = updatedFinancial(w, p, today);
      const ev = financialEvents(w, p, today).slice(0, 6);
      return (
        <>
          <ul className="text-xs">{f.tramos.map((t) => <li key={t.from}>{day(t.from)}–{day(t.to)}: {money(t.capital)} × {f.ratePct} % × {t.days}/30 = {money(t.amount)}</li>)}</ul>
          <p className="mt-1">Total actualizado {money(f.total)} · previsto a hoy {money(economics(w, p, today).financialBudgetToDate)} · adicional {money(economics(w, p, today).financialAdditional)}.</p>
          <p className="mt-1 text-xs text-slate-500">Primeros eventos: {ev.map((e) => `${day(e.date)} ${e.invest ? `+${money(e.invest)}` : `−${money(e.recover)}`} (${e.basis === "fact" ? "hecho" : "supuesto"})`).join(" · ")}</p>
        </>
      );
    },
  },
  {
    id: "ind-capacidad",
    title: "Capacidad futura por rubro",
    unit: "h",
    definition: "Horas laborables de los obreros habilitados contra las horas comprometidas de OTs aprobadas.",
    formula: "Capacidad = Σ horas laborables futuras de cada obrero / cantidad de rubros que tiene (nadie se cuenta dos veces) · Comprometidas = planificación desde hoy si existe; si no, horas restantes (cotizadas − reales) repartidas en partes iguales en los días hábiles hasta la entrega · Potenciales = cotizaciones enviadas o en negociación · Saldo = capacidad − comprometidas.",
    origin: "Personal (jornadas, Gerencia), excepciones (Planta), planificación (Planta), cotizaciones.",
    dates: "Desde la fecha de la demo hasta Hasta (capacidad futura).",
    incomplete: "—",
    corrections: "Al planificar una OT, su estimación se reemplaza por la planificación (no se suman).",
    example: (w, _p, today) => (
      <ul className="text-xs">
        {capacityRows(w, today, periodFor("month", today).to, today).map((r) => <li key={r.rubroId}>{rubroName(w, r.rubroId)}: {num(r.capacity)} − {num(r.committed)} = {num(r.balance)} h (potenciales {num(r.potential)} h)</li>)}
      </ul>
    ),
  },
  {
    id: "ind-costos",
    title: "Indicadores de costos del período",
    unit: "$",
    definition: "Costo de desperdicios, otros gastos directos y costo financiero devengado dentro del período.",
    formula: "Desperdicio = Σ desperdicios rendidos en el período × costo del lote · Otros = Σ otros costos con fecha en el período · Financiero = parte de los tramos que cae en el período.",
    origin: "Rendiciones de Planta, otros costos de Gerencia, tramos del costo financiero.",
    dates: "Desde/Hasta.",
    incomplete: "—",
    corrections: "—",
    example: (w, _p, today) => {
      const c = costIndicators(w, P90(today), today);
      return <p>Últimos 90 días: desperdicio {money(c.waste)} · otros {money(c.other)} · financiero {money(c.financial)}.</p>;
    },
  },
  {
    id: "ind-cobros-vencidos",
    title: "Cuotas vencidas",
    unit: "$",
    definition: "Cuotas previstas con fecha pasada que los ingresos no cubren (se cubren en orden de fecha).",
    formula: "Cobrado acumulado cubre las cuotas de la más vieja a la más nueva; vencida = fecha < hoy y saldo > 0.",
    origin: "Cobros previstos (Administración) e ingresos (Gerencia).",
    dates: "Fecha de cada cuota.",
    incomplete: "—",
    corrections: "Al registrar el ingreso la alerta desaparece.",
    example: (w, p, today) => (p.baseline ? <ul className="text-xs">{scheduleStatus(w, p, today).map((s) => <li key={s.payment.id}>{s.payment.label} {day(s.payment.date)} {money(s.payment.amount)}: cubierto {money(s.covered)}, pendiente {money(s.pending)}{s.overdue ? " (vencida)" : ""}</li>)}</ul> : <p>Sin aprobar.</p>),
  },
  {
    id: "ind-alertas",
    title: "Alertas de cada sesión",
    unit: "cantidad",
    definition: "Solo hechos comprobables. Desaparecen cuando cambia el dato que las causa (no se marcan como resueltas).",
    formula:
      "Gerencia: rentabilidad baja (real − cotizada < −umbral), sobrecostos (materiales u horas > presupuesto × (1 + %), otros > provisión), atraso (entrega vencida sin entrega registrada), cobros vencidos, falta de capacidad (saldo < 0 en las próximas semanas), material faltante (OT en Producción con faltante físico), datos pendientes de Planta, entregado con saldo, lista para cierre. Compras: OC por registrar con inicio en ≤ umbral días, OC atrasada (llegada comprometida vencida), entrega incompleta, material faltante. Planta: trabajo sin operario, material faltante para lo planificado, horas sin revisar o sin registrar, material sin rendir, entrega vencida con producción incompleta. Administración (Pendientes): cotizaciones sin respuesta, BOM por publicar, información incompleta, entregas próximas o atrasadas.",
    origin: "Los mismos registros de las demás fórmulas; umbrales en Alertas y nomenclatura.",
    dates: "Fecha de la demo.",
    incomplete: "Sin fecha de llegada comprometida no hay alerta de atraso de OC.",
    corrections: "—",
    example: (w, _p, today) => <p>Hoy: Gerencia {gerenciaAlerts(w, today).length} · Compras {comprasAlerts(w, today).length} · Planta {plantaAlerts(w, today).length}.</p>,
  },
];

export function IndicadoresDemo() {
  const w = useCore();
  const today = useDemoToday();
  const approved = w.projects.filter((p) => p.baseline);
  const [pid, setPid] = useState(approved.find((p) => p.status === "production")?.id ?? approved[0]?.id ?? "");
  const p = w.projects.find((x) => x.id === pid);
  const [open, setOpen] = useState<string | null>(() => (typeof window !== "undefined" ? window.location.hash.slice(1) || null : null));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-slate-600">OT para los ejemplos:</span>
        <Select value={pid} onChange={(e) => setPid(e.target.value)} className="w-80">
          {approved.map((x) => <option key={x.id} value={x.id}>{x.ot}</option>)}
        </Select>
        <span className="text-xs text-slate-500">Fecha de la demo: {day(today)} · tasa {w.config.financialMonthlyRatePct} % mensual</span>
      </div>
      <nav aria-label="Indicadores" className="flex flex-wrap gap-2 text-xs">
        {INDICATORS.map((i) => <Link key={i.id} href={`#${i.id}`} onClick={() => setOpen(i.id)} className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700 hover:bg-slate-200">{i.title.split(" (")[0].split(" ·")[0]}</Link>)}
      </nav>
      {p &&
        INDICATORS.map((i) => (
          <details key={i.id} id={i.id} className="scroll-mt-20 rounded-lg border border-slate-200 bg-white" open={open === i.id} onToggle={(e) => { const isOpen = (e.currentTarget as HTMLDetailsElement).open; if (isOpen !== (open === i.id)) setOpen(isOpen ? i.id : null); }}>
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-900">{i.title}</summary>
            <div className="space-y-2 px-4 pb-4 text-sm text-slate-700">
              <Table>
                <TBody>
                  <TR><TH className="w-48 normal-case">Definición</TH><TD>{i.definition} <span className="text-xs text-slate-500">({i.unit})</span></TD></TR>
                  <TR><TH className="normal-case">Fórmula</TH><TD>{i.formula}</TD></TR>
                  <TR><TH className="normal-case">Origen de los datos</TH><TD>{i.origin}</TD></TR>
                  <TR><TH className="normal-case">Fechas</TH><TD>{i.dates}</TD></TR>
                  <TR><TH className="normal-case">Información incompleta</TH><TD>{i.incomplete}</TD></TR>
                  <TR><TH className="normal-case">Correcciones y doble conteo</TH><TD>{i.corrections}</TD></TR>
                </TBody>
              </Table>
              <div className="rounded-md bg-slate-50 p-3">
                <div className="mb-1 text-xs font-medium uppercase text-slate-500">Con los datos de la demo</div>
                {i.example(w, p, today)}
              </div>
            </div>
          </details>
        ))}
      <p className="text-xs text-slate-500">Registros completos y resultados esperados del escenario base: docs/demo-auditoria/ en el repositorio.</p>
    </div>
  );
}
