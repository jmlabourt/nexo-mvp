# Jefe de planta: entrega de materiales y cierre del día (diseño corto)

Pedido de producto (oct 2026). El Jefe de planta es quien maneja el material físico. **No es un ERP:**
no hay depósitos múltiples, remitos, lotes con código ni valorización nueva. Se usa el libro de movimientos de
stock que ya existe (`lib/stock.ts`) y la misma regla de siempre: **solo consumo y desperdicio son costo**.

## Qué registra el Jefe (solo cantidades, nunca importes)

1. **Entrega de material** (Planta → Proyectos → proyecto → "Entregar material"):
   material, cantidad, producto y operario (opcional). Sale de:
   - **el depósito** (stock libre): movimiento `assign` depósito → proyecto (el mismo de Stock → Asignar). Descuenta
     el stock libre.
   - **lo ya asignado al proyecto** (comprado para el proyecto): no hay movimiento, queda el registro de entrega.
   La entrega **no es costo todavía**: el material pasó del depósito a la planta.
2. **Cierre del día** (mismo lugar, "Cierre del día"): por producto, las unidades terminadas (el mismo dato y la
   misma función de siempre, `planta_set_completed_units`; las que quedan = cantidad − terminadas) y, por cada entrega
   abierta, cuánto se **consumió**, cuánto fue **desperdicio** y cuánto **sobró reutilizable** (vuelve al depósito
   como sobrante, con el costo de su lote). Lo que no se cierra **sigue en planta** asignado al proyecto (sin costo).

| Concepto | Dónde queda | ¿Es costo del proyecto? |
|---|---|---|
| Compra | Compras / Órdenes de compra (lote con su costo) | No (asignado) |
| Entrega | Registro de entrega + `assign` si sale del depósito | No |
| Consumo | `consume` + uso de material con el costo del lote | **Sí** |
| Desperdicio | `waste` + uso de material con el costo del lote | **Sí** |
| Sobrante reutilizable | `to_leftover` → lote sobrante en el depósito, mismo costo | No (vuelve al stock) |
| Sigue en planta | Asignado al proyecto | No |

## Quién ve qué (aplicado en la base)

| Rol | Entregas y cierre | Stock |
|---|---|---|
| Jefe de planta | Registra (funciones `planta_deliver_material`, `planta_close_day`) y ve las entregas | Lee lotes y movimientos **sin costo ni proveedor** (`planta_stock`) |
| Administrativo | Ve las entregas (lectura) y un resumen con costo en "Para revisar hoy" (sin pantallas nuevas) | Todo, como siempre |
| Compras | No ve entregas | Solo consulta ("Disponible en depósito"), como siempre |
| Operario | Nada | Nada |

Nadie escribe la tabla `material_deliveries` directo: solo las funciones, que validan proyecto, producto, operario,
cantidades contra el saldo real de cada lote, y ponen el costo del lote del lado de la base (el Jefe nunca lo manda
ni lo recibe).

## Resumen del Administrativo ("Para revisar hoy")

- **Entregado y sin cierre** (atención): entregas de días anteriores sin cerrar: "no se sabe cuánto se consumió".
  Cuesta: el valor de lo entregado al costo de su lote.
- **Cierre del día** (info, últimos 7 días): consumido $, desperdicio $ (ambos costo) y sobrante reutilizable que
  volvió al depósito (no es costo).

## Migración

`supabase/migrations/20261024120000_planta_entregas_y_cierre.sql` — tabla nueva + tres funciones. No borra ni cambia
datos. Se aplica **antes** de promover el deploy que trae estas pantallas (ver el reporte de la tanda).
