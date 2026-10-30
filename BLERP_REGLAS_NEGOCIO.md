<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AGENTS.md — Blerp | Reglas permanentes para Codex

> **Aplicación:** repositorio del MVP de Blerp (tesis ITBA). Se aplica a Codex en VS Code y Codex Cloud.
> **Misión:** preservar un sistema integrado de cotización, ejecución y rentabilidad por proyecto; **no** desarrollar cinco pantallas desconectadas ni un ERP generalista.
> **Estado de este documento:** decisiones funcionales acordadas. **Una regla acordada no significa que ya esté implementada**: antes de editar, inspeccionar el código actual.
> **Idioma:** usar español claro en textos visibles y comunicación funcional. Respetar el idioma y convenciones existentes del código.

## 0. Jerarquía y reglas de lectura

1. Respetar primero las instrucciones de seguridad y las órdenes explícitas de la tarea actual. Para el negocio, usar este archivo como guía transversal y los requerimientos expresos más recientes como especificación del cambio solicitado.
2. **Prevalecen las decisiones más recientes** sobre las descripciones históricas de entrevistas, documentos antiguos, README, datos demo o implementaciones provisionales. No restaurar un comportamiento viejo solo porque aparece en el repositorio.
3. Las **reglas obligatorias** de este archivo son invariantes de negocio. Las secciones **«Pendiente / no asumir»** identifican cuestiones que requieren definición: no convertirlas en decisiones por cuenta propia.
4. Un ejemplo de un cliente, un importe de planilla o un registro ficticio **no es un valor predeterminado universal**.
5. No asumir rutas, funciones, esquemas, librerías ni estado de implementación por documentación desactualizada. Inspeccionar archivos, dependencias, tests y comportamiento de la rama activa.
6. El bloque inicial `nextjs-agent-rules` puede ser gestionado automáticamente por Next.js: **conservarlo** y verificar la documentación local del framework cuando corresponda.

## 1. Qué es Blerp y qué problema resuelve

**Blerp** es un MVP de tesis para PyMEs y empresas que **fabrican por encargo, por proyecto o a medida**: carpinterías, fabricantes de mobiliario comercial/corporativo, exhibidores, stands y talleres con trabajos no estandarizados. El enfoque puede extenderse a otras actividades productivas por proyecto si sus rubros y procesos pueden configurarse.

Un proyecto pasa de una estimación comercial a materiales comprados y utilizados, trabajo real, producción y entrega. La cotización parte de horas y materiales previstos; durante la ejecución cambian las cantidades, aparecen desperdicios, sobran materiales, varían las horas y se requieren refuerzos o trabajos externos. La información suele repartirse entre Excel, formularios, WhatsApp y conocimiento informal, por lo que los desvíos y el margen real se conocen tarde o de manera imprecisa.

**Pregunta de producto:** «¿Estoy ganando lo que pensé que iba a ganar? Si no, ¿en qué se desvió el proyecto?».

### Aprendizajes de entrevistas y validaciones

- La planificación de taller **sí existe**: el responsable de Planta organiza anticipadamente qué operario trabajará para qué **proyecto y rubro**. En una empresa entrevistada se prepara la semana siguiente; no equivale a detallar cada tarea física ni cada etapa minúscula de un mueble.
- La fabricación a medida no siempre es lineal: no se puede inferir automáticamente avance físico a partir de horas consumidas ni exigir un catálogo rígido de microtareas diarias.
- El operario es quien conoce y registra las **horas realmente trabajadas** al finalizar la jornada. Planta necesita controlar, corregir excepcionalmente y ver diferencias con la planificación, no reingresar cada hora.
- Planta registra **uso de materiales, desperdicios, sobrantes y unidades terminadas**. Debe ser rápido, incluso durante imprevistos, trabajos paralelos y transferencias de stock.
- Las empresas pueden resolver sobrecarga con **horas extra, operarios externos o tercerización de trabajos completos**. Gerencia y Planta suelen coordinar esas decisiones.
- Se identificó la necesidad de diferenciar el **presupuesto** de las **compras**, el **consumo físico** y el **costo real**; una compra no significa que todo ese material se usó o se perdió.
- Compras necesita saber **qué adquirir, cuánto y con qué urgencia**; no necesita ver métricas internas de consumo productivo, horas ni avances de taller.
- Gerencia necesita trazabilidad de cobros, costos y desvíos de horas/materiales. Los indicadores solo valen si provienen de registros compartidos y reconciliables.
- Son aprendizajes de investigación y validación de flujo, **no una afirmación de product-market fit ni evidencia de que todas las fábricas operan igual**.

### Filosofía del producto

**Simplicidad operativa + una única carga de cada hecho + trazabilidad + decisiones basadas en datos reales.** Capturar lo mínimo que cada persona sabe; calcular y propagar el resto. No transformar Blerp en un ERP de contabilidad, facturación, recursos humanos, planificación avanzada o gestión documental sin un requisito explícito. No incorporar QR por iniciativa propia.

## 2. Modelo conceptual y vocabulario

Distinguir rigurosamente:

