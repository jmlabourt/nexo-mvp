-- ─────────────────────────────────────────────────────────────
-- Blerp — Lote 2: seguridad por rol.
--
--   1. RLS por rol: Gestión (owner/member) lee y escribe todo lo de su empresa.
--      El operario de Taller NO tiene acceso directo a ninguna tabla con plata:
--      lee y escribe solo a través de funciones (taller_*) que devuelven lo que
--      necesita (sus proyectos asignados, sus horas, sus pedidos) sin costos,
--      precios ni márgenes, y que calculan los costos del lado del servidor.
--   2. La baja corta el acceso: un operario con active = false o deactivated_at
--      no pasa ninguna política ni función.
--   3. Reglas de negocio críticas también en la base (triggers): etapas de a una,
--      línea base congelada, costo presupuestado bloqueado en ejecución, registros
--      que no se editan, tope de 24 h por día, sin fechas futuras, no borrar un
--      operario con horas, el libro de stock solo crece.
--   4. reset_workspace: reset de la demo / vaciar datos en una sola transacción
--      del servidor, solo para Gestión. Los triggers de reglas no aplican ahí ni
--      en una empresa recién creada que todavía no cargó su demo (primer ingreso).
--
-- Migración ADITIVA en datos: no borra ni modifica filas existentes.
-- ─────────────────────────────────────────────────────────────

-- ── Helpers de identidad ───────────────────────────────────

/** Fecha de hoy en Argentina (las fechas de los registros son locales). */
create or replace function private.today_ar()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Argentina/Buenos_Aires')::date;
$$;

/** true mientras corre reset_workspace (carga masiva): los triggers de reglas no aplican. */
create or replace function private.bulk_loading()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(current_setting('blerp.bulk', true), '') = 'on';
$$;

