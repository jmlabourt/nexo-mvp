# Blerp (antes NEXO) — Conexiones de datos, estándares de carga y prioridades

Versión 1 · 7/10/2026 · Origen: revisión de los 6 videos del recorrido de pantalla y decisiones de Juanita.
Estado: son decisiones de diseño para implementar. Nada de esto está validado con fabricantes reales y no se afirma Product-Market Fit. El módulo de machine learning es un objetivo futuro, no algo que ya funcione.

Para el chat de desarrollo: este documento se suma a la especificación del MVP. Si algo lo contradice, preservá primero el núcleo del producto (presupuesto → ejecución → captura → costo → desvío → margen) y explicá la decisión en una línea.

---

## 0. Lo que sí o sí hay que cambiar (en este orden)

1. **Catálogos cerrados en vez de texto libre** (rol, unidad, tipo de proyecto, categoría de costo, material, cliente). Hoy se puede escribir "armado" en minúscula o "carpintero" y el sistema no lo reconoce como "Carpintería". Ver sección 3.
2. **Una sola fuente para cada cifra y una cadena de impacto explícita**: si cambia X, se recalcula Y en todas las pantallas. Ver sección 2.
3. **Glosario único**: una palabra, un significado; una cosa, un nombre. Ver sección 4.
4. **Estados honestos cuando no hay datos y un "¿Por qué?" que suma exacto a la diferencia.** Ver sección 5.
5. **Taller: cantidades sin ambigüedad** (retirado = usado + desperdicio + sobrante). Ver sección 6.
6. **Modo demo reversible**: poder ir de Gestión a Taller y volver, siempre. Ver sección 7.
7. **Acciones según la etapa y presupuesto base congelado al aprobar.** Ver sección 8.
8. **Renombrar NEXO por Blerp** desde un solo lugar. Ver sección 9.
9. **Datos preparados para el modelo de predicción.** Ver sección 10.

---

## 1. Principios de datos

- Cada cifra económica se calcula en **un solo lugar** (función pura y testeable). Todas las pantallas leen de ahí; ninguna recalcula por su cuenta.
- Los registros **no se editan**: se corrigen con otro registro que referencia al anterior. Todo registro guarda quién, cuándo, desde qué modo (Gestión o Taller) y a qué proyecto pertenece.
- El texto libre queda solo para notas y nombres propios. Todo lo demás es una lista cerrada o un ID.
- Todo valor económico guarda **fecha y moneda (ARS)**. Hace falta para comparar proyectos de épocas distintas (inflación) y para el modelo.
- Los valores que calcula el modelo **nunca se mezclan** con los valores calculados por reglas ni con los registros reales (ver sección 10).
- Toda cifra importante se puede abrir hasta los registros que la generaron.

---

## 2. Mapa de conexiones: si cambia X, ¿qué se recalcula?

