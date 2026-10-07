-- ─────────────────────────────────────────────────────────────
-- NEXO — stock con libro de movimientos, operarios, etapas, muebles y archivos
--
-- Migración ADITIVA: no borra ni modifica datos existentes.
--   · agrega tablas nuevas y columnas con valor por defecto;
--   · amplía el check de rol (owner | member | operator);
--   · reemplaza la función handle_new_user para que un operario invitado por mail
--     entre a la empresa que lo cargó (en vez de crear una empresa nueva);
--   · la tabla reusable_materials queda como estaba (ya no se usa; se conserva por si acaso).
-- ─────────────────────────────────────────────────────────────

-- ── Roles ──────────────────────────────────────────────────
alter table public.organization_members drop constraint if exists organization_members_role_check;
alter table public.organization_members
  add constraint organization_members_role_check check (role in ('owner', 'member', 'operator'));

create or replace function private.is_org_manager(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org and m.user_id = (select auth.uid()) and m.role in ('owner', 'member')
  );
$$;
revoke all on function private.is_org_manager(uuid) from public;
grant execute on function private.is_org_manager(uuid) to authenticated;

-- ── Proyectos: operarios asignados y línea base ────────────
alter table public.projects add column if not exists assigned_operator_ids text[] not null default '{}';
alter table public.projects add column if not exists baseline jsonb;

-- ── Registros existentes: vínculos nuevos (todos opcionales) ──
alter table public.actual_entries add column if not exists operator_id text;
alter table public.actual_entries add column if not exists stage text;
alter table public.actual_entries add column if not exists item_id text;
alter table public.material_usages add column if not exists lot_id text;
alter table public.material_usages add column if not exists item_id text;

-- ── Operarios ──────────────────────────────────────────────
create table if not exists public.operators (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  id text not null,
  position integer not null default 0,
  name text not null,
  role text not null default '',
  hourly_cost numeric not null check (hourly_cost > 0),
  active boolean not null default true,
  user_id uuid references auth.users (id) on delete set null,
  email text,
  created_at timestamptz not null default now(),
  primary key (organization_id, id)
);
create index if not exists operators_email_idx on public.operators (lower(email));

-- ── Stock: lotes y movimientos (el saldo se deriva, nunca se edita) ──
create table if not exists public.stock_lots (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  id text not null,
  material_id text not null,
  material_name text not null,
  unit text not null default '',
  unit_cost numeric not null check (unit_cost >= 0),
  kind text not null check (kind in ('purchase', 'leftover', 'opening')),
  supplier text,
  purchase_entry_id text,
  origin_project_id text,
  origin_project_name text,
  parent_lot_id text,
  location text,
  dims jsonb,
  notes text,
  created_by text not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, id)
);
create index if not exists stock_lots_material_idx on public.stock_lots (organization_id, material_id);

create table if not exists public.stock_movements (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  id text not null,
  lot_id text not null,
  position integer not null default 0,
  kind text not null check (kind in (
    'purchase_in', 'opening', 'assign', 'release', 'transfer', 'consume', 'waste',
    'to_leftover', 'leftover_in', 'supplier_return', 'adjustment'
  )),
  quantity numeric not null check (quantity > 0),
  from_place jsonb not null,
  to_place jsonb not null,
  date date not null,
  project_id text,
  item_id text,
  into_lot_id text,
  group_id text,
  note text,
  created_by text not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, id)
);
create index if not exists stock_movements_lot_idx on public.stock_movements (organization_id, lot_id);
create index if not exists stock_movements_project_idx on public.stock_movements (organization_id, project_id);

