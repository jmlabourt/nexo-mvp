# Pendientes para el equipo de backend

Rama `sesiones-frontend`: el frontend de las cinco sesiones (Gerencia, Administración / Comercial / Diseño, Compras,
Jefe de planta y Operario). En esta rama **no se tocó** `supabase/`, `lib/supabase/`, RLS, RPC, autenticación,
middleware ni variables de entorno, y no se agregó ninguna migración.

Lo que la base todavía no guarda está así en la app:

- **En la demo** (o sin empresa cargada): se muestran datos de ejemplo de `lib/demo/ejemplos.ts`, siempre con la
  etiqueta "Datos de ejemplo".
- **En una empresa real**: se muestra la etiqueta "Pendiente de backend" y la acción queda deshabilitada (`PendingAction`).
- **Nunca** se simula un guardado.

Los contratos (tipos) de cada dato están en `types/index.ts`, al final del archivo.

## 1. Migraciones: estado y orden

| Migración | Estado | Nota |
| --- | --- | --- |
| `20261023120001_operario_sin_material_usado.sql` | Escrita, **no aplicada** | Aplicar justo después de promover el deploy que la acompaña. |
| `20261024120000_planta_entregas_y_cierre.sql` | Escrita, **no aplicada** | Entrega de materiales y cierre del día del Jefe. |
| `20261028120000_ledger_registros_de_la_empresa.sql` | **Aplicada** (28/10/2026, SQL Editor del proyecto `nexo`) | Registros de la empresa por cuenta: ver sección 8. |
| `20261029120000_rol_administracion.sql` | **Aplicada** (28/10/2026, SQL Editor del proyecto `nexo`) | Rol propio de Administración (`comercial`): ver sección 2. Probada en vivo con un usuario temporal (se deshizo). |
| `pendiente_supabase.sql` (`reset_workspace`, `admin_commit_change`; no está en el repo) | Puede estar pendiente | Verificar en la base real. |

**Versión duplicada.** `20261023120000_historial_y_dataset_llm.sql` y `20261023120001_operario_sin_material_usado.sql`
tienen la misma versión. Supabase CLI registra las versiones en `schema_migrations` y puede rechazar la segunda o
saltearla. Hay que renombrar una de las dos (por ejemplo, `operario_sin_material_usado` → `20261023120001_…`) antes de
aplicarlas. Esta rama no la renombra porque no puede tocar `supabase/`.

## 2. Gerencia y Administración: rol propio (migración `20261029120000_rol_administracion.sql`)

- **Hecho:** Administración / Comercial / Diseño tiene su propio rol en la base (`comercial`). Ya no comparte permisos con
  Gerencia (Administrativo). Detalle de qué ve y qué hace: `docs/ROLES_Y_PERMISOS.md`.
- **Lectura:** `comercial_workspace()` (security definer): proyectos con precio y costo presupuestado, compras, stock con
  costo, tarifas por rubro. Las horas reales llegan **sin importe** y los operarios **sin costo por hora ni PIN**; no llegan
  facturas, cobros, costos generales ni tarifas por persona. Directo a las tablas no lee nada.
- **Escritura:** `comercial_commit_change()`: crea y edita cotizaciones (proyecto, productos, presupuesto, actividad,
  adjuntos) y las aprueba (cotización ↔ aprobado). Un proyecto ya en marcha o cerrado, las etapas de producción en
  adelante, operarios, stock, tarifas y usuarios siguen siendo de Gerencia.
- **Decisión a revisar con el equipo:** hoy "Diseño listo: enviar a Compras" (aprobado → compras) lo hace Gerencia. Si
  Diseño debe hacerlo, se abre en la función y en `QUOTER_STATUSES` (`lib/project-rules.ts`).
- **Un Administrativo** puede seguir mirando la sesión Administración (con sus propios permisos); el selector "Sesión"
  queda en `localStorage` (`nexo-ui-v2`).

## 3. Datos sin tabla o sin lectura desde la app