| Concepto | Significado | Regla de implementación |
|---|---|---|
| Empresa/organización | Cliente que utiliza Blerp | Sus parámetros, usuarios y datos deben permanecer aislados cuando el sistema sea multiempresa. |
| Proyecto | Trabajo comercial/productivo para un cliente | Tiene una **clave interna estable** y un **código visible configurable**. Nunca fabricar una clave nueva para una pantalla. |
| Mueble/ítem fabricable | Unidad o modelo dentro del proyecto, con cantidad requerida | Puede contener varios rubros. Las **unidades terminadas** se contabilizan para el mueble completo. |
| Rubro productivo | Especialidad/proceso configurado: carpintería, pintura, etc. | No es una lista fija; determina horas cotizadas, habilidades y asignaciones. |
| Categoría/puesto | Clasificación laboral y costo/hora | Es diferente del rubro productivo y de la vista de Blerp asignada. |
| Cotizado | Presupuesto original estimado | Congelar referencia aprobada; no reescribirla con resultados reales. |
| BOM publicado | Lista de materiales requeridos para producir, por mueble/rubro según corresponda | Puede versionarse; no reescribir movimientos históricos por una nueva versión. |
| Planificado | Asignación futura de personas y horas | **No** es trabajo realizado ni genera costo real por sí solo. |
| Comprado / pedido | Orden de compra, compromiso de adquisición | No implica recepción, disponibilidad física ni consumo imputable. |
| Recibido | Ingreso físico confirmado | Actualiza existencias según reglas vigentes, no costo de material consumido. |
| Asignado / reservado | Stock comprometido a un proyecto | No equivale a material consumido. Evitar doble asignación. |
| Consumido | Material efectivamente utilizado | Movimiento productivo que puede generar costo imputable. |
| Desperdiciado | Material perdido/no reutilizable | Movimiento imputable al proyecto según valoración de origen. |
| Sobrante | Material reutilizable que vuelve a stock | No tratarlo como desperdicio ni dejarlo cargado como costo consumido del proyecto de origen. |
| Real | Hecho efectivamente registrado: hora, consumo, cobro, etc. | Identificar fecha efectiva, entidad asociada, autor y origen. |
| Parcial / estimado / pendiente | Información incompleta, proyección o costo no validado | Nunca presentarla como real definitivo ni sustituirla silenciosamente por cero. |

No confundir **rubro** con **tarea**: la asignación semanal mínima confirmada es por proyecto y rubro. Si el producto usa «tarea» en una etiqueta de UI, debe mapear a un concepto real del modelo; no crear un catálogo de operaciones inexistentes.

## 3. Las cinco vistas y la propiedad de los datos

Existen exactamente **cinco vistas de Blerp**. Los puestos «Comercial», «Diseño» y otros pueden usar **Administración**; no crear más vistas por cada puesto.

| Vista | Responsabilidad principal | Datos que origina o modifica | Qué no debe hacer |
|---|---|---|---|
| **Gerencia** | Control económico y operativo; configuración; costos, capacidad, cobros, rentabilidad y cierre | Parámetros, personal y acceso demo, cobros, decisiones económicas, costos externos confirmados, cierre | No inventar consumos/horas para alimentar indicadores ni cerrar con costos sin confirmar. |
| **Administración** | Cotizar, gestionar proyectos/clientes, definir muebles/rubros y publicar BOM | Cotizaciones, presupuesto, condiciones de cobro, clientes, BOM y revisiones | No registrar compras desde un módulo duplicado ni fijar categorías «Diseño/Administración» para todas las empresas. |
| **Compras** | Detectar necesidades, gestionar órdenes, proveedores, recepciones y stock de abastecimiento | OCs, partidas/asignaciones vinculadas, recepción, catálogo de proveedores compartido | No exponer el detalle de consumo productivo, horas o avances; no requerir carga de comprobantes. |
| **Jefe de Planta** | Planificar semanalmente, gestionar disponibilidad, materiales, avance, externos, corrección de horas y alertas | Asignaciones, excepciones, movimientos productivos, unidades terminadas, tercerizaciones y rectificaciones auditadas | No volver a cargar las horas internas de todos como fuente duplicada; no cambiar salarios o costo base. |
| **Operario** | Consultar asignación y registrar las horas que realmente trabajó | Registro individual de horas por fecha/proyecto/rubro y mueble cuando se conoce; trabajo interno general | No registrar costos, precios, cobros, rentabilidad ni necesariamente materiales. |

La **vista** asignada y el **puesto/categoría** son atributos independientes de un mismo empleado. Gerencia configura acceso habilitado y una de las cinco vistas en **Personal**, reutilizando el catálogo de empleados; no mantener una segunda tabla de personas para «Usuarios y permisos» dentro del frontend demo. No afirmar que la selección de vista en demo implementa seguridad real. No alterar autenticación ni RLS sin permiso.

Los datos pueden ser relevantes para un cálculo sin tener que mostrarse en todas las vistas. Ejemplo: Compras utiliza existencias libres y pendientes de OC para saber cuánto falta, pero no necesita una columna «Usado en producción».

### Flujo entre vistas — cadena obligatoria

```text
Administración: cotización → aprobación → muebles/rubros → BOM publicado
                                     ↓
Compras:                  necesidades → OC → recepción / asignación de stock
                                                        ↓
Planta:              planificación por operario/proyecto/rubro
                     movimientos de material + avance + refuerzos externos
                                                        ↓
Operario:            asignación precargada → horas reales registradas
                                                        ↓
Planta:              revisión y corrección auditada de horas
                                                        ↓
Gerencia:            costos, cobros, capacidad, desvíos, rentabilidad y cierre
```

El dibujo no implica ejecución estrictamente secuencial: compras, planificación, registros productivos y cobros pueden superponerse según el estado y las reglas del proyecto. Toda vista consulta **los mismos hechos** mediante modelos, selectores y cálculos compartidos.

## 4. Ciclo de vida y fechas de proyecto

### Estados operativos actualmente acordados

`En cotización → Aprobado → Compras → Producción → Cerrado`.