| # | Cambia esto | Debe impactar en | Regla |
|---|---|---|---|
| 1 | **Costo por hora de un operario** (en Operarios) | Cotizador (costo sugerido por rol), horas restantes de proyectos activos (margen proyectado), alertas, Dashboard | Las horas **ya cargadas conservan su valor** (congelado en cada registro). Las horas **futuras** del presupuesto se valorizan al costo vigente solo para el *proyectado*, y se muestra que es una estimación. En Operarios, aclarar bajo "Horas cargadas": "cada hora se valoriza con el costo que tenía el operario cuando se cargó". |
| 2 | **Rol o especialidad de un operario** | Equipo asignado de cada proyecto, lista de proyectos en Taller, opciones de rol en Cotizador | El histórico no se reescribe: cada registro de horas guarda el rol que tenía el operario ese día. |
| 3 | **Operario inactivo / borrado lógico** | Equipo asignado, Taller (deja de ver proyectos), Operarios | Nunca se borra el historial; solo deja de poder cargar. |
| 4 | **Compra registrada** | Lote de stock (con su costo unitario) → "Asignado" a ese proyecto → "Compras registradas" del proyecto | **No es costo todavía.** Solo cambia stock y compras registradas. |
| 5 | **Transferencia** (depósito ↔ proyecto ↔ otro proyecto) | Disponible y Asignado de Stock, Materiales de ambos proyectos | **No es costo.** El lote conserva su costo al moverse. |
| 6 | **Consumo cargado en Taller** | Lote (resta) → **Costo real de Materiales** del proyecto → desvío por categoría → margen proyectado → alertas → Dashboard | Costo = cantidad usada × costo del lote del que salió. |
| 7 | **Desperdicio cargado en Taller** | Igual que consumo: es **costo real**. Aparece como línea separada ("Desperdicio") en el proyecto | Siempre distinguible de consumo útil. |
| 8 | **Sobrante reutilizable cargado en Taller** | Stock > Sobrantes (conserva el costo del lote) | **No es costo.** Si luego se usa en otro proyecto, ahí se vuelve consumo con ese costo. |
| 9 | **Horas cargadas** (Taller o Gestión) | Costo real de Mano de obra (o Instalación, según etapa; ver decisión abierta D1), Operarios (horas cargadas), plazo y alertas de "sin registros" | Costo = horas × costo por hora del operario **a la fecha del registro**. |
| 10 | **Otros costos** (tercerizaciones, logística, imprevistos) | Costo real de su categoría, desvío, margen proyectado | Solo los carga Gestión. |
| 11 | **Precio de venta** del proyecto | Margen esperado, margen proyectado, Dashboard (ponderado por venta), Historial | Si cambia después de aprobar, queda versionado y se muestra en Actividad. |
| 12 | **Cambio de etapa** | Qué acciones están habilitadas, qué ve Taller, alertas de plazo, Dashboard ("Proyectos activos") | Al aprobar se guarda el **presupuesto base (línea base)** y no se pisa. |
| 13 | **Umbrales de Configuración** (Atención / Crítico / días sin registros / días antes de la entrega) | Estado de cada proyecto, alertas, Dashboard, Historial | Se recalcula al instante en todas las pantallas (la propia pantalla de Configuración ya lo promete). |
| 14 | **Cierre del proyecto** | Margen real final → Historial → Aprendizajes → defaults del Cotizador → base de datos de entrenamiento del modelo | Solo se puede cerrar si no queda material asignado sin destino. |
| 15 | **Alta o cambio de un material** (catálogo) | Opciones en Cotizador, Compra, Carga de stock y Taller | Un solo catálogo de materiales para todo el producto. |

Regla de oro para el equipo: **ninguna pantalla guarda su propia copia de una cifra derivada**. Si la cifra aparece en dos lugares, la lee del mismo cálculo.

---

## 3. Estándares de carga (formularios y datos)

### 3.1 Reglas generales de formularios

- **Texto**: quitar espacios sobrantes; capitalizar nombres propios al salir del campo ("pedro" → "Pedro"; "juanita" → "Juanita"); sin diferencias por mayúsculas o acentos al buscar o detectar duplicados.
- **Duplicados**: avisar si ya existe un cliente u operario con el mismo nombre normalizado.
- **Dinero**: campo numérico, siempre en pesos, con separador de miles al mostrar. Nunca "k" ni "M" salvo en tarjetas del Dashboard.
- **Fechas**: calendario, formato visible dd/mm/aaaa; se guardan en formato estándar con zona horaria.
- **Unidades**: siempre de la lista cerrada (ver 3.2). No escribir "placa", "placas", "pl".
- **Cantidades**: aceptar decimales con coma; mostrar la unidad correcta en singular o plural.
- **Validación**: mostrar el error junto al campo y no permitir avanzar con campos obligatorios vacíos; si un botón está deshabilitado, decir qué falta.
- **Selectores en lugar de escribir** siempre que exista una lista cerrada.

### 3.2 Catálogos cerrados (valores propuestos; el owner puede agregar los suyos)

