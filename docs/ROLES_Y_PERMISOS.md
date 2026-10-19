# Roles y permisos (Lote 5A)

Blerp pasó de dos experiencias (Gestión y Taller) a **cuatro roles**. El Lote 5A es la base: permisos, usuarios y precios con vigencia. Las pantallas de cada rol: `docs/PLANTA_Y_HORAS.md` (5B, Jefe de planta y Operario) y `docs/COMPRAS.md` (5C, Compras).

## Los cuatro roles

| Rol | Valor en la base (`organization_members.role`) | Antes se llamaba |
|---|---|---|
| **Administrativo** | `owner` (quien creó la empresa) o `member` | Gestión |
| **Compras** | `compras` | — (nuevo) |
| **Jefe de planta** | `jefe_planta` | — (nuevo) |
| **Operario** | `operator` | Taller |

**Decisión:** se mantienen los valores internos `owner` y `member` para Administrativo. Todas las políticas del Lote 2 los usan (`private.is_org_manager`): renombrarlos obligaba a recrear políticas con DROP. En pantalla siempre dice "Administrativo". Un usuario Administrativo nuevo se guarda como `member`; `owner` queda solo para quien creó la empresa.

## Qué ve y qué hace cada rol

| Dato o acción | Administrativo | Compras | Jefe de planta | Operario |
|---|---|---|---|---|
| Precio de venta | Sí | **No** | **No** | **No** |
| Rentabilidad (esperada, proyectada, real) | Sí | **No** | **No** | **No** |
| Valor de la mano de obra (líneas de horas, tarifas) | Sí | **No** | **No** | **No** |
| Costo por hora de cada operario | Sí | **No** | **No** | **No** |
| Costo de materiales presupuestado (lista de materiales) | Sí | Sí | **No** | **No** |
| Precios de compra, compras, stock con costo | Sí | Sí | **No** | **No** |
| Órdenes de compra (crear, enviar, facturar, recibir) | Sí | Sí (`compras_order_save` / `compras_order_status`) | **No** | **No** |
| Mover stock (ingresar, asignar, devolver) | Sí | **No** (solo consulta) | **No** | **No** |
| Proyectos (código, nombre, cliente, etapa, fechas) | Sí | Sí | Sí | Solo los suyos, en ejecución |
| Operarios y asignaciones | Sí | **No** | Sí (sin costo) | Solo su nombre |
| Horas cargadas | Sí (con valor) | **No** | Sí (sin valor) | Solo las suyas (sin valor) |
| Cargar horas y consumos | Sí (crea la asignación) | — | Asigna y carga unidades terminadas | Sus horas, solo contra sus asignaciones |
| Usuarios y Configuración | Sí | **No** | **No** | **No** |
| Corregir valores congelados | Sí | **No** | **No** | **No** |

**Menú de cada rol** (el mismo mapa arma el menú y los guards de ruta; desde el Lote 5B no hay ítems "Próximamente": lo que no está hecho no se muestra):

- **Administrativo:** Dashboard, Proyectos, Alertas, Horas, Cotizador, Stock, Operarios, Configuración (con la pestaña Usuarios). Historial se sacó en el Lote 6.
- **Compras:** Dashboard, Necesidades, Órdenes de compra, Alertas, Cotizador y Stock (solo consulta). Ver `docs/COMPRAS.md`.
- **Jefe de planta:** Resumen, Proyectos, Operarios, Asignaciones, Alertas (ver `docs/PLANTA_Y_HORAS.md`).
- **Operario:** Mi día (solo lo asignado para hoy: proyecto, producto, rubro, horas estimadas y un campo de horas). Ver `docs/PRODUCCION.md`.

## Cómo se hace cumplir

### En la base (lo que vale de verdad)