- **En cotización:** trabajo todavía no aprobado; no contabilizar como venta comprometida ni demanda confirmada. Si se conserva un estado de cotización rechazada/no aceptada existente, no eliminarlo ni convertirlo artificialmente en proyecto aprobado.
- **Aprobado:** existe aceptación comercial y referencia histórica del presupuesto. Se habilita el trabajo de BOM.
- **Compras:** Administración **publicó el BOM** y el proyecto pasó a abastecimiento automáticamente.
- **Producción:** la recepción de materiales del proyecto o la asignación de stock libre puede activar automáticamente este estado, de acuerdo con el flujo vigente. **No** inferir de esto que empezó la mano de obra.
- **Cerrado:** únicamente **Gerencia** puede realizar cierre definitivo tras las verificaciones económicas y productivas.

No incorporar automáticamente una etapa obligatoria de «Instalación», «Visuales», «Facturación» o similar por aparecer en notas antiguas. Si el código vigente tiene etapas adicionales, identificar el conflicto antes de eliminarlas o migrarlas.

### Cuatro fechas distintas

1. **Aprobación:** cuándo el cliente acepta la cotización.
2. **Inicio previsto de fabricación:** cuándo se espera comenzar; sirve para compras y capacidad.
3. **Inicio real de fabricación:** primer trabajo productivo efectivamente registrado; **no** primera compra ni primera recepción.
4. **Entrega prevista:** compromiso de entrega; sirve para urgencias y capacidad futura.

Conservar fechas reales de entrega, cobro y otras marcas de auditoría si existen. No asumir `aprobación = inicio real` ni `Producción = inicio real`. Un proyecto puede necesitar compras antes de que empiece a fabricarse.

**Históricos:** preservar la fecha del evento, no reemplazarla por «hoy» al reabrir o corregir. Para reportes usar la fecha relevante de cada indicador (aprobación, cobro efectivo, trabajo realizado, etc.).

## 5. Identificador de proyecto — único nomenclador

**La fuente exclusiva del código visible de proyecto es `Gerencia → Configuración → Nomenclatura de proyectos`.** No crear códigos alternativos en componentes, seeds, dashboards o selectores.

- El formato/prefijo/numeración los elige cada empresa. `OT4306` es un **ejemplo de una configuración**, no un prefijo obligatorio. `P-0987` tampoco debe imponerse.
- Al crear un proyecto, asignarle el **código visible de acuerdo con el nomenclador vigente**. Usar ese código, inmutable para ese proyecto salvo modificación explícita y segura, en todas las cinco vistas.
- Separar, cuando el modelo lo permita, la **clave técnica interna** (identidad/referencias) del **código comercial visible**. No utilizar texto de la etiqueta como clave relacional.
- Cambiar el prefijo o secuencia para futuros proyectos **no renumera** proyectos existentes ni rompe referencias de presupuestos, BOM, OCs, horas o stock.
- Garantizar unicidad y prevenir colisiones en el ámbito de cada empresa. No reiniciar numeradores o inventar identificadores al renderizar un gráfico.
- En **ejes de gráficos** usar principalmente **solo el código visible corto**; nombre completo en tooltip, tabla o detalle. Mantener interacción para abrir proyecto; no recortar identificadores al punto de volverlos ambiguos.
- Reutilizar los datos reales ya asociados. Si existen seeds con códigos inconsistentes, corregirlos manteniendo relaciones, no renumerarlos arbitrariamente. Ante necesidad de migrar claves históricas, **pedir permiso**.

Preferir en nombres de componentes y textos genéricos «identificador de proyecto» o «nomenclatura de proyectos»; «OT» es válido solo donde sea el valor elegido por la empresa o parte de un registro histórico.

## 6. Reglas económicas y de horas

### 6.1. Cotizado, ejecutado y rentabilidad

- Presupuesto aprobado = **referencia histórica estable**. Guardar el snapshot necesario de cantidades, horas, precios, tasas/condiciones y márgenes relevantes. Una edición posterior de configuración no debe reescribir silenciosamente ese histórico.
- **Costo real de materiales**: valor de material **consumido + desperdiciado**, con valorización histórica correspondiente; no total comprado ni stock recuperable sobrante.
- **Costo de mano de obra interna de proyecto**: registros de horas reales atribuibles × costo horario aplicable al empleado/categoría, contabilizados **una sola vez**. No usar las horas planificadas como reales. Si existen reglas de horas extra configuradas, aplicarlas sin hardcodear porcentajes.
- **Costos de externos y tercerizaciones**: una única imputación por hecho económico, diferenciando costo estimado, pendiente y confirmado. No duplicar como «otros gastos».
- **Trabajo interno general**: costo indirecto distribuido según la regla de la sección 6.5, sin crear horas ficticias en rubros.
- Conservar otros componentes previstos por el modelo (otros gastos directos, fletes, etc.) si están implementados correctamente. **No cambiar fórmulas específicas del cotizador por conjetura**; revisar su origen y aplicar la regla solicitada sin inventar supuestos.
- Resultado por proyecto, conceptualmente: `ganancia = venta neta pertinente − costos imputables no duplicados`; `margen % = ganancia / venta neta pertinente × 100`. Respetar en la implementación la definición vigente de descuentos, impuestos y costo financiero; no mezclar importes con y sin IVA.
- Los proyectos abiertos muestran **resultados parciales o proyecciones**, nunca «rentabilidad real final» si faltan consumos y horas. La rentabilidad final exige costos suficientemente conciliados y cierre.
- Para rentabilidad agregada, sumar numeradores y denominadores comparables: `Σ ganancia / Σ ventas netas × 100`. **Nunca promediar porcentajes de proyectos** ni mezclar periodos.
- Sin base válida (`venta = 0`, cotizado = 0, faltan datos), mostrar «no disponible / pendiente» en vez de porcentajes imposibles o ceros falsos.

