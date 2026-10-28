-- ─────────────────────────────────────────────────────────────
-- Blerp — Rol propio de Administración (Comercial / Diseño): `comercial`.
--
-- Hasta ahora Administración era una sesión del rol Administrativo (owner/member): veía lo mismo que Gerencia en la base.
-- Con esta migración es un rol aparte, con su lectura y su escritura propias:
--
--   · VE: cotizaciones y proyectos aprobados con su precio de venta, el costo presupuestado (materiales y mano de obra de
--     la cotización), clientes, proveedores, stock con costo, compras y órdenes de materiales, tarifas por categoría y
--     el estado de cada proyecto. Sus horas propias.
--   · NO VE: el costo real de la mano de obra (importes de las horas cargadas ni costo por hora de cada persona),
--     facturas, cobros, tarifas por persona, costos generales, tasa financiera de Gerencia ni correcciones.
--   · ESCRIBE (solo con comercial_commit_change): proyectos mientras están en cotización o aprobados, muebles, líneas de
--     presupuesto (las reglas de congelado las siguen haciendo los disparadores), actividad y adjuntos. Más lo suyo del
--     ledger (contrato, condiciones de pago, BOM, clientes, proveedores) con ledger_commit.
--   · NO ESCRIBE: etapas de producción en adelante, cierre del proyecto, operarios, stock, tarifas, usuarios.
--
-- Es ADITIVA: no modifica filas ni los roles existentes. Para deshacerla: pasar los usuarios `comercial` a `member`,
-- restaurar los checks de rol y borrar las dos funciones nuevas.
-- ─────────────────────────────────────────────────────────────

-- ── 1. El rol existe (miembros e invitaciones) ─────────────────────────────────────────────────────────────────
alter table public.organization_members drop constraint if exists organization_members_role_check;
alter table public.organization_members
  add constraint organization_members_role_check check (role in ('owner', 'member', 'compras', 'jefe_planta', 'operator', 'comercial'));

alter table public.member_invitations drop constraint if exists member_invitations_role_check;
alter table public.member_invitations
  add constraint member_invitations_role_check check (role in ('member', 'compras', 'jefe_planta', 'operator', 'comercial'));