- **Las tablas con importes** son solo de Administrativo: `projects`, `budget_lines`, `purchase_entries`, `material_usages`, `actual_entries`, `operators`, `stock_lots`, `hour_rates`, `cost_settings`, `price_history`, `value_corrections` y el resto de las tablas del proyecto. Sus políticas usan `private.is_org_manager()`, que ahora además exige la cuenta activa.
- **Compras y Jefe de planta** no tienen ninguna política sobre esas tablas: leen solo con funciones `security definer`, igual que `taller_workspace()`. Esas funciones devuelven únicamente las columnas permitidas:
  - **`compras_workspace()`:**
    - trae los proyectos **sin** `sales_price`, `baseline` ni `progress_percent`;
    - trae solo las líneas de **materiales** del costo presupuestado;
    - trae compras, consumos, stock, pedidos y precios de materiales.
  - **`planta_workspace()`:**
    - trae los proyectos sin importes;
    - trae los operarios **sin** `hourly_cost`;
    - trae las horas **sin** `amount` ni `hourlyCost`;
    - trae muebles, bitácora y pedidos.
- **Compras escribe** solo con las órdenes de compra (`compras_order_save`, `compras_order_status`, Lote 6): la factura crea el costo real y la recepción el stock. `compras_save()` ya solo resuelve pedidos del taller: **el stock es solo consulta para Compras** (en la base). Nunca toca venta, mano de obra ni rentabilidad.
- **El Operario** sigue con `taller_workspace()` y las funciones `taller_*` (Lote 2).
- **Llamando a la API directamente** pasa lo mismo: un `select` a una tabla con importes devuelve 0 filas, y las funciones de otro rol dan error.
- **Baja de una cuenta:** `organization_members.deactivated_at`.
  - Una cuenta dada de baja no pasa ninguna política ni función.
  - En un Operario también se puede dar de baja la persona (`operators`), como antes.
- **Otra empresa:** no ve nada (todas las funciones filtran por la empresa del usuario).

### En la app (el mismo criterio, aplicado a la pantalla)

- **`lib/permissions.ts`:** es el único mapa rol → menú, rutas, datos y acciones, con funciones puras.
  - `navFor`, `canAccess` y `homeFor` arman el menú lateral y el guard de cada pantalla.
  - Si un rol entra a una ruta que no le corresponde, ve "No tenés acceso a esta sección". Desde el Dashboard se lo lleva a su inicio.
- **`lib/role-views.ts`:** las vistas de Compras y Jefe de planta solo arman los campos permitidos. Esto importa en la demo, donde un Administrativo mira la app "como" otro rol con todos los datos en memoria.

## Usuarios (Configuración → Usuarios, solo Administrativo)

- **Usuario ≠ persona.**
  - Un **usuario** es una cuenta para entrar a Blerp (`organization_members`), con su rol.
  - Una **persona** de Operarios (`operators`) es el operario con su costo por hora. Puede existir **sin usuario**.
  - Para que un operario entre, se lo invita como Operario y se elige qué persona es.
- **Crear:** nombre, rol y mail de invitación (validado con Zod).
  1. La invitación la registra la base con la sesión de quien invita (`admin_invite_member`, que exige un Administrativo activo).
  2. El mail lo manda Supabase Auth desde el servidor (`app/(gestion)/settings/actions.ts`) con la service role.
  3. La clave está en `SUPABASE_SERVICE_ROLE_KEY`, sin `NEXT_PUBLIC_`, así que nunca llega al navegador. El módulo `lib/supabase/service.ts` es `server-only`.
  4. Si la persona entra con Google usando ese mail, también queda en la empresa con su rol, aunque el mail no se haya mandado.
- **Cambiar rol:**
  - Pasar a Operario pide elegir la persona de Operarios.
  - Pasar de Operario a otro rol desvincula la persona.
- **Dar de baja y reactivar:**
  - En un Operario se usa el mismo flujo de Operarios: hay que darle destino a sus proyectos (reasignación).
  - La cuenta dada de baja pierde el acceso.
- **Reglas** (en la base, con el trigger `guard_members`, y en pantalla, con `lib/users.ts`):
  - nadie se cambia el rol ni se da de baja a sí mismo;
  - siempre queda al menos un Administrativo activo.
- **Operarios sin mail:** queda como **pregunta abierta para el cliente**. El modelo está preparado para un acceso con PIN (`operators.pin_hash`, sin uso todavía).

### Configuración para que salga el mail de invitación (una sola vez)

