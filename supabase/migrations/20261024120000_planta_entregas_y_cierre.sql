-- ─────────────────────────────────────────────────────────────
-- Jefe de planta: entrega de materiales y cierre del día (docs/PLANTA_MATERIALES.md).
--
-- Agrega:
--   · tabla material_deliveries (solo cantidades; la leen Administrativo y Jefe de planta; nadie la escribe directo);
--   · planta_stock(): lotes y movimientos SIN costo ni proveedor, para que el Jefe vea cantidades;
--   · planta_deliver_material(p): entrega (del depósito → movimiento 'assign'; de lo ya asignado → sin movimiento);
--   · planta_close_day(p): unidades terminadas (con planta_set_completed_units) y, por entrega, consumo, desperdicio y
--     sobrante reutilizable (vuelve al depósito con el costo de su lote). El costo lo pone la base, nunca el Jefe.
--
-- No borra ni modifica datos existentes. Es aditiva y se puede aplicar antes del deploy que la usa (el código anterior
-- no la conoce). Para deshacerla: drop de las tres funciones y de la tabla (se pierden solo las entregas cargadas).
-- ─────────────────────────────────────────────────────────────

create table if not exists public.material_deliveries (
  organization_id uuid not null,
  id text not null,
  project_id text not null,
  item_id text,
  operator_id text,
  material_id text not null,
  material_name text not null,
  unit text not null default '',
  quantity numeric not null check (quantity > 0),
  source text not null check (source in ('warehouse', 'project')),
  date date not null,
  closed_at timestamptz,
  close_id text,
  consumed numeric check (consumed >= 0),
  waste numeric check (waste >= 0),
  leftover numeric check (leftover >= 0),
  created_by text not null default '',
  created_at timestamptz not null default now(),
  primary key (organization_id, id),
  foreign key (organization_id, project_id) references public.projects (organization_id, id) on delete cascade
);

alter table public.material_deliveries enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'material_deliveries' and policyname = 'manager and plant read deliveries') then
    create policy "manager and plant read deliveries" on public.material_deliveries for select to authenticated
      using ((select private.is_org_manager(organization_id)) or (select private.is_staff(organization_id, 'jefe_planta')));
  end if;
end $$;
-- Sin políticas de insert/update/delete: solo escriben las funciones de abajo (security definer).

/** Saldo de un lote en un lugar (depósito o proyecto), a partir de sus movimientos. */
create or replace function private.lot_balance(org uuid, lot text, place jsonb)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(case when s.to_place = place then s.quantity else 0 end), 0)
       - coalesce(sum(case when s.from_place = place then s.quantity else 0 end), 0)
  from public.stock_movements s
  where s.organization_id = org and s.lot_id = lot;
$$;
revoke all on function private.lot_balance(uuid, text, jsonb) from public;

/** Proyecto donde la planta puede trabajar (abierto, entre Aprobado e Instalación). Lanza si no. */
create or replace function private.plant_project(org uuid, project text)
returns public.projects
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  proj public.projects;
begin
  select * into proj from public.projects where organization_id = org and id = project;
  if not found then
    raise exception 'Proyecto no encontrado.' using errcode = 'no_data_found';
  end if;
  if proj.is_closed or proj.status not in ('approved', 'purchasing', 'production', 'installation') then
    raise exception 'Solo se entrega material a proyectos entre Aprobado e Instalación.' using errcode = 'check_violation';
  end if;
  return proj;
end;
$$;
revoke all on function private.plant_project(uuid, text) from public;

-- ── Lectura del Jefe: cantidades, sin costos ─────────────────

create or replace function public.planta_stock()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  org uuid := private.my_plan_org();
begin
  return jsonb_build_object(
    'stock_lots', coalesce((
      select jsonb_agg(to_jsonb(l) - 'unit_cost' - 'supplier' - 'purchase_entry_id' order by l.created_at, l.id)
      from public.stock_lots l where l.organization_id = org), '[]'::jsonb),
    'stock_movements', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.position)
      from public.stock_movements s where s.organization_id = org), '[]'::jsonb),
    'deliveries', coalesce((
      select jsonb_agg(to_jsonb(d) order by d.date, d.created_at)
      from public.material_deliveries d where d.organization_id = org), '[]'::jsonb)
  );
end;
$$;

-- ── Entrega de material ──────────────────────────────────────

