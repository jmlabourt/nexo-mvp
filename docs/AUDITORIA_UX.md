# Auditoría UX — Fase 0 (solo diagnóstico)

> **Objetivo de Blerp:** que cargar y leer datos sea muy intuitivo y que, minuto a minuto, se vea **en qué proyecto y por qué
> causa se está perdiendo rentabilidad**. Cada pantalla tiene que entenderse sola, porque la gente va a necesitar entrenamiento.
>
> **Esta fase no cambia código.** Es un diagnóstico con propuestas. No se implementa nada hasta que apruebes la lista de la §8.

## 0. Cómo se hizo

- **Versión:** `main` al 19/10/2026 (commit `68b1e47`, que incluye el PR de arreglos de la compañera), con la demo de Madera Sur
  (`buildSeed`, fechas relativas a hoy) servida por un Supabase simulado.
- **Capturas** de todas las pantallas y pestañas de los 4 roles, en escritorio (1440 px), y de Operario también en celular (390 px):
  [`docs/capturas-ux/antes/`](capturas-ux/antes/). Son 71 capturas; cada hallazgo cita la suya.
- **Escenarios (§2):** se recorrieron en la app. Además se **midió** con las mismas funciones de cálculo de la app qué número
  cambia (y cuál no) cuando pasa algo: por ejemplo, cargar 40 h de más o registrar una factura más cara.
- **Boceto del dashboard:** [`docs/capturas-ux/propuesta-dashboard.html`](capturas-ux/propuesta-dashboard.html) (HTML estático),
  con capturas [`propuesta-dashboard.png`](capturas-ux/propuesta-dashboard.png) y [`propuesta-dashboard-celular.png`](capturas-ux/propuesta-dashboard-celular.png).

### Lo más importante, en 6 líneas

1. **La cadena se corta en la plata.** En P-1058 se cargaron 14 h de más y llegó una factura $ 450.000 más cara, y el
   **margen proyectado no se mueve** (26,8 % → 26,8 %). Con 40 h de más tampoco se mueve; recién con 300 h de más baja.
   Ver §2-A y §2-B.
2. **Ninguna alerta operativa dice cuánta plata es.** "14 h por encima de lo estimado" no dice que son ≈ $ 210.000 (≈ 1,3 puntos de margen).
3. **Hay demasiadas alertas, y muchas repetidas.** El Administrativo tiene 27, y 15 son ruido o duplicados. Además, "Marcar
   resuelta" dura **un día**: al día siguiente la alerta vuelve.
4. **El Dashboard no responde "¿qué proyecto pierde y por qué?"**. Muestra conteos (6 / 1 / 1, 27, 10, 8), un rubro sin
   monto y un bloque de horas que hoy dice "Se pasaron 0" mientras hay una alerta de +14 h.
5. **Un proyecto nuevo no llega solo a planta.** El asistente no pide productos, así que "Pendientes de asignar" queda vacío
   hasta que alguien los carga en otra pestaña. Además, las horas se estiman **dos veces** (presupuesto y productos) y pueden no coincidir.
6. **El Operario puede entrar a "Material usado"** (con desperdicio y sobrante) desde Mi día. El pedido decía solo horas.

---

## 1. (a) Hallazgos por pantalla

Para cada pantalla se responde:
- **5 s:** ¿se entiende en 5 segundos qué estoy mirando?
- **Primero:** ¿lo más importante se ve primero?
- **Qué hago:** ¿queda claro qué hay que hacer acá?
- **Distrae:** ¿qué información distrae y debería bajar?
- **Escondido:** ¿qué es importante y está demasiado escondido?
- **Nombres:** menú, botones o estados que una persona de una PyME industrial no entendería.

### Administrativo

**Dashboard** — [`admin-01-dashboard.png`](capturas-ux/antes/admin-01-dashboard.png)
- **5 s:** No. Hay 12 números del mismo tamaño en 4 bloques, y ninguno es plata.
- **Primero:** La pregunta "¿qué proyecto pierde plata?" no tiene respuesta directa. El bloque Margen da un promedio
  (32,0 → 29,8 %) y "Rubro que más falla: Carpintería metálica" **sin monto ni proyecto**. Viene de la factura del caño de
  P-1058, pero no se dice.
- **Qué hago:** Desplegar números de a uno.
- **Distrae:** El bloque "Horas y operarios" al mismo nivel que Margen. Un lunes muestra "Cumplimiento —, Se pasaron 0,
  Quedaron cortos 0" (la semana recién empieza), mientras hay un desvío de +14 h abierto: se contradice con Alertas.
- **Escondido:** Qué proyecto explica la caída de margen, y con cuántos pesos.
- **Nombres:**
  - "En riesgo" es ambiguo: se usa para plazo, y en el resto de la app "Atención/Crítica" son económicas.
  - "Esperado (en curso)" está bien.
  - "puntos de rentabilidad" debería ser "puntos de margen".

**Proyectos (lista)** — [`admin-02-proyectos.png`](capturas-ux/antes/admin-02-proyectos.png)
- **5 s:** Sí, es una lista.
- **Primero:** No. La única columna económica es "Rentabilidad esperada"; **no hay margen proyectado ni desvío**, así que la
  lista no sirve para encontrar al que pierde.
- **Distrae:** La columna "Cliente" y la barra de plazo, de más peso que la plata.
- **Nombres:**
  - Filtro "Cualquier salud": "salud" no es una palabra del vocabulario.
  - "Rentabilidad esperada" debería ser "Margen esperado".