1. **Vercel → Settings → Environment Variables:** agregar `SUPABASE_SERVICE_ROLE_KEY`.
   - El valor está en Supabase → Project Settings → API Keys → service_role / secret.
   - Marcala como Sensitive y volvé a deployar.
   - Sin la clave, la invitación igual se guarda: la persona entra con Google usando ese mail.
2. **Supabase → Authentication → URL Configuration:** en Redirect URLs agregar `https://*-blerp1.vercel.app/auth/confirm` y la URL de producción + `/auth/confirm`.
3. **(Recomendado) Supabase → Authentication → Emails → Invite user:** cambiar el link por:
   ```
   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/dashboard
   ```
   Así la persona entra directo al tocar el link. Con la plantilla de siempre, el link confirma la invitación y la manda al login para que entre con Google con ese mail.

## Demo

- El selector de la demo tiene cuatro botones: Administrativo, Compras, Jefe de planta y Operario.
- Cada rol tiene su usuario de ejemplo:
  - Laura Gómez (Administrativa);
  - Martín Ruiz (Compras);
  - María Ruiz (Jefa de planta);
  - el Operario que elijas entre los operarios cargados.
- **Solo aparece en una empresa demo** (`organizations.is_demo`) y para un Administrativo. En una empresa real el selector no existe y no cambia nada.
- En la demo se muestran los datos de ejemplo y se puede trabajar como cada rol (asignar como Jefe de planta, comprar como Compras); lo que se carga queda a nombre del usuario de ejemplo.

## Cotizador de Compras (interpretación, Lote 5C)

El pedido fue "Cotizador de materiales: variante para Compras que solo trabaja con materiales y su costo". Se interpretó así:

- **No es el Cotizador del Administrativo con partes ocultas.** El Cotizador completo calcula mano de obra, precio sugerido y rentabilidad, y Compras no puede ver nada de eso. Por eso Compras **no entra** a `/quotes`.
- **Es una pantalla propia** (`/compras/cotizador`) que reutiliza las mismas filas de materiales del Cotizador (`components/budget/material-rows.tsx`): descripción con el catálogo, cantidad, unidad, costo unitario y desperdicio.
- **Resultado:** solo el **costo de materiales** (cantidad con desperdicio × costo unitario). Al lado de cada material muestra el proveedor más barato la última vez (del historial de compras), para comparar.
- **No guarda** la cotización ni crea proyectos: crear un proyecto sigue siendo del Administrativo. Si el cliente quiere que Compras le pase esta cotización al Administrativo, queda para un lote posterior.

## Archivos

- `supabase/migrations/20261018120000_lote5c_compras.sql`: estados de línea, `compras_save` y `compras_workspace` con estados (Lote 5C).
- `supabase/migrations/20261021120000_lote6_dias_laborales.sql`: días laborales y excepciones por operario; los edita el Jefe de planta (o Administrativo) con `planta_save_schedule` (Lote 6).
- `supabase/migrations/20261020120000_lote6_ordenes_de_compra.sql`: órdenes de compra, stock solo consulta para Compras y estado de materiales (Lote 6).
- `supabase/migrations/20261016120000_lote5a_roles_usuarios_vigencia.sql`: roles, funciones de lectura, usuarios, precios con vigencia y valores congelados. Sin DROP ni DELETE.
- `supabase/manual/20261016120100_lote5a_manual.sql`: **se corre a mano** porque tiene DROP y DELETE. Hace dos cosas:
  - amplía la regla de la columna `role` para aceptar `compras` y `jefe_planta`;
  - hace que `reset_workspace` rechace a un Administrativo dado de baja.
- `lib/permissions.ts`, `lib/users.ts`, `lib/role-views.ts`, `lib/supabase/users.ts`, `lib/supabase/service.ts`.
- Tests:
  - `tests/lote5a-permisos.test.ts`: cada rol ve exactamente su menú;
  - `tests/lote5a-usuarios.test.ts`;
  - `tests/lote5a-vistas.test.ts`;
  - `tests/lote5a-pantallas.test.tsx`;
  - `tests/db/lote5a.test.ts`: políticas en Postgres real.

## Ingreso e invitaciones (oct 2026)