| Dato | Contrato | Dónde se usa | Qué falta |
| --- | --- | --- | --- |
| Facturas al cliente (emitidas / previstas, vencimiento, cobro) | `ClientInvoice` | Dashboard de Gerencia (facturación, cobros vencidos), ficha → Facturación | Tabla + RLS (solo Gerencia) + alta/edición. **Una cotización nunca es venta.** |
| Oportunidades (probabilidad, estado de negociación, fechas tentativas, horas por rubro) | `Opportunity`, `NegotiationStatus` | Dashboard de Gerencia (carga confirmada / potencial / ponderada) | Columnas en `projects` o tabla aparte. Sin probabilidad → "Sin estimar" (nunca se inventa). |
| Parámetros de Gerencia: inflación mensual, formato de código, rubros de trabajo, puesto → rubro | `ManagementParams` | Configuración (Rubros y capacidad, Inflación y nomenclatura) | Tabla de parámetros por organización. Los botones de guardar están deshabilitados. |
| Capacidad por rubro | `RubroCapacity` | Configuración y Dashboard | Hoy se deriva del personal activo (`capacityFromOperators`). Para cambiarla a mano hace falta guardar `roleToRubro`. |
| Clientes (contacto, teléfono, mail, dirección, notas) | `ClientRecord` | Administración → Clientes | La tabla `clients` existe (migración de historial), pero la app no la lee todavía. Hoy se derivan de los proyectos (`lib/directory.ts`). Faltan lectura, alta y edición. |
| Proveedores (contacto, rubro, condiciones) | `SupplierRecord` | Administración y Compras → Proveedores | Tabla + RLS. Hoy se derivan del historial de compras. |
| Diseño por mueble: estado, etapas simultáneas, BOM, estado de la BOM | `FurnitureDesign`, `DesignStatus`, `FurnitureStage`, `BomLine` | Ficha → Muebles | Columnas o tablas ligadas a `project_items`. "Mueble" = `project_items` (no hay modelo nuevo). |
| Rechazo de una cotización con su motivo | `CommercialRejection` | Ficha (Administración) → "Registrar rechazo" | Estado `rejected` + motivo + fecha. |
| Rubro de cada línea del cotizador por mueble | `RubroRow.productKey` (solo frontend) | Cotizador → Subtotal por mueble | `budget_lines` no tiene `item_id`: al crear el proyecto se guardan las mismas líneas, sin el mueble. Hace falta `item_id` opcional. |
| Incidencias de planta (máquina parada, falta de material, retrabajo) | — | Jefe → Alertas → "Registrar incidencia" | Ya existe `taller_add_stage_log` (`stage_logs`). Falta una variante para el rol `jefe_planta`, con un tipo "incidencia". |
| Horas de Diseño en la carga manual | — | Ficha → Registrar horas | El tipo de hora "Diseño" por persona existe en tarifas, pero no por empleado ni en la asignación. |

## 4. Cambios de frontend que el backend debería acompañar

- **Devolución al proveedor:** se quitó de todas las pantallas. La acción del store (`returnStockToSupplier`) y su
  movimiento siguen existiendo. Si no se va a usar, puede retirarse de la RPC / política.
- **Operario:** "Mi día" ya no muestra horas estimadas ni el pedido de material o el aviso de problema. La ruta
  `/taller/[projectId]` redirige a `/taller`. Las RPC de pedido de material del operario quedan sin uso.
- **Gerencia no ingresa ni mueve stock de rutina:** asignar, liberar, transferir y marcar sobrantes se hacen desde el
  proyecto o en Planta. La RLS sigue permitiéndolo al rol `admin`.
- **Cotizador de materiales de Compras:** se quitó. La ruta `/compras/cotizador` redirige a Proveedores.

## 5. `reset_workspace` (no se modificó)

Para que una empresa nueva vea las pantallas nuevas con contenido de ejemplo, `reset_workspace` debería sembrar:

- facturas de ejemplo;
- oportunidades;
- parámetros de Gerencia;
- diseño, etapas y BOM de los muebles;
- clientes y proveedores en sus tablas.

Hoy esos ejemplos viven solo en el frontend (`lib/demo/ejemplos.ts`).

## 6. Cotizador, tarifas y circuito entre sesiones (rama siguiente)

Detalle del circuito y resultado de la prueba de punta a punta: `docs/CIRCUITO.md`.

| Qué falta | Dato | Operación | Regla de permisos |
| --- | --- | --- | --- |
| Compras ve el cambio de Diseño ("Aumentó por Diseño", cantidad cotizada y motivo) | Cantidad del presupuesto base de cada línea de materiales y sus `value_corrections` de cantidad (anterior, nueva, motivo, quién, cuándo) | Lectura: sumarlos a `compras_workspace` | Rol `compras`: solo líneas de materiales; sin precio de venta |
| El Jefe ve la cantidad real de materiales por mueble y los planos | Cantidad (sin costo) de las líneas de materiales, su mueble, y `attachments` de los muebles | Lectura: sumarlos a `planta_workspace` | Rol `jefe_planta`: sin `unit_cost` ni `total` |
| El Jefe responde "¿Se terminó este proyecto?" | Confirmación del Jefe (quién y cuándo) | Escritura: una RPC tipo `planta_confirm_finished(project_id)` que deje un evento en el historial | Rol `jefe_planta`, solo en Producción |
| Mueble de cada línea del presupuesto | `budget_lines.item_id` (opcional) | Al crear el proyecto desde el cotizador por mueble | Igual que `budget_lines` |
| Subestados comerciales y decisión de entrega | Hoy van en `activity_events.kind` (`negotiation`, `rejected`, `delivery`) y en el mensaje | Conviene una columna (`commercial_state`, `delivery_choice`) para filtrar y validar | Administración escribe; Gerencia lee |
| Objetivos de rentabilidad por defecto en Configuración | `cost_settings.materials_target_pct` y `labor_target_pct` | Hoy el cotizador arranca en 30 % y 30 % fijos (se ajustan en la cotización); el gasto financiero sí sale de Configuración | Gerencia escribe |
| Un solo costo por hora | `operators.hourly_cost` y el historial `operator_cost` siguen en la base; `cost_settings.labor_valuation` vale `operator` por defecto | La app ya no los edita (un alta toma la tarifa de Mano de obra). Para que todos cobren lo mismo, elegir "tarifa general" en Configuración o cambiar el valor por defecto | Gerencia |

