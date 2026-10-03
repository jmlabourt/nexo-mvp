-- ─────────────────────────────────────────────────────────────
-- NEXO — schema inicial
-- Cada usuario pertenece a una empresa (organization). Todos los datos
-- cuelgan de la empresa y RLS solo deja ver/editar a sus miembros.
-- Los ids de dominio (p-1042, bl-xxxx…) se conservan como text; la PK
-- es (organization_id, id) para que dos empresas puedan tener la demo.
-- ─────────────────────────────────────────────────────────────

create schema if not exists private;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  demo_seeded boolean not null default false,
  alert_settings jsonb,
  created_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'member')),
  display_name text not null default '',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index organization_members_user_id_idx on public.organization_members (user_id);

create table public.projects (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  id text not null,
  code text not null,
  name text not null,
  client text not null default '',
  project_type text not null default '',
  description text not null default '',
  status text not null check (status in ('quotation', 'approved', 'purchasing', 'production', 'installation', 'completed')),
  start_date date not null,
  due_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sales_price numeric not null default 0,
  progress_percent numeric not null default 0,
  owner text not null default '',
  is_closed boolean not null default false,
  closed_at timestamptz,
  primary key (organization_id, id)
);

create table public.budget_lines (
  organization_id uuid not null,
  id text not null,
  project_id text not null,
  position integer not null default 0,
  category text not null,
  description text not null,
  material_id text,
  quantity numeric,
  unit text not null default '',
  unit_cost numeric not null,
  total numeric not null,
  notes text,
  primary key (organization_id, id),
  foreign key (organization_id, project_id) references public.projects (organization_id, id) on delete cascade
);
create index budget_lines_project_idx on public.budget_lines (organization_id, project_id);

create table public.purchase_entries (
  organization_id uuid not null,
  id text not null,
  project_id text not null,
  position integer not null default 0,
  material_id text,
  material_name text not null,
  quantity numeric not null,
  unit text not null default '',
  unit_cost numeric not null,
  total numeric not null,
  supplier text,
  date date not null,
  notes text,
  created_by text not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, id),
  foreign key (organization_id, project_id) references public.projects (organization_id, id) on delete cascade
);
create index purchase_entries_project_idx on public.purchase_entries (organization_id, project_id);

create table public.material_usages (
  organization_id uuid not null,
  id text not null,
  project_id text not null,
  position integer not null default 0,
  material_id text not null,
  material_name text not null,
  date date not null,
  quantity_consumed numeric not null,
  waste_quantity numeric not null default 0,
  reusable_leftover_quantity numeric not null default 0,
  unit text not null default '',
  unit_cost numeric not null,
  unit_cost_origin text not null check (unit_cost_origin in ('manual', 'purchase', 'budget', 'catalog', 'reusable_pool')),
  source text not null check (source in ('purchased_for_project', 'existing_stock', 'reused_leftover')),
  reusable_material_id text,
  notes text,
  created_by text not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, id),
  foreign key (organization_id, project_id) references public.projects (organization_id, id) on delete cascade
);
create index material_usages_project_idx on public.material_usages (organization_id, project_id);

create table public.actual_entries (
  organization_id uuid not null,
  id text not null,
  project_id text not null,
  position integer not null default 0,
  date date not null,
  type text not null check (type in ('labor', 'outsourcing', 'finishing', 'logistics', 'installation', 'unexpected', 'other')),
  category text not null,
  description text not null,
  amount numeric not null,
  supplier text,
  labor jsonb,
  notes text,
  created_by text not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, id),
  foreign key (organization_id, project_id) references public.projects (organization_id, id) on delete cascade
);
create index actual_entries_project_idx on public.actual_entries (organization_id, project_id);

create table public.activity_events (
  organization_id uuid not null,
  id text not null,
  project_id text not null,
  position integer not null default 0,
  at timestamptz not null,
  actor text not null,
  kind text not null,
  message text not null,
  primary key (organization_id, id),
  foreign key (organization_id, project_id) references public.projects (organization_id, id) on delete cascade
);
create index activity_events_project_idx on public.activity_events (organization_id, project_id);

create table public.reusable_materials (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  id text not null,
  position integer not null default 0,
  material_id text not null,
  material_name text not null,
  quantity numeric not null,
  unit text not null default '',
  unit_cost numeric not null,
  origin_project_id text not null,
  origin_project_name text not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, id)
);

create table public.resolved_alerts (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  alert_id text not null,
  resolved_at timestamptz not null default now(),
  primary key (organization_id, alert_id)
);

-- ── Membresía ──────────────────────────────────────────────

create or replace function private.is_org_member(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org and m.user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_org_member(uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.is_org_member(uuid) to authenticated;

-- Al registrarse (primer login con Google) se crea su empresa y queda como owner.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_org uuid;
  display text := coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''),
    split_part(coalesce(new.email, ''), '@', 1)
  );
begin
  insert into public.organizations (name) values ('Empresa de ' || display) returning id into new_org;
  insert into public.organization_members (organization_id, user_id, role, display_name)
  values (new_org, new.id, 'owner', display);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ── RLS ────────────────────────────────────────────────────

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.projects enable row level security;
alter table public.budget_lines enable row level security;
alter table public.purchase_entries enable row level security;
alter table public.material_usages enable row level security;
alter table public.actual_entries enable row level security;
alter table public.activity_events enable row level security;
alter table public.reusable_materials enable row level security;
alter table public.resolved_alerts enable row level security;

create policy "members read their organization" on public.organizations
  for select to authenticated using ((select private.is_org_member(id)));
create policy "members update their organization" on public.organizations
  for update to authenticated using ((select private.is_org_member(id))) with check ((select private.is_org_member(id)));

create policy "members read memberships of their organization" on public.organization_members
  for select to authenticated using ((select private.is_org_member(organization_id)));

do $$
declare
  t text;
begin
  foreach t in array array[
    'projects', 'budget_lines', 'purchase_entries', 'material_usages',
    'actual_entries', 'activity_events', 'reusable_materials', 'resolved_alerts'
  ]
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