| Catálogo | Valores iniciales | Usado en |
|---|---|---|
| **Rol / especialidad del operario** | Carpintería · Armado · Oficina técnica · Terminaciones (pintura, laqueado) · Instalación · Otro | Operarios, Cotizador (mano de obra), Equipo del proyecto, Taller |
| **Tipo de proyecto** | Local comercial · Exhibidores · Oficinas corporativas · Stand · Residencial · Otro | Nuevo proyecto, Cotizador, Historial, Aprendizajes, modelo |
| **Categoría de costo** | Materiales · Mano de obra · Máquinas · Tercerizaciones · Logística · Instalación · Imprevistos | Cotizador, Presupuesto, Costos reales, tabla de desvío, Historial, Configuración |
| **Unidad** | placa · m · m² · unidad · h · kg · litro · global | Cotizador, Compra, Stock, Taller |
| **Etapa** | Cotización · Aprobado · Compras · Producción · Instalación · Finalizado | Estado del proyecto, Taller, alertas |
| **Severidad de alerta** | Crítica · Atención · Informativa | Alertas |
| **Estado de salud del proyecto** | En riesgo · Atención · Sin desvíos · Sin datos todavía | Dashboard, Proyectos, Proyecto |
| **Destino del material al cerrar** | Volver al stock · Otro proyecto · Sobrante · Desperdicio · Proveedor | Cierre |
| **Tipo de registro de Taller** | Material usado · Horas · Solicitud de material · Nota o incidencia | Taller |

Detalles a corregir en estos catálogos (se vieron en los videos):

- **Rol**: el Cotizador pide "Rol" con ejemplo "Carpintero" y Operarios usa "Carpintería". Es la misma idea con dos nombres. Usar el mismo catálogo en ambos.
- **Categorías**: "Máquinas" está en el Cotizador pero no aparece en la tabla de desvío de un proyecto. Las siete categorías deben aparecer igual en todas las pantallas.
- **Rol en el alta de operario**: pasar de texto libre a **selector**, con opción "Otro" que pide un nombre y lo agrega al catálogo.

### 3.3 Entidades y campos mínimos (el modelo necesita esta estructura estable)

| Entidad | Campos mínimos |
|---|---|
| **Cliente** | id, nombre normalizado, tipo de cliente opcional. El proyecto referencia el id, no el texto. |
| **Operario** | id, nombre, rol (catálogo), costo por hora vigente, activo, email de acceso opcional |
| **Material (catálogo)** | id, nombre, familia (tableros, herrajes, perfiles…), espesor, color/terminación, unidad |
| **Lote de stock** | id, material_id, cantidad inicial, costo unitario, fecha de ingreso, proveedor opcional |
| **Movimiento de stock** | id, lote_id, de dónde, a dónde, cantidad, fecha, registrado por, proyecto si corresponde |
| **Proyecto** | id, código, nombre, cliente_id, tipo (catálogo), etapa, fecha inicio y entrega, responsable, precio de venta |
| **Presupuesto base (versión)** | id, proyecto_id, número de versión, fecha, líneas por categoría con material_id o rol, cantidades, costos, horas |
| **Registro de Taller** | id, proyecto_id, tipo, material_id, cantidad retirada, usada, desperdiciada, sobrante, horas, rol del operario ese día, costo por hora aplicado, fecha, operario_id |
| **Alerta** | id, proyecto_id, severidad, tipo, estado (abierta/resuelta), motivo y registros que la originaron |

Para el modelo (sección 10) importan además: fecha de cada costo, y dimensión del proyecto (metros cuadrados, cantidad de muebles) cuando exista.

---

## 4. Glosario único (una palabra, un significado)

