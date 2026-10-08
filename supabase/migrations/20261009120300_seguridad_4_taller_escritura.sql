-- Blerp — Lote 2 (4/4): Taller escribe por funciones que calculan los costos en el servidor.

/** Horas propias. El costo (horas × costo por hora vigente del operario) se calcula acá, nunca en el navegador. */
create or replace function public.taller_log_hours(p jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me record;
  proj public.projects;
  v_hours numeric := (p ->> 'hours')::numeric;
  v_date date := (p ->> 'date')::date;
  v_stage text;
  v_work text := coalesce(nullif(trim(p ->> 'work_type'), ''), 'Trabajo');
  v_rate numeric;
  v_day numeric;
  v_id text := private.safe_id(p ->> 'id', 'act');
begin
  select * into me from private.taller_me();
  if me.operator_id is null then
    raise exception 'Tu usuario no está habilitado para cargar en Taller (no está vinculado o fue dado de baja).'
      using errcode = 'insufficient_privilege';
  end if;
  proj := private.taller_project(me.organization_id, p ->> 'project_id');
  v_stage := coalesce(nullif(p ->> 'stage', ''), proj.status);

  if v_hours is null or v_hours <= 0 then
    raise exception 'Indicá las horas trabajadas.' using errcode = 'check_violation';
  end if;
  if v_date is null or v_date > private.today_ar() then
    raise exception 'No se pueden cargar horas de una fecha futura.' using errcode = 'check_violation';
  end if;
  if v_stage not in ('purchasing', 'production', 'installation') or private.stage_rank(v_stage) > private.stage_rank(proj.status) then
    raise exception 'Etapa inválida para cargar horas.' using errcode = 'check_violation';
  end if;
  if nullif(p ->> 'item_id', '') is not null and not exists (
    select 1 from public.project_items i where i.organization_id = me.organization_id and i.project_id = proj.id and i.id = p ->> 'item_id'
  ) then
    raise exception 'El mueble elegido no existe en este proyecto.' using errcode = 'check_violation';
  end if;
  select coalesce(sum((a.labor ->> 'hours')::numeric), 0) into v_day
  from public.actual_entries a
  where a.organization_id = me.organization_id and a.operator_id = me.operator_id and a.type = 'labor' and a.date = v_date;
  if v_day + v_hours > 16 and not coalesce((p ->> 'confirm_high')::boolean, false) then
    raise exception 'Ese día quedarían % h cargadas (más de 16). Confirmá para guardarlas.', private.fmt_num(v_day + v_hours)
      using errcode = 'check_violation';
  end if;

  select o.hourly_cost into v_rate from public.operators o where o.organization_id = me.organization_id and o.id = me.operator_id;

  insert into public.actual_entries (
    organization_id, id, project_id, position, date, type, category, description, amount,
    labor, operator_id, stage, item_id, notes, created_by, created_at
  ) values (
    me.organization_id, v_id, proj.id, private.next_position('actual_entries', me.organization_id, proj.id), v_date,
    'labor', 'labor', v_work || ' — ' || me.operator_name, round(v_hours * v_rate, 2),
    jsonb_build_object('role', v_work, 'workerName', me.operator_name, 'hours', v_hours, 'hourlyCost', v_rate),
    me.operator_id, v_stage, nullif(p ->> 'item_id', ''), nullif(trim(p ->> 'notes'), ''), me.operator_name, now()
  );
  insert into public.activity_events (organization_id, id, project_id, position, at, actor, kind, message)
  values (
    me.organization_id, private.safe_id(null, 'act'), proj.id, private.next_position('activity_events', me.organization_id, proj.id),
    now(), me.operator_name, 'cost',
    me.operator_name || ' registró ' || private.fmt_num(v_hours) || ' horas de ' || v_work || ' (' || me.operator_name || ').'
  );
  update public.projects set updated_at = now() where organization_id = me.organization_id and id = proj.id;
  return v_id;
end;
$$;

/**
 * Consumo, desperdicio y sobrante. El navegador propone los movimientos por lote; acá se valida que salgan
 * de lo asignado al proyecto, que no se use más de lo que hay, y el costo se toma del lote (D3).
 */
create or replace function public.taller_register_usage(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me record;
  proj public.projects;
  place jsonb;
  m jsonb;
  u jsonb;
  l jsonb;
  src record;
  parent public.stock_lots;
  lot public.stock_lots;
  new_lots text[];
  v_date date := (p ->> 'date')::date;
  v_kind text;
  v_qty numeric;
  v_held numeric;
  pos integer;
begin
  select * into me from private.taller_me();
  if me.operator_id is null then
    raise exception 'Tu usuario no está habilitado para cargar en Taller (no está vinculado o fue dado de baja).'
      using errcode = 'insufficient_privilege';
  end if;
  proj := private.taller_project(me.organization_id, p ->> 'project_id');
  place := jsonb_build_object('type', 'project', 'projectId', proj.id);
  if v_date is null or v_date > private.today_ar() then
    raise exception 'No se pueden registrar consumos con fecha futura.' using errcode = 'check_violation';
  end if;
  select coalesce(array_agg(x ->> 'id'), '{}') into new_lots from jsonb_array_elements(coalesce(p -> 'lots', '[]'::jsonb)) x;

  -- Movimientos: solo consumo, desperdicio y sobrante, desde lo asignado a ESTE proyecto.
  for m in select * from jsonb_array_elements(coalesce(p -> 'movements', '[]'::jsonb)) loop
    v_kind := m ->> 'kind';
    v_qty := (m ->> 'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Las cantidades deben ser mayores a cero.' using errcode = 'check_violation';
    end if;
    if coalesce(m ->> 'project_id', proj.id) <> proj.id then
      raise exception 'Movimiento de otro proyecto.' using errcode = 'check_violation';
    end if;
    if v_kind in ('consume', 'waste', 'to_leftover') then
      if (m -> 'from_place') is distinct from place or (m ->> 'lot_id') = any (new_lots)
        or not exists (select 1 from public.stock_lots s where s.organization_id = me.organization_id and s.id = m ->> 'lot_id') then
        raise exception 'Solo se puede usar material asignado a este proyecto.' using errcode = 'check_violation';
      end if;
      if v_kind = 'consume' and (m -> 'to_place') is distinct from jsonb_build_object('type', 'consumed', 'projectId', proj.id) then
        raise exception 'Destino de consumo inválido.' using errcode = 'check_violation';
      end if;
      if v_kind = 'waste' and (m -> 'to_place') is distinct from jsonb_build_object('type', 'waste', 'projectId', proj.id) then
        raise exception 'Destino de desperdicio inválido.' using errcode = 'check_violation';
      end if;
      if v_kind = 'to_leftover' and ((m -> 'to_place') is distinct from '{"type": "converted"}'::jsonb or not ((m ->> 'into_lot_id') = any (new_lots))) then
        raise exception 'Sobrante inválido.' using errcode = 'check_violation';
      end if;
    elsif v_kind = 'leftover_in' then
      if not ((m ->> 'lot_id') = any (new_lots))
        or (m -> 'from_place') is distinct from '{"type": "converted"}'::jsonb
        or (m -> 'to_place') is distinct from '{"type": "warehouse"}'::jsonb then
        raise exception 'El sobrante de Taller vuelve al depósito.' using errcode = 'check_violation';
      end if;
    else
      raise exception 'Taller no puede registrar movimientos de tipo %.', v_kind using errcode = 'check_violation';
    end if;
  end loop;

  -- No se puede sacar más de lo que el proyecto tiene asignado de cada lote.
  for src in
    select x ->> 'lot_id' as lot_id, sum((x ->> 'quantity')::numeric) as qty
    from jsonb_array_elements(coalesce(p -> 'movements', '[]'::jsonb)) x
    where x ->> 'kind' in ('consume', 'waste', 'to_leftover')
    group by 1
  loop
    select coalesce(sum(case when s.to_place = place then s.quantity else 0 end), 0)
         - coalesce(sum(case when s.from_place = place then s.quantity else 0 end), 0)
      into v_held
    from public.stock_movements s
    where s.organization_id = me.organization_id and s.lot_id = src.lot_id;
    if src.qty > v_held + 0.000001 then
      raise exception 'No alcanza el material asignado a este proyecto (hay %, se quieren usar %).', private.fmt_num(v_held), private.fmt_num(src.qty)
        using errcode = 'check_violation';
    end if;
  end loop;

  -- Lo registrado como uso coincide con los movimientos de consumo y desperdicio, lote por lote.
  if exists (
    with mv as (
      select x ->> 'lot_id' as lot_id,
             sum(case when x ->> 'kind' = 'consume' then (x ->> 'quantity')::numeric else 0 end) as consumed,
             sum(case when x ->> 'kind' = 'waste' then (x ->> 'quantity')::numeric else 0 end) as waste
      from jsonb_array_elements(coalesce(p -> 'movements', '[]'::jsonb)) x
      where x ->> 'kind' in ('consume', 'waste')
      group by 1
    ), us as (
      select x ->> 'lot_id' as lot_id,
             sum((x ->> 'quantity_consumed')::numeric) as consumed,
             sum((x ->> 'waste_quantity')::numeric) as waste
      from jsonb_array_elements(coalesce(p -> 'usages', '[]'::jsonb)) x
      group by 1
    )
    select 1 from mv full join us using (lot_id)
    where abs(coalesce(mv.consumed, 0) - coalesce(us.consumed, 0)) > 0.000001
       or abs(coalesce(mv.waste, 0) - coalesce(us.waste, 0)) > 0.000001
  ) then
    raise exception 'El registro de uso no coincide con los movimientos de material.' using errcode = 'check_violation';
  end if;

  -- Lotes nuevos: solo sobrantes, con el costo del lote del que salen.
  for l in select * from jsonb_array_elements(coalesce(p -> 'lots', '[]'::jsonb)) loop
    select * into parent from public.stock_lots s where s.organization_id = me.organization_id and s.id = l ->> 'parent_lot_id';
    if not found or not exists (
      select 1 from jsonb_array_elements(p -> 'movements') x
      where x ->> 'kind' = 'to_leftover' and x ->> 'lot_id' = parent.id and x ->> 'into_lot_id' = l ->> 'id'
    ) then
      raise exception 'Sobrante sin lote de origen.' using errcode = 'check_violation';
    end if;
    if (select coalesce(sum((x ->> 'quantity')::numeric), 0) from jsonb_array_elements(p -> 'movements') x
        where x ->> 'kind' = 'leftover_in' and x ->> 'lot_id' = l ->> 'id')
       <> (select coalesce(sum((x ->> 'quantity')::numeric), 0) from jsonb_array_elements(p -> 'movements') x
        where x ->> 'kind' = 'to_leftover' and x ->> 'into_lot_id' = l ->> 'id') then
      raise exception 'La cantidad del sobrante no coincide.' using errcode = 'check_violation';
    end if;
    insert into public.stock_lots (
      organization_id, id, material_id, material_name, unit, unit_cost, kind, supplier, origin_project_id,
      origin_project_name, parent_lot_id, location, dims, created_by, created_at
    ) values (
      me.organization_id, private.safe_id(l ->> 'id', 'lot'), parent.material_id, parent.material_name, parent.unit,
      parent.unit_cost, 'leftover', parent.supplier, proj.id,
      case when parent.origin_project_id = proj.id then parent.origin_project_name end,
      parent.id, nullif(trim(l ->> 'location'), ''), l -> 'dims', me.operator_name, now()
    );
  end loop;

  select coalesce(max(s.position) + 1, 0) into pos from public.stock_movements s where s.organization_id = me.organization_id;
  for m in select * from jsonb_array_elements(coalesce(p -> 'movements', '[]'::jsonb)) loop
    insert into public.stock_movements (
      organization_id, id, lot_id, position, kind, quantity, from_place, to_place, date, project_id, item_id,
      into_lot_id, group_id, note, created_by, created_at
    ) values (
      me.organization_id, private.safe_id(m ->> 'id', 'mov'), m ->> 'lot_id', pos, m ->> 'kind', (m ->> 'quantity')::numeric,
      m -> 'from_place', m -> 'to_place', v_date, proj.id, nullif(m ->> 'item_id', ''), nullif(m ->> 'into_lot_id', ''),
      nullif(m ->> 'group_id', ''), nullif(m ->> 'note', ''), me.operator_name, now()
    );
    pos := pos + 1;
  end loop;

  for u in select * from jsonb_array_elements(coalesce(p -> 'usages', '[]'::jsonb)) loop
    select * into lot from public.stock_lots s where s.organization_id = me.organization_id and s.id = u ->> 'lot_id';
    if not found or lot.material_id <> u ->> 'material_id' then
      raise exception 'El material registrado no coincide con el lote.' using errcode = 'check_violation';
    end if;
    insert into public.material_usages (
      organization_id, id, project_id, position, material_id, material_name, date, quantity_consumed, waste_quantity,
      reusable_leftover_quantity, unit, unit_cost, unit_cost_origin, source, lot_id, item_id, notes, created_by, created_at
    ) values (
      me.organization_id, private.safe_id(u ->> 'id', 'use'), proj.id,
      private.next_position('material_usages', me.organization_id, proj.id),
      lot.material_id, lot.material_name, v_date, (u ->> 'quantity_consumed')::numeric, (u ->> 'waste_quantity')::numeric,
      0, lot.unit, lot.unit_cost,
      case lot.kind when 'leftover' then 'reusable_pool' when 'purchase' then 'purchase' else 'manual' end,
      case when lot.kind = 'leftover' then 'reused_leftover' when lot.origin_project_id = proj.id then 'purchased_for_project' else 'existing_stock' end,
      lot.id, nullif(u ->> 'item_id', ''), nullif(trim(u ->> 'notes'), ''), me.operator_name, now()
    );
  end loop;

  for m in select * from jsonb_array_elements(coalesce(p -> 'activity', '[]'::jsonb)) limit 5 loop
    if m ->> 'kind' in ('usage', 'leftover') and length(m ->> 'message') between 1 and 400 then
      insert into public.activity_events (organization_id, id, project_id, position, at, actor, kind, message)
      values (
        me.organization_id, private.safe_id(m ->> 'id', 'act'), proj.id,
        private.next_position('activity_events', me.organization_id, proj.id), now(), me.operator_name, m ->> 'kind', m ->> 'message'
      );
    end if;
  end loop;
  update public.projects set updated_at = now() where organization_id = me.organization_id and id = proj.id;
end;
$$;

/** Nota o incidencia de la etapa. */
create or replace function public.taller_add_stage_log(p jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me record;
  proj public.projects;
  v_text text := trim(coalesce(p ->> 'text', ''));
  v_stage text := p ->> 'stage';
  v_kind text := p ->> 'kind';
  v_id text := private.safe_id(p ->> 'id', 'log');
begin
  select * into me from private.taller_me();
  if me.operator_id is null then
    raise exception 'Tu usuario no está habilitado para cargar en Taller (no está vinculado o fue dado de baja).'
      using errcode = 'insufficient_privilege';
  end if;
  proj := private.taller_project(me.organization_id, p ->> 'project_id');
  if length(v_text) < 3 or length(v_text) > 2000 then
    raise exception 'Contá brevemente qué pasó.' using errcode = 'check_violation';
  end if;
  if v_stage not in ('purchasing', 'production', 'installation') or private.stage_rank(v_stage) > private.stage_rank(proj.status) then
    raise exception 'El proyecto todavía no llegó a esa etapa.' using errcode = 'check_violation';
  end if;
  if v_kind not in ('note', 'incident') then
    raise exception 'Tipo de registro inválido.' using errcode = 'check_violation';
  end if;
  insert into public.stage_logs (organization_id, id, project_id, position, stage, date, kind, text, responsible, item_id, created_by, created_at)
  values (
    me.organization_id, v_id, proj.id, private.next_position('stage_logs', me.organization_id, proj.id), v_stage,
    least(coalesce((p ->> 'date')::date, private.today_ar()), private.today_ar()), v_kind, v_text,
    coalesce(nullif(trim(p ->> 'responsible'), ''), me.operator_name), nullif(p ->> 'item_id', ''), me.operator_name, now()
  );
  insert into public.activity_events (organization_id, id, project_id, position, at, actor, kind, message)
  values (
    me.organization_id, private.safe_id(null, 'act'), proj.id, private.next_position('activity_events', me.organization_id, proj.id),
    now(), me.operator_name, 'stage',
    'Se registró un ' || case v_kind when 'incident' then 'incidente' else 'nota' end || ' en ' ||
      case v_stage when 'purchasing' then 'Compras' when 'production' then 'Producción' else 'Instalación' end || '.'
  );
  update public.projects set updated_at = now() where organization_id = me.organization_id and id = proj.id;
  return v_id;
end;
$$;

/** Archivo adjunto (la foto ya se subió a Storage en la carpeta del proyecto). */
create or replace function public.taller_add_attachment(p jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me record;
  proj public.projects;
  v_path text := p ->> 'storage_path';
  v_id text := private.safe_id(p ->> 'id', 'att');
begin
  select * into me from private.taller_me();
  if me.operator_id is null then
    raise exception 'Tu usuario no está habilitado para cargar en Taller (no está vinculado o fue dado de baja).'
      using errcode = 'insufficient_privilege';
  end if;
  proj := private.taller_project(me.organization_id, p ->> 'project_id');
  if v_path is null or v_path not like me.organization_id::text || '/' || proj.id || '/%' then
    raise exception 'Ruta de archivo inválida.' using errcode = 'check_violation';
  end if;
  insert into public.attachments (organization_id, id, project_id, position, item_id, stage, stage_log_id, name, mime_type, size, storage_path, uploaded_by, uploaded_at)
  values (
    me.organization_id, v_id, proj.id, private.next_position('attachments', me.organization_id, proj.id),
    nullif(p ->> 'item_id', ''), nullif(p ->> 'stage', ''), nullif(p ->> 'stage_log_id', ''),
    left(coalesce(nullif(trim(p ->> 'name'), ''), 'archivo'), 200), left(coalesce(p ->> 'mime_type', ''), 100),
    greatest(coalesce((p ->> 'size')::bigint, 0), 0), v_path, me.operator_name, now()
  );
  insert into public.activity_events (organization_id, id, project_id, position, at, actor, kind, message)
  values (
    me.organization_id, private.safe_id(null, 'act'), proj.id, private.next_position('activity_events', me.organization_id, proj.id),
    now(), me.operator_name, 'stage', 'Se adjuntó “' || left(coalesce(nullif(trim(p ->> 'name'), ''), 'archivo'), 200) || '”.'
  );
  update public.projects set updated_at = now() where organization_id = me.organization_id and id = proj.id;
  return v_id;
end;
$$;

/** Pedido de material de Taller: queda abierto y visible para Gestión. */
create or replace function public.taller_request_material(p jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me record;
  proj public.projects;
  v_qty numeric := (p ->> 'quantity')::numeric;
  v_id text := private.safe_id(p ->> 'id', 'req');
begin
  select * into me from private.taller_me();
  if me.operator_id is null then
    raise exception 'Tu usuario no está habilitado para cargar en Taller (no está vinculado o fue dado de baja).'
      using errcode = 'insufficient_privilege';
  end if;
  proj := private.taller_project(me.organization_id, p ->> 'project_id');
  if v_qty is null or v_qty <= 0 then
    raise exception 'Indicá cuánto material falta.' using errcode = 'check_violation';
  end if;
  if coalesce(trim(p ->> 'material_name'), '') = '' then
    raise exception 'Indicá qué material falta.' using errcode = 'check_violation';
  end if;
  insert into public.material_requests (organization_id, id, position, project_id, material_id, material_name, quantity, unit, note, requested_by, status, created_at)
  values (
    me.organization_id, v_id, (select coalesce(max(position) + 1, 0) from public.material_requests where organization_id = me.organization_id),
    proj.id, coalesce(nullif(p ->> 'material_id', ''), 'otro'), left(trim(p ->> 'material_name'), 200), v_qty,
    left(coalesce(p ->> 'unit', ''), 20), nullif(left(trim(p ->> 'note'), 1000), ''), me.operator_name, 'open', now()
  );
  return v_id;
end;
$$;

-- Las funciones públicas solo las llama un usuario logueado.
revoke all on function public.taller_log_hours(jsonb) from public, anon;
revoke all on function public.taller_register_usage(jsonb) from public, anon;
revoke all on function public.taller_add_stage_log(jsonb) from public, anon;
revoke all on function public.taller_add_attachment(jsonb) from public, anon;
revoke all on function public.taller_request_material(jsonb) from public, anon;
grant execute on function public.taller_log_hours(jsonb) to authenticated;
grant execute on function public.taller_register_usage(jsonb) to authenticated;
grant execute on function public.taller_add_stage_log(jsonb) to authenticated;
grant execute on function public.taller_add_attachment(jsonb) to authenticated;
grant execute on function public.taller_request_material(jsonb) to authenticated;