## 7. Demo integral (rama `claude/epic-johnson-zn9v9u`)

Guía, matriz de datos y pruebas: `docs/DEMO.md`. Todo lo nuevo vive en el frontend: un estado de demostración
guardado en el navegador (`store/demo-local.ts`) y un `Ledger` con los registros que la base todavía no tiene
(`types/index.ts`, `lib/ledger.ts`). Las cuentas reales no usan ese estado: ven "Pendiente de backend".

### 7.1 Ruta pública de demostración

El middleware (`lib/supabase/proxy.ts`) manda a `/login` todo lo que no es público, así que hoy la demo pide iniciar
sesión. **Pedido:** una ruta pública (por ejemplo `/demo`) que abra la app con `blerp-demo:activa = 1` sin sesión,
sin acceso a Supabase y con `noindex`. `HydrationGate` ya no consulta la base cuando la demo está activa.

### 7.2 Esquema propuesto

Todas con `organization_id` (FK) y `created_by`/`created_at`. Importes sin IVA, `numeric(14,2)`.

| Tabla | Columnas principales | Notas |
| --- | --- | --- |
| `sales_invoices` | `project_id`, `number` (único por organización), `date`, `amount`, `notes` | Mes de facturación = `date`. |
| `collections` | `project_id`, `invoice_id` (nullable = anticipo), `date`, `amount` | Check: Σ cobros de una factura ≤ importe. |
| `supplier_payments` | `order_id`, `date`, `amount`, `reference` | Requiere orden facturada. |
| `contract_revisions` | `project_id`, `previous`, `next`, `reason` | Solo después de aprobar; sin update ni delete. |
| `payment_terms` / `payment_schedule` | `project_id`, `days_after_delivery` / `label`, `amount`, `date` | |
| `bom_versions` / `bom_lines` | `project_id`, `item_id`, `version`, `status` (`draft`/`published`), `published_at` / `material`, `material_id`, `quantity`, `unit`, `budget_line_id` | Único `(item_id, version)`; una versión publicada no se modifica. Un solo borrador por mueble. |
| `client_handovers` | `project_id` (único), `date`, `by`, `notes` | Requiere todas las unidades terminadas. |
| `staff_hours` | `employee_id` (usuario), `project_id` nullable, `date`, `hours`, `task`, `hourly_cost` | Sin proyecto = trabajo interno. |
| `project_closures` | `project_id`, `date`, `by`, `pending_costs` (jsonb) | Complementa `closure_snapshots`. |
| `rubro_catalog` | `id`, `name`, `active` | Texto libre; reemplaza `ManagementParams.workRubros`. |
| `rate_records` | `scope` (`rubro`/`employee`), `subject_id`, `hourly_rate`, `valid_from` | La excepción de la persona prevalece. |
| `clients` (existe) / `suppliers` | contacto, teléfono, correo, dirección, notas, `active` | `suppliers` es nueva. |
| `general_costs` | `name`, `monthly_amount` | Informativo. |
| `material_deliveries` (existe) | + acumulados `consumed`, `waste`, `leftover` | Hoy el cierre del día cierra la entrega entera; la demo deja abierto lo que sigue en producción. |
| `cost_settings` | + `financial_monthly_rate_pct` | Hoy `financial_pct` es % del precio; la demo lo usa como tasa mensual. |

### 7.3 Permisos (RLS esperada)

| Registro | Escribe | Lee |
| --- | --- | --- |
| Facturas, cobros, pagos a proveedores, cierre, tasa financiera, rubros, tarifas, costos generales | Gerencia | Gerencia (pagos: estado visible para Compras, sin importes de venta) |
| Contrato vigente, condiciones de pago, BOM, clientes | Administración (y Gerencia) | Gerencia, Administración; BOM publicado también Compras y Jefe (sin costos) |
| Proveedores | Administración, Compras | Todos menos Operario |
| Entrega al cliente, material en producción, corrección de horas | Jefe de planta | Gerencia, Administración |
| Horas propias | La propia persona (Administración, Compras, Jefe) | Gerencia; la persona, las suyas |