| Término a usar | Significa | Reemplaza / no usar para |
|---|---|---|
| **Costo presupuestado** | Lo que se calculó que va a costar | "Presupuesto" a secas (para el fabricante, "presupuesto" es lo que se le pasa al cliente) |
| **Precio de venta** | Lo que se le cobra al cliente | — |
| **Presupuesto base** (o línea base) | El presupuesto aprobado, congelado, contra el que se mide el desvío | "Presupuesto" suelto |
| **Margen esperado** | Del presupuesto base | — |
| **Margen proyectado** | Real hasta hoy + lo que falta presupuestado. **Es un cálculo por reglas, no del modelo.** | Mezclarlo con "Estimación del modelo" |
| **Margen real final** | Al cierre del proyecto | "Margen real" en proyectos activos |
| **Etapa** | Cotización, Aprobado, Compras, Producción, Instalación, Finalizado | "Estado" (en botón, columna y tarjeta) |
| **Disponible** | **Solo** lo libre en el depósito, sin asignar | Lo "asignado a este proyecto" en Taller |
| **Asignado** | Material reservado a un proyecto | — |
| **Asignado a este proyecto** | Lo que Taller ve para ese proyecto | "Disponible" |
| **Costo real hasta hoy** | Consumido + desperdiciado + horas + otros costos registrados a la fecha | Solo en proyectos activos |
| **Costo real final** | Idem, al cierre | Solo en proyectos finalizados (ahí no mostrar "hasta hoy") |
| **Comprado** | Lo que se compró (no es costo todavía) | Costo |
| **Consumido** | Lo que se usó en el mueble | — |
| **Desperdicio** | Lo que se perdió y no se puede reutilizar | — |
| **Sobrante** | Lo que quedó y se puede reutilizar | Desperdicio |
| **Alerta Crítica / Atención / Informativa** | Gravedad de una alerta | — |
| **Salud del proyecto: En riesgo / Atención / Sin desvíos / Sin datos todavía** | Resumen del estado económico | — |
| **Plazo transcurrido** | Tiempo que pasó del plazo total (no es avance de obra) | "Avance" |
| **Puntos de margen** | Diferencia entre dos márgenes | "pp" |

### Crítico vs. En riesgo (propuesta para cerrar la duda)

No son el mismo concepto: uno califica una **alerta** y el otro califica un **proyecto**. Definirlos con una relación explícita:

- Una alerta puede ser **Crítica**, **Atención** o **Informativa**.
- La salud del proyecto es **En riesgo** si tiene al menos una alerta **Crítica abierta**; **Atención** si tiene alertas de Atención abiertas y ninguna Crítica; **Sin desvíos** si hay datos y no hay alertas; **Sin datos todavía** si no hay consumos ni costos registrados.
- Mostrar esta regla en Configuración, junto a los umbrales.

---

## 5. Estados y mensajes honestos

- **Cotización sin registros**: chip gris "Sin datos todavía"; la tarjeta de margen muestra solo el esperado; la lectura rápida no dice "se mantiene".
- **Proyecto Finalizado**: sin chip de salud ni alertas rojas; la lectura rápida pasa a "Cierre: qué pasó". Mostrar solo "Costo real final" (no "hasta hoy").
- **"¿Por qué?"**: listar todas las categorías con desvío distinto de cero, positivas y negativas, y una línea "Total" igual a la Diferencia. Mismo formato de moneda que la tabla (sin redondear "514 k" al lado de "513.500").
- **Sin precio de venta**: mostrar "—" en Ganancia esperada y Margen, nunca un negativo en rojo; ocultar el gráfico "¿Qué pasa si el proyecto se alarga?" hasta que haya precio y más de un día de duración; aclarar cuando use el precio sugerido.
- **"Entrega estimada"**: solo con horas cargadas; no mostrar un valor fijo de +30 días.
- **Historial/Actividad**: ninguna fecha posterior a hoy; los registros ordenados cronológicamente.
- **Alertas**: el número del globo y "Todas" salen de la misma cuenta (alertas abiertas); "Ver proyecto" no cambia el estado de la alerta; solo "Marcar resuelta"; si el problema persiste, reaparece.
- **Conciliación en cada proyecto y material**: Comprado → Consumido → Desperdiciado → Sobrante o devuelto (con destino). Cada cifra abre los registros.
- **Textos**: "1 día laboral / N días laborales"; sin textos cortados con "…"; sin "pp".

---

## 6. Taller

