-- Blerp — admin_record_closure tolerante a payloads parciales.
-- jsonb_populate_record deja en NULL las claves que faltan (no usa el DEFAULT de la columna), así que un cierre
-- sin hours_by_rubro / materials / items / schema_version fallaba con un error de NOT NULL poco claro.
-- Ahora esos campos toman su valor vacío por defecto. No cambia nada más de la función.
BEGIN;

create or replace function public.admin_record_closure(p jsonb) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare
  org uuid := private.my_admin_org();
  proj public.projects;
  org_demo boolean;
  origin text;
  n integer;
begin
  select * into proj from public.projects where organization_id = org and id = p ->> 'project_id';
  if not found then raise exception 'Proyecto no encontrado.'; end if;
  if not proj.is_closed then raise exception 'El proyecto todavía no está cerrado.'; end if;
  select o.is_demo into org_demo from public.organizations o where o.id = org;
  origin := case when org_demo then 'demo' when p ->> 'data_origin' = 'imported' then 'imported' else 'app' end;

  insert into public.project_closures
  select (jsonb_populate_record(null::public.project_closures,
    (p - 'organization_id' - 'recorded_by' - 'recorded_at') || jsonb_build_object(
      'organization_id', org,
      'project_id', proj.id,
      'data_origin', origin,
      'recorded_by', auth.uid(),
      'recorded_at', now(),
      'closed_at', proj.closed_at,
      'client_id', proj.client_id,
      'project_code', proj.code,
      'project_name', proj.name,
      'project_type', proj.project_type,
      'start_date', proj.start_date,
      'due_date', proj.due_date,
      'sales_price', proj.sales_price,
      -- Campos con valor vacío por defecto (aunque falten o vengan en null).
      'schema_version', coalesce(nullif(p ->> 'schema_version', '')::integer, 1),
      'hours_by_rubro', case when jsonb_typeof(p -> 'hours_by_rubro') = 'object' then p -> 'hours_by_rubro' else '{}'::jsonb end,
      'materials', case when jsonb_typeof(p -> 'materials') = 'array' then p -> 'materials' else '[]'::jsonb end,
      'items', case when jsonb_typeof(p -> 'items') = 'array' then p -> 'items' else '[]'::jsonb end
    ))).*
  on conflict (organization_id, project_id) do nothing;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;
revoke all on function public.admin_record_closure(jsonb) from public, anon;
grant execute on function public.admin_record_closure(jsonb) to authenticated;

COMMIT;