### 6.2. Costo financiero — criterio confirmado

El costo financiero de cotización se calcula sobre el **importe de venta sin IVA todavía pendiente de cobro**, no automáticamente sobre el capital invertido en materiales/mano de obra. Revisar primero la utilidad financiera existente: si aplica este criterio, **preservarla**.

Para un período con saldo constante:

`costo financiero del tramo = saldo pendiente sin IVA × (tasa mensual % / 100) × (días financiados / 30)`.

Sumar tramos según anticipos y cuotas: el cobro reduce el saldo desde la fecha que corresponde. Distinguir **calendario estimado/pactado de cobros** del **cobro real**. Un pago previsto no cuenta como recibido; si se calcula financiación real, contemplar demoras reales de manera consistente.

- Tasa mensual, supuestos financieros y condiciones de cobro se configuran **manualmente** por empresa y/o proyecto donde corresponda. Tasa cero válida.
- No fijar un `2%` mensual, un `5%` total, adelantos del `50%`, `30`/`60` días como **defaults comerciales** por el testimonio de Luigi. El `30` del denominador representa la convención mensual del **método lineal confirmado**, no un plazo de cobro impuesto.
- Ejemplo **solo como test**: venta neta $10.000.000, anticipo inmediato 50%, saldo en 30 días, tasa 2% → costo financiero $100.000.
- Ejemplo **solo como test**: venta neta $10.000.000, sin anticipo, 60 días de producción + 60 hasta cobro, tasa 2% mensual → costo financiero lineal $800.000.
- El tiempo de negociación previo a aprobación no se añade automáticamente. Usar la fecha de comienzo del financiamiento establecida por la lógica de contrato; si falta esta definición para un caso nuevo, **consultar**.
- No añadir otro costo de inflación que duplique la misma financiación. Llamarlo siempre **«Costo financiero»** y distinguir tasa mensual de costo financiero total.

### 6.3. Horas reales, atribución y correcciones

- Un **operario interno** registra las horas que hizo por fecha, proyecto y rubro; mueble cuando puede identificarse. Puede partir la jornada entre múltiples proyectos/rubros e incluir Trabajo interno general.
- El plan diario/semanal **precarga** asignaciones, pero el operario puede corregir proyecto, rubro y horas al informar lo real; solamente seleccionar proyectos/rubros existentes y habilitados. No limitar a ocho horas universales.
- El Jefe de Planta puede **revisar/corregir un registro individual** (fecha, proyecto, mueble, rubro, horas según permisos de demo). Guardar antes/después, autor, fecha y causa cuando el flujo lo permita; nunca sobrescribir sin posibilidad de auditoría.
- Si una hora se conoce solamente a nivel **proyecto + rubro**, conservar esa granularidad. No prorratearla silenciosamente entre muebles para que cierren los gráficos. Mostrar como «sin mueble identificado» o pendiente de asignar cuando corresponda.
- Las **horas de operarios externos** las registra Planta y se computan separadas de las internas. Nunca generar falsa diferencia interna al conciliarlas.
- La **calculadora rápida** `n.º operarios × horas por persona` es ayuda para estimar/controlar, **no** segunda fuente de horas reales ni de costos. El total real interno proviene de entradas individuales verificadas.
- Una diferencia respecto a la **planificación** puede ser legítima; no tratar automáticamente como fraude/error. Alertar registros incompletos, inconsistencias comprobables y faltantes vencidos, con acceso a corrección.

### 6.4. Capacidad y demanda semanal

Gerencia configura dotación, días/jornadas, habilitaciones por rubro y **ajustes manuales trazables de capacidad**. Planta registra excepciones (ausencias, fracciones de jornada, disponibilidad extraordinaria) para fechas específicas. No usar números fijos de una fábrica entrevistada.

Distinguir:

- `capacidad disponible` = horas realmente disponibles del personal para el período, ajustadas por calendario y excepciones;
- `horas planificadas` = horas de asignaciones futuras, que consumen capacidad pero **no** son ejecución;
- `demanda estimada` = horas de rubro aún necesarias de proyectos comprometidos, distribuidas por semanas;
- `horas reales` = las ya trabajadas, que actualizan pendiente y desvíos.

**Regla inicial:** distribuir horas cotizadas de cada rubro por las semanas laborables entre **inicio previsto y entrega prevista**. Durante la ejecución, `demanda estimada por semana = horas pendientes estimadas del rubro / semanas laborables restantes`. Ajustar semanas parciales por días/horas hábiles para no sobrecargar semanas incompletas. Proyectos atrasados o sin horizonte válido requieren una alerta/estado explícito, no dividir por cero.

- No comparar las horas totales de tres proyectos de varias semanas contra la capacidad de una sola semana.
- No sumar las horas planificadas **otra vez** a la demanda estimada: son dos vistas del mismo trabajo, no dos trabajos.
- No contabilizar una persona dos veces si está habilitada en varios rubros; repartir su capacidad efectivamente asignable.
- Cotizaciones no aprobadas son demanda **potencial**, no compromiso de planta.
- Horas futuras de externos solo amplían capacidad si el refuerzo está **confirmado para ese período**. Horas externas pasadas son reales, no capacidad futura. Tercerizar un mueble completo reduce trabajo interno pendiente si se refleja una decisión explícita, pero **no crea horas disponibles en la planta**.
- Si las horas reales superan las cotizadas y la fabricación no terminó, no deducir por ello que «no faltan más horas». Marcar sobreconsumo y permitir revisar estimación de trabajo restante, sin inventarla.