**Proyecto → Resumen** — [`admin-03-proyecto-estrella-P1058.png`](capturas-ux/antes/admin-03-proyecto-estrella-P1058.png)
- **5 s:** Bastante. "¿Estoy ganando lo que pensé?" con esperado → proyectado es claro.
- **Primero:** Sí, el margen, pero **muestra 0 puntos** aunque abajo hay dos alertas de desvío (horas y caño): el usuario ve
  "todo bien" arriba y "atención" abajo.
- **Qué hago:** No queda claro. Hay 4 botones arriba (Registrar lo que pasó, Registrar compra, Cambiar etapa, Cerrar proyecto).
- **Distrae:**
  - Las filas de "¿Dónde se está desviando?" con $ 0 (Diseño, Administración, Gasto financiero).
  - El aviso amarillo "Sin costos registrados en Transporte… Imprevistos": es correcto, pero ocupa el lugar más visible.
- **Escondido:**
  - **Avance de producción** (53 %, unidades terminadas): solo se ve "Plazo transcurrido 44 %". El avance físico está en
    la pestaña Productos o en el Jefe de planta.
  - **Las alertas del proyecto quedan al final**, después de 4 tarjetas.
- **Nombres:**
  - "Registrar lo que pasó" es vago (¿horas? ¿material? ¿nota?).
  - "Equipo asignado / Editar equipo" convive con "Asignaciones" del Jefe: son dos conceptos para lo mismo.

**Proyecto → Costo presupuestado** — [`…--costo-presupuestado.png`](capturas-ux/antes/admin-03-proyecto-estrella-P1058--costo-presupuestado.png)
- **5 s:** Sí.
- **Distrae:** Los montos se cortan en dos líneas ("$ / 1.900.000").
- **Escondido:** Las horas por rubro de este presupuesto (280 h de carpintería) **no se cruzan** con las horas por producto
  (mesas 60 h + sillas 220 h). Coinciden en la demo de casualidad; en un proyecto real pueden no coincidir (ver §2-D).

**Proyecto → Materiales** — [`…--materiales.png`](capturas-ux/antes/admin-03-proyecto-estrella-P1058--materiales.png)
- **5 s:** No. Hay **cuatro números distintos de "real"** en la misma pantalla:
  - Real (facturado) $ 5.110.000;
  - Recibido $ 3.850.000;
  - Costo imputable $ 833.000;
  - en Resumen, "Costo real hasta hoy" usa $ 1.393.000 de materiales.

  Cada uno está bien definido, pero juntos no se leen.
- **Primero:** La primera tarjeta (estimado vs facturado, +$ 510.000) es la útil, y está bien arriba.
- **Distrae:** Seis tablas en una pestaña: "Requerido vs asignado", "Presupuestado vs imputado", "Registros de uso",
  "Compras registradas" y "Historial del material", con información repetida.
- **Nombres:** "Asignado sin usar", "Costo imputable", "Recuperado", "Transferido": jerga contable sin ejemplo.

**Proyecto → Costos reales** — [`…--costos-reales.png`](capturas-ux/antes/admin-03-proyecto-estrella-P1058--costos-reales.png)
- **5 s:** Sí, es un libro de registros.
- **Escondido:** **Falta la columna "Producto"**, así que no se puede ver qué horas fueron de las mesas.
- **Distrae:** Los montos se cortan ("$ / 106.250").

**Proyecto → Productos y archivos** — [`…--productos-y-archivos.png`](capturas-ux/antes/admin-03-proyecto-estrella-P1058--productos-y-archivos.png)
- **5 s:** Sí.
- **Escondido:** Es la **única** pantalla del Administrativo con unidades terminadas y estado por producto, y queda en la
  sexta pestaña. "Costo real asociado" por producto ($ 2.214.000 las mesas) es muy valioso y nadie lo ve.
- **Nombres:** "Productos y archivos" mezcla dos cosas.

**Proyecto en Cotización / Atrasado / Cerrado** — [`admin-04…`](capturas-ux/antes/admin-04-proyecto-cotizacion-P1056.png), [`admin-05…`](capturas-ux/antes/admin-05-proyecto-atrasado-P1047.png), [`admin-06…`](capturas-ux/antes/admin-06-proyecto-cerrado-P0987.png)
- **Cerrado:** bien resuelto ("Esperada 37,5 % → Real final 33,7 %, −3,9 puntos"). Es el modelo a imitar.
- **Atrasado (P-1047):** el atraso se ve en un badge y en Alertas, pero el Resumen no dice **qué hacer** ni cuánto cuesta.

**Nuevo proyecto** — [`admin-07-nuevo-proyecto.png`](capturas-ux/antes/admin-07-nuevo-proyecto.png)
- **5 s:** Sí, es un asistente de 3 pasos.
- **Escondido:** **No pide productos ni rubros por producto**. Sin eso el proyecto no aparece en "Pendientes de asignar" (§2-D).
- **Nombres:** las fechas en inglés (mm/dd/aaaa) dependen del idioma del navegador. Conviene forzar es-AR.

**Alertas** — [`admin-08-alertas.png`](capturas-ux/antes/admin-08-alertas.png)
- **5 s:** No. Son 27 tarjetas del mismo peso. Ver §3.
- **Primero:** Las críticas van arriba, pero entre ellas hay "material sin pedir: se necesitaban desde el 21/09/2026"
  (proyecto que arrancó hace un mes) al lado de una pérdida de $ 1.000.000.
- **Distrae:** 8 alertas "sin consumir" con "Impacto: +$ 1.890.000" en rojo. **No es una pérdida**: es material que está en
  el proyecto.
- **Nombres:** "Marcar resuelta" no explica que vuelve mañana. "Impacto" se usa para pérdidas y para material sin usar.

