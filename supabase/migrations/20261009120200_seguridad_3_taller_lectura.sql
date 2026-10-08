-- Blerp — Lote 2 (3/4): Taller lee sin plata (taller_workspace) y helpers.

-- ── 4. Taller: lectura y escritura sin plata ───────────────

/** Valida que el operario activo pueda trabajar en el proyecto y lo devuelve. */
create or replace function private.taller_project(org uuid, project text)
returns public.projects
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.projects;
begin
  select * into p from public.projects where organization_id = org and id = project;
  if not found then
    raise exception 'Proyecto no encontrado.' using errcode = 'no_data_found';
  end if;
  if not private.operator_on_project(org, project) then
    raise exception 'No estás asignado a este proyecto o todavía no está en una etapa de Taller.' using errcode = 'insufficient_privilege';
  end if;
  return p;
end;
$$;

/** Siguiente posición para una tabla hija del proyecto. */
create or replace function private.next_position(tbl text, org uuid, project text)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  execute format('select coalesce(max(position) + 1, 0) from public.%I where organization_id = $1 and project_id = $2', tbl)
    into n using org, project;
  return n;
end;
$$;

create or replace function private.safe_id(v text, prefix text)
returns text
language sql
volatile
set search_path = ''
as $$
  select case
    when v ~ '^[A-Za-z0-9_-]{3,64}$' then v
    else prefix || '_' || replace(gen_random_uuid()::text, '-', '')
  end;
$$;

/**
 * Lo que Taller necesita para trabajar, sin plata: sus proyectos asignados en Compras/Producción/Instalación,
 * sus muebles, bitácora y archivos, sus propias horas (sin costo), el material asignado (sin costo unitario)
 * y sus pedidos. Si el operario fue dado de baja devuelve { status: "inactive" } y nada más.
 */
create or replace function public.taller_workspace()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me record;
  pids text[];
  lot_ids text[];
  org_name text;
begin
  select * into me from private.taller_me();
  if me.operator_id is null then
    if exists (select 1 from public.organization_members m where m.user_id = (select auth.uid()) and m.role = 'operator') then
      return jsonb_build_object('status', 'inactive');
    end if;
    raise exception 'Tu usuario no es operario de ninguna empresa.' using errcode = 'insufficient_privilege';
  end if;

  select o.name into org_name from public.organizations o where o.id = me.organization_id;
  select coalesce(array_agg(p.id), '{}') into pids
  from public.projects p
  where p.organization_id = me.organization_id
    and not p.is_closed
    and p.status in ('purchasing', 'production', 'installation')
    and me.operator_id = any (p.assigned_operator_ids);

  select coalesce(array_agg(distinct m.lot_id), '{}') into lot_ids
  from public.stock_movements m
  where m.organization_id = me.organization_id
    and ((m.from_place ->> 'projectId') = any (pids) or (m.to_place ->> 'projectId') = any (pids));

  return jsonb_build_object(
    'status', 'active',
    'organization_id', me.organization_id,
    'organization_name', org_name,
    'operator', jsonb_build_object(
      'id', me.operator_id, 'name', me.operator_name, 'role', me.operator_role, 'hourly_cost', 0,
      'active', true, 'user_id', (select auth.uid()), 'email', me.operator_email, 'created_at', me.created_at, 'position', 0
    ),
    'projects', coalesce((
      select jsonb_agg(
        (to_jsonb(p) - 'sales_price' - 'baseline' - 'progress_percent')
        || jsonb_build_object('sales_price', 0, 'baseline', null, 'progress_percent', 0)
        order by p.created_at desc)
      from public.projects p where p.organization_id = me.organization_id and p.id = any (pids)), '[]'::jsonb),
    'project_items', coalesce((
      select jsonb_agg(to_jsonb(i) order by i.position)
      from public.project_items i where i.organization_id = me.organization_id and i.project_id = any (pids)), '[]'::jsonb),
    'stage_logs', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.position)
      from public.stage_logs s where s.organization_id = me.organization_id and s.project_id = any (pids)), '[]'::jsonb),
    'attachments', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.position)
      from public.attachments a where a.organization_id = me.organization_id and a.project_id = any (pids)), '[]'::jsonb),
    'actual_entries', coalesce((
      select jsonb_agg(
        to_jsonb(a) || jsonb_build_object('amount', 0, 'labor', coalesce(a.labor, '{}'::jsonb) || jsonb_build_object('hourlyCost', 0))
        order by a.position)
      from public.actual_entries a
      where a.organization_id = me.organization_id and a.project_id = any (pids)
        and a.type = 'labor' and a.operator_id = me.operator_id), '[]'::jsonb),
    'stock_lots', coalesce((
      select jsonb_agg((to_jsonb(l) - 'supplier') || jsonb_build_object('unit_cost', 0) order by l.created_at, l.id)
      from public.stock_lots l where l.organization_id = me.organization_id and l.id = any (lot_ids)), '[]'::jsonb),
    'stock_movements', coalesce((
      select jsonb_agg(to_jsonb(m) order by m.position)
      from public.stock_movements m
      where m.organization_id = me.organization_id
        and ((m.from_place ->> 'projectId') = any (pids) or (m.to_place ->> 'projectId') = any (pids))), '[]'::jsonb),
    'material_requests', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at desc)
      from public.material_requests r
      where r.organization_id = me.organization_id and r.project_id = any (pids) and r.requested_by = me.operator_name), '[]'::jsonb)
  );
end;
$$;

revoke all on function private.taller_project(uuid, text) from public;
revoke all on function private.next_position(text, uuid, text) from public;
revoke all on function private.safe_id(text, text) from public;
revoke all on function public.taller_workspace() from public, anon;
grant execute on function public.taller_workspace() to authenticated;
