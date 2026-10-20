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
| `20261023120000_operario_sin_material_usado.sql` | Escrita, **no aplicada** | Aplicar justo después de promover el deploy que la acompaña. |
| `20261024120000_planta_entregas_y_cierre.sql` | Escrita, **no aplicada** | Entrega de materiales y cierre del día del Jefe. |
| `pendiente_supabase.sql` (`reset_workspace`, `admin_commit_change`; no está en el repo) | Puede estar pendiente | Verificar en la base real. |

**Versión duplicada.** `20261023120000_historial_y_dataset_llm.sql` y `20261023120000_operario_sin_material_usado.sql`
tienen la misma versión. Supabase CLI registra las versiones en `schema_migrations` y puede rechazar la segunda o
saltearla. Hay que renombrar una de las dos (por ejemplo, `operario_sin_material_usado` → `20261023120001_…`) antes de
aplicarlas. Esta rama no la renombra porque no puede tocar `supabase/`.

## 2. Gerencia y Administración: separación solo visual

- Las dos sesiones usan el mismo rol de la base (`admin` / Administrativo). La separación es de pantallas
  (`lib/permissions.ts`: `SessionKey`, `sessionRole`, `canSee`, `can`).
- Hoy un usuario Administrativo puede leer por API lo mismo que Gerencia: márgenes, valor de la mano de obra y costo
  horario de cada operario.
- **Punto de partida:** `20261022121000_permiso_comercial.sql` ya agrega `organization_members.can_view_commercial`.
- **Pendiente:**
  - un rol en la base para Administración (por ejemplo `comercial`), distinto de Gerencia;
  - RLS que oculte `hourly_cost` de los operarios y los campos de margen, o vistas sin esas columnas;
  - mapear ese rol a la sesión `administracion` en `sessionRole` / `sessionsFor`.
- **Multirrol:** una persona que es Gerencia y Administración elige la sesión con el selector "Sesión" (radiogroup en
  el menú). No hay persistencia de la sesión elegida en la base: queda en `localStorage` (`nexo-ui-v2`).

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