### 6.5. Trabajo interno general — asignación monetaria

Cuando cualquier empleado registra horas de **Trabajo interno general** no ligadas directamente a un proyecto:

1. Guardar **un único registro** de horas y su costo calculado con la tarifa vigente aplicable al empleado.
2. Identificar proyectos **activos en la fecha efectiva trabajada**: como regla acordada de partida, aprobados y aún no cerrados, incluyendo Compras y Producción; excluir cotizaciones sin aprobación y cerrados.
3. Repartir el **costo monetario total** por partes iguales entre esos proyectos. Ejemplo ilustrativo: 8 horas generales y cuatro proyectos activos → cada proyecto absorbe 1/4 del costo total (no crear cuatro registros productivos de 2 horas).
4. Conservar trazabilidad entre registro general y asignaciones; el total asignado debe ser exactamente igual al costo original y **no volver a sumarse como costo general aparte** en el mismo consolidado.
5. Si no hay proyectos activos, mantener el costo **sin distribuir**, nunca inventar uno ni dividir por cero.
6. Cambios posteriores del registro, la fecha o datos históricos deben recalcular o versionar las asignaciones sin duplicaciones. No asignar basándose en los proyectos activos **hoy** cuando el trabajo fue en otra fecha.

No imputar estas horas a rubros productivos ni usarlas para los gráficos de horas de Planta.

### 6.6. Desvíos y dashboards

- **Desvío de horas** por rubro/proyecto = `horas reales − horas cotizadas`. Positivo = sobreconsumo; negativo en proyecto abierto = diferencia parcial, **no ahorro definitivo**.
- **Desvío de materiales** se agrega entre materiales heterogéneos **en dinero**, nunca sumando placas, metros y litros. Mostrar en detalle cotizado/BOM/consumido/desperdiciado y valoraciones para explicar cantidad, precio y cambios de diseño.
- La comparación cotizado vs. real debe tener **igual alcance** (proyecto, mueble, rubro, fechas, unidad) y aclarar registros sin atribución granular.
- El porcentaje de desvío requiere denominador cotizado válido; evitar dividir por cero y falsos `100%` cuando falta referencia.
- Separar gráficos/tablas de **trabajos terminados** de los **parciales** o etiquetar explícitamente el segundo grupo.
- Las tarjetas de dinero cobrado usan **cobros efectivamente registrados**; los saldos pendientes usan contrato vigente menos cobros reales hasta la fecha de corte. No sumar nuevamente un anticipo.
- **Proyectos aprobados** considera el **evento de aprobación del período**, incluso si el proyecto ya avanzó a Compras/Producción/Cerrado; no filtrar solo por estado actual `Aprobado`.
- El subtotal de «Costos del período» pedido para dashboard se refiere a `desperdicios + otros gastos directos + costo financiero`; **no** es el costo total de fabricar. Si desperdicio ya está en costo real de material, mostrarlo como desglose sin agregarlo dos veces al resultado económico.
- Los KPIs y tablas con filtro global deben usar el tipo de fecha correcto para cada métrica. No interpretar datos faltantes como `0` real y no comparar períodos incompatibles.

## 7. Materiales, BOM, Compras y stock — invariantes

### 7.1. Ciclo material

```text
BOM por proyecto/mueble/rubro
  → necesidad de abastecimiento
  → stock libre aplicable y OCs pendientes
  → compra / recepción / asignación a proyecto
  → consumo | desperdicio | sobrante reutilizable | saldo asignado
  → costos reales, stock disponible y conciliación
```

- **Una OC puede incluir materiales para varios proyectos**: conservar atribución por línea y cantidades asignadas; evitar comprar dos veces lo ya disponible, reservado o pedido.
- **Las compras pueden ocurrir antes de producción**, y pueden tener recepciones parciales. Una OC abierta no equivale a stock físico.
- **La compra no se imputa inmediatamente como costo de material real**. Reconocer lo efectivamente consumido o desperdiciado conforme a la valoración del origen. El sobrante reutilizable retorna a stock; preservar su valor y procedencia para imputarlo correctamente cuando otro proyecto lo consuma.
- Mantener trazabilidad de lote/costo histórico **cuando esté disponible**; no inventar valores históricos ni reconstruir costos con el precio actual si hay un costo real de origen guardado.
- Los cambios de BOM deben quedar **versionados** y generar diferencias/necesidades nuevas; no editar retroactivamente OCs, recepciones o consumos.
- Para material asignado/liberado, conservar cantidades: `asignado/entregado = consumido + desperdiciado + retornado como sobrante + todavía asignado`, teniendo en cuenta transferencias y ajustes registrados. No permitir stock negativo silencioso ni movimientos imposibles.
- Si una misma pieza circula entre proyectos, registrar la **transferencia de stock** y ajustar ambas atribuciones; no duplicar existencias ni costos.
- Planta registra **por proyecto → mueble → rubro → material** y marca unidades terminadas **del mueble completo**. Materiales extra pedidos por Planta deben generar una necesidad trazable de Compras; un rubro de trabajo nuevo no debe aparecer por arte de magia: requiere actualización autorizada de la estructura del proyecto/BOM según el flujo de Administración.
- Un proyecto en ejecución puede tener materiales todavía asignados. Al cierre, esos materiales deben quedar rendidos: consumidos, desperdiciados, sobrantes o transferidos según regla vigente.

### 7.2. Qué se muestra en Compras

Mostrar **qué comprar, cuánto, cuándo/urgencia, proveedor, OC y recepción**. Calcular la urgencia a partir del **inicio previsto** y plazos necesarios de abastecimiento cuando existan; si falta una fecha/plazo indispensable, indicar que no puede determinarse con precisión. No inventar fechas de llegada.

