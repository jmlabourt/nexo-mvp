# Auditoría técnica de Blerp

**Fecha:** 8 de octubre de 2026 · **Base revisada:** rama `lote-1b-ajustes-ux` (incluye Lote 1 y 1B) · **Modo:** solo lectura, no se cambió código.

**Herramientas usadas:** `madge` 8.0.0 (ciclos de dependencias), `knip` 5.62.0 (código muerto), `vitest` con cobertura v8, el asesor de seguridad de Supabase y lectura manual del código y de las migraciones SQL.

> **Límite de esta auditoría:** no pude abrir el documento "Conexiones, estándares de datos y prioridades" (no aparece entre los artifacts accesibles desde esta sesión). En la sección 8 tomé como criterios de aceptación los que figuran en los pedidos del Lote 1, 1B y en las decisiones D1–D5. Si me pasás el link, completo esa sección.

---

## Resumen en una pantalla

| # | Hallazgo | Impacto |
|---|---|---|
| S1 | La base de datos deja que **cualquier usuario de la empresa, incluso un operario de Taller, lea y modifique todo** (precios, márgenes, proyectos, borrar datos). La separación Gestión/Taller existe solo en la pantalla. | **Crítico** |
| S2 | Un **operario dado de baja sigue teniendo acceso a la base**: la baja es solo visual. | **Crítico** |
| S3 | Todas las reglas de negocio (horas ≤ 24, costo bloqueado en ejecución, etapas de a una, quién carga qué) se validan **solo en el navegador**. | **Crítico** |
| D1 | Falta el **historial estructurado de etapas** (fecha de cada cambio de etapa): hoy solo queda como texto en la Actividad. Sin eso, el modelo no puede aprender duraciones. | Importante |
| D2 | **Cliente, rol, unidad, material "otro" y muebles son texto libre**: el mismo dato se escribe de varias formas y no se puede agrupar. | Importante |
| D3 | No hay marca de **origen del dato** (demo / real / importado) por proyecto: los datos de ejemplo se mezclan con los reales. | Importante |
| C1 | Hay **cifras que se calculan en más de un lugar** (margen en 5 lugares, costo de línea en 4, costo por mueble en la pantalla). | Importante |
| C2 | Hay **dos modelos de material** conviviendo (el "pool" viejo de sobrantes y el libro de stock nuevo). | Importante |
| F1 | **"Compra" significa dos cosas distintas**: la de Stock no deja registro de compra y la del proyecto sí. Además se puede comprar fuera de la etapa Compras (D2 sin implementar). | Importante |
| F2 | **D1 sin implementar**: las horas de la etapa Instalación se imputan a Mano de obra. | Importante |
| T1 | Las pantallas, el store y la conexión con Supabase **no tienen tests** (0 %). Solo está cubierta la lógica de `lib/`. | Importante |
| — | Código muerto, textos fuera del glosario, catálogos duplicados, ramas viejas. | Mejora |

**No se encontraron ciclos de dependencias** (madge: 141 archivos, 0 ciclos).

---

## 1. Cifras económicas calculadas en más de un lugar

**Regla buscada:** una sola función pura por cifra en `lib/`, y las pantallas solo la leen.

**Lo que está bien:**
- `projectEconomics()` en `lib/calculations.ts` es la fuente única de costo real hasta hoy, costo final proyectado, margen esperado, proyectado y real final, Diferencia y desvío por categoría.
- `deviationReasons()` es la fuente única del "¿Por qué?".
- `projectHealth()` en `lib/alerts.ts` es la fuente única de la salud del proyecto.
- `splitAlerts()` y `openAlertCount()` son la fuente única de la cuenta de alertas.

