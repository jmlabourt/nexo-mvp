-- Blerp — Lote 2 (2/4): reglas de negocio en la base y reset de la empresa.

-- ── 2. Reglas de negocio en la base (triggers) ─────────────

-- Proyecto: etapas de a una (o corrección hacia atrás), cerrar solo con is_closed, línea base congelada,
-- un proyecto cerrado no se modifica.
create or replace function private.guard_project_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.rules_off(new.organization_id) then return new; end if;
  if old.is_closed then
    if (to_jsonb(old) - 'updated_at') is distinct from (to_jsonb(new) - 'updated_at') then
      raise exception 'El proyecto está cerrado: no admite cambios.' using errcode = 'check_violation';
    end if;
    return new;
  end if;
  if new.status is distinct from old.status then
    if new.status = 'completed' then
      if not new.is_closed then
        raise exception 'Para finalizar un proyecto hay que cerrarlo.' using errcode = 'check_violation';
      end if;
    elsif not (
      private.stage_rank(new.status) = private.stage_rank(old.status) + 1
      or private.stage_rank(new.status) < private.stage_rank(old.status)
    ) then
      raise exception 'Las etapas se avanzan de a una (de % no se puede pasar a %).', old.status, new.status
        using errcode = 'check_violation';
    end if;
  end if;
  if new.is_closed and new.status <> 'completed' then
    raise exception 'Un proyecto cerrado tiene que estar Finalizado.' using errcode = 'check_violation';
  end if;
  -- Congelado = misma captura y mismo total (las categorías de las líneas pueden venir normalizadas).
  if old.baseline is not null and (
    new.baseline is null
    or (new.baseline -> 'capturedAt') is distinct from (old.baseline -> 'capturedAt')
    or (new.baseline -> 'budgetTotal') is distinct from (old.baseline -> 'budgetTotal')
    or jsonb_array_length(coalesce(new.baseline -> 'lines', '[]'::jsonb)) <> jsonb_array_length(coalesce(old.baseline -> 'lines', '[]'::jsonb))
  ) then
    raise exception 'El presupuesto base ya está congelado: no se puede reemplazar.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create or replace trigger guard_project_update before update on public.projects
  for each row execute function private.guard_project_update();

-- Costo presupuestado: se edita solo en Cotización y Aprobado.
create or replace function private.guard_budget_lines()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  st text;
  pid text := coalesce(new.project_id, old.project_id);
  org uuid := coalesce(new.organization_id, old.organization_id);
begin
  if private.rules_off(org) then return coalesce(new, old); end if;
  if tg_op = 'UPDATE' and (to_jsonb(old) - 'position' - 'category') = (to_jsonb(new) - 'position' - 'category') then return new; end if;
  select p.status into st from public.projects p where p.organization_id = org and p.id = pid;
  if st is null then return coalesce(new, old); end if; -- el proyecto se está borrando
  if st not in ('quotation', 'approved') then
    raise exception 'El costo presupuestado está bloqueado: el proyecto ya está en ejecución.' using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end;
$$;

create or replace trigger guard_budget_lines before insert or update or delete on public.budget_lines
  for each row execute function private.guard_budget_lines();

-- Registros de ejecución (horas, costos, consumos): solo en etapas de ejecución, sin fechas futuras,
-- no se editan ni se borran (se corrigen con otro registro).
create or replace function private.guard_execution_records()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  st text;
  closed boolean;
  day_total numeric;
  hours numeric;