- **Administrativo**: crea la empresa entrando con Google (la primera vez).
- **Invitar**: Configuración → Usuarios → Nuevo usuario (nombre, rol y mail). Sale la invitación de Supabase por mail (requiere `SUPABASE_SERVICE_ROLE_KEY` en Vercel).
- **Cargar un listado** (Configuración → Usuarios → "Cargar un listado de usuarios"): se pega desde Excel o se sube un CSV con `nombre, mail, rol` (una persona por línea; separador coma, punto y coma o tab; encabezado opcional). Hay una vista previa con los errores por línea (mail inválido, rol desconocido, mail repetido o ya invitado) y solo se invitan las filas sin error. Roles aceptados: Administrativo, Compras, Jefe de planta, Operario (también "planta", "taller", etc.). Un Operario se vincula por nombre a una persona ya cargada en Operarios que no tenga usuario.
- **Link por rol**: cada invitación tiene un link `…/login?next=<pantalla del rol>&email=<mail>` que abre el login con el mail ya puesto y, al entrar, lleva a la pantalla de su rol: Administrativo `/dashboard`, Compras `/compras`, Jefe de planta `/planta`, Operario `/taller`. Se copia desde la lista de invitaciones pendientes o desde el resultado de la carga masiva, para pasarlo por el canal que quieras. El mail de invitación también lleva a la misma pantalla.
- **Entrar** (pantalla de login): Google o **código por mail** (no hace falta cuenta de Google). Quien entra con un mail invitado queda en la empresa con el rol asignado y ve solo su vista. Un mail sin invitación crea su propia empresa, igual que Google.
- **Alta de un Operario**: se escribe el nombre una sola vez. En "Operario" se elige *Persona nueva* (pide puesto y costo por hora, y se carga en Operarios al invitar, porque las horas se valorizan con ese costo) o una persona *ya cargada* en Operarios sin usuario (su nombre y mail salen de ahí). Si el nombre de la persona nueva ya existe sin usuario, avisa y pide elegirla de la lista (no se duplica). En el listado masivo, un Operario que coincide por nombre se vincula; si no existe se crea cuando la fila trae las columnas `Puesto` y `Costo por hora` (o las columnas 4 y 5). Si la invitación falla después de crear al operario, queda cargado en Operarios y se elige de la lista para reintentar.
- **Empresa nueva**: quien entra sin invitación crea su empresa con los datos de ejemplo de Madera Sur S.R.L. Mientras sea así, el Administrativo ve un aviso arriba de cada pantalla con el botón **Empezar con mis datos** (pide confirmar; borra proyectos, registros, stock y operarios de ejemplo y deja las alertas en sus valores iniciales; los usuarios invitados se conservan). Es la misma acción que Configuración → Datos → Vaciar, pero a la vista. Al terminar, el aviso desaparece.
- **Sesión**: dura 7 días desde la última vez que se usó la app (cookie de Supabase de 7 días, renovada al refrescar el token; `lib/supabase/session.ts`). Quien entra a diario no vuelve a loguearse; tras una semana sin entrar, sí. Cerrar sesión la termina antes. Es un límite de la app: en Supabase no hay un tope propio (el límite "time-box" del panel es de planes pagos).
- **Login por código**: el mail llega puesto cuando se entra desde el link de invitación ("No soy yo" lo cambia), se recuerda el último mail usado en el dispositivo, el código se puede reenviar (espera de 60 s) y solo acepta números. Quien ya tiene sesión y abre un link de invitación va directo a la pantalla de su rol.
- Queda todo en Supabase: `member_invitations`, `organization_members` y `auth.users`.
- **WhatsApp: descartado por ahora.** El envío de códigos por WhatsApp requiere pagar una API (Twilio/Meta). La base conserva la columna `phone` en las invitaciones (migración `20261023130000`), pero la app no la usa. Un celular sin invitación igual se rechaza si algún día se habilita el ingreso por teléfono.

### Configuración que falta en el panel de Supabase
- **Código por mail**: Authentication → Email Templates → plantilla "Magic Link" → incluir `{{ .Token }}` en el texto (ej. "Tu código es: {{ .Token }}"). Sin eso el mail trae un link en vez del código.