| Impacto | Dónde | Qué pasa | Propuesta |
|---|---|---|---|
| Importante | `components/budget/budget-tab.tsx:131` | La pestaña "Costo presupuestado" del proyecto calcula su propio margen esperado con `marginPercent(project.salesPrice - total, …)` en vez de leer `econ.expectedMargin`. | Leer `projectEconomics(project).expectedMargin`. |
| Importante | `components/projects/items-tab.tsx:33-34` | El costo por mueble se calcula en la pantalla: repite la fórmula de `usageProjectCost` y suma `actualEntries` a mano. | Crear `costByItem(project, itemId)` en `lib/calculations.ts`. |
| Importante | `lib/budget-calculator.ts:181` (`marginAt`) vs `lib/calculations.ts:53` (`marginPercent`) | Hay dos funciones de margen con la misma fórmula y distinta firma. | Dejar una sola. |
| Importante | `lib/budget-calculator.ts:140, 155, 170` y `components/budget/budget-calculator.tsx:76` | El total de línea (cantidad × costo o monto directo) se reescribe 4 veces en vez de usar `budgetLineTotal` (`lib/calculations.ts:25`). | Usar `budgetLineTotal`. Además, el resumen por categoría de la calculadora debería salir de `budgetByCategory`. |
| Importante | `components/materials/usage-form.tsx:87, 258` | La vista previa "Se imputa al proyecto" usa un **costo promedio** de los lotes. Al guardar, el consumo se valoriza **lote por lote** (`lib/project-operations.ts:351-390`, D3). Las dos cifras pueden diferir, y la de pantalla se presenta como definitiva. | Calcular la vista previa con la misma función que reparte por lotes (`consumeMaterial` en modo simulación). |
| Mejora | `lib/calculations.ts:58, 62, 183, 187, 192` | Las funciones sueltas `expectedProfit`, `expectedMargin`, `projectedProfit`, `projectedMargin` y `finalMargin` repiten lo que ya hace `projectEconomics` y **no se usan en ninguna pantalla** (solo en tests). Si alguien las usa, las sueltas **no** tratan "sin precio de venta" como `null` en la ganancia. | Borrarlas o hacer que deleguen en `projectEconomics`. |
| Mejora | `lib/alerts.ts:149` vs `lib/material-flow.ts:241` | El valor del material asignado sin consumir se calcula dos veces. | Que la alerta use la función de `material-flow`. |
| Mejora | `lib/seed-data.ts:303` | El total de la línea base se suma a mano en vez de usar `budgetTotal()`. | Usar `budgetTotal()`. |
| Mejora | `components/quotes/quote-page.tsx:46`, `components/projects/new-project-wizard.tsx:64` | El Cotizador y Nuevo proyecto calculan margen y ganancia cada uno por su lado (antes de que exista el proyecto). La fórmula es la misma, pero el panel lateral está duplicado. | Un solo componente de resumen que lea una función `quoteEconomics(total, precio)`. |

---

## 2. Código muerto, duplicados y dependencias

**Ciclos de dependencias:** ninguno (madge).

### 2.1 Archivos y carpetas sin uso

| Impacto | Qué | Detalle |
|---|---|---|
| Mejora | `arreglo-calculadora/` (5 archivos) | Es una copia vieja de la calculadora subida a mano. En el Lote 1 la dejé afuera de tsc y eslint, pero sigue en el repo. Conviene borrarla. |
| Mejora | `lib/reusable-pool.ts` y la tabla `reusable_materials` | Modelo viejo de sobrantes ("pool"). Hoy solo lo usa el armado de los datos demo (`lib/seed-data.ts:26`) y el pasaje del modelo viejo al libro de stock (`lib/stock-legacy.ts`). La migración `20261007120000` dice que la tabla "ya no se usa". |
| Mejora | `app/(gestion)/materials/page.tsx` | Es solo una redirección a `/stock?tab=sobrantes`. Se puede dejar como atajo o borrarla. |
| Mejora | Dependencias sin uso en `package.json` | `@radix-ui/react-dropdown-menu` y `@radix-ui/react-progress`. |

**Falsos positivos de knip (no tocar):**
- `proxy.ts` y `lib/supabase/proxy.ts`: son la convención de Next 16 para el middleware.
- `tailwindcss`: se usa desde `app/globals.css`.

### 2.2 Exportaciones sin uso afuera de su archivo (knip)

