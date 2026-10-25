// Exporta el escenario base de la demo (lib/core/seed.ts) a archivos legibles por máquina y arma el documento con
// TODOS los registros. Uso: npx tsx --tsconfig tsconfig.json docs/demo-auditoria/exportar.mts
//   datos/escenario.json         → el estado completo (fuente de los cálculos independientes)
//   datos/<colección>.csv        → una tabla por colección
//   DATOS_DEMO_COMPLETOS.md      → documento humano con todos los registros
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDemoWorld, DEMO_AS_OF } from "@/lib/core/seed";


const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, "datos");
mkdirSync(DATA, { recursive: true });

const w = buildDemoWorld();
writeFileSync(join(DATA, "escenario.json"), JSON.stringify(w, null, 1) + "\n");

const P = (id?: string) => w.projects.find((p) => p.id === id)?.ot.split("_")[0] ?? "";
const M = (id?: string) => w.materials.find((m) => m.id === id)?.name ?? "";
const E = (id?: string) => w.employees.find((e) => e.id === id)?.name ?? "";
const R = (id?: string) => w.rubros.find((r) => r.id === id)?.name ?? "";
const I = (pid?: string, iid?: string) => w.projects.find((p) => p.id === pid)?.items.find((i) => i.id === iid)?.name ?? "";
const n = (x: number | undefined) => (x === undefined ? "" : String(x).replace(".", ","));

type Row = Record<string, string | number | undefined>;
const tables: Array<{ name: string; title: string; rows: Row[] }> = [];
const add = (name: string, title: string, rows: Row[]) => tables.push({ name, title, rows });