**Horas** — [`admin-09-horas.png`](capturas-ux/antes/admin-09-horas.png)
- **5 s:** No. "Por rubro: Carpintería madera −534 h (−37 %)" y "P-1058 −216 h (−56 %)" se leen como ahorro, pero comparan la
  estimación **total** con lo cargado **hasta hoy** de proyectos que siguen en curso.
- **Primero:** El único desvío real (+14 h en mesas) está **al final de la página**.
- **Distrae:** La columna "Costo real" sin comparación contra lo presupuestado.
- **Nombres:** "Horas" debería ser "Mano de obra" (ver §6). "Previstas" y "Estimadas" se usan para lo mismo.

**Cotizador** — [`admin-10-cotizador.png`](capturas-ux/antes/admin-10-cotizador.png)
- Se entiende. No es parte de la cadena de rentabilidad en curso. Sin hallazgos críticos.

**Stock** — [`admin-11-stock.png`](capturas-ux/antes/admin-11-stock.png)
- **5 s:** Sí, es una tabla de inventario.
- **Escondido:** Qué material libre se puede usar para un proyecto que lo necesita. Eso está en Compras → Necesidades, no acá.
- **Nombres:**
  - "Stock" suena a ERP.
  - "Físico / Disponible / Asignado a proyectos" sin ayuda.
  - "Ingresar stock" compite con las órdenes de compra.

**Operarios** — [`admin-12-operarios.png`](capturas-ux/antes/admin-12-operarios.png)
- Se entiende. Duplica en parte "Planta → Operarios".

**Configuración** — [`admin-13-configuracion*.png`](capturas-ux/antes/admin-13-configuracion--tarifas-y-horas.png)
- **Distrae:** "Costo real de las horas — Hipótesis a confirmar con el cliente" está a la vista del cliente.
- **Escondido:** En "Tarifas" y "Precios de materiales" no se dice **explícitamente** que un cambio no altera los proyectos
  anteriores (§2-F).
- **Nombres:** hay dos tarifas de mano de obra (la general, $ 19.000, y el costo por hora de cada operario), sin explicación
  de cuándo se usa cada una.

### Compras

**Dashboard** — [`compras-01-dashboard.png`](capturas-ux/antes/compras-01-dashboard.png)
- **5 s:** Sí, es claro: qué pedir, órdenes abiertas, compras caras.
- **Primero:** "Para pedir esta semana: 10", bien.
- **Distrae:**
  - "Compras sobre lo estimado: 13" incluye diferencias de +0,8 % y +2 %. Las alertas usan un umbral; esta lista no.
  - Fechas viejas: "se necesita desde el 21/09/2026".
- **Escondido:** Cuánto de esas compras caras **le pega al margen** de cada proyecto, en puntos de margen.

**Necesidades** — [`compras-02-necesidades.png`](capturas-ux/antes/compras-02-necesidades.png)
- **5 s:** Casi. El nombre no ayuda, y el botón "Generar orden de compra" aparece deshabilitado hasta tildar algo, sin decir por qué.
- **Qué hago:** Tildar y generar la orden. Bien.
- **Distrae:** "(estimado, de memoria)" se repite en cada línea; alcanza con una vez en el encabezado.
- **Nombres:**
  - "Necesidades" no es claro; proponemos "Por comprar".
  - "Asignado del depósito" no se entiende sin explicación.

**Órdenes de compra** — [`compras-03-ordenes.png`](capturas-ux/antes/compras-03-ordenes.png)
- **5 s:** Sí. Los estados (Borrador → Enviada → Facturada, Pagada, Recibida) se leen bien.
- **Escondido:** Al facturar no se ve el efecto ("este proyecto pasa a costar $ X más que lo estimado").

**Alertas / Cotizador / Stock** — [`compras-04…`](capturas-ux/antes/compras-04-alertas.png), [`compras-06-stock.png`](capturas-ux/antes/compras-06-stock.png)
- **Stock:** está en solo consulta (no hay botones de edición). Bien. El título "Stock" con "Ingresar…" ausente puede confundir:
  conviene "Disponible en depósito".
- **Alertas:** 4 de 6 son "material sin pedir" de obras ya arrancadas, todas críticas. Ver §3.

### Jefe de planta

**Resumen** — [`jefe-01-resumen.png`](capturas-ux/antes/jefe-01-resumen.png)
- **5 s:** Sí. "Hoy en planta" está muy bien.
- **Primero:** Bien. Las 4 tarjetas son operativas y correctas para este rol.
- **Escondido:** No dice qué obras arrancan **sin materiales** (§2-C).

**Proyectos** — [`jefe-02-proyectos.png`](capturas-ux/antes/jefe-02-proyectos.png)
- **5 s:** Sí, pero la página mide **4.100 px**: hay que bajar mucho.
- **Primero:** Los chips "Juan Pérez: 44 de 30 h · se pasó 14 h" son claros.
- **Distrae:** Productos terminados y rubros completos con el mismo peso que los que tienen problemas.
- **Qué hago:** El contador de terminadas está bien ubicado.

**Asignaciones** — [`jefe-04-asignaciones.png`](capturas-ux/antes/jefe-04-asignaciones.png)
- **5 s:** Sí. El calendario operarios × días se entiende.
- **Primero:** El calendario va antes que "Pendientes de asignar". Para planificar, la cola de pendientes debería ir primero
  o al costado.
- **Nombres:** "Asignaciones" describe el objeto, no la tarea. Proponemos "Planificación" (§6).

**Operarios / Alertas** — [`jefe-03…`](capturas-ux/antes/jefe-03-operarios.png), [`jefe-05…`](capturas-ux/antes/jefe-05-alertas.png)
- Correctos. Las alertas (2) son pertinentes.

### Operario