Son **23 funciones/constantes y 19 tipos**. La mayoría se usa dentro de su propio archivo y solo sobra el `export`. Las que parecen realmente muertas:

- `lib/supabase/mappers.ts`: `reusableToRow`
- `lib/reusable-pool.ts`: `poolTotalValue`
- `lib/material-flow.ts`: `unresolvedValue`
- `lib/operators.ts`: `hoursByOperator` (la pantalla de equipo lo recalcula a mano en `components/projects/team-card.tsx:19-24`: duplicado)
- `lib/schemas.ts`: `usageSchema`, `laborSchema`
- `components/ui/dialog.tsx`: `DialogTrigger`, `DialogClose`

### 2.3 Lógica y componentes duplicados

| Impacto | Dónde | Qué |
|---|---|---|
| Importante | `lib/material-reconciliation.ts:100` (`materialRows`) vs `lib/material-flow.ts:109` (`projectMaterialFlow`) | **Dos cuentas de material por proyecto**: una sale de compras y consumos registrados, la otra del libro de stock. `lib/insights.ts:120-121` usa las dos a la vez y elige según cuál haya. Hay un test que las compara, pero conviven dos verdades. |
| Mejora | `function Row` en `components/quotes/quote-page.tsx:136` y `components/projects/new-project-wizard.tsx:238`; `in30days` en `quote-page.tsx:20` y `new-project-wizard.tsx:26` | Mismo panel lateral y misma fecha por defecto, copiados. |
| Mejora | `Kpi` (`close-dialog.tsx:177`) y `Money` (`economic-summary.tsx:11`) | Dos tarjetitas de cifra casi iguales, más `components/shared/stat.tsx`. |
| Mejora | `const num` en `components/materials/usage-form.tsx:37` y `components/budget/budget-editor.tsx:40` | Dos lectores de número distintos (uno acepta coma decimal y el otro no exactamente igual), además de `parseDecimal` en `lib/schemas.ts`. |
| Mejora | `components/projects/team-card.tsx:19-24` | Recalcula las horas por operario que ya da `hoursByOperator`. |

---

## 3. Textos fuera del glosario y nombres distintos para lo mismo

| Impacto | Dónde | Hoy dice | Debería decir |
|---|---|---|---|
| Importante | `components/materials/materials-tab.tsx:40, 203, 205, 235`; `components/materials/material-flow-cards.tsx:56`; `components/projects/close-dialog.tsx:62`; `lib/activity.ts:53` | "Costo imputado real", "costo imputado", "Imputado", "costo imputable" | **Tres nombres para la misma cifra**. Elegir uno: "Costo real de materiales" (consumido + desperdicio). |
| Importante | `components/materials/materials-tab.tsx:34-35` | "Presupuestado", "Comprado / asignado" | "Cantidad presupuestada". Además separar Comprado de Asignado: el glosario pide que Comprado ≠ Asignado. |
| Importante | `lib/constants.ts:110` (`SOURCE_LABELS`), `lib/activity.ts:42`, `materials-tab.tsx:51, 91` | "Stock existente" | El glosario usa "Disponible" para lo libre en depósito. Proponer "Tomado del depósito". |
| Mejora | `lib/constants.ts:119` | "Valor del sobrante en el pool" | "Valor del sobrante". "Pool" no es del glosario. |
| Mejora | `lib/search.ts:118` | "inactivo" | "dado de baja". |
| Mejora | `components/stock/stock-page.tsx:241, 299` | Columna "Estado" | "Situación". "Estado" quedó reservado y se reemplazó por "Etapa". |
| Mejora | `components/projects/project-detail.tsx:116` | Pestaña "Costos reales" | Esa pestaña lista **solo** costos que no son material. Proponer "Horas y otros costos". |
| Mejora | `components/settings/settings-page.tsx:42` | "Costos que se pasan del presupuesto" | "…del costo presupuestado". |
| Mejora | Catálogos con nombres distintos para lo mismo | `WORK_TYPES` (`components/actual-costs/hours-form.tsx:15`: Corte, Armado, Laqueado / pintura…) vs roles de operario del Lote 2 (Carpintería, Armado, Oficina técnica, Terminaciones…) | Unificar en un solo catálogo de oficios. |