Ocultar de la vista de Compras «usado en producción», productividad, horas, avances por mueble y reportes de taller; **no borrar** los movimientos del dominio que hacen posible calcular stock libre y necesidades. Eliminar la obligatoriedad de adjuntar comprobantes a una OC. Conservar las recepciones parciales y su historial.

En Administración, **Clientes** permanece como pestaña para consultar/crear/editar clientes; **Proveedores** se administra desde el lugar de configuración/gestión compartida previsto, sin duplicar un catálogo ni una pestaña de Administración de uso marginal.

## 8. Reglas de UX específicas por vista

Estas son **decisiones funcionales vigentes**, no órdenes de reconstruir pantallas que ya estén bien resueltas.

### 8.1. Gerencia

- Preservar Dashboard, Proyectos, Personal, Stock y Configuración, más las funciones existentes que no contradigan reglas actuales.
- Cuatro tarjetas: **Dinero cobrado, Pendiente de cobrar, Rentabilidad total y Proyectos aprobados** (importe y cantidad). Preservar filtro global de fechas.
- **Dinero cobrado por proyecto:** tabla sencilla con código visible, cliente, cobro efectivo del período y acceso al detalle; **no** gráfico horizontal de cobros.
- **Eliminar «Cobros por semana»** del Dashboard; no agregar otro equivalente sin solicitud.
- **Desvíos de producción:** tres gráficos compactos: (a) horas cotizadas vs. reales por proyecto, (b) desvíos de horas por rubro —barras horizontales—, (c) materiales cotizados vs. reales por proyecto en pesos. Abrir detalle por mueble/rubro/material al seleccionar; tablas detalladas plegables. No sobrecargar etiquetas: en el eje usar el **identificador corto del nomenclador** y tooltip con nombre completo.
- Conservar rentabilidad cotizada vs. real, capacidad por rubro, alertas y detalle/trazabilidad de cálculos. No usar cifras aleatorias para llenar gráficos.
- **Personal:** única gestión de empleados, con categoría/puesto, jornada, días, rubros habilitados y costo horario visible; acceso habilitado y **Vista de Blerp** (exactamente cinco opciones) en la misma ficha. Los costos se modifican desde la configuración económica correspondiente, no desde un duplicado.
- **Configuración → Indicadores y cálculos:** diccionario de desplegables que explica qué es, fórmula, origen y actualización del indicador. No selector de «OT para los ejemplos», controles de demo, botones de indicadores o filtros redundantes. Los cálculos por proyecto van en su detalle/«Ver cálculo».
- **Configuración:** nomenclatura de **proyectos**, costos por hora, márgenes, tasa financiera, capacidad y criterios de alerta editables; no parámetros fijos de By Braun.

### 8.2. Administración

- Cotización, clientes, proyectos, muebles/rubros/BOM, condiciones comerciales/cobros según funciones actuales.
- «Horas de diseño y administración» se sustituye por una denominación genérica como **«Horas de personal no operario»**, con categorías configuradas por empresa. Distinguirlas de horas productivas de operarios por rubro.
- Publicación de BOM comunica automáticamente las necesidades a Compras. Mantener versiones y adicionales autorizados sin alterar el presupuesto aprobado original.
- Cliente se agrega desde la pestaña **Clientes**; no duplicar clientes en dos módulos.
- No reintroducir la carga de OCs desde Administración si Compras es quien debe registrarlas.

### 8.3. Compras

- Dashboard minimalista sobre necesidades, cantidades, prioridad por inicio previsto y órdenes/recepciones pendientes.
- «Por comprar» considera stock libre, asignaciones y pedidos en tránsito para evitar compras duplicadas.
- Una OC puede abastecer varios proyectos con atribución clara.
- Stock muestra disponibilidad útil para comprar, **no consumo de producción**.
- Órdenes de compra **sin formulario obligatorio de comprobantes**.

### 8.4. Jefe de Planta

Mantener/adaptar accesos **Hoy · Planificación · Proyectos · Operarios · Alertas · Registrar mis horas**; no agregar Dashboard independiente.

- **Hoy:** jerarquía visual **proyecto → mueble → rubro → material**. Mostrar claramente horas **cotizadas totales**, **trabajadas hasta hoy** (incluye hoy), **registradas hoy** y **pendientes estimadas/sobreconsumo** con sus alcances. Para materiales mostrar **BOM total, consumido acumulado, consumido hoy, desperdicio, sobrante y saldo**. Planta registra consumo y avance físico; no duplica horas internas.
- **Planificación:** semanal, por **operario + proyecto + rubro + día/tramo/horas**, sin obligar a elegir mueble. Varios trabajos por día; editar/cambiar/copiar asignaciones. Tramos configurables, no cuatro obligatorios.
- **Proyectos:** resumen de muebles, rubros, materiales, horas, avance real y faltantes, sin precios comerciales.
- **Operarios:** disponibilidad y excepciones por fecha; revisión/corrección individual de horas con auditoría y referencia a la asignación original. No cambiar costos o jornadas base.
- **Alertas:** conservar y vincular a registros verificables (capacidad insuficiente, atrasos, faltantes, registros de horas, material pendiente de rendición, costos externos pendientes relevantes). Evitar falsos positivos.
- **Registrar mis horas:** horas propias del jefe, por proyecto o Trabajo interno general. No se confunden con las horas del equipo.
- **Externos:** registra operarios externos por hora y trabajos tercerizados; costo optativo si se conoce, siempre sujeto a confirmación final de Gerencia.
- **Calculadora de horas:** ayuda opcional `operarios × horas`; no crea entradas económicas nuevas.

