# Matriz de pruebas de la demo

Escenario base: **Carpintería Lapacho (empresa ficticia)**, fecha simulada **martes 20/10/2026**. Antes de cada
recorrido: menú lateral → **Restaurar datos de prueba**. Para cambiar de sesión: **Demo: ver como**.

Cada recorrido dice qué hacer, qué tiene que pasar en la misma sesión y qué tiene que verse en otra. La columna
**Test** indica la prueba automática que cubre la misma regla (`tests/demo-aceptacion.test.ts`, caso N; `E` =
`tests/demo-esperados.test.ts`, que compara contra el cálculo independiente de `calculo_independiente.py`).

Datos de referencia: `DATOS_DEMO_COMPLETOS.md` (todos los registros) y `RESULTADOS_ESPERADOS.md` (todas las cifras).

## 1. Recorridos completos

| # | Recorrido | Sesión → acción | Resultado esperado | Efecto en otra sesión | Test |
| --- | --- | --- | --- | --- | --- |
| 1 | Cliente nuevo y OT | Administración → Clientes → **Nuevo cliente** «Panadería Las Tres Espigas». Cotizador → **Nueva cotización** con ese cliente, descripción «Mostrador y estantes». | Se crea **OT4312_PanaderiaTres_MostradorEstantes** (correlativo siguiente a OT4311). Borrar la cotización no libera el número: la siguiente es OT4313. | Gerencia → Proyectos la lista en Cotización. | 1 |
| 2 | Cotizar y aprobar | Administración → Cotizador → la OT nueva: un mueble, materiales y horas de dos rubros, cobros previstos (seña y saldo) → **Confirmar aprobación del cliente**. | Precio = costo ÷ (1 − rentabilidad) por bloque; se suma el costo financiero previsto. La cotización queda congelada (no se puede volver a guardar). Estado **Aprobado**. | Administración → Dashboard: aparece en «Pendientes de BOM». Gerencia ve la cotización original en la ficha. | 2 |
| 3 | BOM y publicación | Administración → ficha → BOM → **Armar BOM desde la cotización**, cambiar una cantidad, **Guardar borrador**, después **Publicar y enviar a Compras**. | El borrador no llega a Compras. Al publicar: estado **Compras**. | Compras → **Por comprar** muestra la OT con la cantidad del BOM publicado (no la cotizada). | 3 |
| 4 | Stock libre a una OT | Compras → Stock → Placa MDF 18 mm (2 libres) → **Asignar a OT** OT4307, 2. | Libre 0; asignado a OT4307 2; en Por comprar OT4307 pasa de 5 a **3**. OT4307 pasa sola a **Producción** (historial: automático). | Planta → Proyectos ve el material asignado de OT4307. | 4 |
| 5 | OC para dos OTs, recepción parcial | Compras → OCs → **Registrar orden de compra**: Pintura poliuretánica 7 l a OT4306 y 2 l a OT4305. **Materiales recibidos**: 4 y 2. | OT4306: asignado 4, pedido sin recibir 3, por registrar 0. OT4305: asignado 2. Cada lote guarda el precio de esa OC. | Planta ve 4 l y 2 l en cada OT. Gerencia: el costo entra a la OT recién cuando se consume. | 5 |
| 6 | Revertir una recepción | Compras → OCs → una recepción recién hecha → **Revertir** con motivo. | Vuelve a «pedido sin recibir»; el saldo asignado baja. Si parte ya se entregó a producción, se bloquea («corregí primero…»). En el escenario base ya hay una recepción revertida en OC-0020. | Planta deja de ver ese material. | 6 |
| 7 | Planificar un rubro cotizado | Planta → Proyectos → Planificación → OT4306 · Barra → **Planificar** Carpintería 27/10, 6 h. | Se guarda. Herrería no aparece como opción para la barra. | Gerencia → Dashboard → Capacidad: suben las horas comprometidas de Carpintería. | 7 |
| 8 | Rubro no cotizado → adicional | Planta → OT4305 → **Pedir rubro nuevo** (ya hay uno abierto: Mostrador · Armado y montaje). Administración → ficha OT4305 → **Aprobar como adicional** con horas, costo y material. | La cotización original no cambia; el adicional suma al contrato vigente. Recién después Planta puede planificar ese rubro. Si se agrega material, una nueva versión de BOM lo manda a Por comprar. | Compras ve el material del adicional. Gerencia ve el adicional en la ficha. | 8 |
| 9 | Asignación → Mi día → corrección | Planta asignó a Iván Correa la Mesa de OT4306 hoy. Operario (Iván) → **Mi día** aparece precargado; cambia a Barra · Carpintería 8 h → **Guardar jornada**. Planta → Operarios → revisión → **Corregir** a 6 h. | Mi día solo deja elegir OTs, muebles y rubros válidos. La corrección queda con antes/después. La planificación no cambia. | Gerencia: el costo de mano de obra de OT4306 baja 2 h × costo vigente. | 9 |
| 10 | Horas internas | Planta, Compras, Administración y un operario → **Registrar mis horas** → 2 h «Trabajo interno». | Se suman a las horas de cada persona. | Ninguna OT cambia de costo. Gerencia → Personal ve las horas. | 10 |
| 11 | Entregar y rendir | Planta → OT4305 → Silla → **Entregar a producción** Tela 4 m; después rendir 2,5 consumido, 0,5 desperdicio, 0,5 devuelto. | Quedan 0,5 m **en producción**. 4 = 2,5 + 0,5 + 0,5 + 0,5. Costo de materiales +3 × $28.500. Lo devuelto vuelve a stock libre con el costo de su lote. | Compras ve +0,5 m libre. Gerencia ve el desperdicio. | 11 |
| 12 | Unidades terminadas | Planta → OT4306 → Sillas → **Terminar unidades** 3, después 12. | 3/12 sigue **En proceso**; 12/12 **Finalizado**. No acepta 13. Con barra y mesas terminadas, todos los muebles quedan finalizados. | Gerencia → Alertas: «Lista para cerrar» cuando además se rinde y se entrega. | 12 |
| 13 | Cierre bloqueado → permitido | Gerencia → OT4303 → **Cerrar OT**. | Bloqueado: faltan rendir Melamina 1,5 en producción y Tornillo 2 asignados. Planta lo ve en Alertas. Planta rinde la melamina y **Devolver a stock** los tornillos → Gerencia cierra. | La OT pasa a **Cerrado** para todos; se guarda la foto de costos. | 13 |
| 14 | Ingresos | Gerencia → OT4308 → **Registrar ingreso** seña $3.532.000 y un anticipo de $1.000.000. | Cobrado $4.532.000; pendiente $4.298.000. No acepta más que el contrato ni fechas futuras. No hay facturas de venta. | Dashboard: «Dinero cobrado» del período sube. | 14 |
| 15 | Costo financiero con atraso | Gerencia → OT4305 → Costo financiero. | La cuota del 21/09 está vencida: el costo financiero actualizado supera al previsto (**CF adicional**). Cada tramo = capital × 4 % × días ÷ 30. Si se registra la cuota con fecha 21/09, baja. | Dashboard → costos del período: financiero. | 15, E |
| 16 | Pago a proveedor multi-OT | Gerencia → OT4307 → OC-0020 → **Registrar pago**. | El pago de $700.000 se reparte por valor de línea (OT4306 = 700.000 × 582.000 ÷ 1.300.000). No suma costo de material. No acepta pagar más que lo recibido o el valor de la OC. | Compras ve el estado de pago de la OC. | 16 |
| 17 | Tarifa nueva | Gerencia → Personal → Camila Rivas → **Costo por hora** $9.200 desde 01/11. | Las horas anteriores no cambian de costo. Diego Paz ya tiene un cambio desde 01/10: sus horas de septiembre van a $8.000 y las de octubre a $8.800. | Ninguna OT cambia hoy. | 17 |
| 18 | Filtro del Dashboard | Gerencia → Dashboard → Desde/Hasta: octubre; después julio. | Tarjetas y tres gráficos usan la misma ventana. En julio no hay rentabilidad (ninguna OT cerrada) y OT4301 aparece como parcial; en agosto aparece como final. «Pendiente de cobrar» es saldo a la fecha de corte. | — | 18, E |
| 19 | Persistencia y restaurar | Cualquier cambio → recargar la página → sigue. **Restaurar datos de prueba** → vuelve exactamente al escenario base. | Mismo estado en las cinco sesiones. | Nada se escribe en Supabase. | 19, `tests/demo-local.test.ts` |
| 20 | Estado manual | Administración → OT4306 → **Corregir estado** a Compras. Compras → asigna 1 m de tapacanto a OT4306. | Vuelve sola a **Producción**. El historial guarda los dos cambios (manual y automático). Administración no puede pasar a Cerrado. | — | 20 |