-- Invitar y cambiar el rol aceptan el rol nuevo (mismo cuerpo que antes; solo cambia la lista de roles válidos).
create or replace function public.admin_invite_member(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  org uuid := private.my_admin_org();
  v_email text := nullif(lower(trim(coalesce(p ->> 'email', ''))), '');
  v_phone text := private.norm_phone(p ->> 'phone');
  v_name text := trim(coalesce(p ->> 'display_name', ''));
  v_role text := p ->> 'role';
  v_operator text := nullif(p ->> 'operator_id', '');
  v_id uuid;
begin
  if v_email is null and v_phone is null then
    raise exception 'Ingresá un mail o un celular.' using errcode = 'check_violation';
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Ingresá un mail válido.' using errcode = 'check_violation';
  end if;
  if v_phone is not null and v_phone !~ '^[0-9]{8,15}$' then
    raise exception 'Ingresá el celular con código de país, solo números (ej. 5491155551234).' using errcode = 'check_violation';
  end if;
  if length(v_name) < 2 then
    raise exception 'Ingresá el nombre.' using errcode = 'check_violation';
  end if;
  if v_role is null or v_role not in ('member', 'compras', 'jefe_planta', 'operator', 'comercial') then
    raise exception 'Elegí un rol válido.' using errcode = 'check_violation';
  end if;
  if exists (
    select 1 from public.organization_members m join auth.users u on u.id = m.user_id
    where m.organization_id = org
      and ((v_email is not null and lower(u.email) = v_email) or (v_phone is not null and private.norm_phone(u.phone) = v_phone))
  ) then
    raise exception 'Esa persona ya es un usuario de la empresa.' using errcode = 'unique_violation';
  end if;
  if exists (
    select 1 from public.member_invitations i
    where i.organization_id <> org and i.accepted_at is null and i.revoked_at is null
      and ((v_email is not null and lower(i.email) = v_email) or (v_phone is not null and i.phone = v_phone))
  ) then
    raise exception 'Ese contacto tiene una invitación pendiente de otra empresa.' using errcode = 'unique_violation';
  end if;
  if v_role = 'operator' then
    if v_operator is null or not exists (
      select 1 from public.operators o
      where o.organization_id = org and o.id = v_operator and o.active and o.deactivated_at is null and o.user_id is null
    ) then
      raise exception 'Elegí un operario activo que todavía no tenga usuario.' using errcode = 'check_violation';
    end if;
    update public.operators set email = coalesce(v_email, email), phone = coalesce(v_phone, phone)
    where organization_id = org and id = v_operator;
  else
    v_operator := null;
  end if;

  update public.member_invitations set revoked_at = now()
  where organization_id = org and accepted_at is null and revoked_at is null
    and ((v_email is not null and lower(email) = v_email) or (v_phone is not null and phone = v_phone));
  insert into public.member_invitations (organization_id, email, phone, display_name, role, operator_id, invited_by)
  values (org, v_email, v_phone, v_name, v_role, v_operator, (select auth.uid()))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.admin_set_member_role(p_user uuid, p_role text, p_operator_id text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  org uuid := private.my_admin_org();
  old_role text;
begin
  if p_user = (select auth.uid()) then
    raise exception 'No podés cambiar tu propio rol.' using errcode = 'check_violation';
  end if;
  if p_role is null or p_role not in ('member', 'compras', 'jefe_planta', 'operator', 'comercial') then
    raise exception 'Elegí un rol válido.' using errcode = 'check_violation';
  end if;
  select m.role into old_role from public.organization_members m where m.organization_id = org and m.user_id = p_user;
  if old_role is null then
    raise exception 'El usuario no es de tu empresa.' using errcode = 'no_data_found';
  end if;
  if old_role = 'owner' and p_role = 'member' then
    return;
  end if;
  if p_role = 'operator' and old_role <> 'operator' then
    if p_operator_id is null or not exists (
      select 1 from public.operators o
      where o.organization_id = org and o.id = p_operator_id and o.active and o.deactivated_at is null and o.user_id is null
    ) then
      raise exception 'Elegí un operario activo que todavía no tenga usuario.' using errcode = 'check_violation';
    end if;
    update public.operators set user_id = p_user where organization_id = org and id = p_operator_id;
  elsif old_role = 'operator' and p_role <> 'operator' then
    update public.operators set user_id = null where organization_id = org and user_id = p_user;
  end if;
  update public.organization_members set role = p_role where organization_id = org and user_id = p_user;
end;
$$;

-- ── 2. Lectura: comercial_workspace() ──────────────────────────────────────────────────────────────────────────
-- Misma forma que compras_workspace / planta_workspace (filas de las tablas), con lo que Administración puede ver.
create or replace function public.comercial_workspace()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me record;
begin
  select m.organization_id, m.display_name, o.name as org_name, o.alert_settings into me
  from public.organization_members m join public.organizations o on o.id = m.organization_id
  where m.user_id = (select auth.uid()) and m.role = 'comercial' and m.deactivated_at is null
  order by m.created_at limit 1;
  if me.organization_id is null then
    if exists (select 1 from public.organization_members m where m.user_id = (select auth.uid()) and m.role = 'comercial') then
      return jsonb_build_object('status', 'inactive');
    end if;
    raise exception 'Tu usuario no es de Administración.' using errcode = 'insufficient_privilege';
  end if;

  return jsonb_build_object(
    'status', 'active',
    'organization_id', me.organization_id,
    'organization_name', me.org_name,
    'display_name', me.display_name,
    'projects', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.created_at desc)
      from public.projects p where p.organization_id = me.organization_id), '[]'::jsonb),
    'budget_lines', coalesce((
      select jsonb_agg(to_jsonb(b) order by b.project_id, b.position)
      from public.budget_lines b where b.organization_id = me.organization_id), '[]'::jsonb),
    'purchase_entries', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.project_id, x.position)
      from public.purchase_entries x where x.organization_id = me.organization_id), '[]'::jsonb),
    'material_usages', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.project_id, x.position)
      from public.material_usages x where x.organization_id = me.organization_id), '[]'::jsonb),
    -- Costos reales: lo que no es mano de obra se ve; de las horas, solo la cantidad (sin importe ni costo por hora).
    'actual_entries', coalesce((
      select jsonb_agg(
        case when a.type = 'labor'
          then (to_jsonb(a) - 'amount' - 'labor') || jsonb_build_object('amount', 0, 'labor', coalesce(a.labor, '{}'::jsonb) - 'hourlyCost')
          else to_jsonb(a) end
        order by a.project_id, a.position)
      from public.actual_entries a where a.organization_id = me.organization_id), '[]'::jsonb),
    'project_items', coalesce((
      select jsonb_agg(to_jsonb(i) order by i.position)
      from public.project_items i where i.organization_id = me.organization_id), '[]'::jsonb),
    'stage_logs', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.project_id, s.position)
      from public.stage_logs s where s.organization_id = me.organization_id), '[]'::jsonb),
    'activity_events', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.project_id, e.position)
      from public.activity_events e where e.organization_id = me.organization_id), '[]'::jsonb),
    'attachments', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.project_id, t.position)
      from public.attachments t where t.organization_id = me.organization_id), '[]'::jsonb),
    'operators', coalesce((
      select jsonb_agg(to_jsonb(o) - 'hourly_cost' - 'pin_hash' order by o.position)
      from public.operators o where o.organization_id = me.organization_id), '[]'::jsonb),
    'stock_lots', coalesce((
      select jsonb_agg(to_jsonb(l) order by l.created_at, l.id)
      from public.stock_lots l where l.organization_id = me.organization_id), '[]'::jsonb),
    'stock_movements', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.position)
      from public.stock_movements s where s.organization_id = me.organization_id), '[]'::jsonb),
    'material_requests', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at desc)
      from public.material_requests r where r.organization_id = me.organization_id), '[]'::jsonb),
    -- Tarifas por categoría (las usa el cotizador). Sin el costo de cada persona ni el multiplicador de horas extra.
    'hour_rates', coalesce((
      select jsonb_agg(to_jsonb(h) order by h.position)
      from public.hour_rates h where h.organization_id = me.organization_id), '[]'::jsonb),
    'price_history', coalesce((
      select jsonb_agg(to_jsonb(h) order by h.valid_from, h.created_at)
      from public.price_history h where h.organization_id = me.organization_id and h.kind in ('material_price', 'hour_rate')), '[]'::jsonb),
    'cost_settings', (
      select to_jsonb(c) from public.cost_settings c where c.organization_id = me.organization_id),
    'purchase_orders', coalesce((
      select jsonb_agg(to_jsonb(o) order by o.number)
      from public.purchase_orders o where o.organization_id = me.organization_id), '[]'::jsonb),
    'purchase_order_lines', coalesce((
      select jsonb_agg(to_jsonb(l) order by l.order_id, l.position)
      from public.purchase_order_lines l where l.organization_id = me.organization_id and l.removed_at is null), '[]'::jsonb),
    'alert_settings', me.alert_settings
  );