---

## 4. Campos de texto libre que deberían ser catálogo cerrado

| Campo | Dónde se carga | Hoy | Riesgo | Propuesta |
|---|---|---|---|---|
| **Cliente** | Nuevo proyecto (`lib/schemas.ts:13`) | Texto libre. Columna `projects.client text` | "Retail Sur", "RETAIL SUR SRL" y "Retail Sur S.R.L." quedan como tres clientes distintos | **D5**: tabla `clients` + `client_id` en el proyecto |
| **Rol del operario** | `components/operators/operators-page.tsx:61` | Texto libre ("armado" en minúscula) | No se puede comparar costo por oficio | Catálogo del Lote 2 |
| **Tipo de trabajo de las horas** | `hours-form.tsx:15` | Lista fija en el código, distinta de la de roles | Dos catálogos para lo mismo | Unificar con el de roles |
| **Unidad** | Calculadora, editor línea a línea, Registrar compra de stock (`components/stock/add-stock-dialog.tsx:108`), compra de proyecto | Texto libre | "placa", "placas", "Placa" y "pl" se tratan como unidades distintas | Catálogo: placa, m, m², u, par, kg, l, h, global |
| **Material "Otro"** | Calculadora (nombre libre con sugerencias), "Otro material" en Stock, compras y pedidos | Se crea un id a partir del texto (`slugify`) | El mismo material escrito distinto queda como dos materiales y no se reconcilia | Catálogo de materiales **por empresa en la base** (hoy son 8 fijos en `lib/constants.ts:122`) con alta controlada |
| **Muebles del proyecto** | `components/projects/items-tab.tsx` | Nombre + descripción libres | No se puede comparar "mostrador" entre proyectos | Tipo de mueble (catálogo) + medidas opcionales |
| **Tipo de proyecto** | Nuevo proyecto | Lista fija en el código (`lib/constants.ts:156`) con "Otro", guardada como texto | Si se renombra un tipo, los proyectos viejos quedan huérfanos | Guardar un id de catálogo |
| **Categoría de costo** | — | **Ya es catálogo cerrado** (7 categorías). Lo viejo se normaliza en `normalizeCategory` | — | La columna `category` en la base es texto sin restricción: agregar un `check` |
| **Proveedor** | Compras, otros costos | Texto libre | Igual que el cliente | Catálogo de proveedores (más adelante) |
| **Responsable del proyecto** | Nuevo proyecto (`owner`) | Texto libre con el nombre | No queda ligado a un usuario | Guardar el id del usuario |

---

## 5. Datos que el futuro modelo de predicción necesitaría

| Dato | ¿Se guarda hoy? | Detalle |
|---|---|---|
| Fecha de cada costo, consumo y compra | **Sí** | `date` en `actual_entries`, `material_usages` y `purchase_entries`, además de `created_at`. |
| Etapa en la que se cargaron las horas | **Sí** | `actual_entries.stage` (necesario para D1). |
| Costo de cada lote (D3) | **Sí** | `stock_lots.unit_cost`. Cada consumo guarda `lot_id` y `unit_cost`. |
| Presupuesto base congelado | **Sí** | `projects.baseline` (JSON). |
| `material_id` | **A medias** | Los 8 materiales del catálogo tienen id. Los "Otro" usan un id armado del texto, y las líneas de la calculadora con nombre libre quedan **sin** `materialId` (`components/budget/calculator-state.ts`: solo si el nombre coincide exacto). |
| **Fecha de cada cambio de etapa** | **No (estructurado)** | Solo queda como texto en `activity_events` ("Proyecto pasó a la etapa…"). Hace falta una tabla `project_stage_changes` (etapa, desde, hasta, quién). **Es la base para predecir plazos.** |
| Fecha real de inicio | **No** | Hay fecha de inicio *planificada* y fecha de cierre, pero no cuándo empezó realmente la producción. Se deriva del punto anterior. |
| Muebles estructurados | **No** | Solo nombre y cantidad. Faltan tipo, medidas, material principal y terminación. |
| Tamaño del proyecto | **No** | No hay m², cantidad de piezas ni de muebles normalizada. Sin una medida de tamaño, 10 proyectos "comparables" (D4) no se pueden comparar. |
| **Origen del dato (demo / real / importado)** | **No** | Solo existe `organizations.demo_seeded` a nivel empresa. Los proyectos demo y los reales conviven sin marca. Hace falta `projects.origin` (`demo`, `manual`, `importado`). |
| Cliente como id | **No** | D5 pendiente. |
| Versión del modelo / supuestos de la cotización | **A medias** | El estado de la calculadora no se guarda con el proyecto: solo quedan las líneas resultantes. Los supuestos (horas por jornada, % de desperdicio, % de imprevistos) se pierden. |
| Cotizaciones que no se ganaron | **No** | El Cotizador no guarda nada si no se convierte en proyecto. Para aprender la tasa de cierre hace falta guardar la cotización perdida. |