### 8.5. Operario

- «Mi día» muestra automáticamente el **proyecto y rubro** asignados por Planta (y horas previstas si la interfaz requiere esa referencia; evitar sesgar la declaración de horas reales).
- Permitir cambiar a otro proyecto/rubro válido, registrar las horas realmente trabajadas y agregar varias actividades del día. Mueble opcional cuando se conoce; no inventarlo ni exigir granularidad que no existe.
- «Trabajo interno general» es opción propia, separada de una OT.
- No mostrar costos, rentabilidad, ingresos, información de compras ni datos sensibles de Gerencia.
- El registro efectivo es **único** y puede corregirse con historial desde Planta.

## 9. Tercerizaciones, refuerzos y cierre

Distinguir:

1. **Operario externo por horas:** Planta registra fecha, proyecto, rubro, mueble si corresponde y horas. Gerencia configura tarifa; Planta puede informar costo conocido; no se registra como empleado interno ni se duplica como otro gasto.
2. **Trabajo tercerizado a otro taller:** Planta registra parte fabricada, proyecto/rubro/mueble, proveedor/descripcion y costo si se conoce. Si el precio es cerrado, **no inventar horas internas**. No aumentar capacidad interna por enviar trabajo afuera.

El Jefe de Planta puede ingresar un **costo provisional/conocido**. **Gerencia lo confirma o reemplaza por el definitivo**. Hasta entonces aparece **«Pendiente de confirmar»** o «Estimado», no $0 confirmado. Registrar solo una imputación económica por el mismo refuerzo/trabajo.

**Cierre exclusivo de Gerencia** y condicionado a: muebles finalizados; entrega/rendición requerida registrada según el flujo existente; materiales conciliados; registros de horas suficientemente completos/revisados; costos de externos y tercerizaciones confirmados; otros costos indispensables no pendientes. Informar exactamente qué bloquea el cierre. **No exigir cobro total para cerrar la fabricación**: las cuentas por cobrar y sus cobros posteriores siguen activos.

## 10. Reglas para modificar el MVP

### 10.1. Preservar lo existente

- Mantener **paleta, tipografías, componentes, espaciados, navegación, responsive y modo demo local**. No rehacer pantallas ni introducir otra librería UI sin necesidad comprobada.
- Reutilizar componentes, modelos, selectores, stores, utilidades y fórmulas existentes. Corregir la lógica en su fuente compartida, **no** con parches distintos para cada vista.
- Mantener datos demo coherentes y conectados; si hay datos ficticios, identificarlos como demo. No generar valores al azar por cada tarjeta/serie para que un gráfico parezca completo. Si faltan registros, mostrar estado vacío o pendiente.
- Preservar mecanismo actual de persistencia local y reset de demo. **No exigir Supabase ni credenciales externas para usar el modo demo que ya funciona.** No reinicializar el estado cada vez que renderiza ni perder cambios del usuario al navegar.
- Si hay código de Supabase o integraciones ya presentes, **no tocarlos** sin autorización. No afirmar que el frontend demuestra permisos de seguridad de backend.
- No introducir QR, módulo nuevo de facturación, integración contable o automatizaciones no solicitadas.

### 10.2. Límites de autorización

**Podés hacer sin pedir permiso en cada paso:** cambios de componentes existentes, textos, visualizaciones, validaciones, selectores, tests, cálculos y modelos del frontend necesarios para el pedido, siempre que respeten estas reglas y no produzcan migraciones destructivas.

**Pedí autorización antes de:**

- Cambios arquitectónicos mayores o reescrituras masivas.
- Operaciones destructivas sobre datos históricos o cambios incompatibles de identificadores.
- Modificar **Supabase, migraciones, políticas RLS, autenticación, middleware de seguridad, permisos reales, APIs o integraciones backend**.
- Cambiar dependencias estructurales, despliegue, dominio o configuración de infraestructura de modo significativo.
- Resolver una contradicción material de negocio que las decisiones documentadas no resuelvan.

Si algo no está definido, implementar solo la parte segura y comunicar **el punto pendiente concreto**. No inventar una política silenciosamente.

### 10.3. Seguridad operativa de Git

- **Trabajar exclusivamente en la rama de desarrollo indicada** por el usuario o el entorno. Antes de editar, comprobar rama activa y `git status`.
- **Nunca modificar `main`** sin permiso explícito. Si se abre un entorno en `main`, no editar allí; solicitar rama autorizada o usar una rama de trabajo solo si el usuario/entorno lo permite claramente.
- **No ejecutar automáticamente `git commit`, `git push`, merges, rebases, apertura/cierre de PR ni despliegues a Vercel/producción.** Dejar cambios sin commit para revisión y reportarlos.
- No descartar ni sobrescribir cambios preexistentes del usuario. No borrar archivos sin comprender referencias y consecuencias.
- No incluir secretos, claves, variables de entorno sensibles ni datos reales de clientes en commits, fixtures o respuestas.

## 11. Forma de trabajo de Codex por tarea