end;
$$;

-- ── 3. Escritura: comercial_commit_change(p) ───────────────────────────────────────────────────────────────────
-- Mismo formato que admin_commit_change ({ expected_projects, tables: { <tabla>: { rows, removed } } }) pero con una
-- lista corta de tablas y de reglas. SECURITY DEFINER: Administración no tiene políticas de escritura sobre las tablas.
create or replace function public.comercial_commit_change(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  org uuid;
  tbl text; batch jsonb; row_json jsonb; expected jsonb; cols text; updates text; actual_stamp timestamptz;
  old_status text; old_closed boolean; pid text; pstatus text; pclosed boolean;
  allowed text[] := array['projects', 'project_items', 'budget_lines', 'activity_events', 'attachments'];
  open_stages text[] := array['quotation', 'approved'];
begin
  select m.organization_id into org from public.organization_members m
  where m.user_id = uid and m.role = 'comercial' and m.deactivated_at is null order by m.created_at limit 1;
  if org is null then
    raise exception 'Esto lo registra Administración.' using errcode = 'insufficient_privilege';
  end if;

  -- Serializa las escrituras de la empresa; la comparación detecta sesiones desactualizadas.
  perform 1 from public.organizations where id = org for update;
  for expected in select * from jsonb_array_elements(coalesce(p -> 'expected_projects', '[]')) loop
    select updated_at into actual_stamp from public.projects where organization_id = org and id = expected ->> 'id' for update;
    if (expected ->> 'updated_at') is null then
      if found then raise exception 'El proyecto ya existe. Actualizá los datos.'; end if;
    elsif not found or date_trunc('milliseconds', actual_stamp) is distinct from date_trunc('milliseconds', (expected ->> 'updated_at')::timestamptz) then
      raise exception 'El proyecto cambió en otra sesión. Actualizá antes de guardar.';
    end if;
  end loop;

  for tbl in select jsonb_object_keys(coalesce(p -> 'tables', '{}')) loop
    if not tbl = any(allowed) then
      raise exception 'Con tu rol no se guarda esto: lo hace Gerencia.' using errcode = 'insufficient_privilege';
    end if;
  end loop;

  foreach tbl in array allowed loop
    batch := p -> 'tables' -> tbl;
    if batch is null then continue; end if;

    for row_json in select * from jsonb_array_elements(coalesce(batch -> 'rows', '[]')) loop
      if (row_json ->> 'organization_id')::uuid is distinct from org then raise exception 'Empresa inválida.'; end if;

      if tbl = 'projects' then
        select status, is_closed into old_status, old_closed from public.projects where organization_id = org and id = row_json ->> 'id';
        if found and old_closed then raise exception 'El proyecto está cerrado: no admite cambios.' using errcode = 'check_violation'; end if;
        if old_status is not null and not old_status = any(open_stages) then
          raise exception 'Con el proyecto ya en marcha, los cambios los hace Gerencia.' using errcode = 'insufficient_privilege';
        end if;
        if not coalesce(row_json ->> 'status', '') = any(open_stages) or coalesce((row_json ->> 'is_closed')::boolean, false) then
          raise exception 'Las etapas de producción en adelante las avanza Gerencia.' using errcode = 'insufficient_privilege';
        end if;
        select updated_at into actual_stamp from public.projects where organization_id = org and id = row_json ->> 'id';
        row_json := jsonb_set(row_json, '{updated_at}', to_jsonb(greatest(date_trunc('milliseconds', clock_timestamp()),
          date_trunc('milliseconds', coalesce(actual_stamp, '1970-01-01'::timestamptz)) + interval '1 millisecond')));
      else
        -- Hijos: el proyecto tiene que existir en esta empresa, abierto; muebles y presupuesto, además en cotización o aprobado.
        pid := row_json ->> 'project_id';
        select status, is_closed into pstatus, pclosed from public.projects where organization_id = org and id = pid;
        if not found then
          -- Puede ser un proyecto que viaja en este mismo guardado (todavía no existe): se valida contra el lote.
          select r ->> 'status' into pstatus from jsonb_array_elements(coalesce(p -> 'tables' -> 'projects' -> 'rows', '[]')) r where r ->> 'id' = pid limit 1;
          pclosed := false;
          if pstatus is null then raise exception 'El proyecto no existe.' using errcode = 'check_violation'; end if;
        end if;
        if pclosed then raise exception 'El proyecto está cerrado: no admite cambios.' using errcode = 'check_violation'; end if;
        if tbl in ('project_items', 'budget_lines') and not pstatus = any(open_stages) then
          raise exception 'Con el proyecto ya en marcha, los cambios los hace Gerencia.' using errcode = 'insufficient_privilege';
        end if;
      end if;

      select string_agg(format('%I', c.column_name), ',' order by c.ordinal_position),
             string_agg(format('%1$I=excluded.%1$I', c.column_name), ',' order by c.ordinal_position) filter (where c.column_name not in ('organization_id', 'id'))
      into cols, updates from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = tbl and row_json ? c.column_name;
      execute format('insert into public.%1$I (%2$s) select %2$s from jsonb_populate_record(null::public.%1$I,$1) on conflict(organization_id,id) do update set %3$s', tbl, cols, updates)
        using row_json;
    end loop;

    if jsonb_array_length(coalesce(batch -> 'removed', '[]')) > 0 then
      if not tbl = any(array['budget_lines', 'project_items', 'attachments']) then
        raise exception 'El historial no se puede eliminar.' using errcode = 'check_violation';
      end if;
      -- Solo se quita en una cotización (muebles y presupuesto) o en un proyecto abierto (adjuntos).
      execute format(
        'select exists (select 1 from public.%1$I x join public.projects pr on pr.organization_id = x.organization_id and pr.id = x.project_id
           where x.organization_id = $1 and x.id in (select jsonb_array_elements_text($2))
             and (pr.is_closed or ($3 and pr.status <> ''quotation'')))', tbl)
        into pclosed using org, batch -> 'removed', tbl in ('budget_lines', 'project_items');
      if pclosed then
        raise exception 'Con el proyecto aprobado o en marcha no se quita esto: queda en el historial.' using errcode = 'check_violation';
      end if;
      execute format('delete from public.%I where organization_id = $1 and id in (select jsonb_array_elements_text($2))', tbl)
        using org, batch -> 'removed';
    end if;
  end loop;
end;
$$;

revoke all on function public.comercial_workspace() from public, anon;
revoke all on function public.comercial_commit_change(jsonb) from public, anon;
grant execute on function public.comercial_workspace() to authenticated;
grant execute on function public.comercial_commit_change(jsonb) to authenticated;