- **Cantidades**: reemplazar "usada / desperdiciada / reutilizable" por:
  1. "¿Cuántas placas sacaste del stock?" (retirado)
  2. "De esas, ¿cuántas quedaron en el mueble?" (usadas)
  3. "De esas, ¿cuántas se tiraron?" (desperdicio)
  4. "De esas, ¿cuántas sobraron y se pueden reutilizar?" (sobrante)
  - Mostrar en vivo "Total retirado = X" y **no permitir guardar si usadas + desperdicio + sobrante ≠ retirado**.
- **Guardar** fijo abajo de la pantalla, siempre visible.
- **Medidas del sobrante**: plegado en "Agregar detalles (opcional)"; sin espesor ni color (ya los sabe el material).
- **Después de guardar**: "Registrar otra cosa" vuelve al menú del mismo proyecto.
- **Corrección**: "Deshacer" disponible 1 minuto y después "Corregir" como registro nuevo.
- **Lo que no debe verse en Taller**: ningún importe, margen ni costo.
- **Etiquetas**: "Asignado a este proyecto: 32 placas" en vez de "Disponible".
- **Selector de rol** al crear operario (no texto libre).

---

## 7. Modo demo y separación real de usuarios

**Hoy**: al pasar de Gestión a Taller no se puede volver a Gestión desde la misma pantalla.

**Para la demo**
- El cambio Gestión ↔ Taller debe estar disponible **desde las dos vistas** (en Taller, un control chico fijo "Salir de la vista Taller / Volver a Gestión").
- Solo existe cuando la organización está marcada como **demo**.
- En Taller de demo, el selector "Ver Taller como operario" debe permitir cambiar de operario sin salir.

**Para uso real (fabricantes)**
- Los usuarios quedan **separados por rol**: un usuario de Gestión siempre entra a Gestión; un operario siempre entra a Taller. Sin toggle visible.
- El operario solo ve sus proyectos asignados en Compras, Producción o Instalación.
- La ruta de Taller no debe compartir ruta con el Dashboard de Gestión (hoy se vio `/dashboard` mostrando la vista de Taller).

---

## 8. Acciones según la etapa

| Etapa | Acciones habilitadas | Acciones deshabilitadas con motivo |
|---|---|---|
| **Cotización** | Editar presupuesto, Aprobar presupuesto | Registrar compra, Registrar consumo/horas/costo, Cerrar proyecto |
| **Aprobado** | Registrar compra (decisión abierta D2), Pasar a Compras, Crear nueva versión del presupuesto | Registrar consumo/horas, Cerrar proyecto |
| **Compras / Producción / Instalación** | Registrar compra, cargar consumo/horas/costo, Cambiar etapa (de a una), Cerrar proyecto (solo en Instalación) | — |
| **Finalizado** | Solo lectura | Todo lo demás |

- Los botones **se deshabilitan** (no se ocultan) con un texto corto de motivo.
- El **botón principal** cambia con la etapa: Cotización = "Aprobar presupuesto"; Aprobado = "Pasar a Compras"; Compras en adelante = "Registrar compra".
- "Registrar lo que pasó" se renombra "Cargar consumo, horas o costo" y es secundario.
- Los mensajes de bloqueo deben decir la **misma regla** en todas partes.
- **Presupuesto base congelado**: después de aprobar, "Editar presupuesto" pasa a "Crear nueva versión", con el texto "Línea base congelada el [fecha]". Los desvíos siempre se miden contra la versión aprobada vigente, y el cambio queda en Actividad.

---

## 9. Marca: NEXO → Blerp

- Cambiar el nombre desde **una sola constante central**; no repetir el texto en cada archivo.
- Lugares a revisar: título lateral, título de pestaña del navegador, encabezado de Taller, landing, mails de invitación, textos de ayuda, archivos del proyecto.
- Mantener el subtítulo "Rentabilidad por proyecto" salvo decisión contraria.
- La landing todavía menciona el QR (ya eliminado del producto): sacarlo.

---

## 10. Preparación para machine learning

Importante: **con 4 proyectos finalizados de demostración no hay nada que aprender.** Los datos actuales son de ejemplo. El módulo debe presentarse como hipótesis experimental hasta tener historia real.