/** Operario ACTIVO vinculado al usuario actual: empresa, id y nombre. Vacío si no hay (o está de baja). */
create or replace function private.taller_me()
returns table (organization_id uuid, operator_id text, operator_name text, operator_role text, operator_email text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select o.organization_id, o.id, o.name, o.role, o.email, o.created_at
  from public.organization_members m
  join public.operators o on o.organization_id = m.organization_id and o.user_id = m.user_id
  where m.user_id = (select auth.uid())
    and m.role = 'operator'
    and o.active
    and o.deactivated_at is null
  order by o.created_at
  limit 1;
$$;

/** Id del operario activo del usuario en esa empresa (null si no es operario activo). */
create or replace function private.active_operator_id(org uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select me.operator_id from private.taller_me() me where me.organization_id = org;
$$;

/** Miembro con acceso vigente: Gestión, u operario activo (la baja corta el acceso). */
create or replace function private.is_active_member(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_org_manager(org) or private.active_operator_id(org) is not null;
$$;

/** Compatibilidad: is_org_member ahora respeta la baja de operarios. */
create or replace function private.is_org_member(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_member(org);
$$;

/** ¿El usuario es operario activo asignado a ese proyecto, en una etapa de Taller? */
create or replace function private.operator_on_project(org uuid, project text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.projects p
    where p.organization_id = org
      and p.id = project
      and not p.is_closed
      and p.status in ('purchasing', 'production', 'installation')
      and private.active_operator_id(org) = any (p.assigned_operator_ids)
  );
$$;

create or replace function private.stage_rank(s text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select array_position(array['quotation', 'approved', 'purchasing', 'production', 'installation', 'completed'], s);
$$;

/** 10.50 → "10,5" (formato es-AR para los mensajes de Actividad). */
create or replace function private.fmt_num(n numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select replace(regexp_replace(round(n, 2)::text, '\.?0+$', ''), '.', ',');
$$;

/**
 * Las reglas de negocio no aplican durante una carga masiva (reset_workspace) ni mientras una empresa
 * recién creada todavía no tiene su demo cargada (primer ingreso).
 */
create or replace function private.rules_off(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.bulk_loading()
      or coalesce((select not o.demo_seeded from public.organizations o where o.id = org), false);
$$;

revoke all on function private.today_ar() from public;
revoke all on function private.bulk_loading() from public;
revoke all on function private.rules_off(uuid) from public;
revoke all on function private.taller_me() from public;
revoke all on function private.active_operator_id(uuid) from public;
revoke all on function private.is_active_member(uuid) from public;
revoke all on function private.operator_on_project(uuid, text) from public;
grant execute on function private.today_ar() to authenticated;
grant execute on function private.bulk_loading() to authenticated;
grant execute on function private.rules_off(uuid) to authenticated;
grant execute on function private.taller_me() to authenticated;
grant execute on function private.active_operator_id(uuid) to authenticated;
grant execute on function private.is_active_member(uuid) to authenticated;
grant execute on function private.operator_on_project(uuid, text) to authenticated;
grant execute on function private.stage_rank(text) to authenticated;
grant execute on function private.fmt_num(numeric) to authenticated;

-- ── 1. Políticas por rol ───────────────────────────────────

-- Se modifican las políticas existentes (alter policy) en lugar de borrarlas y crearlas de nuevo.

-- Empresa: la leen los miembros con acceso vigente; solo Gestión la modifica (umbrales, demo).
alter policy "members read their organization" on public.organizations
  rename to "active members read their organization";
alter policy "active members read their organization" on public.organizations
  using ((select private.is_active_member(id)));
alter policy "members update their organization" on public.organizations
  rename to "managers update their organization";
alter policy "managers update their organization" on public.organizations
  using ((select private.is_org_manager(id)))
  with check ((select private.is_org_manager(id)));

-- Membresías: cada uno ve la suya; Gestión ve las de su empresa.
alter policy "members read memberships of their organization" on public.organization_members
  rename to "read own membership or as manager";
alter policy "read own membership or as manager" on public.organization_members
  using (user_id = (select auth.uid()) or (select private.is_org_manager(organization_id)));

-- Operarios: solo Gestión (tienen el costo por hora). Taller recibe solo su propio nombre por taller_workspace().
alter policy "members read operators" on public.operators rename to "managers read operators";
alter policy "managers read operators" on public.operators
  using ((select private.is_org_manager(organization_id)));

-- Todas las tablas del proyecto y del stock: solo Gestión, directo. Taller pasa por las funciones taller_*.
do $$
declare
  t text;
begin
  foreach t in array array[
    'projects', 'budget_lines', 'purchase_entries', 'material_usages', 'actual_entries', 'activity_events',
    'reusable_materials', 'resolved_alerts', 'stock_lots', 'stock_movements', 'material_requests',
    'project_items', 'stage_logs', 'attachments'
  ]
  loop
    execute format('alter policy "members manage %1$s" on public.%1$I rename to "managers manage %1$s"', t);
    execute format(
      'alter policy "managers manage %1$s" on public.%1$I
         using ((select private.is_org_manager(organization_id)))
         with check ((select private.is_org_manager(organization_id)))',
      t
    );
  end loop;
end;
$$;

-- Archivos (Storage): sus políticas no se pueden modificar desde una migración (la tabla es de Supabase).
-- Siguen usando private.is_org_member, que ahora respeta la baja: un operario dado de baja no ve ni sube
-- archivos. Un operario activo ve los archivos de toda su empresa (no solo de sus proyectos): para
-- restringirlo a sus proyectos hay que editar las dos políticas desde el panel de Storage de Supabase
-- (ver docs/SEGURIDAD.md).

-- Alta de usuarios: un operario dado de baja no queda vinculado si se registra con su email.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_org uuid;
  invited public.operators%rowtype;
  display text := coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''),
    split_part(coalesce(new.email, ''), '@', 1)
  );
begin
  select * into invited
  from public.operators o
  where o.user_id is null and o.active and o.deactivated_at is null
    and new.email is not null and lower(o.email) = lower(new.email)
  order by o.created_at
  limit 1;

  if found then
    insert into public.organization_members (organization_id, user_id, role, display_name)
    values (invited.organization_id, new.id, 'operator', invited.name);
    update public.operators set user_id = new.id
    where organization_id = invited.organization_id and id = invited.id;
    return new;
  end if;

  insert into public.organizations (name) values ('Empresa de ' || display) returning id into new_org;
  insert into public.organization_members (organization_id, user_id, role, display_name)
  values (new_org, new.id, 'owner', display);
  return new;
end;
$$;