---

## 6. Seguridad

### 6.1 Reglas de la base (RLS)

El asesor de seguridad de Supabase solo marca un aviso menor: la protección de contraseñas filtradas está apagada. No aplica mucho porque se entra con Google.

La revisión de las migraciones muestra lo siguiente:

| Impacto | Dónde | Qué pasa |
|---|---|---|
| **Crítico** | `supabase/migrations/20261003190000_init.sql:238-252` | En `projects`, `budget_lines`, `purchase_entries`, `material_usages`, `actual_entries`, `activity_events` y `resolved_alerts` la regla es "cualquier **miembro** de la empresa puede todo" (`for all … is_org_member`). Un **operario** (rol `operator`) es miembro, así que por API puede leer precios de venta, márgenes y costos, editar el costo presupuestado y borrar proyectos. "Taller no ve plata" es solo de pantalla. |
| **Crítico** | `supabase/migrations/20261007120000_stock_operarios_etapas.sql:186-199` | Lo mismo para `stock_lots`, `stock_movements`, `material_requests`, `project_items`, `stage_logs` y `attachments`. |
| **Crítico** | Baja de operarios (Lote 1B) | Dar de baja pone `operators.active = false`, pero **no toca `organization_members`**. El usuario sigue siendo miembro y la base le sigue dando acceso. |
| Importante | `init.sql:229-230` | Cualquier miembro (incluido un operario) puede **modificar la empresa**: nombre, umbrales de alertas y `demo_seeded`. |
| Importante | `20261007120000…sql:254-262` (Storage) | Cualquier miembro puede subir archivos a la carpeta de la empresa. Está bien que lean, pero subir debería quedar limitado a los proyectos asignados. |
| Bien | Operarios (`20261007120000…sql:202-212`) | Solo Gestión crea, edita y borra operarios. Está bien hecho. |
| Bien | Todas las tablas tienen RLS activado y aisladas por empresa | Una empresa no ve a otra. |

### 6.2 Validado solo en el navegador

Todo esto vive en `lib/project-operations.ts`, `lib/project-rules.ts` y `store/use-app-store.ts`. **La base no lo controla:**

- Avanzar de etapa de a una, y que solo Gestión cambie de etapa (`lib/project-rules.ts:64-88`).
- Que el costo presupuestado quede bloqueado en ejecución (`lib/project-operations.ts:154`).
- No cargar consumo ni horas en Cotización o Aprobado (`assertExecutable`).
- Tope de 24 h por día, sin fechas futuras (`lib/project-rules.ts:checkHours`).
- Que un operario solo cargue sus propias horas y en proyectos asignados.
- Que no se cierre un proyecto con material sin destino.
- Que no se consuma más material del asignado (el libro de stock no tiene control en la base).
- Que no se elimine un operario con horas (Lote 1B).

**Además:** la sincronización (`store/use-app-store.ts:203-219`) escribe "lo último que vio cada pestaña". Si dos personas de Gestión editan el mismo proyecto a la vez, gana la última y no se avisa. Es un riesgo de pisar datos, no de seguridad.