## 2. Casos límite

| Caso | Dónde | Qué probar | Esperado | Test |
| --- | --- | --- | --- | --- |
| OC multi-OT | OC-0020 (OT4306 + OT4307) | Recepción parcial, una revertida, pago parcial | Cada línea neta en su OT; el pago se prorratea | 5, 6, 16 |
| Recepción revertida | OC-0020 | Revertir con material ya entregado | Bloqueado | 6 |
| BOM republicado | OT4307 (BOM v2) | Comparar v1 y v2 en la ficha | Por comprar usa solo la v2 | aceptación «otras reglas» |
| Corrección de horas | OT4306 | Corregir horas de un operario | Cambia el costo, la planificación no | 9 |
| Sobrante a otra OT | OT4301 → OT4306 (MDF) | En el escenario, 2 placas sobrantes de OT4301 se asignaron a OT4306 | OT4306 necesita 5: 2 asignadas + 3 por comprar | E (Por comprar) |
| Cambio histórico de tarifa | Diego Paz (01/10) | Horas antes y después | $8.000 / $8.800 | 17 |
| Cliente en mora | OT4305 (cuota vencida 21/09) | Alertas de Gerencia y costo financiero | Alerta «cobro vencido»; CF adicional > 0 | 15 |
| Operario redirigido | Iván Correa, 20/10 | Asignado a la Mesa, trabaja en la Barra | Se registra lo real; Planta corrige | 9 |
| OT sin material | OT4308 (BOM en borrador) | Por comprar | No aparece hasta publicar | 3 |
| Cierre bloqueado | OT4303 | Cerrar con material sin rendir | Bloqueado con motivos; Planta ve la alerta | 13 |
| Jornada asignada sin horas | Sofía Arce, 16/10, OT4305 | Gerencia → Alertas → datos pendientes | Desaparece al cargar las horas | aceptación «otras reglas» |
| Capacidad corta | Herrería, Joaquín de vacaciones 26/10–13/11 | Dashboard → Capacidad | Herrería: capacidad 40 h, comprometidas 55,43 h, saldo −15,43 h; alerta «falta capacidad» | E (capacidad) |
| Horas extra | Camila Rivas, 15/10, 10 h | Costo de la jornada | 2 h extra × 1,5 | 17 |
| Compra urgente que se resuelve | OT4307 · MDF | Asignar las 2 libres y registrar OC por 3 | La alerta desaparece (no hay «descartar») | aceptación «otras reglas» |
| Sesión equivocada | Cualquier acción | Ej.: Compras aprueba, Planta cierra | «Esta acción no corresponde a tu sesión.» | 8, 12, 13, `demo-local` |

## 3. Integridad (automático)

`tests/demo-esperados.test.ts`: todas las referencias existen; ningún lote queda negativo en ninguna fecha y cada lote
suma cero entre lugares; cada entrega a producción cumple liberado = consumido + desperdicio + devuelto + en
producción; ningún día supera 24 h; las horas de cada OT son la suma de sus registros; la OT pública no se repite.