**Mi día (celular)** — [`operario-celular-01-mi-dia.png`](capturas-ux/antes/operario-celular-01-mi-dia.png)
- **5 s:** Sí. Proyecto, producto, rubro, horas estimadas, un campo y Guardar. Excelente.
- **Hallazgo:** El link "**Materiales o incidencias de este proyecto**" lleva a
  [`operario-celular-02-proyecto.png`](capturas-ux/antes/operario-celular-02-proyecto.png), con "Material usado (lo que
  usaste, desperdicio y sobrante)", "Solicitar material" y "Nota o incidencia". Ver §7.
- **Distrae (solo en la demo):** el selector "Demo: ver el día de" y los botones de rol. No aparecen con un usuario real.

---

## 2. (b) Cadena causa → efecto por escenario

En cada escenario: dónde se ve, en cuántos clics desde el inicio de cada rol, si se ve **el impacto en pesos**, y si la
alerta desaparece sola.

### A. El Operario carga más horas de las estimadas

| Paso | Dónde se ve | Clics | ¿Se ve en $? |
|---|---|---|---|
| Operario carga horas | Mi día → horas → Guardar | 2 | No (correcto: el operario no ve plata) |
| Jefe de planta | Resumen → "Desvíos de horas" | 0 | **No**: "14 h por encima de lo estimado" |
| Jefe de planta | Proyectos → chip "Juan: 44 de 30 h · se pasó 14 h" | 1 | No (correcto: sin importes) |
| Administrativo | Alertas (globo) → tarjeta de la mesa | 1 | **No**: no tiene "Impacto" |
| Administrativo | Horas → al final de la página | 1 + scroll | **No** |
| Administrativo | Proyecto → Resumen → margen proyectado | 2 | **No cambia** (ver la medición) |
| Administrativo | Dashboard → Margen | 0 | **No cambia** |

**Medición** (P-1058, mismas funciones de la app):

| Horas de más | Costo | Margen proyectado | Alertas |
|---|---|---|---|
| Hoy (+14 h) | ≈ $ 210.000 | 26,8 % | — |
| +40 h | $ 600.000 | **26,8 %** (no cambia) | Solo la de horas, sin $ |
| +300 h | $ 4.500.000 | 19,4 % | Recién ahí aparecen "Mano de obra superó…" y "cayó 7,4 puntos" |

**Dónde se corta.** El proyectado de mano de obra se calcula **por categoría y en total**: lo cargado de más en un producto se
compensa con las horas que todavía no se cargaron de los otros productos (las sillas). La sobrecarga de un producto no llega
al margen hasta que se come toda la holgura del proyecto.

**Duplicado.** La misma alerta de la mesa aparece en **5 lugares**:
- Alertas del Administrativo;
- Horas (al final);
- Proyecto → Alertas del proyecto;
- Jefe → Resumen;
- Jefe → Alertas.

**¿Desaparece?** No. Las horas no bajan; solo "Marcar resuelta", y eso dura hasta el día siguiente, porque la clave de
resolución incluye la fecha (`alertResolutionKey`). Cada mañana vuelve.

### B. Compras registra una factura más cara que el costo estimado

| Paso | Dónde se ve | Clics | ¿Se ve en $? |
|---|---|---|---|
| Compras factura | Órdenes de compra → Registrar factura → n° → Registrar | 3 | — |
| Compras | Alertas → "Caño 40×40: costó 16,7 % más" | 1 | **Sí**: "Impacto +$ 450.000" |
| Compras | Dashboard → "Compras que costaron más" | 0 | Sí, por línea |
| Administrativo | Alertas (la misma alerta, mezclada) | 1 | Sí |
| Administrativo | Proyecto → Materiales → "Diferencia en lo facturado +$ 510.000" | 2 | **Sí** |
| Administrativo | Proyecto → Resumen → margen proyectado | 2 | **No cambia** |
| Administrativo | Dashboard → Margen | 0 | **No cambia**. "Rubro que más falla: Carpintería metálica" aparece sin monto ni proyecto |

**Medición.** Facturar OC-0003 (tapacanto) a $ 1.500 en vez de $ 1.000 (+$ 100.000):
- **margen proyectado:** 26,8 % → **26,8 %**;
- **alerta nueva:** solo la de Compras ("Tapacanto: costó 50 % más");
- **dashboard:** sin cambios.

**Dónde se corta.** El costo de materiales del proyecto se imputa **al consumir**, no al facturar. Lo comprado y no consumido
se valoriza a precio presupuestado en el proyectado, salvo cuando todas las líneas de materiales tienen material y unidad
(P-1058 tiene "Pintura / Laqueados" como monto directo, así que no se extrapola).

Resultado: la factura más cara se ve en **Materiales**, pero no en el **margen proyectado**, el número que mira el dueño.

**Duplicado.** La misma alerta está en Compras → Alertas, en Administrativo → Alertas y en Proyecto → Alertas del proyecto.

### C. Un proyecto está por empezar y los materiales no llegaron

| Rol | Dónde | ¿Lo ve? |
|---|---|---|
| Compras | Dashboard "Para pedir esta semana" y Alertas "material sin pedir" | Sí, **si falta pedir** |
| Administrativo | Alertas (las mismas de Compras) y badge "Materiales: En camino / Sin comprar" en el proyecto | Sí, sin $ |
| Jefe de planta | Badge en Proyectos y en "Pendientes de asignar"; aviso al asignar | **Solo si entra al proyecto**: no hay alerta ni línea en Resumen |
| Operario | — | No (correcto) |

**Dónde se corta.**
- **Pedido pero no llegó: no hay alerta en ningún rol.** Ejemplo: una orden Enviada sin recibir para una obra que arranca
  mañana. La alerta de Compras solo mira lo que "falta pedir" (`toBuyWithin`), no lo que falta recibir.