**Nombre y lugar en la interfaz**
- El resultado del modelo se llama **"Estimación del modelo (experimental)"** y se muestra **separado** del Margen proyectado (que es por reglas). Nunca el mismo nombre ni el mismo número.
- Mostrar siempre: rango (no un solo número), con cuántos proyectos comparables se calculó y cuáles son. Sin caja negra: "Se basa en 6 proyectos de tipo Local comercial".
- El modelo **no pisa** el presupuesto base ni el margen proyectado; el usuario decide si usar la sugerencia (como hoy "Sumar ese margen de seguridad").
- Si hay menos de N proyectos comparables (definir N, por ejemplo 10), no mostrar estimación y decir cuántos faltan.

**Datos que hay que dejar bien registrados desde ahora**
- Presupuesto base **versionado** y por línea (material_id o rol), para comparar presupuesto vs. real línea por línea.
- Consumo, desperdicio y sobrante separados, con material_id (no solo nombre).
- Horas por rol (catálogo) y por etapa.
- Fecha en cada costo (la inflación afecta precios en pesos).
- Duración planificada vs. real.
- Tipo de proyecto (catálogo), cliente (id) y, si es posible, dimensión (m² o cantidad de muebles; hoy existe la pestaña "Muebles y archivos").
- Cierre completo con margen real final.

**Reglas**
- Sin texto libre en los campos que alimentan el modelo.
- Los datos de demostración deben estar marcados como demo y **excluidos** del entrenamiento real.
- Guardar de cada predicción: versión del modelo, datos de entrada y fecha, para poder explicar y auditar.

---

## 11. Pruebas de aceptación (cambia X → se verifica Y)

1. Subo el costo por hora de Juan Pérez → las horas ya cargadas no cambian; el Cotizador sugiere el nuevo valor; el margen proyectado de proyectos activos cambia solo por las horas que faltan.
2. Cargo en Taller 3 usadas + 0,4 desperdicio + 0,1 sobrante (retirado 3,5) → Stock baja 3,5; el costo real de Materiales sube por 3,4; Stock > Sobrantes sube 0,1 con el costo del lote; el Dashboard refleja el cambio.
3. Registro una compra en Aprobado → Stock sube y Asignado sube; el costo real no cambia.
4. Intento cargar "armado" o "carpintero" en minúscula → el sistema obliga a elegir del selector.
5. Un proyecto sin registros muestra "Sin datos todavía", no "Saludable".
6. Un proyecto Finalizado no muestra alertas ni chip de salud.
7. El "¿Por qué?" de cualquier proyecto suma exactamente la Diferencia.
8. El número del globo de alertas coincide con la pestaña "Todas".
9. Cambio un umbral en Configuración → el estado de proyectos y las alertas se actualizan al instante en todas las pantallas.
10. En demo, paso de Gestión a Taller y vuelvo a Gestión; con un usuario real, no existe el toggle.
11. Cierro un proyecto con material asignado sin destino → no deja.
12. Cambio el precio de venta → cambian margen esperado, proyectado, Dashboard e Historial.

---

## 12. Decisiones abiertas para el equipo (antes de implementar)

- **D1 — Horas de instalación**: ¿van a la categoría "Instalación" o a "Mano de obra"? Hoy "Instalación" aparece como días en Mano de obra y como monto en Otros costos, con riesgo de contarse dos veces. Propuesta: las horas cargadas en etapa Instalación van a "Instalación"; el resto a "Mano de obra".
- **D2 — Compras en Aprobado**: hoy se puede comprar en Aprobado y existe una etapa llamada Compras. Decidir si Aprobado permite comprar o solo Compras.
- **D3 — Cómo se valoriza el consumo**: costo del lote del que sale (propuesto) o promedio ponderado. Definir una sola regla y mostrarla.
- **D4 — Mínimo de proyectos comparables (N)** para mostrar la estimación del modelo.
- **D5 — Cliente como entidad**: confirmar que el proyecto referencia un id de cliente y no texto libre.
