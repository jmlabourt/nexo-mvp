-- ─────────────────────────────────────────────────────────────
-- Blerp — Registros de la empresa (el "ledger" de la demo integral) en la base, por empresa.
--
-- Hasta ahora estos datos solo existían en el modo demostración (en el navegador). Con esta migración cada empresa
-- los guarda en su propia base, aislados por organization_id y con permisos por rol:
--
--   · Gerencia (Administrativo): facturas de venta, cobros, pagos a proveedores, rubros, tarifas, costos generales,
--     tasa de gasto financiero.
--   · Administración / Comercial (hoy el mismo Administrativo; el rol propio llega en la migración siguiente):
--     contrato vigente, condiciones de pago, BOM por versiones, clientes.
--   · Compras: proveedores; ve el BOM publicado y el estado de pago de sus órdenes.
--   · Jefe de planta: entrega real al cliente; ve el BOM publicado (solo cantidades).
--   · Administración, Compras y Jefe: sus horas propias (cada uno ve las suyas; el costo por hora lo congela la base).
--   · Operario: solo ve el catálogo de rubros.
--
-- Cómo se escribe: NUNCA directo a las tablas (no tienen políticas de escritura) sino con public.ledger_commit(p), que
-- valida el permiso por colección y deja que los disparadores (triggers) hagan cumplir las reglas del negocio.
-- Cómo se lee: public.ledger_workspace() devuelve solo lo que el rol puede ver, con la forma del contrato `Ledger`
-- del frontend (types/index.ts).
--
-- Es ADITIVA: no borra ni modifica datos existentes. Se puede aplicar antes del deploy que la usa.
-- Para deshacerla: drop de las funciones public.ledger_* y de las tablas nuevas (se pierden solo estos registros).
-- ─────────────────────────────────────────────────────────────
BEGIN;

