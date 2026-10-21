# Blerp · modo demostración integral

Rama `claude/epic-johnson-zn9v9u`. Solo frontend: no se tocó `supabase/`, `lib/supabase/`, migraciones, RLS, RPC,
autenticación, middleware (`proxy.ts`), API routes, server actions ni variables de entorno. No hay deploy ni merge.

## 1. Guía de uso

1. Entrar con cualquier usuario (el middleware pide sesión; ver `PENDIENTES_BACKEND.md` §7.1).
2. En el menú lateral, abajo: **Abrir modo demostración**. Arriba aparece el rótulo
   _"Modo demostración — guardado en este navegador · Datos de ejemplo"_.
3. **Demo: ver como** (menú lateral) cambia de sesión: Gerencia, Administración, Compras, Jefe de planta, Operario.
   Las cinco leen y escriben el mismo estado.
4. Todo lo que se registra queda en este navegador (`localStorage`, clave `blerp-demo:datos`, con versión de esquema)
   y sigue ahí después de recargar.
5. **Restaurar datos de prueba** vuelve al escenario inicial. **Salir de la demostración** vuelve a la empresa real;
   la demo nunca escribe en la base ni mezcla datos con una cuenta real.

Escenario inicial: 14 proyectos (2 en cotización, 8 aprobados o en proceso, 4 cerrados), facturas y cobros, condiciones
de pago, BOM publicados, clientes, proveedores, rubros y tarifas. Todos los nombres e importes son ficticios.

### Recorrido sugerido (una misma OT entre sesiones)

| Paso | Sesión | Dónde | Qué hacer |
| --- | --- | --- | --- |
| 1 | Administración | Cotizador | Cargar muebles; **Cargar condiciones de cobro** (inicio, entrega, días de pago, seña, cuotas): el gasto financiero se calcula. |
| 2 | Administración | Proyectos → ficha | Aprobar (congela presupuesto y contrato). En otra cotización, **Registrar rechazo** con motivo. |
| 3 | Administración | Ficha → Muebles | **Nueva versión del BOM**, editar, **Guardar borrador** (Compras no lo ve), **Finalizar y enviar BOM**. |
| 4 | Administración | Ficha → Contrato y pagos | Cambiar el contrato vigente con motivo; seña y cuotas. |
| 5 | Compras | Necesidades | Elegir materiales de dos OT → **Generar orden de compra**; en Órdenes: enviar, **Recibir** en parte, **Registrar factura**. |
| 6 | Gerencia | Ficha → Facturación | Confirmar el pago al proveedor; registrar factura de venta, cobro y anticipo (y aplicarlo). |
| 7 | Jefe de planta | Proyectos | **Entregar material**; **Cierre del día** con consumido, desperdicio y devuelto; el resto queda en producción. |
| 8 | Operario | Mi día | Cargar horas y **Registrar horas**. |
| 9 | Jefe de planta | Operarios | Revisión de horas: **Redistribuir horas** con motivo. |
| 10 | Adm. / Compras / Jefe | Dashboard | **Registrar mis horas** (a una OT o trabajo interno). |
| 11 | Jefe de planta | Proyectos | Con todas las unidades terminadas: **Confirmar entrega al cliente**. |
| 12 | Gerencia | Ficha | **Cerrar proyecto** (bloquea con material sin rendir; avisa costos pendientes). |
| 13 | Gerencia | Dashboard | Ver facturación por OT y mes, rentabilidad presupuestada / hasta hoy (parcial) / final, capacidad. |

## 2. Qué se conservó, modificó y eliminó

**Se conservó:** identidad visual, `app-shell`, navegación con exactamente 23 pestañas (5 + 7 + 6 + 4 + 1), flujo
listado → detalle, cotizador por mueble, store y operaciones existentes (stock por lotes, órdenes, horas, cierre).

**Se modificó:**
- Dashboard de Gerencia: 4 KPIs, "Para mirar hoy" (máx. 5) y el detalle plegado (facturación, rentabilidad, costos y
  horas, capacidad, cómo se calcula). Capacidad confirmada vs potencial **sin probabilidades**, por semana o mes.