### 6.3 Propuesta

1. Separar las políticas por rol:
   - Gestión (`is_org_manager`) escribe todo.
   - Taller (`operator`) **solo lee** los proyectos donde está en `assigned_operator_ids`, sin columnas de plata (vía una vista), y **solo inserta** horas propias, consumos y pedidos de material.
2. Al dar de baja, cambiar también el rol en `organization_members` (por ejemplo a `inactive`) o hacer que `is_org_member` excluya a los operarios inactivos.
3. Pasar las reglas críticas a la base: funciones RPC (`log_hours`, `register_usage`, `change_stage`) con sus `check`, o como mínimo triggers para el tope de horas y el bloqueo del costo presupuestado.

---

## 7. Flujos que se cortan, duplican o confunden

| Impacto | Flujo | Qué pasa | Propuesta |
|---|---|---|---|
| Importante | **Cotizador vs. Nuevo proyecto** | Son dos entradas a la misma calculadora. La cotización viaja al asistente en una variable en memoria (`components/budget/quote-draft.ts`): **si se recarga la página, se pierde**. El Cotizador no guarda nada propio y el proyecto nace en la etapa "Cotización", así que hay dos "cotizaciones" que no son lo mismo. | Que "Crear cotización" cree directamente un proyecto en etapa Cotización (sin cliente obligatorio) y el Cotizador sea solo su vista. Así no se pierde nada y quedan registradas las cotizaciones perdidas (punto 5). |
| Importante | **Stock "Registrar compra" vs. "Registrar compra" del proyecto** | Mismo nombre, distinto registro. La de Stock crea un lote en el depósito sin `purchase_entries`; la del proyecto crea `purchase_entries` y un lote asignado. Un listado de compras del mes no puede salir de un solo lugar. | Un único registro de compra con destino "Depósito" o "Proyecto X". |
| Importante | **D2 (solo se compra desde Compras)** | La compra del proyecto se permite en Aprobado, Compras, Producción e Instalación (`lib/project-operations.ts:248`, solo bloquea Cotización). El botón "Registrar compra" está siempre visible (`components/projects/project-detail.tsx:94`). | Implementar D2 (estaba planificado para un lote posterior). |
| Importante | **D1 (horas de Instalación → categoría Instalación)** | `lib/project-operations.ts:505` imputa todas las horas a Mano de obra, aunque `stage` = installation. | Implementar D1. Ya se guarda la etapa, así que se puede recategorizar lo histórico. |
| Mejora | **Pedido de material de Taller** | El operario pide, Gestión lo ve en Stock → Pedidos, pero el pedido no queda ligado a la compra o asignación que lo resuelve. | Guardar qué compra o asignación lo resolvió. |
| Mejora | **"Registrar lo que pasó" de Gestión vs. Taller** | Son dos formularios distintos para el mismo consumo (`usage-form` tiene variante "management" y "workshop"). Funcionan, pero conviene probar que dan el mismo resultado. | Test de equivalencia. |
| Mejora | **Cerrar proyecto** | El aviso "categorías presupuestadas sin costos" (`close-dialog.tsx:111-123`) no bloquea el cierre, pero el material sin destino sí. Está bien, pero el criterio no se explica en pantalla. | Texto de ayuda. |

---

## 8. Cobertura de tests

**Hoy:** 12 archivos y 126 tests, todos pasando.

| Zona | Líneas cubiertas |
|---|---|
| `lib/` (lógica de negocio) | **78 %** |
| `lib/calculations.ts` | 94 % |
| `lib/alerts.ts` | 100 % |
| `lib/stock.ts` | 94 % |
| `lib/operators.ts` | 83 % |
| `lib/insights.ts` | 57 % |
| `lib/formatting.ts` | 56 % |
| `lib/schemas.ts` (validaciones de formularios) | 36 % |
| `lib/supabase/workspace.ts` (lectura y escritura en la base) | **0 %** |
| `store/` (acciones de la app) | **0 %** |
| `components/` (pantallas) | **0 %** |

