# Circuito entre sesiones

Camino por defecto de un proyecto. No es una secuencia obligatoria: las etapas de cada mueble pueden superponerse. Usa
las etapas que ya guarda la base (Cotización, Aprobado, Compras, Producción, Instalación, Finalizado) y respeta los
cuatro estados generales (En cotización, Aprobado, En proceso, Cerrado). "En negociación" y "No aprobado" son
subestados de En cotización. La lógica está en `lib/circuit.ts` (funciones puras, `tests/circuito.test.ts`).

## Paso por paso

| Paso del circuito | Quién envía | Quién recibe | Dónde le aparece | ¿Existía, se adaptó o falta? | ¿Persistencia real o prototipo? |
| --- | --- | --- | --- | --- | --- |
| 1. Cargar el proyecto y cotizar | Administración | Gerencia | Cotizador / Nuevo proyecto → Proyectos, "En cotización" | Ya existía (se adaptó el cotizador, puntos A y B) | Real |
| 2a. Aprobado por el cliente | Administración | Diseño (Administración) | Ficha: "Aprobado por el cliente". Dashboard de Administración: "En Diseño" | Se adaptó (antes solo "Cambiar etapa") | Real (etapa; el presupuesto queda como base) |
| 2b. No aprobado, con motivo | Administración | Administración y Gerencia | Ficha (etapa "No aprobado") e Historial | Nuevo (antes era un botón deshabilitado) | Real (historial del proyecto) |
| 2c. Renegociación de precio | Administración | Administración y Gerencia | Ficha (etapa "En negociación"), Historial con el precio anterior. Dashboard de Administración: "En negociación" | Nuevo | Real (precio e historial) |
| 3. Diseño corrige materiales y adjunta planos | Diseño (Administración) | Compras, Gerencia, Jefe de planta | Muebles → "Materiales: cotizado → real" y "Corregir cantidad (Diseño)". Archivos por mueble | Nuevo, sobre la corrección auditada que ya existía. Los planos ya existían | Real (`admin_correct_value`: quién, cuándo, anterior, nuevo, motivo) |
| 4. Diseño → Compras | Administración | Compras | Dashboard de Compras: "Proyectos nuevos para comprar". Necesidades con la cantidad real | Se adaptó | Real. La marca "Aumentó por Diseño" en una empresa real: **falta** (Compras no recibe el presupuesto base ni las correcciones) |
| 5. Compras consigue el precio y carga el real | Compras | Gerencia y Administración | Órdenes de compra → factura → costo real. Gerencia: desvío por precio | Ya existía | Real |
| 6. Compras → Jefe de planta | Administración o Gerencia | Jefe de planta | Dashboard del Jefe: "Proyectos nuevos para recibir". Proyectos con muebles, horas por rubro, planos y materiales | Se adaptó | Real. Materiales y planos para el Jefe en una empresa real: **falta** (la base no se los comparte) |
| 7. Asignaciones, entrega de stock, horas y unidades terminadas | Jefe y operarios | Gerencia (costos), Stock | Operarios → Asignaciones, Material en planta, Mi día, unidades terminadas | Ya existía | Real |
| 8a. "¿Se terminó este proyecto?" | Jefe de planta | Administración | Proyectos del Jefe y su Dashboard | Nuevo | La respuesta del Jefe es **prototipo** (botón deshabilitado: no tiene cómo guardarla). Que el proyecto está listo se deriva de las unidades terminadas, que sí se guardan |
| 8b. Proyecto listo: ¿qué se hace? | Administración | Gerencia | Ficha: retiro en planta, flete e instalación (pasa a Instalación) o finalizar. Dashboard de Gerencia: "Listos para cerrar" | Nuevo | Real (historial y etapa) |
| 8c. Gerencia cierra | Gerencia | — | Ficha: "Cerrar proyecto" | Ya existía | Real |
| 9. Cada sesión ve sus etapas | — | — | Proyectos de Administración: columna "Etapa" (en cotización, en negociación, aprobado, listo para definir entrega, finalizado) | Nuevo | Derivado de datos reales |
| 10. Cambios que se reflejan en las demás sesiones | — | — | Cantidades de Diseño → necesidades y costos. Precio de Compras → desvío. Entregas → stock. Horas → costos | Ya existía; se sumaron las cantidades de Diseño | Real |

## Cuando Diseño cambia materiales (D.2)

| Dónde | Qué se ve | Estado |
| --- | --- | --- |
| Detalle del mueble (Gerencia y Administración) | "cotizado 8 → real 10 (+2)", impacto, motivo, quién y cuándo, agrupado por mueble | Real |
| Compras → Necesidades | Cantidad real, "Aumentó por Diseño (+2)" y presupuesto original | Cantidad real: real. La marca y el original se ven con "Ver como Compras" (el mismo usuario de Gerencia); con el usuario de Compras **falta** |
| Gerencia: ficha y Dashboard | Desvío de materiales por cantidad + por precio = total (`materialDeviationSplit`) | Real |
| Administración: detalle | Igual que el detalle del mueble | Real |
| Jefe de planta | Cantidad real por mueble, sin importes | Se ve con "Ver como Jefe de planta"; con el usuario del Jefe **falta** |
| Alerta única | "Diseño aumentó materiales: +2 placa de MDF 18 mm en Mesa", para Compras y Gerencia (con $) | Real para Gerencia; con el usuario de Compras **falta** |

## Prueba de punta a punta (base local)

`e2e/circuito.mjs` sobre PGlite con todas las migraciones del repo y cuatro usuarios (ver `e2e/README.md`). Proyecto
P-1056 (en cotización). Resultado de la última corrida:

| Eslabón | Resultado |
| --- | --- |
| 1. Renegociación de precio (queda En negociación tras recargar) | PASA |
| 2. Aprobado por el cliente → Diseño | PASA |
| 3. Diseño corrige MDF 18 mm de 8 a 10 con motivo | PASA |
| 4. Diseño → Compras | PASA |
| 5a. Compras: "Proyectos nuevos para comprar" | PASA |
| 5b. Compras: la necesidad usa la cantidad real (10) | PASA |
| 5c. Compras: marca "Aumentó por Diseño (+2)" | **FALLA**: Compras no recibe el presupuesto base ni las correcciones |
| 6. Gerencia: desvío por cantidad en la ficha y alerta con $ en el Dashboard | PASA |
| 7. Compras → planta | PASA |
| 8a. Jefe: "Proyectos nuevos para recibir" | PASA |
| 8b. Jefe: cantidad real de materiales | **FALLA**: la base no le comparte las líneas de materiales |
| 9. Jefe: carga las unidades y aparece "¿Se terminó este proyecto?" | PASA (la respuesta es prototipo) |
| 10. Administración: "Proyecto listo: ¿qué se hace?" → se finaliza | PASA |
| 11. Gerencia: "Listos para cerrar" | PASA |

No se probaron en esta corrida, así que no se dan por aprobados:

- la carga del precio real por Compras (orden de compra y factura) y su desvío por precio;
- el cierre por Gerencia;
- la carga de horas del operario y la entrega o el cierre del día del Jefe. Estos últimos ya tenían su prueba en la Fase 2.