create or replace function public.planta_deliver_material(p jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  org uuid := private.my_plan_org();
  proj public.projects;
  v_id text := private.safe_id(p ->> 'id', 'del');
  v_item text := nullif(p ->> 'item_id', '');
  v_operator text := nullif(p ->> 'operator_id', '');
  v_material text := p ->> 'material_id';
  v_qty numeric := (p ->> 'quantity')::numeric;
  v_date date := (p ->> 'date')::date;
  v_source text := p ->> 'source';
  place jsonb;
  warehouse constant jsonb := '{"type": "warehouse"}'::jsonb;
  m jsonb;
  src record;
  lot public.stock_lots;
  v_moved numeric := 0;
  v_held numeric;
  v_actor text;
  v_operator_name text;
  pos integer;
begin
  if exists (select 1 from public.material_deliveries d where d.organization_id = org and d.id = v_id) then
    return v_id; -- reintento de la misma entrega
  end if;
  proj := private.plant_project(org, p ->> 'project_id');
  place := jsonb_build_object('type', 'project', 'projectId', proj.id);
  if v_item is null or not exists (select 1 from public.project_items i where i.organization_id = org and i.project_id = proj.id and i.id = v_item) then
    raise exception 'Elegí un producto del proyecto.' using errcode = 'check_violation';
  end if;
  if v_operator is not null then
    select o.name into v_operator_name from public.operators o
    where o.organization_id = org and o.id = v_operator and o.active and o.deactivated_at is null;
    if not found then
      raise exception 'Elegí un operario activo.' using errcode = 'check_violation';
    end if;
  end if;
  if v_qty is null or v_qty <= 0 then
    raise exception 'La cantidad tiene que ser mayor a cero.' using errcode = 'check_violation';
  end if;
  if v_date is null or v_date > private.today_ar() then
    raise exception 'La entrega no puede tener fecha futura.' using errcode = 'check_violation';
  end if;
  if v_source not in ('warehouse', 'project') then
    raise exception 'Indicá de dónde sale el material.' using errcode = 'check_violation';
  end if;

  -- Del depósito: solo movimientos 'assign' depósito → este proyecto, del material elegido.
  for m in select * from jsonb_array_elements(coalesce(p -> 'movements', '[]'::jsonb)) loop
    select * into lot from public.stock_lots s where s.organization_id = org and s.id = m ->> 'lot_id';
    if v_source <> 'warehouse' or m ->> 'kind' <> 'assign' or not found or lot.material_id <> v_material
      or (m -> 'from_place') is distinct from warehouse or (m -> 'to_place') is distinct from place
      or coalesce((m ->> 'quantity')::numeric, 0) <= 0 then
      raise exception 'Movimiento de entrega inválido.' using errcode = 'check_violation';
    end if;
    v_moved := v_moved + (m ->> 'quantity')::numeric;
  end loop;
  if v_source = 'warehouse' and abs(v_moved - v_qty) > 0.000001 then
    raise exception 'La entrega no coincide con lo que sale del depósito.' using errcode = 'check_violation';
  end if;

  if v_source = 'warehouse' then
    for src in
      select x ->> 'lot_id' as lot_id, sum((x ->> 'quantity')::numeric) as qty
      from jsonb_array_elements(p -> 'movements') x group by 1
    loop
      if src.qty > private.lot_balance(org, src.lot_id, warehouse) + 0.000001 then
        raise exception 'No hay tanto material libre en el depósito (hay %).', private.fmt_num(private.lot_balance(org, src.lot_id, warehouse))
          using errcode = 'check_violation';
      end if;
    end loop;
  else
    -- De lo asignado al proyecto: tiene que estar (y no estar ya entregado sin cerrar).
    select coalesce(sum(private.lot_balance(org, l.id, place)), 0) into v_held
    from public.stock_lots l where l.organization_id = org and l.material_id = v_material;
    v_held := v_held - coalesce((
      select sum(d.quantity) from public.material_deliveries d
      where d.organization_id = org and d.project_id = proj.id and d.material_id = v_material and d.closed_at is null), 0);
    if v_qty > v_held + 0.000001 then
      raise exception 'El proyecto no tiene tanto material asignado sin entregar (hay %).', private.fmt_num(greatest(v_held, 0))
        using errcode = 'check_violation';
    end if;
  end if;

  select l.* into lot from public.stock_lots l where l.organization_id = org and l.material_id = v_material order by l.created_at limit 1;
  if not found then
    raise exception 'Material no encontrado.' using errcode = 'no_data_found';
  end if;
  select m2.display_name into v_actor from public.organization_members m2 where m2.organization_id = org and m2.user_id = (select auth.uid());

  select coalesce(max(s.position) + 1, 0) into pos from public.stock_movements s where s.organization_id = org;
  for m in select * from jsonb_array_elements(coalesce(p -> 'movements', '[]'::jsonb)) loop
    insert into public.stock_movements (
      organization_id, id, lot_id, position, kind, quantity, from_place, to_place, date, project_id, item_id, note, created_by, created_at
    ) values (
      org, private.safe_id(m ->> 'id', 'mov'), m ->> 'lot_id', pos, 'assign', (m ->> 'quantity')::numeric, warehouse, place, v_date,
      proj.id, v_item, 'Entrega ' || v_id, coalesce(v_actor, ''), now()
    );
    pos := pos + 1;
  end loop;

  insert into public.material_deliveries (
    organization_id, id, project_id, item_id, operator_id, material_id, material_name, unit, quantity, source, date, created_by
  ) values (org, v_id, proj.id, v_item, v_operator, v_material, lot.material_name, lot.unit, v_qty, v_source, v_date, coalesce(v_actor, ''));

  insert into public.activity_events (organization_id, id, project_id, position, at, actor, kind, message)
  values (
    org, private.safe_id(null, 'act'), proj.id, private.next_position('activity_events', org, proj.id), now(), coalesce(v_actor, ''), 'usage',
    format('Entrega de material: %s %s de %s%s (%s).', private.fmt_num(v_qty), lot.unit, lot.material_name,
      case when v_operator_name is not null then ' a ' || v_operator_name else '' end,
      case v_source when 'warehouse' then 'sale del depósito' else 'ya estaba asignado al proyecto' end)
  );
  update public.projects set updated_at = now() where organization_id = org and id = proj.id;
  return v_id;
end;
$$;

-- ── Cierre del día ───────────────────────────────────────────

create or replace function public.planta_close_day(p jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  org uuid := private.my_plan_org();
  proj public.projects;
  place jsonb;
  v_close text := private.safe_id(p ->> 'id', 'cls');
  v_date date := (p ->> 'date')::date;
  m jsonb;
  u jsonb;
  l jsonb;
  d jsonb;
  src record;
  del public.material_deliveries;
  parent public.stock_lots;
  lot public.stock_lots;
  new_lots text[];
  v_kind text;
  v_qty numeric;
  v_actor text;
  pos integer;
begin
  if exists (select 1 from public.material_deliveries x where x.organization_id = org and x.close_id = v_close) then
    return v_close; -- reintento del mismo cierre
  end if;
  proj := private.plant_project(org, p ->> 'project_id');
  place := jsonb_build_object('type', 'project', 'projectId', proj.id);
  if v_date is null or v_date > private.today_ar() then
    raise exception 'El cierre no puede tener fecha futura.' using errcode = 'check_violation';
  end if;
  select m2.display_name into v_actor from public.organization_members m2 where m2.organization_id = org and m2.user_id = (select auth.uid());
  v_actor := coalesce(v_actor, '');

  -- 1. Unidades terminadas: la misma función y validación de siempre.
  for u in select * from jsonb_array_elements(coalesce(p -> 'units', '[]'::jsonb)) loop
    perform public.planta_set_completed_units(jsonb_build_object('project_id', proj.id, 'item_id', u ->> 'item_id', 'units', u -> 'units'));
  end loop;

  -- 2. Entregas que se cierran: abiertas, de este proyecto; consumo + desperdicio + sobrante ≤ lo entregado.
  for d in select * from jsonb_array_elements(coalesce(p -> 'deliveries', '[]'::jsonb)) loop
    select * into del from public.material_deliveries x
    where x.organization_id = org and x.id = d ->> 'id' and x.project_id = proj.id for update;
    if not found then
      raise exception 'Entrega no encontrada en este proyecto.' using errcode = 'no_data_found';
    end if;
    if del.closed_at is not null then
      raise exception 'La entrega de % ya está cerrada.', del.material_name using errcode = 'check_violation';
    end if;
    if coalesce((d ->> 'consumed')::numeric, -1) < 0 or coalesce((d ->> 'waste')::numeric, -1) < 0 or coalesce((d ->> 'leftover')::numeric, -1) < 0 then
      raise exception 'Las cantidades no pueden ser negativas.' using errcode = 'check_violation';
    end if;
    if (d ->> 'consumed')::numeric + (d ->> 'waste')::numeric + (d ->> 'leftover')::numeric > del.quantity + 0.000001 then
      raise exception 'De % se entregaron %: consumo, desperdicio y sobrante no pueden sumar más.', del.material_name, private.fmt_num(del.quantity)
        using errcode = 'check_violation';
    end if;
  end loop;

  -- 3. Los movimientos coinciden, material por material, con lo cerrado en las entregas.
  if exists (
    with mv as (
      select l2.material_id,
             sum(case when x ->> 'kind' = 'consume' then (x ->> 'quantity')::numeric else 0 end) as consumed,
             sum(case when x ->> 'kind' = 'waste' then (x ->> 'quantity')::numeric else 0 end) as waste,
             sum(case when x ->> 'kind' = 'to_leftover' then (x ->> 'quantity')::numeric else 0 end) as leftover
      from jsonb_array_elements(coalesce(p -> 'movements', '[]'::jsonb)) x
      join public.stock_lots l2 on l2.organization_id = org and l2.id = x ->> 'lot_id'
      where x ->> 'kind' in ('consume', 'waste', 'to_leftover')
      group by 1
    ), dl as (
      select x2.material_id,
             sum((y ->> 'consumed')::numeric) as consumed, sum((y ->> 'waste')::numeric) as waste, sum((y ->> 'leftover')::numeric) as leftover
      from jsonb_array_elements(coalesce(p -> 'deliveries', '[]'::jsonb)) y
      join public.material_deliveries x2 on x2.organization_id = org and x2.id = y ->> 'id'
      group by 1
    )
    select 1 from mv full join dl using (material_id)
    where abs(coalesce(mv.consumed, 0) - coalesce(dl.consumed, 0)) > 0.000001
       or abs(coalesce(mv.waste, 0) - coalesce(dl.waste, 0)) > 0.000001
       or abs(coalesce(mv.leftover, 0) - coalesce(dl.leftover, 0)) > 0.000001
  ) then
    raise exception 'El cierre no coincide con los movimientos de material.' using errcode = 'check_violation';
  end if;

  -- 4. Movimientos: consumo, desperdicio y sobrante desde lo asignado a ESTE proyecto (como el uso de material).
  select coalesce(array_agg(x ->> 'id'), '{}') into new_lots from jsonb_array_elements(coalesce(p -> 'lots', '[]'::jsonb)) x;
  for m in select * from jsonb_array_elements(coalesce(p -> 'movements', '[]'::jsonb)) loop
    v_kind := m ->> 'kind';
    v_qty := (m ->> 'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Las cantidades deben ser mayores a cero.' using errcode = 'check_violation';
    end if;
    if v_kind in ('consume', 'waste', 'to_leftover') then
      if (m -> 'from_place') is distinct from place or (m ->> 'lot_id') = any (new_lots)
        or not exists (select 1 from public.stock_lots s where s.organization_id = org and s.id = m ->> 'lot_id') then
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
        raise exception 'El sobrante reutilizable vuelve al depósito.' using errcode = 'check_violation';
      end if;
    else
      raise exception 'El cierre del día no puede registrar movimientos de tipo %.', v_kind using errcode = 'check_violation';
    end if;
  end loop;

  for src in
    select x ->> 'lot_id' as lot_id, sum((x ->> 'quantity')::numeric) as qty
    from jsonb_array_elements(coalesce(p -> 'movements', '[]'::jsonb)) x
    where x ->> 'kind' in ('consume', 'waste', 'to_leftover')
    group by 1
  loop
    if src.qty > private.lot_balance(org, src.lot_id, place) + 0.000001 then
      raise exception 'No alcanza el material asignado a este proyecto (hay %, se quieren usar %).',
        private.fmt_num(private.lot_balance(org, src.lot_id, place)), private.fmt_num(src.qty) using errcode = 'check_violation';
    end if;
  end loop;

  -- 5. Lo registrado como uso coincide con consumo y desperdicio, lote por lote.
  if exists (
    with mv as (
      select x ->> 'lot_id' as lot_id,
             sum(case when x ->> 'kind' = 'consume' then (x ->> 'quantity')::numeric else 0 end) as consumed,
             sum(case when x ->> 'kind' = 'waste' then (x ->> 'quantity')::numeric else 0 end) as waste
      from jsonb_array_elements(coalesce(p -> 'movements', '[]'::jsonb)) x
      where x ->> 'kind' in ('consume', 'waste')
      group by 1
    ), us as (
      select x ->> 'lot_id' as lot_id, sum((x ->> 'quantity_consumed')::numeric) as consumed, sum((x ->> 'waste_quantity')::numeric) as waste
      from jsonb_array_elements(coalesce(p -> 'usages', '[]'::jsonb)) x
      group by 1
    )
    select 1 from mv full join us using (lot_id)
    where abs(coalesce(mv.consumed, 0) - coalesce(us.consumed, 0)) > 0.000001
       or abs(coalesce(mv.waste, 0) - coalesce(us.waste, 0)) > 0.000001
  ) then
    raise exception 'El registro de uso no coincide con los movimientos de material.' using errcode = 'check_violation';
  end if;

  -- 6. Sobrantes: lote nuevo con el costo del lote del que salen (lo pone la base).
  for l in select * from jsonb_array_elements(coalesce(p -> 'lots', '[]'::jsonb)) loop
    select * into parent from public.stock_lots s where s.organization_id = org and s.id = l ->> 'parent_lot_id';
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
      org, private.safe_id(l ->> 'id', 'lot'), parent.material_id, parent.material_name, parent.unit,
      parent.unit_cost, 'leftover', parent.supplier, proj.id,
      case when parent.origin_project_id = proj.id then parent.origin_project_name end,
      parent.id, nullif(trim(l ->> 'location'), ''), l -> 'dims', v_actor, now()
    );
  end loop;

  select coalesce(max(s.position) + 1, 0) into pos from public.stock_movements s where s.organization_id = org;
  for m in select * from jsonb_array_elements(coalesce(p -> 'movements', '[]'::jsonb)) loop
    insert into public.stock_movements (
      organization_id, id, lot_id, position, kind, quantity, from_place, to_place, date, project_id, item_id,
      into_lot_id, group_id, note, created_by, created_at
    ) values (
      org, private.safe_id(m ->> 'id', 'mov'), m ->> 'lot_id', pos, m ->> 'kind', (m ->> 'quantity')::numeric,
      m -> 'from_place', m -> 'to_place', v_date, proj.id, nullif(m ->> 'item_id', ''), nullif(m ->> 'into_lot_id', ''),
      nullif(m ->> 'group_id', ''), 'Cierre ' || v_close, v_actor, now()
    );
    pos := pos + 1;
  end loop;

  for u in select * from jsonb_array_elements(coalesce(p -> 'usages', '[]'::jsonb)) loop
    select * into lot from public.stock_lots s where s.organization_id = org and s.id = u ->> 'lot_id';
    if not found then
      raise exception 'El material registrado no coincide con el lote.' using errcode = 'check_violation';
    end if;
    insert into public.material_usages (
      organization_id, id, project_id, position, material_id, material_name, date, quantity_consumed, waste_quantity,
      reusable_leftover_quantity, unit, unit_cost, unit_cost_origin, source, lot_id, item_id, notes, created_by, created_at
    ) values (
      org, private.safe_id(u ->> 'id', 'use'), proj.id, private.next_position('material_usages', org, proj.id),
      lot.material_id, lot.material_name, v_date, (u ->> 'quantity_consumed')::numeric, (u ->> 'waste_quantity')::numeric,
      0, lot.unit, lot.unit_cost,
      case lot.kind when 'leftover' then 'reusable_pool' when 'purchase' then 'purchase' else 'manual' end,
      case when lot.kind = 'leftover' then 'reused_leftover' when lot.origin_project_id = proj.id then 'purchased_for_project' else 'existing_stock' end,
      lot.id, nullif(u ->> 'item_id', ''), 'Cierre del día ' || v_close, v_actor, now()
    );
  end loop;

  update public.material_deliveries x
  set closed_at = now(), close_id = v_close,
      consumed = (y ->> 'consumed')::numeric, waste = (y ->> 'waste')::numeric, leftover = (y ->> 'leftover')::numeric
  from jsonb_array_elements(coalesce(p -> 'deliveries', '[]'::jsonb)) y
  where x.organization_id = org and x.id = y ->> 'id';

  insert into public.activity_events (organization_id, id, project_id, position, at, actor, kind, message)
  values (
    org, private.safe_id(null, 'act'), proj.id, private.next_position('activity_events', org, proj.id), now(), v_actor, 'usage',
    format('Cierre del día %s en planta.', to_char(v_date, 'DD/MM/YYYY'))
  );
  update public.projects set updated_at = now() where organization_id = org and id = proj.id;
  return v_close;
end;
$$;

revoke all on function public.planta_stock() from public, anon;
revoke all on function public.planta_deliver_material(jsonb) from public, anon;
revoke all on function public.planta_close_day(jsonb) from public, anon;
grant execute on function public.planta_stock() to authenticated;
grant execute on function public.planta_deliver_material(jsonb) to authenticated;
grant execute on function public.planta_close_day(jsonb) to authenticated;