### 7.4 Acciones y eventos

Una RPC por acción, que valide lo mismo que las funciones puras y deje un `activity_events`:
`register_sales_invoice`, `register_collection`, `apply_advance`, `confirm_supplier_payment`, `revise_contract`,
`set_payment_terms`, `start_bom_draft`, `save_bom_draft`, `publish_bom`, `confirm_handover`, `close_day` (con
arrastre), `log_staff_hours`, `close_project` (con `pending_costs`), `set_financial_rate`, `upsert_client`,
`upsert_supplier`, `add_rate`, `add_rubro`. Las validaciones de referencia están en `lib/ledger.ts`, `lib/tablero.ts`
(`closeCheck`) y `lib/plant-materials.ts`, con sus pruebas.

### 7.5 De la demo a la base

1. Crear las tablas y RPC de 7.2–7.4.
2. Un adaptador lee la base y arma el mismo `Ledger` (`normalizeLedger`), así las pantallas no cambian.
3. En `store/use-app-store.ts`, `recordLedger` hoy rechaza fuera de la demo: con la base lista, en vez de rechazar
   llama a la RPC de cada acción (el `fn` puro sigue validando en el cliente).
4. `reset_workspace` siembra el mismo escenario de `lib/demo/escenario.ts`.
5. Pendientes de sincronización: que el cierre del día acepte arrastre (hoy la base cierra la entrega entera) y que
   las necesidades de Compras salgan del BOM publicado también en `compras_workspace`.

## 8. Registros de la empresa en la base (migración `20261028120000`) — estado

Lo de la sección 7.2–7.5 ya está construido y aplicado. Todo se guarda por empresa (`organization_id`) y se lee con el
rol de cada sesión.

- **Lectura:** `public.ledger_workspace()` devuelve el `Ledger` solo con lo que el rol puede ver.
- **Escritura:** `public.ledger_commit(p)` (única vía; las tablas no tienen políticas de escritura). Valida permiso por
  colección y los disparadores hacen cumplir las reglas del negocio (factura única, cobro ≤ saldo, BOM publicado
  inmutable, entrega con unidades terminadas, etc.). Estampa autor y hora en el servidor.
- **Carga masiva:** `public.ledger_reset(p)` (solo Administrativo), usada al cargar la demo de la empresa o empezar de cero.
- **Frontend:** `lib/supabase/ledger.ts` (`ledgerDelta`, `loadLedger`, `commitLedger`, `resetLedger`); el store marca
  `ledgerReady` cuando la base tiene la migración (si no, sigue "Pendiente de backend").
- **Pruebas:** `tests/db/ledger.test.ts` (35, por rol y entre empresas) y `tests/ledger-sync.test.ts`. En vivo se
  probó con transacciones que se deshacen: Gerencia, Jefe de planta, Operario y anónimo, y el rechazo de proyectos de otra empresa.

### Qué ve y qué escribe cada rol (hoy)

| Rol en la base | Ve | Escribe |
| --- | --- | --- |
| Administrativo (Gerencia) | Todo | Todo |
| Administración (`comercial`) | Contrato, condiciones de pago, BOM, clientes y proveedores; **no** facturas, cobros, costos generales ni tarifas por persona | Condiciones de pago, contrato, clientes, proveedores, BOM, sus horas; **no** facturas, cobros ni entregas |
| Compras | Pagos a proveedores, BOM publicado (cantidades), proveedores, cierres, sus horas | Proveedores, sus horas |
| Jefe de planta | BOM publicado (cantidades), entregas al cliente, cierres, sus horas | Entrega al cliente, sus horas |
| Operario | Solo el catálogo de rubros | Nada de esto |

### Pendiente

1. Probar el rol Administración con una cuenta real (invitar a alguien como Administración desde Configuración → Usuarios) cuando se despliegue el frontend.
2. `20261024120000_planta_entregas_y_cierre.sql` y `20261023120001_operario_sin_material_usado.sql` (esta última, recién
   después de desplegar el frontend nuevo).
3. El estado de materiales del Jefe sigue calculado desde el presupuesto, no desde el BOM publicado.
4. `planta_close_day` no arrastra material (el arrastre sigue solo en la demo local).
5. Los cierres de la demo no traen `pending_costs`; las excepciones de tarifa por persona no tienen pantalla.
6. Las necesidades de Compras salen del BOM publicado: un proyecto real sin BOM no muestra necesidades.
7. Mails de invitación: falta `SUPABASE_SERVICE_ROLE_KEY` en Production, redeploy y SMTP propio.