-- ── Permisos por capacidad (un solo lugar) ─────────────────────────────────────────────────────────────────────
-- manage = Administrativo con acceso comercial · quote = cotiza (hoy igual que manage; luego suma Comercial) ·
-- buy = Compras · plant = Jefe de planta. Todos exigen la cuenta activa (is_staff / is_org_manager ya lo hacen).
create or replace function private.can_manage(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$ select private.is_org_manager(org) $$;

create or replace function private.can_quote(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$ select private.is_org_manager(org) or private.is_staff(org, 'comercial') $$;

create or replace function private.can_buy(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$ select private.is_org_manager(org) or private.is_staff(org, 'compras') $$;

create or replace function private.can_plant(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$ select private.is_org_manager(org) or private.is_staff(org, 'jefe_planta') $$;

revoke all on function private.can_manage(uuid), private.can_quote(uuid), private.can_buy(uuid), private.can_plant(uuid) from public, anon;
grant execute on function private.can_manage(uuid), private.can_quote(uuid), private.can_buy(uuid), private.can_plant(uuid) to authenticated;

/** Empresa y nombre de la persona que opera (cuenta activa, cualquier rol menos Operario). Lanza si no hay. */
create or replace function private.ledger_member(out org uuid, out actor text)
language plpgsql stable security definer set search_path = '' as $$
begin
  select m.organization_id, coalesce(nullif(m.display_name, ''), 'Usuario') into org, actor
  from public.organization_members m
  where m.user_id = (select auth.uid()) and m.deactivated_at is null and m.role <> 'operator'
  order by m.created_at limit 1;
  if org is null then
    raise exception 'Tu usuario no tiene acceso a estos registros.' using errcode = 'insufficient_privilege';
  end if;
end;
$$;
revoke all on function private.ledger_member() from public, anon;
grant execute on function private.ledger_member() to authenticated;

-- ── Columnas nuevas en tablas existentes ───────────────────────────────────────────────────────────────────────
alter table public.cost_settings add column if not exists financial_monthly_rate_pct numeric not null default 5
  check (financial_monthly_rate_pct >= 0 and financial_monthly_rate_pct <= 50);

alter table public.clients
  add column if not exists contact text,
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists address text,
  add column if not exists notes text,
  add column if not exists active boolean not null default true;

-- Nullable a propósito: admin_record_closure arma la fila con jsonb_populate_record, que deja en NULL lo que no viene
-- (no usa los valores por defecto). Los cierres anteriores quedan sin autor ni avisos.
alter table public.project_closures
  add column if not exists closed_by text,
  add column if not exists pending_costs jsonb default '[]'::jsonb;

-- ── Tablas ─────────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.sales_invoices (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  id text not null,
  project_id text not null,
  number text not null,
  date date not null,
  amount numeric(14, 2) not null check (amount > 0),
  notes text,
  created_by text not null default '',
  created_at timestamptz not null default now(),
  primary key (organization_id, id),
  foreign key (organization_id, project_id) references public.projects (organization_id, id) on delete cascade
);
create index if not exists sales_invoices_project_idx on public.sales_invoices (organization_id, project_id);

create table if not exists public.collections (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  id text not null,
  project_id text not null,
  invoice_id text,
  date date not null,
  amount numeric(14, 2) not null check (amount > 0),
  notes text,
  created_by text not null default '',
  created_at timestamptz not null default now(),
  primary key (organization_id, id),
  foreign key (organization_id, project_id) references public.projects (organization_id, id) on delete cascade,
  foreign key (organization_id, invoice_id) references public.sales_invoices (organization_id, id) on delete restrict
);
create index if not exists collections_project_idx on public.collections (organization_id, project_id);

create table if not exists public.supplier_payments (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  id text not null,
  order_id text not null,
  date date not null,
  amount numeric(14, 2) not null check (amount > 0),
  reference text not null check (length(btrim(reference)) > 0),
  paid_by text not null default '',
  paid_at timestamptz not null default now(),
  primary key (organization_id, id),
  foreign key (organization_id, order_id) references public.purchase_orders (organization_id, id) on delete cascade
);
create index if not exists supplier_payments_order_idx on public.supplier_payments (organization_id, order_id);

create table if not exists public.contract_revisions (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  id text not null,
  project_id text not null,
  previous numeric(14, 2) not null,
  next numeric(14, 2) not null check (next > 0),
  reason text not null check (length(btrim(reason)) >= 3),
  by text not null default '',
  at timestamptz not null default now(),
  primary key (organization_id, id),
  foreign key (organization_id, project_id) references public.projects (organization_id, id) on delete cascade
);
create index if not exists contract_revisions_project_idx on public.contract_revisions (organization_id, project_id, at);

create table if not exists public.payment_terms (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id text not null,
  days_after_delivery integer not null default 0 check (days_after_delivery >= 0),
  schedule jsonb not null default '[]'::jsonb,
  updated_by text not null default '',
  updated_at timestamptz not null default now(),
  primary key (organization_id, project_id),
  foreign key (organization_id, project_id) references public.projects (organization_id, id) on delete cascade
);

create table if not exists public.bom_versions (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  id text not null,
  project_id text not null,
  item_id text not null,
  version integer not null check (version >= 1),
  status text not null default 'draft' check (status in ('draft', 'published')),
  notes text,
  created_by text not null default '',
  created_at timestamptz not null default now(),
  published_at timestamptz,
  primary key (organization_id, id),
  foreign key (organization_id, project_id) references public.projects (organization_id, id) on delete cascade,
  foreign key (organization_id, item_id) references public.project_items (organization_id, id) on delete cascade,
  unique (organization_id, project_id, item_id, version)
);
-- Un solo borrador por mueble.
create unique index if not exists bom_versions_one_draft_idx on public.bom_versions (organization_id, project_id, item_id) where status = 'draft';

create table if not exists public.bom_lines (
  organization_id uuid not null,
  id text not null,
  bom_id text not null,
  position integer not null default 0,
  material text not null,
  material_id text,
  spec text,
  quantity numeric not null check (quantity > 0),
  unit text not null,
  budget_line_id text,
  primary key (organization_id, id),
  foreign key (organization_id, bom_id) references public.bom_versions (organization_id, id) on delete cascade
);
create index if not exists bom_lines_bom_idx on public.bom_lines (organization_id, bom_id, position);

create table if not exists public.client_handovers (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  id text not null,
  project_id text not null,
  date date not null,
  by text not null default '',
  notes text,
  created_at timestamptz not null default now(),
  primary key (organization_id, id),
  foreign key (organization_id, project_id) references public.projects (organization_id, id) on delete cascade
);
create unique index if not exists client_handovers_one_per_project_idx on public.client_handovers (organization_id, project_id);

create table if not exists public.staff_hours (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  id text not null,
  user_id uuid not null,
  employee text not null default '',
  project_id text,
  date date not null,
  hours numeric(5, 2) not null check (hours > 0 and hours <= 24),
  task text not null check (length(btrim(task)) >= 2),
  hourly_cost numeric(14, 2),
  created_at timestamptz not null default now(),
  primary key (organization_id, id),
  foreign key (organization_id, project_id) references public.projects (organization_id, id) on delete cascade,
  check (project_id is not null or hourly_cost is null)
);
create index if not exists staff_hours_project_idx on public.staff_hours (organization_id, project_id);
create index if not exists staff_hours_user_idx on public.staff_hours (organization_id, user_id, date);

create table if not exists public.rubro_catalog (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  id text not null,
  name text not null check (length(btrim(name)) >= 2),
  name_key text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (organization_id, id),
  unique (organization_id, name_key)
);

create table if not exists public.rate_records (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  id text not null,
  scope text not null check (scope in ('rubro', 'employee')),
  subject_id text not null,
  hourly_rate numeric(14, 2) not null check (hourly_rate > 0),
  valid_from date not null,
  created_by text not null default '',
  created_at timestamptz not null default now(),
  primary key (organization_id, id)
);
create index if not exists rate_records_subject_idx on public.rate_records (organization_id, scope, subject_id, valid_from);

create table if not exists public.suppliers (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  id text not null,
  name text not null check (length(btrim(name)) >= 2),
  name_key text not null,
  contact text,
  phone text,
  email text,
  address text,
  notes text,
  catalog_url text,
  website text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (organization_id, id),
  unique (organization_id, name_key)
);

create table if not exists public.general_costs (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  id text not null,
  name text not null check (length(btrim(name)) >= 2),
  monthly_amount numeric(14, 2) not null check (monthly_amount > 0),
  created_at timestamptz not null default now(),
  primary key (organization_id, id)
);

-- ── Lectura directa: solo Administrativo (los demás roles leen con ledger_workspace, ya filtrado) ───────────────
do $$
declare t text;
begin
  foreach t in array array[
    'sales_invoices', 'collections', 'supplier_payments', 'contract_revisions', 'payment_terms', 'bom_versions', 'bom_lines',
    'client_handovers', 'staff_hours', 'rubro_catalog', 'rate_records', 'suppliers', 'general_costs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'manager reads') then
      execute format(
        'create policy "manager reads" on public.%I for select to authenticated using ((select private.is_org_manager(organization_id)))', t);
    end if;
  end loop;
end $$;
-- Sin políticas de insert/update/delete: escribe solo public.ledger_commit (security definer).

-- ── Reglas del negocio (disparadores) ──────────────────────────────────────────────────────────────────────────
-- Se saltean en la carga masiva (reset_workspace / ledger_reset) y en empresas que nunca cargaron datos, igual que
-- el resto de las reglas (private.rules_off).

create or replace function private.today_ledger() returns date language sql stable set search_path = '' as $$ select (now() at time zone 'America/Argentina/Buenos_Aires')::date $$;

create or replace function private.tg_sales_invoice() returns trigger language plpgsql set search_path = '' as $$
declare st text;
begin
  if private.rules_off(new.organization_id) then return new; end if;
  select p.status into st from public.projects p where p.organization_id = new.organization_id and p.id = new.project_id;
  if st = 'quotation' then raise exception 'Una cotización no se factura: primero se aprueba.' using errcode = 'check_violation'; end if;
  if length(btrim(new.number)) = 0 then raise exception 'Indicá el número o la referencia de la factura.' using errcode = 'check_violation'; end if;
  if exists (
    select 1 from public.sales_invoices x
    where x.organization_id = new.organization_id and x.id <> new.id and lower(btrim(x.number)) = lower(btrim(new.number))
  ) then raise exception 'Ya hay una factura con ese número.' using errcode = 'unique_violation'; end if;
  return new;
end;
$$;
drop trigger if exists sales_invoice_rules on public.sales_invoices;
create trigger sales_invoice_rules before insert on public.sales_invoices for each row execute function private.tg_sales_invoice();

create or replace function private.tg_collection() returns trigger language plpgsql set search_path = '' as $$
declare st text; inv public.sales_invoices; applied numeric;
begin
  if private.rules_off(new.organization_id) then return new; end if;
  if tg_op = 'UPDATE' then
    -- Un cobro no se edita: solo un anticipo (sin factura) se puede aplicar a una factura, sin duplicar el dinero.
    if old.invoice_id is not null or (to_jsonb(old) - 'invoice_id') is distinct from (to_jsonb(new) - 'invoice_id') or new.invoice_id is null then
      raise exception 'Un cobro registrado no se modifica (solo se aplica un anticipo a una factura).' using errcode = 'check_violation';
    end if;
  end if;
  select p.status into st from public.projects p where p.organization_id = new.organization_id and p.id = new.project_id;
  if st = 'quotation' then raise exception 'Una cotización no tiene cobros.' using errcode = 'check_violation'; end if;
  if new.invoice_id is not null then
    select * into inv from public.sales_invoices i where i.organization_id = new.organization_id and i.id = new.invoice_id;
    if not found or inv.project_id <> new.project_id then raise exception 'La factura no es de este proyecto.' using errcode = 'check_violation'; end if;
    select coalesce(sum(c.amount), 0) into applied from public.collections c
    where c.organization_id = new.organization_id and c.invoice_id = new.invoice_id and c.id <> new.id;
    if new.amount - (inv.amount - applied) > 0.005 then
      raise exception 'Esa factura tiene % pendientes: el cobro no puede superarlo.', to_char(inv.amount - applied, 'FM999999999990.00') using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists collection_rules on public.collections;
create trigger collection_rules before insert or update on public.collections for each row execute function private.tg_collection();

create or replace function private.tg_supplier_payment() returns trigger language plpgsql set search_path = '' as $$
declare o public.purchase_orders;
begin
  if private.rules_off(new.organization_id) then return new; end if;
  select * into o from public.purchase_orders x where x.organization_id = new.organization_id and x.id = new.order_id;
  if not found or o.status <> 'invoiced' or coalesce(o.invoice_amount, 0) <= 0 then
    raise exception 'Primero Compras carga la factura del proveedor.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
drop trigger if exists supplier_payment_rules on public.supplier_payments;
create trigger supplier_payment_rules before insert on public.supplier_payments for each row execute function private.tg_supplier_payment();

/** Monto contratado vigente: la última revisión, o el precio aprobado, o el precio actual. */
create or replace function private.current_contract(org uuid, pid text) returns numeric
language sql stable set search_path = '' as $$
  select coalesce(
    (select r.next from public.contract_revisions r where r.organization_id = org and r.project_id = pid order by r.at desc, r.id desc limit 1),
    (select coalesce((p.baseline ->> 'salesPrice')::numeric, p.sales_price) from public.projects p where p.organization_id = org and p.id = pid)
  )
$$;

create or replace function private.tg_contract_revision() returns trigger language plpgsql set search_path = '' as $$
declare st text; cur numeric;
begin
  if private.rules_off(new.organization_id) then return new; end if;
  select p.status into st from public.projects p where p.organization_id = new.organization_id and p.id = new.project_id;
  if st = 'quotation' then
    raise exception 'En cotización se cambia el precio de la cotización; el contrato existe desde que se aprueba.' using errcode = 'check_violation';
  end if;
  cur := private.current_contract(new.organization_id, new.project_id);
  if round(new.next, 2) = round(cur, 2) then raise exception 'Es el mismo monto contratado vigente.' using errcode = 'check_violation'; end if;
  -- El monto anterior y la hora los pone la base: nadie puede escribir una historia distinta.
  new.previous := cur;
  new.at := now();
  return new;
end;
$$;
drop trigger if exists contract_revision_rules on public.contract_revisions;
create trigger contract_revision_rules before insert on public.contract_revisions for each row execute function private.tg_contract_revision();

create or replace function private.tg_payment_terms() returns trigger language plpgsql set search_path = '' as $$
declare s jsonb;
begin
  if private.rules_off(new.organization_id) then return new; end if;
  if jsonb_typeof(new.schedule) <> 'array' then raise exception 'Las cuotas tienen que ser una lista.' using errcode = 'check_violation'; end if;
  for s in select * from jsonb_array_elements(new.schedule) loop
    if coalesce((s ->> 'amount')::numeric, 0) <= 0 then raise exception 'Cada cobro previsto necesita un importe mayor a cero.' using errcode = 'check_violation'; end if;
    if coalesce(s ->> 'date', '') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Cada cobro previsto necesita una fecha.' using errcode = 'check_violation'; end if;
  end loop;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists payment_terms_rules on public.payment_terms;
create trigger payment_terms_rules before insert or update on public.payment_terms for each row execute function private.tg_payment_terms();

create or replace function private.tg_bom_version() returns trigger language plpgsql set search_path = '' as $$
declare st text; n integer;
begin
  if tg_op = 'DELETE' then
    if private.rules_off(old.organization_id) then return old; end if;
    if old.status = 'published' and exists (select 1 from public.projects p where p.organization_id = old.organization_id and p.id = old.project_id) then
      raise exception 'Una versión publicada del BOM no se elimina: queda en el historial.' using errcode = 'check_violation';
    end if;
    return old;
  end if;
  if private.rules_off(new.organization_id) then return new; end if;
  if tg_op = 'INSERT' then
    select p.status into st from public.projects p where p.organization_id = new.organization_id and p.id = new.project_id;
    if st = 'quotation' then raise exception 'El BOM se arma cuando el proyecto está aprobado.' using errcode = 'check_violation'; end if;
    if not exists (select 1 from public.project_items i where i.organization_id = new.organization_id and i.id = new.item_id and i.project_id = new.project_id) then
      raise exception 'El mueble no es de este proyecto.' using errcode = 'check_violation';
    end if;
    if exists (select 1 from public.bom_versions b where b.organization_id = new.organization_id and b.project_id = new.project_id and b.item_id = new.item_id and b.status = 'draft') then
      raise exception 'Ese mueble ya tiene un borrador de BOM.' using errcode = 'unique_violation';
    end if;
    select coalesce(max(b.version), 0) + 1 into n from public.bom_versions b
    where b.organization_id = new.organization_id and b.project_id = new.project_id and b.item_id = new.item_id;
    new.version := n;
    new.status := 'draft';
    new.published_at := null;
    return new;
  end if;
  -- UPDATE
  if old.status = 'published' then raise exception 'Una versión publicada del BOM no se modifica: se crea una versión nueva.' using errcode = 'check_violation'; end if;
  if new.project_id <> old.project_id or new.item_id <> old.item_id or new.version <> old.version then
    raise exception 'El BOM no cambia de mueble ni de versión.' using errcode = 'check_violation';
  end if;
  if new.status = 'published' then
    if not exists (select 1 from public.bom_lines l where l.organization_id = new.organization_id and l.bom_id = new.id) then
      raise exception 'El BOM no tiene materiales.' using errcode = 'check_violation';
    end if;
    new.published_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists bom_version_rules on public.bom_versions;
create trigger bom_version_rules before insert or update or delete on public.bom_versions for each row execute function private.tg_bom_version();

create or replace function private.tg_bom_line() returns trigger language plpgsql set search_path = '' as $$
declare st text; org uuid; bid text;
begin
  org := coalesce(new.organization_id, old.organization_id);
  bid := coalesce(new.bom_id, old.bom_id);
  if private.rules_off(org) then return coalesce(new, old); end if;
  select b.status into st from public.bom_versions b where b.organization_id = org and b.id = bid;
  -- Sin la versión (se está borrando junto con el proyecto) no hay nada que cuidar.
  if st is null then return coalesce(new, old); end if;
  if st = 'published' then raise exception 'Una versión publicada del BOM no se modifica: se crea una versión nueva.' using errcode = 'check_violation'; end if;
  if tg_op <> 'DELETE' then
    if length(btrim(new.material)) = 0 then raise exception 'Cada línea necesita el material.' using errcode = 'check_violation'; end if;
    if length(btrim(new.unit)) = 0 then raise exception 'Indicá la unidad de %.', btrim(new.material) using errcode = 'check_violation'; end if;
  end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists bom_line_rules on public.bom_lines;
create trigger bom_line_rules before insert or update or delete on public.bom_lines for each row execute function private.tg_bom_line();

create or replace function private.tg_client_handover() returns trigger language plpgsql set search_path = '' as $$
declare closed boolean; total integer; pending integer;
begin
  if private.rules_off(new.organization_id) then return new; end if;
  select p.is_closed into closed from public.projects p where p.organization_id = new.organization_id and p.id = new.project_id;
  if closed then raise exception 'El proyecto ya está cerrado.' using errcode = 'check_violation'; end if;
  select count(*), count(*) filter (where i.completed_units < i.quantity) into total, pending
  from public.project_items i where i.organization_id = new.organization_id and i.project_id = new.project_id;
  if total = 0 or pending > 0 then
    raise exception 'Para confirmar la entrega tienen que estar terminadas todas las unidades.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.client_handovers h where h.organization_id = new.organization_id and h.project_id = new.project_id and h.id <> new.id) then
    raise exception 'La entrega ya está confirmada.' using errcode = 'unique_violation';
  end if;
  return new;
end;
$$;
drop trigger if exists client_handover_rules on public.client_handovers;
create trigger client_handover_rules before insert on public.client_handovers for each row execute function private.tg_client_handover();

create or replace function private.tg_staff_hours() returns trigger language plpgsql set search_path = '' as $$
declare st text; closed boolean;
begin
  if private.rules_off(new.organization_id) then return new; end if;
  if new.project_id is not null then
    select p.status, p.is_closed into st, closed from public.projects p where p.organization_id = new.organization_id and p.id = new.project_id;
    if st = 'quotation' then raise exception 'Las horas no se imputan a una cotización.' using errcode = 'check_violation'; end if;
    if closed then raise exception 'El proyecto está cerrado: no admite horas.' using errcode = 'check_violation'; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists staff_hours_rules on public.staff_hours;
create trigger staff_hours_rules before insert on public.staff_hours for each row execute function private.tg_staff_hours();

/**
 * Registros que no se editan ni se eliminan (queda la historia). El borrado en cascada al borrar el proyecto (o la
 * orden de compra) sí se permite. Argumento del trigger: 'project', 'order' o 'none'.
 */
create or replace function private.tg_append_only() returns trigger language plpgsql set search_path = '' as $$
declare parent_gone boolean := false; j jsonb;
begin
  if private.rules_off(old.organization_id) then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then
    j := to_jsonb(old);
    if tg_argv[0] = 'project' and (j ->> 'project_id') is not null then
      parent_gone := not exists (select 1 from public.projects p where p.organization_id = old.organization_id and p.id = j ->> 'project_id');
    elsif tg_argv[0] = 'order' then
      parent_gone := not exists (select 1 from public.purchase_orders o where o.organization_id = old.organization_id and o.id = j ->> 'order_id');
    end if;
    if parent_gone then return old; end if;
  end if;
  raise exception 'Este registro no se modifica ni se elimina: queda en el historial.' using errcode = 'check_violation';
end;
$$;
drop trigger if exists append_only on public.supplier_payments;
create trigger append_only before update or delete on public.supplier_payments for each row execute function private.tg_append_only('order');
drop trigger if exists append_only on public.contract_revisions;
create trigger append_only before update or delete on public.contract_revisions for each row execute function private.tg_append_only('project');
drop trigger if exists append_only on public.client_handovers;
create trigger append_only before update or delete on public.client_handovers for each row execute function private.tg_append_only('project');
drop trigger if exists append_only on public.staff_hours;
create trigger append_only before update or delete on public.staff_hours for each row execute function private.tg_append_only('project');
drop trigger if exists append_only on public.rate_records;
create trigger append_only before update or delete on public.rate_records for each row execute function private.tg_append_only('none');

-- Un nombre por empresa en directorios y rubros, con mensaje claro.
create or replace function private.tg_directory_name() returns trigger language plpgsql set search_path = '' as $$
declare dup boolean;
begin
  new.name := btrim(new.name);
  new.name_key := private.name_key(new.name);
  if length(new.name) < 2 then raise exception 'Escribí el nombre.' using errcode = 'check_violation'; end if;
  execute format('select exists (select 1 from public.%I x where x.organization_id = $1 and x.name_key = $2 and x.id <> $3)', tg_table_name)
    into dup using new.organization_id, new.name_key, new.id;
  if dup then
    raise exception '%', case tg_table_name when 'suppliers' then 'Ya hay un proveedor con ese nombre.' else 'Ya hay un rubro con ese nombre.' end
      using errcode = 'unique_violation';
  end if;
  return new;
end;
$$;
drop trigger if exists directory_name on public.suppliers;
create trigger directory_name before insert or update of name on public.suppliers for each row execute function private.tg_directory_name();
drop trigger if exists directory_name on public.rubro_catalog;
create trigger directory_name before insert or update of name on public.rubro_catalog for each row execute function private.tg_directory_name();
-- Clientes: el alta automática por proyecto (sync_project_client) ya resuelve los duplicados con "on conflict do nothing";
-- acá solo se mantiene la clave. El mensaje claro de duplicado lo da ledger_commit.
create or replace function private.tg_client_name() returns trigger language plpgsql set search_path = '' as $$
begin
  new.name := btrim(new.name);
  new.name_key := private.name_key(new.name);
  if length(new.name) < 2 then raise exception 'Escribí el nombre del cliente.' using errcode = 'check_violation'; end if;
  return new;
end;
$$;
drop trigger if exists client_name on public.clients;
create trigger client_name before insert or update of name on public.clients for each row execute function private.tg_client_name();

-- ── Costo por hora de las horas propias (lo congela la base: Administración, Compras y Jefe no leen las tarifas) ─
create or replace function private.staff_hourly_cost(org uuid, uid uuid, d date) returns numeric
language sql stable security definer set search_path = '' as $$
  -- 1) tarifa propia de la persona (vigente a esa fecha) · 2) tarifa de Administración con vigencia (historial de precios)
  -- · 3) la tarifa de Administración cargada · 4) la inicial de la app (27.000, igual que DEFAULT_HOUR_RATES).
  select coalesce(
    (select r.hourly_rate from public.rate_records r
      where r.organization_id = org and r.scope = 'employee' and r.subject_id = uid::text and r.valid_from <= d
      order by r.valid_from desc, r.created_at desc, r.id desc limit 1),
    (select ph.value from public.price_history ph
      where ph.organization_id = org and ph.kind = 'hour_rate' and ph.subject_id = 'admin' and ph.valid_from <= d
      order by ph.valid_from desc, ph.created_at desc, ph.id desc limit 1),
    (select h.hourly_rate from public.hour_rates h where h.organization_id = org and h.category = 'admin' order by h.position limit 1),
    27000
  )
$$;
revoke all on function private.staff_hourly_cost(uuid, uuid, date) from public, anon;

-- ── Lectura: ledger_workspace() ────────────────────────────────────────────────────────────────────────────────
-- Devuelve el contrato `Ledger` del frontend, SOLO con lo que el rol puede ver. Los importes de Gerencia
-- (facturas, cobros, pagos, tarifas, costos generales) no salen para nadie más.
create or replace function public.ledger_workspace()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  org uuid;
  mgr boolean; quote boolean; buy boolean; plant boolean;
  empty jsonb := '[]'::jsonb;
begin
  select m.organization_id into org from public.organization_members m
  where m.user_id = uid and m.deactivated_at is null order by m.created_at limit 1;
  if org is null then raise exception 'Tu usuario no tiene acceso a estos registros.' using errcode = 'insufficient_privilege'; end if;
  mgr := private.can_manage(org); quote := private.can_quote(org); buy := private.can_buy(org); plant := private.can_plant(org);

  return jsonb_build_object(
    'salesInvoices', case when mgr then (
      select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', i.id, 'projectId', i.project_id, 'number', i.number, 'date', i.date,
        'amount', i.amount, 'notes', i.notes, 'createdBy', i.created_by, 'createdAt', i.created_at)) order by i.date, i.created_at, i.id), empty)
      from public.sales_invoices i where i.organization_id = org) else empty end,
    'collections', case when mgr then (
      select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', c.id, 'projectId', c.project_id, 'invoiceId', c.invoice_id, 'date', c.date,
        'amount', c.amount, 'notes', c.notes, 'createdBy', c.created_by, 'createdAt', c.created_at)) order by c.date, c.created_at, c.id), empty)
      from public.collections c where c.organization_id = org) else empty end,
    'supplierPayments', case when buy then (
      select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'orderId', s.order_id, 'date', s.date, 'amount', s.amount,
        'reference', s.reference, 'by', s.paid_by, 'at', s.paid_at) order by s.date, s.paid_at, s.id), empty)
      from public.supplier_payments s where s.organization_id = org) else empty end,
    'contractRevisions', case when quote then (
      select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'projectId', r.project_id, 'previous', r.previous, 'next', r.next,
        'reason', r.reason, 'by', r.by, 'at', r.at) order by r.at, r.id), empty)
      from public.contract_revisions r where r.organization_id = org) else empty end,
    'paymentTerms', case when quote then (
      select coalesce(jsonb_agg(jsonb_build_object('projectId', t.project_id, 'daysAfterDelivery', t.days_after_delivery, 'schedule', t.schedule)
        order by t.project_id), empty)
      from public.payment_terms t where t.organization_id = org) else empty end,
    -- BOM: Administración ve todo (borradores incluidos); Compras y el Jefe de planta, solo lo publicado y solo cantidades.
    'boms', case when quote or buy or plant then (
      select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', b.id, 'projectId', b.project_id, 'itemId', b.item_id, 'version', b.version,
        'status', b.status, 'notes', case when quote then b.notes end, 'createdBy', b.created_by, 'createdAt', b.created_at, 'publishedAt', b.published_at,
        'lines', coalesce((
          select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', l.id, 'material', l.material, 'materialId', l.material_id, 'spec', l.spec,
            'quantity', l.quantity, 'unit', l.unit, 'budgetLineId', l.budget_line_id)) order by l.position, l.id)
          from public.bom_lines l where l.organization_id = b.organization_id and l.bom_id = b.id), empty))
        ) order by b.project_id, b.item_id, b.version), empty)
      from public.bom_versions b where b.organization_id = org and (quote or b.status = 'published')) else empty end,
    'handovers', case when quote or plant then (
      select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', h.id, 'projectId', h.project_id, 'date', h.date, 'by', h.by, 'notes', h.notes))
        order by h.date, h.id), empty)
      from public.client_handovers h where h.organization_id = org) else empty end,
    -- Horas propias: Gerencia ve todas (con el costo); cada persona ve las suyas, sin costo.
    'internalHours', case when mgr or buy or plant or quote then (
      select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', s.id, 'employeeId', s.user_id::text, 'employee', s.employee, 'projectId', s.project_id,
        'date', s.date, 'hours', s.hours, 'task', s.task, 'hourlyCost', case when mgr then s.hourly_cost end, 'createdAt', s.created_at))
        order by s.date, s.created_at, s.id), empty)
      from public.staff_hours s where s.organization_id = org and (mgr or s.user_id = uid)) else empty end,
    'closures', case when mgr or quote or buy or plant then (
      select coalesce(jsonb_agg(jsonb_build_object('projectId', c.project_id, 'date', (c.closed_at at time zone 'UTC')::date, 'by', coalesce(c.closed_by, ''),
        'pendingCosts', coalesce(c.pending_costs, '[]'::jsonb)) order by c.closed_at, c.project_id), empty)
      from public.project_closures c where c.organization_id = org) else empty end,
    'generalCosts', case when mgr then (
      select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'monthlyAmount', g.monthly_amount) order by g.created_at, g.id), empty)
      from public.general_costs g where g.organization_id = org) else empty end,
    'rubroCatalog', (
      select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'active', r.active) order by r.created_at, r.id), empty)
      from public.rubro_catalog r where r.organization_id = org),
    'rates', case when mgr then (
      select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'scope', r.scope, 'subjectId', r.subject_id, 'hourlyRate', r.hourly_rate,
        'validFrom', r.valid_from, 'createdBy', r.created_by, 'createdAt', r.created_at) order by r.valid_from, r.created_at, r.id), empty)
      from public.rate_records r where r.organization_id = org) else empty end,
    'clients', case when quote then (
      select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', c.id, 'name', c.name, 'contact', c.contact, 'phone', c.phone, 'email', c.email,
        'address', c.address, 'notes', c.notes, 'active', c.active, 'createdAt', c.created_at)) order by c.name_key, c.id), empty)
      from public.clients c where c.organization_id = org) else empty end,
    'suppliers', case when quote or buy then (
      select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', s.id, 'name', s.name, 'contact', s.contact, 'phone', s.phone, 'email', s.email,
        'address', s.address, 'notes', s.notes, 'catalogUrl', s.catalog_url, 'website', s.website, 'active', s.active, 'createdAt', s.created_at))
        order by s.name_key, s.id), empty)
      from public.suppliers s where s.organization_id = org) else empty end,
    'financialMonthlyRatePct', case when quote then coalesce((select c.financial_monthly_rate_pct from public.cost_settings c where c.organization_id = org), 5) end
  );