-- ── Pedidos de material desde Taller ───────────────────────
create table if not exists public.material_requests (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  id text not null,
  position integer not null default 0,
  project_id text not null,
  material_id text not null,
  material_name text not null,
  quantity numeric not null check (quantity > 0),
  unit text not null default '',
  note text,
  requested_by text not null,
  status text not null default 'open' check (status in ('open', 'resolved', 'cancelled')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text,
  primary key (organization_id, id)
);

-- ── Hijos del proyecto: muebles, bitácora de etapas, archivos ──
create table if not exists public.project_items (
  organization_id uuid not null,
  id text not null,
  project_id text not null,
  position integer not null default 0,
  name text not null,
  description text,
  quantity numeric not null default 1,
  primary key (organization_id, id),
  foreign key (organization_id, project_id) references public.projects (organization_id, id) on delete cascade
);
create index if not exists project_items_project_idx on public.project_items (organization_id, project_id);

create table if not exists public.stage_logs (
  organization_id uuid not null,
  id text not null,
  project_id text not null,
  position integer not null default 0,
  stage text not null check (stage in ('purchasing', 'production', 'installation')),
  date date not null,
  kind text not null check (kind in ('note', 'incident')),
  text text not null,
  responsible text,
  item_id text,
  created_by text not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, id),
  foreign key (organization_id, project_id) references public.projects (organization_id, id) on delete cascade
);
create index if not exists stage_logs_project_idx on public.stage_logs (organization_id, project_id);

create table if not exists public.attachments (
  organization_id uuid not null,
  id text not null,
  project_id text not null,
  position integer not null default 0,
  item_id text,
  stage text check (stage in ('purchasing', 'production', 'installation')),
  stage_log_id text,
  name text not null,
  mime_type text not null default '',
  size bigint not null default 0,
  storage_path text not null,
  uploaded_by text not null,
  uploaded_at timestamptz not null default now(),
  primary key (organization_id, id),
  foreign key (organization_id, project_id) references public.projects (organization_id, id) on delete cascade
);
create index if not exists attachments_project_idx on public.attachments (organization_id, project_id);

-- ── RLS ────────────────────────────────────────────────────
alter table public.operators enable row level security;
alter table public.stock_lots enable row level security;
alter table public.stock_movements enable row level security;
alter table public.material_requests enable row level security;
alter table public.project_items enable row level security;
alter table public.stage_logs enable row level security;
alter table public.attachments enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['stock_lots', 'stock_movements', 'material_requests', 'project_items', 'stage_logs', 'attachments']
  loop
    execute format(
      'create policy "members manage %1$s" on public.%1$I for all to authenticated
         using ((select private.is_org_member(organization_id)))
         with check ((select private.is_org_member(organization_id)))',
      t
    );
  end loop;
end;
$$;

-- Operarios: todos los miembros los leen; sólo Gestión los crea o modifica.
create policy "members read operators" on public.operators
  for select to authenticated using ((select private.is_org_member(organization_id)));
create policy "managers write operators" on public.operators
  for insert to authenticated with check ((select private.is_org_manager(organization_id)));
create policy "managers update operators" on public.operators
  for update to authenticated
  using ((select private.is_org_manager(organization_id)))
  with check ((select private.is_org_manager(organization_id)));
create policy "managers delete operators" on public.operators
  for delete to authenticated using ((select private.is_org_manager(organization_id)));

-- ── Alta de usuarios: un operario invitado entra a la empresa que lo cargó ──
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
  where o.user_id is null and o.active and new.email is not null and lower(o.email) = lower(new.email)
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

-- ── Archivos: bucket privado, una carpeta por empresa ──────
insert into storage.buckets (id, name, public)
values ('project-files', 'project-files', false)
on conflict (id) do nothing;

create policy "members read project files" on storage.objects
  for select to authenticated
  using (bucket_id = 'project-files' and (select private.is_org_member(((storage.foldername(name))[1])::uuid)));
create policy "members upload project files" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'project-files' and (select private.is_org_member(((storage.foldername(name))[1])::uuid)));
create policy "managers delete project files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'project-files' and (select private.is_org_manager(((storage.foldername(name))[1])::uuid)));