- Ficha → Facturación (Gerencia): facturas, cobros, anticipos, pagos a proveedores, gasto financiero estimado.
- Cierre: exige unidades terminadas, entrega real y nada sin rendir; los costos pendientes avisan
  ("Cerrado con costos pendientes").
- Configuración (Gerencia): rubros de texto libre, costo horario por rubro con excepción por persona y vigencia,
  tasa de gasto financiero, otros costos generales, sección Demo.
- Personal: jornada, días, multirrol (rubros con horas en el mes), costo por hora.
- Administración: BOM por versiones, Contrato y pagos, Clientes y Proveedores editables, "Registrar mis horas".
- Cotizador: condiciones de cobro y gasto financiero por tramos.
- Compras: necesidades solo del BOM publicado (mueble y versión por línea); no paga.
- Jefe: material en producción entre días; entrega real; corrección de horas también en la demo.
- Mi día: botón "Registrar horas".

**Se eliminó:** "Ingresar stock" (Stock de Gerencia es solo consulta), "Marcar como pagada" en Compras (en la demo),
la carga ponderada por probabilidad del Dashboard y del glosario.

## 3. Matriz de datos

| Dato | Quién lo registra | Quién lo consulta | Fórmula / estado | Contrato futuro |
| --- | --- | --- | --- | --- |
| Cotización por mueble | Administración | Gerencia | Σ cantidad × precio unitario por mueble | `projects`, `project_items`, `budget_lines` (+ `item_id`) |
| Presupuesto aprobado | Administración (aprobar) | Todos (sin importes en Compras/Jefe) | Foto al aprobar | `projects.baseline` (existe) |
| Contrato vigente | Administración | Gerencia | Última revisión o el aprobado | `ContractRevision` |
| Condiciones de pago | Administración (cotizador / ficha) | Gerencia | Seña + cuotas + días después de la entrega | `PaymentTerms`, `ScheduledPayment` |
| Factura de venta | Gerencia | Gerencia | Mes por fecha de emisión | `SalesInvoice` |
| Cobro / anticipo | Gerencia | Gerencia | Mes por fecha de ingreso; anticipo aplicado sin duplicar | `Collection` |
| Rechazo | Administración | Gerencia | Sigue "En cotización", nunca venta | `activity_events.kind = rejected` |
| BOM | Administración | Compras, Jefe | Solo la versión publicada | `BomVersion`, `BomVersionLine` |
| Necesidad | (derivado) | Compras | BOM publicado − órdenes − compras − asignado − stock libre | Selector `materialNeeds` |
| Orden de compra | Compras | Gerencia, Jefe | Una OC, varias OT (destino por línea) | `purchase_orders` (existe) |
| Recepción / lote | Compras | Jefe, Gerencia | Parcial; cada recepción es un lote | `stock_lots`, `stock_movements` (existe) |
| Factura de proveedor | Compras | Gerencia | Crea el costo real de materiales | `purchase_orders.invoice_*` (existe) |
| Pago a proveedor | Gerencia | Gerencia, Compras (estado) | No es ingreso ni costo nuevo | `SupplierPayment` |
| Liberado / en producción / rendido | Jefe | Gerencia | liberado = consumido + desperdiciado + devuelto + en producción | `MaterialDelivery` (+ acumulados) |
| Horas de operario | Operario | Jefe, Gerencia | horas × costo vigente ese día | `actual_entries` (existe) |
| Corrección de horas | Jefe | Gerencia | Reparte horas y costo, total igual, con motivo | `planta_correct_hours` (existe) |
| Horas propias / internas | Adm., Compras, Jefe | Gerencia | Con OT suman al costo; internas no | `InternalHours` |
| Entrega al cliente | Jefe | Gerencia, Adm. | Fecha y responsable | `ClientHandover` |
| Cierre | Gerencia | Todos | Bloqueos y avisos (`closeCheck`) | `ProjectClosure` |
| Rentabilidad | (derivado) | Gerencia | Presupuestada / hasta hoy (PARCIAL) / final | Selector `profitView` |
| Margen agregado | (derivado) | Gerencia | Σ ganancias / Σ contratos | Selector `aggregateMargin` |
| Gasto financiero | Gerencia (tasa) | Gerencia, Adm. (cotizador) | precio × tasa / 100 × días / 30, por tramos | `Ledger.financialMonthlyRatePct` |
| Capacidad | (derivado) | Gerencia | Personas × jornada × días; confirmado / potencial | Selector `capacityTimeline` |
| Rubros, tarifas | Gerencia | Todos | Excepción de la persona > rubro; vigencia | `RubroCatalogEntry`, `RateRecord` |
| Clientes, proveedores | Adm. (Compras: proveedores) | Todos | Sin duplicar nombres | `ClientEntry`, `SupplierEntry` |