add("clientes", "Clientes", w.clients.map((c) => ({ id: c.id, nombre: c.name, contacto: c.contact, activo: c.active ? "sí" : "no" })));
add("proveedores", "Proveedores", w.suppliers.map((s) => ({ id: s.id, nombre: s.name, contacto: s.contact, links: s.links.map((l) => `${l.label}: ${l.url}`).join(" · ") })));
add("rubros", "Rubros (de obreros)", w.rubros.map((r) => ({ id: r.id, nombre: r.name })));
add("materiales", "Materiales", w.materials.map((m) => ({ id: m.id, nombre: m.name, unidad: m.unit, rubro: R(m.rubroId), costo_referencia: m.referenceCost })));
add("categorias", "Categorías de personal", w.config.categories.map((c) => ({ id: c.id, nombre: c.name, obrero: c.isWorker ? "sí" : "no" })));
add("empleados", "Personal", w.employees.map((e) => ({ id: e.id, nombre: e.name, categoria: w.config.categories.find((c) => c.id === e.categoryId)?.name, ingreso: e.hireDate, dias: e.workDays.join(" "), horas_dia: e.dailyHours, rubros: e.rubroIds.map(R).join(", "), sesiones: e.sessions.join(", ") })));
add("tarifas", "Valores con vigencia (costos por hora y multiplicadores)", w.rates.map((r) => ({ id: r.id, tipo: r.kind, sujeto: r.subjectId, valor: r.value, vigente_desde: r.validFrom })));
add("excepciones", "Excepciones y ausencias", w.exceptions.map((x) => ({ id: x.id, persona: E(x.employeeId), fecha: x.date, horas_disponibles: x.availableHours, nota: x.note })));
add("ots", "OTs", w.projects.map((p) => ({ id: p.id, ot: p.ot, cliente: w.clients.find((c) => c.id === p.clientId)?.name, descripcion: p.description, estado: p.status, subestado_cotizacion: p.quote.state, inicio: p.startDate, entrega: p.dueDate, aprobada: p.baseline?.approvedAt, precio_acordado: p.baseline?.agreedPrice, rentabilidad_cotizada: p.baseline?.quotedMarginPct })));
add("muebles", "Muebles", w.projects.flatMap((p) => p.items.map((i) => ({ id: i.id, ot: P(p.id), mueble: i.name, cantidad: i.quantity, terminadas: i.completedUnits }))));
add("lineas_cotizadas", "Líneas cotizadas (cotización vigente o aprobada)", w.projects.flatMap((p) => (p.baseline?.lines ?? p.quote.lines).map((l) => ({ id: l.id, ot: P(p.id), mueble: I(p.id, l.itemId), rubro: R(l.rubroId), tipo: l.kind === "labor" ? "horas" : "material", material: M(l.materialId), cantidad: l.quantity, unidad: l.unit, costo_unitario: l.unitCost }))));
add("horas_personal_cotizadas", "Horas de diseño/administración cotizadas", w.projects.flatMap((p) => (p.baseline?.staffLines ?? p.quote.staffLines).map((l) => ({ id: l.id, ot: P(p.id), categoria: w.config.categories.find((c) => c.id === l.categoryId)?.name, horas: l.hours, costo_hora: l.hourlyCost }))));
add("cotizacion_parametros", "Parámetros de cada cotización", w.projects.map((p) => ({ ot: P(p.id), rent_materiales: p.quote.marginMaterialsPct, rent_mano_obra: p.quote.marginLaborPct, costos_generales: p.quote.generalCosts.map((g) => `${g.name} ${g.mode === "pct" ? `${g.value} %` : `$ ${g.value}`}`).join(" · "), precio_lista_manual: p.quote.listPriceOverride, descuento: p.quote.discount, cuotas: p.quote.plan.map((c) => `${c.label} ${c.pct} % ${c.date}`).join(" · ") })));
add("cobros_previstos", "Cobros previstos vigentes (señas y cuotas)", w.projects.flatMap((p) => p.schedule.map((s) => ({ id: s.id, ot: P(p.id), concepto: s.label, fecha: s.date, importe: s.amount }))));
add("adicionales", "Adicionales aprobados", w.additionals.map((a) => ({ id: a.id, ot: P(a.projectId), mueble: I(a.projectId, a.itemId), rubro: R(a.rubroId), lineas: a.lines.map((l) => `${l.kind === "labor" ? "horas" : M(l.materialId)} ${l.quantity} × ${l.unitCost}`).join(" · "), precio: a.price, fecha: a.date })));
add("pedidos_rubro", "Pedidos de rubro de Planta", w.rubroRequests.map((r) => ({ id: r.id, ot: P(r.projectId), mueble: I(r.projectId, r.itemId), rubro: R(r.rubroId), horas: r.hours, estado: r.status, fecha: r.date, nota: r.note })));
add("bom", "BOM: versiones y líneas", w.boms.flatMap((b) => b.lines.map((l) => ({ bom: b.id, ot: P(b.projectId), version: b.version, estado: b.status, publicado: b.publishedDate, linea: l.id, mueble: I(b.projectId, l.itemId), rubro: R(l.rubroId), material: M(l.materialId), cantidad: l.quantity }))));
add("pedidos_material", "Pedidos adicionales de material", w.materialRequests.map((r) => ({ id: r.id, ot: P(r.projectId), mueble: I(r.projectId, r.itemId), material: M(r.materialId), cantidad: r.quantity, estado: r.status, fecha: r.date, nota: r.note })));
add("ordenes_compra", "Órdenes de compra", w.orders.map((o) => ({ id: o.id, numero: o.number, proveedor: w.suppliers.find((s) => s.id === o.supplierId)?.name, fecha: o.date, llegada_comprometida: o.expectedDate, comprobante: o.invoice ? `${o.invoice.number} ${o.invoice.date} ${o.invoice.amount}` : "" })));
add("lineas_oc", "Líneas de OC (por OT)", w.orders.flatMap((o) => o.lines.map((l) => ({ id: l.id, oc: o.number, ot: P(l.projectId) || "stock libre", mueble: I(l.projectId, l.itemId), material: M(l.materialId), cantidad: l.quantity, precio_unitario: l.unitPrice }))));
add("recepciones", "Materiales recibidos (y reversiones)", w.receipts.map((r) => ({ id: r.id, oc: w.orders.find((o) => o.id === r.orderId)?.number, linea: r.lineId, fecha: r.date, cantidad: r.quantity, lote: r.lotId, revertida: r.reversal ? `${r.reversal.date}: ${r.reversal.reason}` : "" })));
add("pagos_proveedor", "Pagos a proveedores", w.supplierPayments.map((p) => ({ id: p.id, oc: w.orders.find((o) => o.id === p.orderId)?.number, fecha: p.date, importe: p.amount, ot_explicita: P(p.projectId), referencia: p.reference })));
add("lotes", "Lotes de stock", w.lots.map((l) => ({ id: l.id, material: M(l.materialId), costo_unitario: l.unitCost, fecha: l.date, origen: l.source, oc: w.orders.find((o) => o.id === l.orderId)?.number, ot_origen: P(l.projectId) })));
add("movimientos", "Movimientos de stock", w.movements.map((m) => ({ id: m.id, lote: m.lotId, material: M(w.lots.find((l) => l.id === m.lotId)?.materialId), fecha: m.date, cantidad: m.quantity, desde: m.from, hacia: m.to, tipo: m.kind, registro: m.ref })));
add("entregas_produccion", "Entregas de material a producción", w.releases.map((r) => ({ id: r.id, ot: P(r.projectId), mueble: I(r.projectId, r.itemId), rubro: R(r.rubroId), material: M(r.materialId), cantidad: r.quantity, fecha: r.date })));
add("rendiciones", "Rendiciones (consumido / desperdicio / devuelto)", w.renditions.map((x) => ({ id: x.id, entrega: x.releaseId, fecha: x.date, consumido: x.consumed, desperdicio: x.waste, devuelto: x.returned })));
add("planificacion", "Planificación de Planta", w.plans.map((x) => ({ id: x.id, fecha: x.date, ot: P(x.projectId), mueble: I(x.projectId, x.itemId), rubro: R(x.rubroId), horas: x.hours })));
add("asignaciones", "Asignaciones a operarios", w.assignments.map((a) => ({ id: a.id, operario: E(a.employeeId), ot: P(a.projectId), mueble: I(a.projectId, a.itemId), rubro: R(a.rubroId), desde: a.from, hasta: a.to, horas_dia: a.hoursPerDay })));
add("horas", "Horas registradas (todas las personas)", w.timeEntries.map((t) => ({ id: t.id, persona: E(t.employeeId), fecha: t.date, ot: P(t.projectId) || "Trabajo interno", mueble: I(t.projectId, t.itemId), rubro: R(t.rubroId), horas: t.hours, nota: t.note, revision: t.review?.status ?? "pendiente", correcciones: t.corrections.map((c) => `${c.before.hours} → ${c.after.hours} h`).join(" · ") })));
add("otros_costos", "Otros costos reales", w.otherCosts.map((c) => ({ id: c.id, ot: P(c.projectId), fecha: c.date, descripcion: c.description, categoria: w.config.otherCostCategories.find((x) => x.id === c.categoryId)?.name, monto: c.amount })));
add("ingresos", "Ingresos efectivos", w.incomes.map((i) => ({ id: i.id, ot: P(i.projectId), fecha: i.date, importe: i.amount, referencia: i.reference })));
add("revisiones_contrato", "Revisiones de contrato", w.contractRevisions.map((r) => ({ id: r.id, ot: P(r.projectId), fecha: r.date, anterior: r.previous, nuevo: r.next, nota: r.note })));
add("entregas_cliente", "Entregas al cliente", w.handovers.map((h) => ({ id: h.id, ot: P(h.projectId), fecha: h.date, nota: h.note })));
add("cierres", "Cierres", w.closures.map((c) => ({ ot: P(c.projectId), fecha: c.date, por: c.by, ...Object.fromEntries(Object.entries(c.snapshot).map(([k, v]) => [k, v ?? ""])) })));
add("historial", "Historial de las OTs", w.projects.flatMap((p) => [...p.activity].reverse().map((a) => ({ id: a.id, ot: P(p.id), fecha: a.date, por: a.by, tipo: a.kind, automatico: a.auto ? "sí" : "", texto: a.text }))));