**Pruebas de aceptación** (de los pedidos del Lote 1, 1B y D1–D5; el documento "Conexiones…" no lo pude leer):

| Criterio | ¿Automatizado? |
|---|---|
| "¿Por qué?" suma exacto a la Diferencia | Sí (`tests/lote1-mensajes-honestos.test.ts`) |
| Salud según alertas abiertas, "Sin datos todavía", finalizado sin chip ni alertas | Sí |
| Globo de alertas = pestaña Todas; la alerta reaparece si persiste | Sí |
| Sin precio de venta → "—"; gráfico de atraso con precio y más de un día | Sí (la regla; no la pantalla) |
| Siete categorías iguales en todas las pantallas | Solo en la lógica. **No** se prueba que cada pantalla las muestre |
| Actividad sin fechas futuras y ordenada | Sí |
| Compra ≠ costo; consumo sí cambia el margen | Sí (`tests/demo-scenarios.test.ts`) |
| Baja de operarios, reactivar, eliminar sin horas | Sí (`tests/lote1b-ajustes-ux.test.ts`) |
| Breadcrumbs con links, "Volver" a la lista padre | Sí (la regla); **no** el clic real |
| **Un operario no puede leer precios ni márgenes** | **No**, y además hoy **falla** en la base (S1) |
| **Un operario de baja no accede a nada** | **No** (solo se prueba la pantalla) |
| Recargar la página no pierde datos ni la cotización | **No** (y la cotización se pierde) |
| D1: horas de Instalación en la categoría Instalación | **No** (no implementado) |
| D2: solo se compra desde la etapa Compras | **No** (no implementado) |
| D3: el consumo se valoriza al costo del lote | Sí (escenarios de stock) |
| D4: mínimo de 10 proyectos comparables | Solo la constante. No hay modelo que probar |
| D5: el proyecto referencia un id de cliente | **No** (no implementado) |
| Textos del glosario en pantalla (sin "pp", sin "presupuesto" suelto…) | **No** (solo se prueban los formateadores) |
| Recorrido completo en navegador (crear, registrar, cerrar) | **No** (no hay tests de punta a punta) |

**Propuesta:**
1. Tests de RLS contra una base de prueba de Supabase: un operario intenta leer `projects.sales_price` y debe fallar.
2. Tests de punta a punta con Playwright (ya está instalado en el entorno) para los recorridos principales.
3. Un test que recorra los textos de `components/` buscando palabras prohibidas ("pp", "presupuesto" suelto, "inactivo", "pool").

---

## Orden de arreglo propuesto

1. **Seguridad de la base (S1, S2, S3).** Es lo único crítico.
   - Políticas por rol: Taller solo lee sus proyectos y sin plata.
   - La baja corta el acceso.
   - Reglas clave en la base.
   - Tests de RLS.
   - *Antes de sumar un piloto con datos reales.*
2. **Datos para el modelo que no se pueden recuperar después.**
   - Historial de etapas con fechas.
   - Origen del dato (demo/real).
   - Guardar los supuestos de la calculadora y las cotizaciones perdidas.
   - *Cada día que pasa sin guardarlos es historia perdida.*
3. **Decisiones D1, D2 y D5 y los catálogos cerrados.**
   - Cliente con id.
   - Unidad, rol/oficio (Lote 2) y material por empresa.
4. **Una sola fuente por cifra.**
   - Margen de la pestaña Costo presupuestado, costo por mueble, vista previa del consumo, `marginAt` y total de línea.
   - Un solo modelo de material (retirar el "pool" viejo).
5. **Flujos.**
   - Cotizador que guarda.
   - Una sola "compra" con destino.
6. **Glosario pendiente:** imputado/imputable, "Stock existente", "pool", "Estado" en Stock.
7. **Limpieza.**
   - Borrar `arreglo-calculadora/`, el código muerto de knip y las dependencias sin uso.
   - Borrar las ramas viejas del repositorio (`calculadora-presupuesto`, `stock-logica`, `stock-logica-1`, `claude/*`).