- **El Jefe no tiene alerta** de "arranca X y falta material", aunque es quien tiene gente parada.
- **Ruido:** cuatro alertas críticas de "material sin pedir… se necesitaban desde el 21/09" son de obras que **ya arrancaron**
  hace semanas. Ahí el problema ya no es "pedir", es "estás trabajando sin material", y el texto no lo dice.
- **Plata:** no se estima el costo de la demora (no corresponde inventarlo; ver P2).

### D. Nuevo proyecto → Pendientes de asignar (Jefe) → Mi día (Operario)

1. **Nuevo proyecto** (3 pasos): crea el proyecto en Cotización con el **presupuesto** (incluye horas de mano de obra por
   rubro), **pero sin productos**.
2. **Aprobar:** Proyecto → Cambiar etapa → Aprobado (2 clics).
3. **Cargar productos y rubros:** Proyecto → pestaña "Productos y archivos" → Agregar producto con rubros, horas y operarios.
   **Nadie le dice al Administrativo que tiene que hacerlo.** El asistente terminó y el proyecto parece completo.
4. **Jefe → Asignaciones → Pendientes de asignar:** aparece cada producto + rubro → Asignar (persona y fechas) → la fila se va.
5. **Operario → Mi día:** lo ve **el día asignado** (no antes).

**Dónde se corta.**
- **Del paso 1 al 4.** Si no se hace el paso 3, el proyecto aprobado **nunca aparece** en la cola del Jefe. Lo único que
  aparece es "Proyecto sin operario asignado" (alerta del modelo anterior, "Editar equipo"), que lleva a otra pantalla.
- **Doble carga.** Las horas se estiman en el presupuesto (por rubro) y otra vez en los productos (por producto + rubro).
  No hay control de que sumen lo mismo. Si difieren, el margen usa una y el desvío de horas usa la otra.

### E. El Jefe actualiza unidades terminadas

| Efecto | Dónde | ¿Se ve? |
|---|---|---|
| Estado del producto (Pendiente / En producción / Terminado) | Jefe → Proyectos (al instante); Admin → Productos y archivos | Sí |
| Avance del proyecto (% por horas estimadas) | Jefe → Proyectos ("avance 53 %"); Admin → Dashboard → semáforo En tiempo / En riesgo / Atrasado | Sí |
| Avance en el Resumen del proyecto (Admin) | — | **No**: el Resumen muestra "Plazo transcurrido 44 %" y no el avance físico |
| Costo / margen | — | No aplica (correcto: las unidades no son costo) |

**Dónde se corta.** El Administrativo no ve el avance físico donde mira el proyecto (el Resumen). Tiene que ir a la sexta
pestaña o al Dashboard.

### F. Un cambio de tarifa o de precio de material no altera proyectos pasados