end;
$$;

-- ── Escritura: ledger_commit(p) ────────────────────────────────────────────────────────────────────────────────
-- p = { "<colección>": { "upsert": [filas con la forma del contrato], "remove": [ids] }, ..., "financialMonthlyRatePct": n }
-- Solo se mandan las colecciones que cambiaron. El permiso se chequea por colección; las reglas, en los disparadores.
create or replace function public.ledger_commit(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  org uuid; actor text;
  b jsonb; v_status text; v_id text;
  known text[] := array['salesInvoices','collections','supplierPayments','contractRevisions','paymentTerms','boms','handovers',
                        'internalHours','generalCosts','rubroCatalog','rates','clients','suppliers','financialMonthlyRatePct'];
  k text;
begin
  select m.org, m.actor into org, actor from private.ledger_member() m;
  for k in select jsonb_object_keys(p) loop
    if not k = any(known) then raise exception 'Colección no permitida: %.', k using errcode = 'check_violation'; end if;
  end loop;

  -- Permiso por colección.
  if (p ? 'salesInvoices' or p ? 'collections' or p ? 'supplierPayments' or p ? 'rubroCatalog' or p ? 'rates' or p ? 'generalCosts'
      or p ? 'financialMonthlyRatePct') and not private.can_manage(org) then
    raise exception 'Esto lo registra Gerencia.' using errcode = 'insufficient_privilege';
  end if;
  if (p ? 'contractRevisions' or p ? 'paymentTerms' or p ? 'boms' or p ? 'clients') and not private.can_quote(org) then
    raise exception 'Esto lo registra Administración.' using errcode = 'insufficient_privilege';
  end if;
  if p ? 'suppliers' and not (private.can_quote(org) or private.can_buy(org)) then
    raise exception 'Los proveedores los cargan Administración o Compras.' using errcode = 'insufficient_privilege';
  end if;
  if p ? 'handovers' and not private.can_plant(org) then
    raise exception 'La entrega al cliente la confirma el Jefe de planta.' using errcode = 'insufficient_privilege';
  end if;
  -- Solo se eliminan borradores de BOM y costos generales; el resto es historial.
  for k in select jsonb_object_keys(p) loop
    if k <> 'financialMonthlyRatePct' and jsonb_array_length(coalesce(p -> k -> 'remove', '[]'::jsonb)) > 0 and k not in ('boms', 'generalCosts') then
      raise exception 'Este registro no se elimina: queda en el historial.' using errcode = 'check_violation';
    end if;
  end loop;

  -- Serializa las escrituras de la empresa (los chequeos de saldo y de numeración dependen del orden).
  perform 1 from public.organizations o where o.id = org for update;

  if p ? 'rubroCatalog' then
    insert into public.rubro_catalog (organization_id, id, name, name_key, active)
    select org, x.id, x.name, '', coalesce(x.active, true)
    from jsonb_to_recordset(coalesce(p -> 'rubroCatalog' -> 'upsert', '[]')) as x(id text, name text, active boolean)
    on conflict (organization_id, id) do update set name = excluded.name, active = excluded.active;
  end if;

  if p ? 'rates' then
    insert into public.rate_records (organization_id, id, scope, subject_id, hourly_rate, valid_from, created_by)
    select org, x.id, x.scope, x."subjectId", round(x."hourlyRate", 2), x."validFrom", actor
    from jsonb_to_recordset(coalesce(p -> 'rates' -> 'upsert', '[]')) as x(id text, scope text, "subjectId" text, "hourlyRate" numeric, "validFrom" date)
    on conflict (organization_id, id) do nothing;
  end if;

  if p ? 'generalCosts' then
    insert into public.general_costs (organization_id, id, name, monthly_amount)
    select org, x.id, btrim(x.name), round(x."monthlyAmount", 2)
    from jsonb_to_recordset(coalesce(p -> 'generalCosts' -> 'upsert', '[]')) as x(id text, name text, "monthlyAmount" numeric)
    on conflict (organization_id, id) do update set name = excluded.name, monthly_amount = excluded.monthly_amount;
    delete from public.general_costs g
    where g.organization_id = org and g.id in (select jsonb_array_elements_text(coalesce(p -> 'generalCosts' -> 'remove', '[]')));
  end if;

  if p ? 'financialMonthlyRatePct' then
    if jsonb_typeof(p -> 'financialMonthlyRatePct') <> 'number' or (p ->> 'financialMonthlyRatePct')::numeric < 0 or (p ->> 'financialMonthlyRatePct')::numeric > 50 then
      raise exception 'La tasa mensual va de 0 a 50 %%.' using errcode = 'check_violation';
    end if;
    insert into public.cost_settings (organization_id, financial_monthly_rate_pct)
    values (org, round((p ->> 'financialMonthlyRatePct')::numeric, 2))
    on conflict (organization_id) do update set financial_monthly_rate_pct = excluded.financial_monthly_rate_pct, updated_at = now();
  end if;

  if p ? 'clients' then
    if exists (
      select 1 from jsonb_to_recordset(coalesce(p -> 'clients' -> 'upsert', '[]')) as x(id text, name text)
      join public.clients c on c.organization_id = org and c.name_key = private.name_key(x.name) and c.id <> x.id
    ) then raise exception 'Ya hay un cliente con ese nombre.' using errcode = 'unique_violation'; end if;
    insert into public.clients (organization_id, id, name, name_key, contact, phone, email, address, notes, active)
    select org, x.id, x.name, '', nullif(btrim(x.contact), ''), nullif(btrim(x.phone), ''), nullif(btrim(x.email), ''),
           nullif(btrim(x.address), ''), nullif(btrim(x.notes), ''), coalesce(x.active, true)
    from jsonb_to_recordset(coalesce(p -> 'clients' -> 'upsert', '[]')) as x(id text, name text, contact text, phone text, email text, address text, notes text, active boolean)
    on conflict (organization_id, id) do update set name = excluded.name, contact = excluded.contact, phone = excluded.phone,
      email = excluded.email, address = excluded.address, notes = excluded.notes, active = excluded.active;
  end if;

  if p ? 'suppliers' then
    insert into public.suppliers (organization_id, id, name, name_key, contact, phone, email, address, notes, catalog_url, website, active)
    select org, x.id, x.name, '', nullif(btrim(x.contact), ''), nullif(btrim(x.phone), ''), nullif(btrim(x.email), ''), nullif(btrim(x.address), ''),
           nullif(btrim(x.notes), ''), nullif(btrim(x."catalogUrl"), ''), nullif(btrim(x.website), ''), coalesce(x.active, true)
    from jsonb_to_recordset(coalesce(p -> 'suppliers' -> 'upsert', '[]'))
      as x(id text, name text, contact text, phone text, email text, address text, notes text, "catalogUrl" text, website text, active boolean)
    on conflict (organization_id, id) do update set name = excluded.name, contact = excluded.contact, phone = excluded.phone, email = excluded.email,
      address = excluded.address, notes = excluded.notes, catalog_url = excluded.catalog_url, website = excluded.website, active = excluded.active;
  end if;

  if p ? 'salesInvoices' then
    insert into public.sales_invoices (organization_id, id, project_id, number, date, amount, notes, created_by)
    select org, x.id, x."projectId", x.number, x.date, round(x.amount, 2), nullif(btrim(x.notes), ''), actor
    from jsonb_to_recordset(coalesce(p -> 'salesInvoices' -> 'upsert', '[]')) as x(id text, "projectId" text, number text, date date, amount numeric, notes text)
    on conflict (organization_id, id) do nothing;
  end if;

  if p ? 'collections' then
    if exists (
      select 1 from jsonb_to_recordset(coalesce(p -> 'collections' -> 'upsert', '[]')) as x(id text, "invoiceId" text)
      join public.collections c on c.organization_id = org and c.id = x.id
      where c.invoice_id is not null and c.invoice_id is distinct from nullif(x."invoiceId", '')
    ) then raise exception 'Un cobro registrado no se modifica (solo se aplica un anticipo a una factura).' using errcode = 'check_violation'; end if;
    -- Un cobro nuevo, o un anticipo (sin factura) que se aplica a una factura: nada más cambia.
    insert into public.collections (organization_id, id, project_id, invoice_id, date, amount, notes, created_by)
    select org, x.id, x."projectId", nullif(x."invoiceId", ''), x.date, round(x.amount, 2), nullif(btrim(x.notes), ''), actor
    from jsonb_to_recordset(coalesce(p -> 'collections' -> 'upsert', '[]')) as x(id text, "projectId" text, "invoiceId" text, date date, amount numeric, notes text)
    on conflict (organization_id, id) do update set invoice_id = excluded.invoice_id
      where public.collections.invoice_id is null and excluded.invoice_id is not null;
  end if;

  if p ? 'supplierPayments' then
    insert into public.supplier_payments (organization_id, id, order_id, date, amount, reference, paid_by)
    select org, x.id, x."orderId", x.date, round(x.amount, 2), btrim(x.reference), actor
    from jsonb_to_recordset(coalesce(p -> 'supplierPayments' -> 'upsert', '[]')) as x(id text, "orderId" text, date date, amount numeric, reference text)
    on conflict (organization_id, id) do nothing;
  end if;

  if p ? 'contractRevisions' then
    insert into public.contract_revisions (organization_id, id, project_id, previous, next, reason, by)
    select org, x.id, x."projectId", 0, round(x.next, 2), btrim(x.reason), actor
    from jsonb_to_recordset(coalesce(p -> 'contractRevisions' -> 'upsert', '[]')) as x(id text, "projectId" text, next numeric, reason text)
    on conflict (organization_id, id) do nothing;
  end if;

  if p ? 'paymentTerms' then
    insert into public.payment_terms (organization_id, project_id, days_after_delivery, schedule, updated_by)
    select org, x."projectId", coalesce(x."daysAfterDelivery", 0), coalesce(x.schedule, '[]'::jsonb), actor
    from jsonb_to_recordset(coalesce(p -> 'paymentTerms' -> 'upsert', '[]')) as x("projectId" text, "daysAfterDelivery" integer, schedule jsonb)
    on conflict (organization_id, project_id) do update set days_after_delivery = excluded.days_after_delivery, schedule = excluded.schedule,
      updated_by = excluded.updated_by;
  end if;

  if p ? 'boms' then
    -- Borradores que se quitaron (las versiones publicadas no se eliminan: el disparador lo impide).
    delete from public.bom_versions v
    where v.organization_id = org and v.id in (select jsonb_array_elements_text(coalesce(p -> 'boms' -> 'remove', '[]')));
    for b in select * from jsonb_array_elements(coalesce(p -> 'boms' -> 'upsert', '[]')) loop
      v_id := b ->> 'id';
      select v.status into v_status from public.bom_versions v where v.organization_id = org and v.id = v_id;
      if not found then
        insert into public.bom_versions (organization_id, id, project_id, item_id, version, notes, created_by)
        values (org, v_id, b ->> 'projectId', b ->> 'itemId', 1, nullif(btrim(b ->> 'notes'), ''), actor);
      elsif v_status = 'published' then
        raise exception 'Una versión publicada del BOM no se modifica: se crea una versión nueva.' using errcode = 'check_violation';
      else
        update public.bom_versions v set notes = nullif(btrim(b ->> 'notes'), '') where v.organization_id = org and v.id = v_id;
      end if;
      -- Las líneas del borrador se reemplazan completas.
      delete from public.bom_lines l where l.organization_id = org and l.bom_id = v_id;
      insert into public.bom_lines (organization_id, id, bom_id, position, material, material_id, spec, quantity, unit, budget_line_id)
      select org, e.v ->> 'id', v_id, (e.ord - 1)::integer, btrim(e.v ->> 'material'), nullif(e.v ->> 'materialId', ''), nullif(btrim(e.v ->> 'spec'), ''),
             (e.v ->> 'quantity')::numeric, btrim(e.v ->> 'unit'), nullif(e.v ->> 'budgetLineId', '')
      from jsonb_array_elements(coalesce(b -> 'lines', '[]')) with ordinality as e(v, ord);
      if b ->> 'status' = 'published' then
        update public.bom_versions v set status = 'published' where v.organization_id = org and v.id = v_id;
      end if;
    end loop;
  end if;

  if p ? 'handovers' then
    insert into public.client_handovers (organization_id, id, project_id, date, by, notes)
    select org, x.id, x."projectId", x.date, actor, nullif(btrim(x.notes), '')
    from jsonb_to_recordset(coalesce(p -> 'handovers' -> 'upsert', '[]')) as x(id text, "projectId" text, date date, notes text)
    on conflict (organization_id, id) do nothing;
  end if;

  if p ? 'internalHours' then
    -- Las horas son de quien las carga; el costo por hora lo congela la base (solo si van a un proyecto).
    insert into public.staff_hours (organization_id, id, user_id, employee, project_id, date, hours, task, hourly_cost)
    select org, x.id, uid, actor, nullif(x."projectId", ''), x.date, round(x.hours, 2), btrim(x.task),
           case when nullif(x."projectId", '') is not null then private.staff_hourly_cost(org, uid, x.date) end
    from jsonb_to_recordset(coalesce(p -> 'internalHours' -> 'upsert', '[]')) as x(id text, "projectId" text, date date, hours numeric, task text)
    on conflict (organization_id, id) do nothing;
  end if;
end;
$$;

-- ── Carga masiva del ledger (demo de la empresa / empezar de cero): solo Administrativo ─────────────────────────
-- Borra los registros de la empresa y, si se pasa `p`, carga ese ledger (mismo contrato que ledger_workspace). Corre
-- sin las reglas del negocio (es una foto de datos de ejemplo), igual que reset_workspace.
create or replace function public.ledger_reset(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  org uuid := private.my_admin_org();
  b jsonb;
begin
  perform set_config('blerp.bulk', 'on', true);

  delete from public.supplier_payments where organization_id = org;
  delete from public.collections where organization_id = org;
  delete from public.sales_invoices where organization_id = org;
  delete from public.contract_revisions where organization_id = org;
  delete from public.payment_terms where organization_id = org;
  delete from public.bom_versions where organization_id = org;
  delete from public.client_handovers where organization_id = org;
  delete from public.staff_hours where organization_id = org;
  delete from public.general_costs where organization_id = org;
  delete from public.rate_records where organization_id = org;
  delete from public.rubro_catalog where organization_id = org;
  delete from public.suppliers where organization_id = org;
  -- Los clientes que siguen en algún proyecto se conservan (el proyecto los referencia).
  delete from public.clients c where c.organization_id = org
    and not exists (select 1 from public.projects pr where pr.organization_id = org and pr.client_id = c.id);
  update public.cost_settings set financial_monthly_rate_pct = 5 where organization_id = org;

  if p is not null and jsonb_typeof(p) = 'object' then
    insert into public.rubro_catalog (organization_id, id, name, name_key, active)
    select org, x.id, x.name, '', coalesce(x.active, true)
    from jsonb_to_recordset(coalesce(p -> 'rubroCatalog', '[]')) as x(id text, name text, active boolean);

    insert into public.rate_records (organization_id, id, scope, subject_id, hourly_rate, valid_from, created_by)
    select org, x.id, x.scope, x."subjectId", x."hourlyRate", x."validFrom", coalesce(x."createdBy", '')
    from jsonb_to_recordset(coalesce(p -> 'rates', '[]')) as x(id text, scope text, "subjectId" text, "hourlyRate" numeric, "validFrom" date, "createdBy" text);

    insert into public.general_costs (organization_id, id, name, monthly_amount)
    select org, x.id, x.name, x."monthlyAmount"
    from jsonb_to_recordset(coalesce(p -> 'generalCosts', '[]')) as x(id text, name text, "monthlyAmount" numeric);

    -- Clientes del escenario: si ya existe uno con ese nombre, se completan sus datos de contacto.
    insert into public.clients (organization_id, id, name, name_key, contact, phone, email, address, notes, active)
    select org, x.id, x.name, '', nullif(x.contact, ''), nullif(x.phone, ''), nullif(x.email, ''), nullif(x.address, ''), nullif(x.notes, ''), coalesce(x.active, true)
    from jsonb_to_recordset(coalesce(p -> 'clients', '[]')) as x(id text, name text, contact text, phone text, email text, address text, notes text, active boolean)
    where not exists (select 1 from public.clients c where c.organization_id = org and c.name_key = private.name_key(x.name))
    on conflict (organization_id, id) do nothing;
    update public.clients c set contact = nullif(x.contact, ''), phone = nullif(x.phone, ''), email = nullif(x.email, ''), address = nullif(x.address, ''),
      notes = nullif(x.notes, ''), active = coalesce(x.active, true)
    from jsonb_to_recordset(coalesce(p -> 'clients', '[]')) as x(id text, name text, contact text, phone text, email text, address text, notes text, active boolean)
    where c.organization_id = org and c.name_key = private.name_key(x.name);

    insert into public.suppliers (organization_id, id, name, name_key, contact, phone, email, address, notes, catalog_url, website, active)
    select org, x.id, x.name, '', nullif(x.contact, ''), nullif(x.phone, ''), nullif(x.email, ''), nullif(x.address, ''), nullif(x.notes, ''),
           nullif(x."catalogUrl", ''), nullif(x.website, ''), coalesce(x.active, true)
    from jsonb_to_recordset(coalesce(p -> 'suppliers', '[]'))
      as x(id text, name text, contact text, phone text, email text, address text, notes text, "catalogUrl" text, website text, active boolean);

    insert into public.sales_invoices (organization_id, id, project_id, number, date, amount, notes, created_by, created_at)
    select org, x.id, x."projectId", x.number, x.date, x.amount, nullif(x.notes, ''), coalesce(x."createdBy", ''), coalesce(x."createdAt", now())
    from jsonb_to_recordset(coalesce(p -> 'salesInvoices', '[]'))
      as x(id text, "projectId" text, number text, date date, amount numeric, notes text, "createdBy" text, "createdAt" timestamptz);

    insert into public.collections (organization_id, id, project_id, invoice_id, date, amount, notes, created_by, created_at)
    select org, x.id, x."projectId", nullif(x."invoiceId", ''), x.date, x.amount, nullif(x.notes, ''), coalesce(x."createdBy", ''), coalesce(x."createdAt", now())
    from jsonb_to_recordset(coalesce(p -> 'collections', '[]'))
      as x(id text, "projectId" text, "invoiceId" text, date date, amount numeric, notes text, "createdBy" text, "createdAt" timestamptz);

    insert into public.supplier_payments (organization_id, id, order_id, date, amount, reference, paid_by, paid_at)
    select org, x.id, x."orderId", x.date, x.amount, x.reference, coalesce(x.by, ''), coalesce(x.at, now())
    from jsonb_to_recordset(coalesce(p -> 'supplierPayments', '[]')) as x(id text, "orderId" text, date date, amount numeric, reference text, by text, at timestamptz);

    insert into public.contract_revisions (organization_id, id, project_id, previous, next, reason, by, at)
    select org, x.id, x."projectId", x.previous, x.next, x.reason, coalesce(x.by, ''), coalesce(x.at, now())
    from jsonb_to_recordset(coalesce(p -> 'contractRevisions', '[]'))
      as x(id text, "projectId" text, previous numeric, next numeric, reason text, by text, at timestamptz);

    insert into public.payment_terms (organization_id, project_id, days_after_delivery, schedule)
    select org, x."projectId", coalesce(x."daysAfterDelivery", 0), coalesce(x.schedule, '[]'::jsonb)
    from jsonb_to_recordset(coalesce(p -> 'paymentTerms', '[]')) as x("projectId" text, "daysAfterDelivery" integer, schedule jsonb);

    for b in select * from jsonb_array_elements(coalesce(p -> 'boms', '[]')) loop
      insert into public.bom_versions (organization_id, id, project_id, item_id, version, status, notes, created_by, created_at, published_at)
      values (org, b ->> 'id', b ->> 'projectId', b ->> 'itemId', (b ->> 'version')::integer, b ->> 'status', nullif(b ->> 'notes', ''),
              coalesce(b ->> 'createdBy', ''), coalesce((b ->> 'createdAt')::timestamptz, now()), (b ->> 'publishedAt')::timestamptz);
      insert into public.bom_lines (organization_id, id, bom_id, position, material, material_id, spec, quantity, unit, budget_line_id)
      select org, e.v ->> 'id', b ->> 'id', (e.ord - 1)::integer, e.v ->> 'material', nullif(e.v ->> 'materialId', ''), nullif(e.v ->> 'spec', ''),
             (e.v ->> 'quantity')::numeric, e.v ->> 'unit', nullif(e.v ->> 'budgetLineId', '')
      from jsonb_array_elements(coalesce(b -> 'lines', '[]')) with ordinality as e(v, ord);
    end loop;

    insert into public.client_handovers (organization_id, id, project_id, date, by, notes)
    select org, x.id, x."projectId", x.date, coalesce(x.by, ''), nullif(x.notes, '')
    from jsonb_to_recordset(coalesce(p -> 'handovers', '[]')) as x(id text, "projectId" text, date date, by text, notes text);

    -- Horas propias del escenario: son de ejemplo, de quien carga la demo.
    insert into public.staff_hours (organization_id, id, user_id, employee, project_id, date, hours, task, hourly_cost)
    select org, x.id, (select auth.uid()), coalesce(x."employeeId", ''), nullif(x."projectId", ''), x.date, x.hours, x.task, x."hourlyCost"
    from jsonb_to_recordset(coalesce(p -> 'internalHours', '[]'))
      as x(id text, "employeeId" text, "projectId" text, date date, hours numeric, task text, "hourlyCost" numeric);

    if jsonb_typeof(p -> 'financialMonthlyRatePct') = 'number' then
      insert into public.cost_settings (organization_id, financial_monthly_rate_pct) values (org, (p ->> 'financialMonthlyRatePct')::numeric)
      on conflict (organization_id) do update set financial_monthly_rate_pct = excluded.financial_monthly_rate_pct;
    end if;
  end if;

  perform set_config('blerp.bulk', 'off', true);
end;
$$;

-- ── Cierre de proyecto: quién cerró y con qué costos pendientes (solo columnas nuevas; admin_record_closure las toma) ──

revoke all on function public.ledger_workspace() from public, anon;
revoke all on function public.ledger_commit(jsonb) from public, anon;
revoke all on function public.ledger_reset(jsonb) from public, anon;
grant execute on function public.ledger_workspace() to authenticated;
grant execute on function public.ledger_commit(jsonb) to authenticated;
grant execute on function public.ledger_reset(jsonb) to authenticated;

COMMIT;