Los contratos están en `types/index.ts` (al final). Las operaciones puras, en `lib/ledger.ts`, `lib/tablero.ts`,
`lib/financial.ts`, `lib/bom-needs.ts`, `lib/plant-materials.ts` y `lib/hours-review.ts`.

## 4. Pruebas (§11 del pedido)

| # | Escenario | Cómo se verificó | Resultado |
| --- | --- | --- | --- |
| 1 | Reutilización y UX | Capturas antes/después, escritorio y móvil (`docs/capturas-ux/demo/`) | Hecho |
| 2 | Cotización: aprobar / rechazar | `tests/aceptacion-demo.test.ts` | Pasa |
| 3 | BOM borrador / publicado / nueva versión | `tests/aceptacion-demo.test.ts`, `tests/ledger.test.ts` | Pasa |
| 4 | OC de dos OT, recepción parcial, factura, pago | `tests/aceptacion-demo.test.ts` | Pasa |
| 5 | Reservar, liberar, rendir, en producción | `tests/aceptacion-demo.test.ts`, `tests/tablero.test.ts` | Pasa |
| 6 | Horas de todos los roles | `tests/aceptacion-demo.test.ts` | Pasa |
| 7 | Facturación por OT, mes, total; rentabilidad parcial | `tests/aceptacion-demo.test.ts`, `tests/tablero.test.ts` | Pasa |
| 8 | Capacidad semanal/mensual sin probabilidades | `tests/tablero.test.ts` | Pasa |
| 9 | Gasto financiero ($1.000.000 → $100.000; seña, atraso, pago tardío, parcial) | `tests/financiero.test.ts` | Pasa |
| 10 | Entrega y cierre | `tests/aceptacion-demo.test.ts` | Pasa |
| 11 | Persistencia y restaurar | `tests/aceptacion-demo.test.ts` y en el navegador (`e2e/demo-persistencia.mjs`) | Pasa |
| 12 | No-regresiones | `npm run typecheck`, `npm run lint` (0 errores, 3 avisos previos), `npm test` (61 archivos, 739 pruebas), `npm run build` | Pasa |

**Límites conocidos**
- La demo pide iniciar sesión (el middleware no se tocó).
- Los rubros nuevos del catálogo se usan en tarifas, personal y capacidad; el Cotizador sigue con los rubros fijos
  (`RubroId`), porque cambiarlo toca el guardado de `budget_lines`.
- Diseño de cada mueble (estado y etapas) sigue con datos de ejemplo, sin edición.
- Lo vencido a hoy en el gasto financiero actualizado usa la fecha del día: la cifra cambia día a día.
- En una empresa real, los registros nuevos muestran "Pendiente de backend" (no se simula ningún guardado).

## 5. Capturas

`docs/capturas-ux/demo/antes/` (versión anterior, cuenta real local) y `docs/capturas-ux/demo/despues/` (modo
demostración): Dashboard de Gerencia, Proyecto, Cotizador, Compras, Planta y Mi día, en escritorio y móvil.