const csv = (rows: Row[]) => {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v === undefined || v === null ? "" : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n") + "\n";
};
for (const t of tables) writeFileSync(join(DATA, `${t.name}.csv`), csv(t.rows));

const md = (rows: Row[]) => {
  if (!rows.length) return "_Sin registros._\n";
  const cols = Object.keys(rows[0]);
  const cell = (v: unknown) => (v === undefined || v === null ? "" : typeof v === "number" ? n(v) : String(v).replace(/\|/g, "/"));
  return [`| ${cols.join(" | ")} |`, `| ${cols.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${cols.map((c) => cell(r[c])).join(" | ")} |`)].join("\n") + "\n";
};

const cfg = w.config;
const intro = `# Datos completos de la demo (escenario base)

Empresa ficticia **${cfg.companyName}**. Fecha de la demo (asOf): **${DEMO_AS_OF}** (martes). Todos los nombres, montos y
personas son inventados. Importes en pesos sin IVA. Generado por \`docs/demo-auditoria/exportar.mts\` a partir de
\`lib/core/seed.ts\`: no falta ningún registro (${tables.reduce((s, t) => s + t.rows.length, 0)} filas en ${tables.length} tablas).

Archivos estructurados: \`datos/escenario.json\` (estado completo, ids estables) y un CSV por tabla en \`datos/\`.
Resultados calculados de forma independiente: \`RESULTADOS_ESPERADOS.md\` y \`datos/esperados.json\`.

## Configuración y supuestos

- Nomenclador de OT: prefijo **${cfg.ot.prefix}**, partes ${cfg.ot.parts.join(" + ")}, último número usado ${cfg.ot.lastNumber}.
- Rentabilidad objetivo por defecto: materiales ${cfg.marginMaterialsPct} %, mano de obra ${cfg.marginLaborPct} % (margen sobre el precio).
- Costo financiero: ${cfg.financialMonthlyRatePct} % mensual, interés simple, mes de 30 días. Material sin pago cargado: invertido al recibir. Horas: invertidas el día trabajado.
- Costos generales de cotización: ${cfg.quoteGeneralCosts.map((g) => `${g.name} (${g.value}${g.mode === "pct" ? " % del costo directo" : " $"})`).join(", ")}.
- Categorías de otros costos: ${cfg.otherCostCategories.map((c) => c.name).join(", ")}.
- Umbrales: ${Object.entries(cfg.alerts).map(([k, v]) => `${k} = ${v}`).join(" · ")}.

## Historia de cada OT (resumen)

| OT | Situación al ${DEMO_AS_OF} | Qué prueba |
| --- | --- | --- |
| OT4301 Librería El Faro Azul | Cerrada el 10/08, cobrada | Ciclo completo; sobrante de 2 placas MDF devuelto a stock (después va a OT4306). |
| OT4302 Restó Cardo y Ajo | Cerrada el 04/09, saldo 30 % sin cobrar | Rentabilidad baja (horas de herrería de más); cliente moroso: el costo financiero sigue solo sobre el capital propio no recuperado (no sobre el saldo del precio). |
| OT4303 Coworking Nodo Sur | Producción: todo terminado y entregado | Cierre bloqueado: 1,5 placas de melamina en producción sin rendir y 2 cajas de tornillos asignadas sin usar. Descuento en la cotización. |
| OT4304 Óptica Visión Clara | Producción: terminada, entregada y rendida | Apta para cierre (alerta «lista para cerrar»). |
| OT4305 Clínica Dental Sonrisa Norte | Producción, entrega vencida (09/10) | Cuota vencida (21/09); costo financiero adicional por atraso; rubro Tapicería pedido por Planta y aprobado como adicional con precio (revisión de contrato); otro pedido de rubro abierto; laca entregada sin rendir; jornada asignada sin horas (Sofía 16/10). |
| OT4306 Café Brújula | Producción | 12 sillas (8/12); MDF: necesita 5, 2 asignadas desde stock (sobrante de OT4301) y 3 por comprar; OC-0020 compartida con OT4307 con recepción parcial y una recepción revertida; pago parcial repartido; pedido adicional de 3 m de tela; corrección de horas (Diego 16/10); horas extra (Camila 15/10); trabajo de otra tarea (Iván 19/10). |
| OT4307 Estudio Arenal Arquitectura | Compras (BOM v2) | BOM republicado; OC-0020 y OC-0021 en camino; MDF: necesita 5 y hay 2 libres (caso de prueba «asignar 2 de 5»); compras urgentes (inicio 26/10). |
| OT4308 Hotel Puerto Colibrí | Aprobada, BOM en borrador | «Pendiente de BOM». Herrería comprometida (falta de capacidad por vacaciones de Joaquín). |
| OT4309 Escuela de Música Clave de Sol | Cotización enviada | Potencial en capacidad. |
| OT4310 Café Brújula | Cotización en negociación sin cuotas | Información incompleta (Administración). |
| OT4311 Restó Cardo y Ajo | Borrador | Listado de borradores del Cotizador. |

`;

writeFileSync(join(HERE, "DATOS_DEMO_COMPLETOS.md"), intro + tables.map((t) => `## ${t.title}\n\nArchivo: \`datos/${t.name}.csv\` · ${t.rows.length} registros.\n\n${md(t.rows)}`).join("\n"));
console.log(`exportado: ${tables.length} tablas, ${tables.reduce((s, t) => s + t.rows.length, 0)} filas`);