- **Funciona.** Las horas guardan su monto con la tarifa vigente ese día ("Vigente desde"). El presupuesto base queda
  congelado al aprobar. Los precios de materiales solo cambian lo que se cotice después. Está cubierto por tests
  (`tests/lote5a-vigencia.test.ts`: "lo anterior al cambio sigue con 10.000; desde el cambio, 15.000", "el primer cambio
  guarda también el valor anterior desde siempre: lo pasado no cambia").
- **No se comunica.** En Configuración, el botón Guardar no dice "esto no cambia proyectos ya aprobados ni horas ya cargadas".
  Una persona nueva va a tener miedo de tocarlo.

---

## 3. Alertas: inventario, ruido y propuesta

### Cuántas hay (demo del 19/10/2026)

| Rol | Total | De dónde vienen |
|---|---|---|
| **Administrativo** | **27** | 19 del proyecto (`projectAlerts`) + 6 de Compras + 2 de Planta, todas en una sola lista |
| **Compras** | 6 | 4 críticas "material sin pedir", 1 de atención "sin pedir (en 5 días)", 1 "costó más que lo estimado" |
| **Jefe de planta** | 2 | 1 desvío de horas (mesa) y 1 "no trabaja y tiene horas asignadas" (Diego) |
| **Operario** | 0 | — (correcto) |

Tipos en el Administrativo:
- **Por categoría** (crítica / atención / info): 4.
- **Caída de margen**: 3.
- **Entrega vencida**: 1.
- **Sin registros recientes**: 1.
- **Proyecto sin operario asignado**: 2.
- **"Sin consumir"**: 8.
- **Material sin pedir**: 5.
- **Compra más cara**: 1.
- **Horas**: 1.
- **Capacidad**: 1.

### Cuáles son ruido o duplicados (15 de 27)

| Alerta | Por qué es ruido |
|---|---|
| 8 × "X sin consumir" (info) | No es una pérdida, y muestra "Impacto +$" en rojo. Es control de cierre: debería verse **solo al cerrar** el proyecto. |
| P-1039 "Materiales superaron… en **0 %**" + "cayó **0,1 puntos**" | Diferencias mínimas ($ 13.750). Deberían quedar por debajo del umbral. |
| P-1042 "Materiales +22 %" + "Transporte +17 %" + "cayó 8,8 puntos" | **Una sola situación en tres tarjetas**. Debería ser una: "P-1042 pierde 8,8 puntos de margen ($ 1.050.000): Materiales +$ 1.000.000, Transporte +$ 50.000". |
| P-1045 "Diseño +13 %" + "cayó 5,9 puntos" | Lo mismo: dos tarjetas para una situación. |
| P-1051 / P-1053 "Proyecto sin operario asignado" | Duplica "Pendientes de asignar" del Jefe, con otro concepto ("Equipo"). |
| "Material sin pedir… se necesitaban desde el 21/09" | **Fecha vieja**: la obra arrancó hace un mes. O el problema es otro (trabajan sin material) o el dato está desactualizado. |
| Todas: "Marcar resuelta" | Vuelve al día siguiente, porque la clave incluye la fecha. Para el usuario, la lista nunca baja. |

### Propuesta: una sola lista priorizada por rol

Regla general:
- **una situación = una tarjeta**;
- se ordena **por pesos** (o por urgencia, si no hay pesos);
- cada tarjeta tiene **"Qué pasó"** y **"Qué revisar"**, con link a la pantalla donde se resuelve;
- desaparece sola cuando el dato deja de cumplirse;
- "Marcar resuelta" la silencia **hasta que cambie el dato** (no hasta mañana).

**Administrativo** (todo con impacto en $ y en puntos de margen):

| # | Qué pasó | Qué revisar |
|---|---|---|
| 1 | P-1042 pierde **8,8 puntos de margen ($ 1.050.000)**. Causa principal: Materiales +$ 1.000.000. | Proyecto → Materiales: facturas por encima de lo estimado. |
| 2 | P-1058: desvíos **detectados** por ≈ $ 720.000 (≈ 4,5 puntos). Facturas +$ 510.000; Mesas · Carpintería +14 h ≈ $ 210.000. | Materiales (facturas) y Productos (horas por producto). |
| 3 | P-1045 pierde **5,9 puntos ($ 653.000)**: Diseño +$ 486.000, Administración +$ 162.000. | Costos reales filtrado por Diseño. |
| 4 | P-1047 **entrega vencida** hace 2 días, avance 20 %. (Plazo, no economía.) | Hablar con el cliente y con el Jefe de planta. |
| 5 | 4 obras **trabajan sin todo el material** (P-1048, P-1047, P-1045, P-1053). | Compras → Por comprar. |

**Compras:**

| # | Qué pasó | Qué revisar |
|---|---|---|
| 1 | P-1051 arranca **en 5 días** y faltan pedir 5 materiales. | Por comprar → P-1051 → generar orden. |
| 2 | 4 obras **ya arrancaron** y les falta material (antes decía "sin pedir… desde el 21/09"). | Por comprar, ordenado por fecha de inicio. |
| 3 | OC enviada **sin recibir** para una obra que arranca en ≤ 7 días. **Hoy no existe.** | Órdenes de compra → Recibir. |
| 4 | Facturas por encima de lo estimado **desde el umbral** de Configuración: P-1058 caño +$ 450.000 (≈ 2,8 puntos de margen del proyecto). | Órdenes de compra / proveedor. |

**Jefe de planta** (sin importes):

| # | Qué pasó | Qué revisar |
|---|---|---|
| 1 | Mesas (P-1058) · Carpintería: **14 h por encima** de lo estimado (Juan +14 h). | Proyectos → Mesa de comedor. |
| 2 | Diego **no trabaja el 21/10** y tiene 8 h asignadas. | Planificación → reasignar. |
| 3 | P-1053 **arranca** y faltan materiales. **Hoy no existe.** | Avisar a Compras. |
| 4 | 8 tareas sin persona asignada (cuando falten ≤ X días para la entrega). | Planificación → Pendientes. |

**Operario:** sin alertas. Si cargó más que lo estimado, se le muestra solo un aviso suave al guardar.

---

## 4. Operario: verificación (pedido 7)

| Pedido | Estado |
|---|---|
| Solo ve lo asignado **de hoy** | **Cumple.** `myDay` filtra por operario y fecha de hoy. Proyectos de otros días no aparecen en Mi día. |
| Un campo de horas + Guardar | **Cumple.** |
| Sin costos ni rentabilidad | **Cumple.** La base no se los manda (`taller_workspace` pone montos en 0; tests PGlite). |
| **Sin materiales ni desperdicio** | **No cumple.** El link "Materiales o incidencias de este proyecto" abre "Material usado (desperdicio y sobrante)", "Solicitar material" y "Nota o incidencia". |

Decisión a tomar (ver P0-6): sacar "Material usado" del Operario, o reconocer que el consumo lo carga el operario.
El costo de materiales del proyecto se imputa **por consumo**. Hoy lo cargan el Operario (desde ese link) y el
Administrativo ("Registrar lo que pasó" → "Material utilizado"). Si se le saca al Operario, tiene que quedar claro quién lo
carga en el día a día (el Administrativo o el Jefe de planta). Si nadie lo carga, el costo de materiales de los proyectos
queda subestimado.

---

## 5. (d) Propuesta de Dashboard del Administrativo

Boceto: [`propuesta-dashboard.html`](capturas-ux/propuesta-dashboard.html) ·
[captura escritorio](capturas-ux/propuesta-dashboard.png) · [captura celular](capturas-ux/propuesta-dashboard-celular.png).
Los números son los de la demo de hoy.

**Pregunta que responde primero:** "¿Qué proyectos se desvían y por qué?"

1. **Cuatro números, todos económicos:**
   - **Plata en riesgo:** costo final proyectado por encima del presupuestado, en $ ($ 1.717.000).
   - **Margen esperado → Margen proyectado**, con la diferencia en **puntos de margen** (32,0 % → 29,8 %, −2,1 puntos).
   - **Desvíos detectados aún no proyectados:** horas de más y facturas más caras ($ 720.000). Solo si se decide mantener
     el proyectado como está (P0-1).
   - **Margen real final** de proyectos **cerrados**, separado y rotulado: nunca se mezcla con los otros dos.
2. **Lista de proyectos ordenada por impacto en $**, con columnas:
   - Impacto $;
   - Margen esperado → Margen proyectado (puntos de margen);
   - **Causa principal con su monto** ("Materiales +$ 1.000.000");
   - **Plazo en columna aparte** ("En tiempo / Entrega en 3 días / Atrasado 2 días"). "En riesgo" deja de usarse para dos cosas.
3. **"¿Por qué se pierde?"**: causas sumadas de todas las obras en curso, en $, con los proyectos donde pasa.
4. **"Para revisar hoy"**: lo operativo (horas, materiales, asignaciones), **bajado de jerarquía** y con su traducción
   económica cuando la tiene ("Juan cargó 14 h de más ≈ $ 210.000").

**Qué sale de la primera vista:**
- "Cumplimiento de la semana";
- "Se pasaron / Quedaron cortos" en horas;
- "Compras sin hacer" como número suelto;
- "Rubro que más falla" sin monto.

Se reemplazan por la causa en $ y la lista "Para revisar hoy".

---

## 6. (d) Propuesta de menús

Criterio: agrupar **por lo que la persona quiere hacer**, con un máximo de 7 ítems visibles sin scroll a 768 px de alto, y
usar palabras de taller y oficina, no de sistema. **No se agregan pantallas**: solo se renombran y se reordenan.

### Administrativo

| Grupo | Ítem (propuesto) | Hoy | Por qué |
|---|---|---|---|
| Ver | **Resumen** | Dashboard | "Dashboard" es palabra de software. "Resumen" es lo que la persona busca a la mañana. |
| Ver | **Proyectos** | Proyectos | Igual. |
| Ver | **Alertas** | Alertas | Igual, con la lista única de §3. |
| Analizar | **Mano de obra** | Horas | La pantalla no es para mirar horas: es para ver si la mano de obra cuesta lo presupuestado. "Mano de obra" es la categoría del vocabulario (Costo presupuestado → Mano de obra). |
| Cotizar | **Cotizador** | Cotizador | Igual. |
| Materiales | **Materiales en depósito** | Stock | "Stock" suena a inventario de ERP. Acá se ve el material físico y lo que está libre para usar. |
| Configurar | **Personas** (operarios) y **Configuración** | Operarios, Configuración | Agrupados abajo, separados de lo diario. |

### Compras

| Ítem (propuesto) | Hoy | Por qué |
|---|---|---|
| **Resumen** | Dashboard | Igual que en el Administrativo. |
| **Por comprar** | Necesidades | Es la acción: lo que hay que pedir. "Necesidades" es abstracto. Tiene el filtro "Todos" para ver también lo pedido y recibido. |
| **Órdenes de compra** | Órdenes de compra | Ya es claro. |
| **Alertas** | Alertas | Igual. |
| **Cotizador de materiales** | Cotizador | Aclara que es solo materiales (Compras no ve mano de obra ni precio). |
| **Disponible en depósito** | Stock | Es solo consulta: el nombre tiene que decir "qué hay", no invitar a cargar. |

### Jefe de planta

| Ítem (propuesto) | Hoy | Por qué |
|---|---|---|
| **Hoy en planta** | Resumen | Es literalmente lo que muestra (quién está en qué hoy). |
| **Planificación** | Asignaciones | La tarea es planificar (cola de pendientes + calendario). "Asignaciones" es el objeto, no la tarea. **Recomendado** de las dos opciones. |
| **Avance de proyectos** | Proyectos | Lo que el Jefe hace ahí es cargar unidades terminadas y mirar horas por producto. |
| **Personas y días** | Operarios | Ahí se editan días laborales y excepciones. |
| **Alertas** | Alertas | Igual. |

### Operario

Sin menú: **Mi día** como única pantalla. Recomendación (P0-6): el link "Materiales o incidencias" pasa a decir solo lo que
se decida que el operario hace.

---

## 7. Vocabulario: dónde la app no usa el vocabulario acordado

| Hoy dice | Debería decir | Dónde |
|---|---|---|
| Rentabilidad esperada | **Margen esperado** | Lista de proyectos, Costo presupuestado (Resumen), Cotizador |
| Rentabilidad proyectada / "¿Estoy ganando lo que pensé?" | **Margen proyectado** | Proyecto → Resumen, Alertas |
| Rentabilidad real final | **Margen real final** | Proyecto cerrado, Dashboard |
| "cayó 8,8 **puntos de rentabilidad**" | "cayó 8,8 **puntos de margen**" | Alertas, Dashboard |
| Salud / "Cualquier salud" / Atención-Crítica para economía y "En riesgo" para plazo | Separar **Economía** (con $) de **Plazo** | Filtros de Proyectos, Dashboard |
| Previstas / Estimadas | Una sola: **Estimadas** | Horas, Jefe |

---

## 8. (c) Lista priorizada de cambios propuestos

Ninguno agrega funciones ni pestañas. Los que tocan la **lógica económica** están marcados con ⚠ y necesitan tu decisión antes.

### P0 — sin esto el objetivo no se cumple

| # | Cambio | Efecto esperado |
|---|---|---|
| **P0-1 ⚠** | **Que el desvío detectado llegue al margen proyectado.** Opciones: (a) sumar al proyectado de mano de obra las horas de más **por producto + rubro**, en vez de compensarlas con la holgura de otros productos; y al de materiales, el sobrecosto de lo **facturado** contra lo estimado. (b) No tocar el cálculo y mostrar al lado "desvíos detectados aún no proyectados: $ X (≈ Y puntos de margen)". | El dueño ve en el margen lo que el taller y Compras ya saben. Hoy +40 h y una factura +$ 100.000 dan 0 puntos. Con (a) cambia la lógica económica; con (b) no. Recomiendo (b) ya y (a) después de validarlo con el cliente. |
| **P0-2** | **Impacto en $ en toda alerta económica u operativa con traducción económica** (horas de más × tarifa del día; factura − estimado), y la diferencia de margen en **puntos de margen**. El Jefe sigue sin importes. | Cada alerta del Administrativo responde "¿cuánto me cuesta?". |
| **P0-3** | **Una situación = una alerta**: unir categoría + margen del mismo proyecto; sacar "sin consumir" de la lista diaria (solo al cerrar); umbral mínimo (no alertar 0 % ni 0,1 puntos); sacar "Proyecto sin operario asignado" (ya está "Pendientes de asignar"). | Administrativo: de 27 a unas 10 alertas, todas accionables. |
| **P0-4** | **"Marcar resuelta" dura hasta que cambie el dato**, no hasta mañana (sacar la fecha de la clave de resolución). | La lista baja de verdad cuando se resuelve algo. |
| **P0-5** | **Dashboard nuevo (§5)**: proyectos ordenados por impacto en $, margen esperado → proyectado en puntos de margen, causa principal con monto, plazo aparte, margen real final separado. | Se responde "¿qué proyecto pierde y por qué?" en 5 segundos, sin abrir nada. |
| **P0-6 ⚠** | **Operario sin materiales ni desperdicio** (pedido 7). Decidir quién carga el consumo en el día a día: el Administrativo ya puede ("Registrar lo que pasó"), o el Jefe de planta. | Cumple el pedido. Sin un responsable claro, el costo de materiales de los proyectos queda subestimado. |
| **P0-7** | **Proyecto nuevo → planta:** el asistente de Nuevo proyecto pide los productos (nombre, cantidad, rubros con horas y operarios) en el paso de Costo presupuestado, en vez de cargar horas por rubro aparte. Se reusa el formulario de "Agregar producto". | Al aprobar, el proyecto aparece solo en "Pendientes de asignar". Se cargan las horas una sola vez y no pueden contradecirse. |

### P1 — se entiende mucho mejor

| # | Cambio | Efecto esperado |
|---|---|---|
| P1-1 | **Lista de Proyectos:** columnas Margen esperado → Margen proyectado (puntos de margen) y Causa principal con $; orden por impacto; filtro "Economía / Plazo" en vez de "salud". | La lista sirve para encontrar al que pierde. |
| P1-2 | **Resumen del proyecto:** sumar **Avance de producción** al lado de Plazo transcurrido; subir las alertas del proyecto arriba de la tabla de categorías; esconder filas en $ 0. | Se ve en una pantalla si va atrasado y por qué pierde. |
| P1-3 | **Alerta "pedido y no llegó"** para obras que arrancan en ≤ X días (Compras y Jefe) y "trabajando sin material" en vez de "sin pedir desde el 21/09". | Se cierra el escenario C. |
| P1-4 | **Mano de obra (ex Horas):** comparar contra lo estimado **de lo hecho** (productos terminados o avance), no contra el total; poner arriba los desvíos por producto + rubro con $. | Deja de leerse como "ahorro de 534 h". |
| P1-5 | **Materiales del proyecto:** una línea que explique los 4 "reales" (facturado / recibido / consumido / imputable) y por qué solo el imputable es costo; colapsar las tablas de detalle. | Se entiende sin entrenamiento. |
| P1-6 | **Renombres de menú y vocabulario** (§6 y §7). | Menos explicación en el entrenamiento. |
| P1-7 | **Costos reales:** agregar la columna Producto y evitar cortar montos ("$ / 106.250"). | Se ve qué horas fueron de qué producto. |
| P1-8 | **Compras:** "Compras sobre lo estimado" con el mismo umbral que las alertas, y al facturar mostrar el efecto en puntos de margen del proyecto. | Compras ve el efecto de su compra en el margen. |

### P2 — pulido

| # | Cambio | Efecto esperado |
|---|---|---|
| P2-1 | Jefe → Proyectos: plegar productos terminados y ordenar por "tiene problema". | La página pasa de 4.100 px a una pantalla. |
| P2-2 | Planificación: "Pendientes de asignar" arriba o al costado del calendario. | Primero lo que falta. |
| P2-3 | Configuración: decir junto a Guardar "no cambia horas ya cargadas ni proyectos aprobados"; sacar "Hipótesis a confirmar con el cliente" de la vista del cliente. | Confianza para usarla. |
| P2-4 | Forzar fechas en formato es-AR (dd/mm/aaaa) en los campos de fecha. | Sin confusión mes/día. |
| P2-5 | "Registrar lo que pasó" → "Cargar horas, material o nota"; separar o explicar "Registrar compra" (compra directa) contra "Órdenes de compra". | El botón dice lo que hace. |
| P2-6 | Unificar "Equipo asignado / Editar equipo" con Planificación (un solo concepto). | No hay dos maneras de "asignar". |

---

## 9. Decisiones que necesito antes de implementar

1. **P0-1:** ¿opción (b) ahora (mostrar desvío detectado al lado, sin tocar el cálculo) y (a) después, o directamente (a)?
2. **P0-6:** si el Operario deja de cargar "Material usado", ¿lo carga el Administrativo (ya puede) o el Jefe de planta?
3. **P0-7:** ¿los productos reemplazan las líneas de mano de obra del presupuesto (horas una sola vez), o se mantienen las
   dos y se valida que coincidan?
4. **Menús:** ¿"Planificación" o "Asignaciones" para el Jefe? ¿"Resumen" en lugar de "Dashboard"?
5. **Alertas "sin consumir":** ¿solo al cerrar el proyecto, o en una sección aparte de "control de cierre"?