1. **Inspección breve:** leer requerimiento, este `AGENTS.md`, rama/estado de Git y los archivos afectados; rastrear origen de los datos, consumidores en otras vistas, validaciones y tests existentes. No asumir que el último ZIP compartido es el repositorio actual.
2. **Mapa de impacto:** identificar flujo de entrada → fuente de verdad → cálculo compartido → proyecciones en las cinco vistas. Comprobar estados, fechas, IDs y unidades; señalar ambigüedades materiales.
3. **Implementación mínima:** modificar la lógica común primero y luego UI/selecciones/etiquetas. Preferir cambios incrementales, con tipos y validaciones coherentes, evitando estado duplicado y funciones «especiales» para un proyecto concreto.
4. **Pruebas:** ejecutar los comandos existentes de `package.json` que correspondan (`typecheck`, `test`, `lint`, `build` **solo si están disponibles**); además cubrir los escenarios de negocio afectados. No agregar paquetes para ejecutar checks rutinarios sin permiso.
5. **Revisión transversal:** validar que el mismo hecho se vea y compute bien en las vistas correspondientes y en el modo demo. Revisar etiquetas de tiempo («hoy», «acumulado», «cotizado»), unidades, manejo de vacíos y estados pendientes.
6. **Entrega concisa:** informar archivos cambiados, qué comportamiento cambió, qué pruebas se ejecutaron y su resultado, qué no se pudo verificar, qué decisiones requieren validación. **No hacer commit ni despliegue.**

### Casos de regresión prioritarios

- **Identificador:** un proyecto se crea con el nomenclador vigente; aparece con **el mismo código** en cotización, BOM, compras, horas, stock y gráficos. Cambiar el formato futuro no reetiqueta los ya creados. Los gráficos usan código corto y nombre en tooltip.
- **Cotización y BOM:** al aprobar se conserva el presupuesto base; publicar BOM envía necesidades a Compras y cambia etapa; una revisión posterior no reescribe compras/consumos históricos.
- **Materiales:** pedir/comprar **no** aumenta costo real de materiales; consumir/desperdiciar **sí**; un sobrante reutilizable retorna a stock con costo/origen; recepción parcial y transferencia entre proyectos preservan cantidades.
- **Plan y horas:** Planta asigna por operario/proyecto/rubro; Operario recibe precarga, informa horas distintas o cambia tarea; Planta corrige con historial. La hora se contabiliza **una vez** y aparece igual en Gerencia.
- **Capacidad:** ausencias, jornadas configurables y rubros múltiples ajustan correctamente la semana; tres proyectos de varias semanas no se comparan como si todos se ejecutaran en una sola.
- **Tercerización:** costo desconocido queda pendiente; costo provisional del jefe requiere confirmación; se bloquea cierre y no se duplica costo ni capacidad.
- **Financiero:** anticipo y saldo, cuotas, retraso efectivo, tasa editable y tasa cero. No aplicar porcentaje fijo por defecto basado en un cliente.
- **Trabajo interno:** un registro se distribuye monetariamente entre proyectos activos **de su fecha**, sin duplicar horas ni costo; ausencia de proyectos no genera una división inválida.
- **Dashboard:** indicadores coinciden con las fuentes; proyectos abiertos son parciales; desvíos comparan alcances homogéneos; cobrado es cobrado real, no cobro previsto.
- **Demo:** carga, navegación, edición, persistencia local y reinicio intencional siguen funcionando; ningún cambio exige conexión a Supabase si antes no la requería.

## 12. Pendientes y límites de conocimiento — NO resolver por suposición

Estos puntos tienen antecedentes variables, quedaron condicionados o dependen de cómo esté implementado el MVP. **No son autorización para crear nuevas funcionalidades.**

1. **Roles múltiples para una persona:** una reunión antigua mencionó múltiples roles simultáneos; la definición reciente del MVP es **exactamente cinco vistas y una vista seleccionable por empleado** en la configuración de Personal. No implementar permisos multivista ni seguridad backend sin una decisión explícita.
2. **Granularidad del avance:** el número de muebles completos es una medida fiable; no se validó una fórmula universal de porcentaje por proceso. No imponer microtareas ni traducir horas a porcentaje físico.
3. **Horas no atribuibles a mueble:** está admitido que una asignación sea proyecto/rubro. No inventar prorrateos entre muebles. Si se necesita distribuir para rentabilidad por mueble, pedir definición del criterio de atribución.
4. **Costo de una tercerización sin importe:** pendiente hasta confirmación gerencial; no estimar arbitrariamente. No suponer que cada tercerización se factura por hora.
5. **Capacidad:** distribución uniforme de remanente por semanas es una **aproximación**, no planificación de secuencia de rubros o fechas exactas de fabricación. Para feriados, turnos, excepciones y lead times no configurados, no inventar calendarios ni promesas de entrega.
6. **Parámetros financieros:** el método lineal sobre saldo sin IVA está confirmado. La fecha inicial y condiciones concretas pueden depender del acuerdo comercial; no añadir la espera de aprobación ni usar inflación y tasa como cargos separados por cuenta propia.
7. **Alcance de estados o entrega:** en documentación anterior hubo otros nombres de etapas y requisitos; prevalece el flujo actual de cinco estados. Si código actual y reglas recientes difieren materialmente, describir el conflicto antes de borrar históricos o migrarlos.
8. **Tarifas, márgenes, rubros, número de personas, jornada, formatos de proyecto:** los datos de Luigi y de cualquier demo son ilustrativos. **Ninguno es una constante universal.**
9. **Backend y persistencia:** el trabajo de Supabase se coordina por separado y la integración definitiva no se presume terminada. Conservar lo que existe sin rediseñar contratos/seguridad ni prometer que la UI de demo implica permisos reales.
10. **Hipótesis de mercado:** hay entrevistas y validaciones operativas; no afirmar adopción masiva, ahorro cuantificado o resultados económicos reales sin datos verificables.

---

### Regla de oro

**Cada área registra una sola vez lo que realmente sabe.** El resto de Blerp consume esos mismos registros, calcula con reglas auditables y diferencia lo cotizado, planificado, recibido, consumido, real, parcial y pendiente. **Preservar el MVP y simplificarlo es más importante que agregar funciones.**