begin
  if private.rules_off(coalesce(new.organization_id, old.organization_id)) then return coalesce(new, old); end if;
  if tg_op = 'UPDATE' then
    -- La app vuelve a guardar los registros sin cambios; la categoría puede venir normalizada (Lote 1).
    if (to_jsonb(old) - 'position' - 'category') = (to_jsonb(new) - 'position' - 'category') then return new; end if;
    raise exception 'Los registros no se editan: cargá una corrección.' using errcode = 'check_violation';
  end if;
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.projects p where p.organization_id = old.organization_id and p.id = old.project_id) then
      return old; -- borrado en cascada del proyecto
    end if;
    raise exception 'Los registros no se borran: cargá una corrección.' using errcode = 'check_violation';
  end if;

  select p.status, p.is_closed into st, closed
  from public.projects p where p.organization_id = new.organization_id and p.id = new.project_id;
  if closed then
    raise exception 'El proyecto está cerrado: no admite nuevos registros.' using errcode = 'check_violation';
  end if;
  if st not in ('purchasing', 'production', 'installation') then
    raise exception 'El proyecto todavía no está en ejecución: pasalo a Compras para empezar a registrar.' using errcode = 'check_violation';
  end if;
  if new.date > private.today_ar() then
    raise exception 'No se pueden cargar registros con fecha futura.' using errcode = 'check_violation';
  end if;

  if tg_table_name = 'actual_entries' then
    if new.amount < 0 then
      raise exception 'El monto no puede ser negativo.' using errcode = 'check_violation';
    end if;
    if new.type = 'labor' then
      hours := coalesce((new.labor ->> 'hours')::numeric, 0);
      if hours <= 0 then
        raise exception 'Indicá las horas trabajadas.' using errcode = 'check_violation';
      end if;
      if new.operator_id is not null then
        select coalesce(sum((a.labor ->> 'hours')::numeric), 0) into day_total
        from public.actual_entries a
        where a.organization_id = new.organization_id and a.operator_id = new.operator_id
          and a.type = 'labor' and a.date = new.date and a.id <> new.id;
        if day_total + hours > 24 then
          raise exception 'Un día tiene 24 h: con estas serían % h para el mismo operario.', private.fmt_num(day_total + hours)
            using errcode = 'check_violation';
        end if;
      end if;
    end if;
  else
    if new.quantity_consumed < 0 or new.waste_quantity < 0 or new.reusable_leftover_quantity < 0 or new.unit_cost < 0 then
      raise exception 'Las cantidades y el costo no pueden ser negativos.' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create or replace trigger guard_actual_entries before insert or update or delete on public.actual_entries
  for each row execute function private.guard_execution_records();
create or replace trigger guard_material_usages before insert or update or delete on public.material_usages
  for each row execute function private.guard_execution_records();

-- Compras: no en Cotización ni en un proyecto cerrado.
create or replace function private.guard_purchases()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  st text;
  closed boolean;
begin
  if private.rules_off(new.organization_id) then return new; end if;
  if tg_op = 'UPDATE' and (to_jsonb(old) - 'position') = (to_jsonb(new) - 'position') then return new; end if;
  select p.status, p.is_closed into st, closed
  from public.projects p where p.organization_id = new.organization_id and p.id = new.project_id;
  if closed or st = 'quotation' then
    raise exception 'Un proyecto en Cotización o cerrado no registra compras.' using errcode = 'check_violation';
  end if;
  if new.quantity <= 0 or new.unit_cost < 0 then
    raise exception 'La cantidad debe ser mayor a cero y el costo no puede ser negativo.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create or replace trigger guard_purchases before insert or update on public.purchase_entries
  for each row execute function private.guard_purchases();

-- Operarios: no se elimina uno con horas registradas (solo baja).
create or replace function private.guard_operator_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.rules_off(old.organization_id) then return old; end if;
  if exists (
    select 1 from public.actual_entries a where a.organization_id = old.organization_id and a.operator_id = old.id
  ) then
    raise exception '% tiene horas registradas: no se puede eliminar, solo dar de baja.', old.name using errcode = 'check_violation';
  end if;
  return old;
end;
$$;

create or replace trigger guard_operator_delete before delete on public.operators
  for each row execute function private.guard_operator_delete();

-- Libro de stock: solo crece (los movimientos no se editan ni se borran).
create or replace function private.guard_stock_ledger()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.rules_off(coalesce(new.organization_id, old.organization_id)) then return coalesce(new, old); end if;
  if tg_op = 'UPDATE' and (to_jsonb(old) - 'position') = (to_jsonb(new) - 'position') then return new; end if;
  raise exception 'El libro de stock solo crece: los movimientos no se editan ni se borran.' using errcode = 'check_violation';
end;
$$;

create or replace trigger guard_stock_ledger before update or delete on public.stock_movements
  for each row execute function private.guard_stock_ledger();
