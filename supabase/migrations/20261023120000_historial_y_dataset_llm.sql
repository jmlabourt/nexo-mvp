-- Blerp — Historial y dataset para estimación (LLM / modelo).
-- Aditiva: no cambia ninguna tabla ni función existente salvo agregar projects.client_id.
-- Principios (ver docs/DATOS_PARA_LLM.md):
--   · Cada cifra se calcula UNA vez (en lib/calculations.ts) y se congela al cerrar el proyecto.
--   · El cierre es un registro histórico: no se edita ni se borra.
--   · Lo demo se marca y nunca cuenta como dato real de entrenamiento.
--   · Todo es por empresa (RLS) y solo lo ven los usuarios Administrativos con permiso comercial.
--   · Lo que produce un modelo se guarda aparte (model_predictions) y nunca pisa cifras por reglas.
BEGIN;

-- ── 1. Clientes como entidad (decisión D5) ────────────────────────────────────

/** Clave para comparar nombres: minúsculas, sin acentos, sin espacios de más. */
create or replace function private.name_key(p text) returns text
language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(
    translate(lower(coalesce(p, '')), 'áàäâéèëêíìïîóòöôúùüûñ', 'aaaaeeeeiiiioooouuuun'),
    '\s+', ' ', 'g'));
$$;

create table if not exists public.clients (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  id text not null,
  name text not null,
  name_key text not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, id),
  unique (organization_id, name_key)
);
alter table public.clients enable row level security;
revoke all on public.clients from anon;
create policy "managers read clients" on public.clients for select to authenticated
  using ((select private.is_org_manager(organization_id)));

alter table public.projects add column if not exists client_id text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'projects_client_fk') then
    alter table public.projects add constraint projects_client_fk
      foreign key (organization_id, client_id) references public.clients (organization_id, id);
  end if;
end $$;
create index if not exists projects_client_idx on public.projects (organization_id, client_id);

/**
 * El texto del proyecto sigue siendo lo que carga el usuario; la base lo vincula sola a un cliente
 * normalizado ("retail sur " y "Retail Sur" son el mismo). Así la app no cambia y el historial queda limpio.
 */
create or replace function private.sync_project_client() returns trigger
language plpgsql security definer set search_path = '' as $$
declare k text := private.name_key(new.client);
begin
  if k = '' then
    new.client_id := null;
    return new;
  end if;
  if tg_op = 'UPDATE' and new.client is not distinct from old.client and new.client_id is not null then
    return new;
  end if;
  insert into public.clients (organization_id, id, name, name_key)
  values (new.organization_id, 'cli-' || substr(md5(new.organization_id::text || k), 1, 12), btrim(new.client), k)
  on conflict do nothing;
  select c.id into new.client_id from public.clients c where c.organization_id = new.organization_id and c.name_key = k;
  return new;
end;
$$;
revoke all on function private.sync_project_client() from public, anon, authenticated;
create trigger sync_project_client before insert or update of client on public.projects
  for each row execute function private.sync_project_client();

-- Carga de los proyectos existentes (sin tocar updated_at ni disparar reglas de negocio).
select set_config('blerp.bulk', 'on', true);
insert into public.clients (organization_id, id, name, name_key)
select p.organization_id,
       'cli-' || substr(md5(p.organization_id::text || private.name_key(p.client)), 1, 12),
       (array_agg(btrim(p.client) order by p.created_at))[1],
       private.name_key(p.client)
from public.projects p
where private.name_key(p.client) <> ''
group by p.organization_id, private.name_key(p.client)
on conflict do nothing;
update public.projects p
set client_id = c.id
from public.clients c
where c.organization_id = p.organization_id and c.name_key = private.name_key(p.client) and p.client_id is distinct from c.id;
select set_config('blerp.bulk', 'off', true);

-- ── 2. Cierre congelado del proyecto ──────────────────────────────────────────

/**
 * Qué pasó en un proyecto terminado, congelado al cerrarlo. Es la unidad de aprendizaje:
 * presupuesto vs. real por categoría, horas por rubro, materiales, productos y resumen en texto.
 * Las cifras las calcula la app con las mismas funciones de siempre (una sola fuente);
 * los datos de identidad (tipo, fechas, precio, cliente) salen de la tabla projects, no del cliente.
 */
create table if not exists public.project_closures (
  organization_id uuid not null,
  project_id text not null,
  schema_version integer not null default 1,
  closed_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  recorded_by uuid default auth.uid(),
  /** app = capturado en Blerp · imported = importado de planillas · demo = datos de demostración. */
  data_origin text not null check (data_origin in ('app', 'imported', 'demo')),
  project_code text not null,
  project_name text not null,
  client_id text,
  project_type text not null,
  start_date date not null,
  due_date date not null,
  planned_days integer,
  actual_days integer,
  first_cost_date date,
  last_cost_date date,
  sales_price numeric not null,
  budget_total numeric not null,
  final_cost numeric not null,
  /** Nulos cuando el proyecto no tiene precio de venta (no hay margen que calcular). */
  expected_margin numeric,
  final_margin numeric,
  margin_delta_points numeric,
  /** {"materials": 4000000, "labor": …} con las siete categorías de reporte. */
  budget_by_category jsonb not null,
  actual_by_category jsonb not null,
  /** {"carpinteria_madera": {"planned_hours": 120, "actual_hours": 140, "actual_cost": 2660000}} */
  hours_by_rubro jsonb not null default '{}'::jsonb,
  /** [{material_id, material_name, unit, budgeted_qty, purchased_qty, consumed_qty, waste_qty, leftover_qty, imputed_cost, …}] */
  materials jsonb not null default '[]'::jsonb,
  /** [{name, quantity, completed_units, rubros: [{rubro, hours, workers}]}] */
  items jsonb not null default '[]'::jsonb,
  main_deviation_category text,
  main_deviation_amount numeric,
  /** Resumen determinístico en español (sin IA): lo que un LLM o una persona lee primero. */
  summary_text text not null,
  primary key (organization_id, project_id),
  foreign key (organization_id, project_id) references public.projects (organization_id, id) on delete cascade,
  check (jsonb_typeof(budget_by_category) = 'object' and jsonb_typeof(actual_by_category) = 'object'),
  check (jsonb_typeof(materials) = 'array' and jsonb_typeof(items) = 'array')
);
create index if not exists project_closures_type_idx on public.project_closures (organization_id, project_type, closed_at desc);
create index if not exists project_closures_client_idx on public.project_closures (organization_id, client_id);

alter table public.project_closures enable row level security;
revoke all on public.project_closures from anon;
create policy "managers read closures" on public.project_closures for select to authenticated
  using ((select private.is_org_manager(organization_id)));
create policy "managers add closures" on public.project_closures for insert to authenticated
  with check (
    (select private.is_org_manager(organization_id))
    and exists (
      select 1 from public.projects p
      where p.organization_id = project_closures.organization_id and p.id = project_closures.project_id and p.is_closed
    )
  );

create or replace function private.guard_closure_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if private.bulk_loading() then return coalesce(new, old); end if;
  -- Se borra el proyecto (o la empresa): el cierre se va con él.
  if tg_op = 'DELETE' and not exists (
    select 1 from public.projects p where p.organization_id = old.organization_id and p.id = old.project_id
  ) then
    return old;
  end if;
  raise exception 'El cierre de un proyecto es un registro histórico: no se edita ni se borra.' using errcode = 'check_violation';
end;
$$;
revoke all on function private.guard_closure_immutable() from public, anon, authenticated;
create trigger guard_closure_immutable before update or delete on public.project_closures
  for each row execute function private.guard_closure_immutable();

-- ── 3. Curaduría: excluir atípicos del aprendizaje, con motivo ───────────────

create table if not exists public.closure_reviews (
  organization_id uuid not null,
  project_id text not null,
  excluded boolean not null default false,
  reason text,
  reviewed_by uuid default auth.uid(),
  reviewed_at timestamptz not null default now(),
  primary key (organization_id, project_id),
  foreign key (organization_id, project_id) references public.project_closures (organization_id, project_id) on delete cascade,
  -- Excluir un proyecto del aprendizaje exige explicar por qué (queda auditable).
  check (not excluded or length(btrim(coalesce(reason, ''))) >= 3)
);
alter table public.closure_reviews enable row level security;
revoke all on public.closure_reviews from anon;
create policy "managers read closure reviews" on public.closure_reviews for select to authenticated
  using ((select private.is_org_manager(organization_id)));
create policy "managers add closure reviews" on public.closure_reviews for insert to authenticated
  with check ((select private.is_org_manager(organization_id)));
create policy "managers change closure reviews" on public.closure_reviews for update to authenticated
  using ((select private.is_org_manager(organization_id)))
  with check ((select private.is_org_manager(organization_id)));

create or replace function private.touch_closure_review() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.reviewed_by := auth.uid();
  new.reviewed_at := now();
  return new;
end;
$$;
revoke all on function private.touch_closure_review() from public, anon, authenticated;
create trigger touch_closure_review before insert or update on public.closure_reviews
  for each row execute function private.touch_closure_review();

-- ── 4. Predicciones guardadas (estadística, red neuronal o LLM) ──────────────

/**
 * Todo lo que un modelo estime se guarda con su versión, sus datos de entrada y los proyectos
 * comparables usados, para poder explicarlo y auditarlo. Nunca pisa el presupuesto base ni el margen proyectado.
 * Contrato sugerido de "output": {"margin_low": 22.1, "margin_median": 27.4, "margin_high": 31.0, "notes": "…"} (rango, no un número).
 */
create table if not exists public.model_predictions (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  id text not null,
  /** Opcional: una estimación puede hacerse sobre una cotización que todavía no es proyecto. */
  project_id text,
  kind text not null check (kind in ('statistics', 'neural_network', 'llm')),
  model_name text not null,
  model_version text not null,
  input jsonb not null,
  output jsonb not null,
  comparable_project_ids text[] not null default '{}',
  sample_size integer not null default 0 check (sample_size >= 0),
  /** true si algún comparable era dato de demostración: la pantalla tiene que decirlo. */
  based_on_demo boolean not null default false,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (organization_id, id)
);
create index if not exists model_predictions_project_idx on public.model_predictions (organization_id, project_id);
create index if not exists model_predictions_created_idx on public.model_predictions (organization_id, created_at desc);

alter table public.model_predictions enable row level security;
revoke all on public.model_predictions from anon;
create policy "managers read predictions" on public.model_predictions for select to authenticated
  using ((select private.is_org_manager(organization_id)));
create policy "managers add predictions" on public.model_predictions for insert to authenticated
  with check ((select private.is_org_manager(organization_id)) and created_by = (select auth.uid()));
create trigger guard_model_predictions before update or delete on public.model_predictions
  for each row execute function private.guard_append_only();

-- ── 5. Vistas de dataset (respetan RLS de quien consulta) ────────────────────

create or replace view public.dataset_closed_projects with (security_invoker = true) as
select
  c.*,
  cl.name as client_name,
  coalesce(r.excluded, false) as excluded,
  r.reason as excluded_reason,
  -- Entrena solo lo real y no excluido. Los datos demo ilustran la interfaz, no demuestran nada.
  (c.data_origin <> 'demo' and not coalesce(r.excluded, false)) as usable_for_training
from public.project_closures c
left join public.clients cl on cl.organization_id = c.organization_id and cl.id = c.client_id
left join public.closure_reviews r on r.organization_id = c.organization_id and r.project_id = c.project_id;

/** Una fila por proyecto y categoría: lo que necesita una tabla de entrenamiento o un kNN. */
create or replace view public.dataset_category_deviation with (security_invoker = true) as
select
  d.organization_id, d.project_id, d.project_type, d.data_origin, d.closed_at, d.usable_for_training,
  k.category,
  coalesce((d.budget_by_category ->> k.category)::numeric, 0) as budget,
  coalesce((d.actual_by_category ->> k.category)::numeric, 0) as actual,
  coalesce((d.actual_by_category ->> k.category)::numeric, 0) - coalesce((d.budget_by_category ->> k.category)::numeric, 0) as deviation_amount,
  case when coalesce((d.budget_by_category ->> k.category)::numeric, 0) > 0
       then (coalesce((d.actual_by_category ->> k.category)::numeric, 0) - (d.budget_by_category ->> k.category)::numeric)
            / (d.budget_by_category ->> k.category)::numeric * 100 end as deviation_pct
from public.dataset_closed_projects d
cross join (values ('materials'), ('labor'), ('design'), ('admin'), ('transport'), ('financial'), ('contingency')) as k (category);

/** Una fila por proyecto y material: presupuestado, comprado, consumido, desperdicio y sobrante (compra ≠ consumo). */
create or replace view public.dataset_material_deviation with (security_invoker = true) as
select
  d.organization_id, d.project_id, d.project_type, d.data_origin, d.closed_at, d.usable_for_training,
  m.material_id, m.material_name, m.unit,
  m.budgeted_qty, m.budgeted_cost, m.purchased_qty, m.consumed_qty, m.waste_qty, m.leftover_qty, m.imputed_cost,
  case when m.budgeted_qty > 0 then (m.consumed_qty + m.waste_qty - m.budgeted_qty) / m.budgeted_qty * 100 end as qty_deviation_pct,
  case when m.consumed_qty + m.waste_qty > 0 then m.waste_qty / (m.consumed_qty + m.waste_qty) * 100 end as waste_pct
from public.dataset_closed_projects d
cross join lateral jsonb_to_recordset(d.materials) as m (
  material_id text, material_name text, unit text,
  budgeted_qty numeric, budgeted_cost numeric, purchased_qty numeric,
  consumed_qty numeric, waste_qty numeric, leftover_qty numeric, imputed_cost numeric
);

/** Una fila por proyecto y rubro: horas previstas vs. reales. */
create or replace view public.dataset_hours_deviation with (security_invoker = true) as
select
  d.organization_id, d.project_id, d.project_type, d.data_origin, d.closed_at, d.usable_for_training,
  h.key as rubro,
  coalesce((h.value ->> 'planned_hours')::numeric, 0) as planned_hours,
  coalesce((h.value ->> 'actual_hours')::numeric, 0) as actual_hours,
  coalesce((h.value ->> 'actual_cost')::numeric, 0) as actual_cost,
  case when coalesce((h.value ->> 'planned_hours')::numeric, 0) > 0
       then ((h.value ->> 'actual_hours')::numeric - (h.value ->> 'planned_hours')::numeric) / (h.value ->> 'planned_hours')::numeric * 100 end as hours_deviation_pct
from public.dataset_closed_projects d
cross join lateral jsonb_each(d.hours_by_rubro) as h;

revoke all on public.dataset_closed_projects, public.dataset_category_deviation,
  public.dataset_material_deviation, public.dataset_hours_deviation from anon;

-- ── 6. Funciones: guardar un cierre y traer proyectos parecidos ──────────────

/**
 * Guarda el cierre congelado de un proyecto ya cerrado. Idempotente: si ya existe, no hace nada (devuelve false).
 * La identidad (tipo, fechas, precio, cliente, código) sale de projects; el origen es 'demo' si la empresa es demo.
 */
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
      'sales_price', proj.sales_price
    ))).*
  on conflict (organization_id, project_id) do nothing;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;
revoke all on function public.admin_record_closure(jsonb) from public, anon;
grant execute on function public.admin_record_closure(jsonb) to authenticated;

/**
 * Proyectos cerrados parecidos (mismo tipo), del más reciente al más viejo, para el panel de la cotización
 * y como contexto de un LLM. Sin tipo: todos. Excluye los marcados como atípicos. Los datos demo solo
 * entran si se pide (p_include_demo) y cada fila trae su origen para que la pantalla lo diga.
 * sample_size cuenta TODOS los que cumplen (no solo los devueltos).
 */
create or replace function public.admin_similar_closures(
  p_project_type text default null,
  p_limit integer default 10,
  p_include_demo boolean default false
) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  org uuid := private.my_admin_org();
  lim integer := least(greatest(coalesce(p_limit, 10), 1), 50);
  n integer;
  items jsonb;
begin
  select count(*) into n
  from public.project_closures c
  left join public.closure_reviews r on r.organization_id = c.organization_id and r.project_id = c.project_id
  where c.organization_id = org and not coalesce(r.excluded, false)
    and (p_include_demo or c.data_origin <> 'demo')
    and (p_project_type is null or c.project_type = p_project_type);

  select coalesce(jsonb_agg(x.j order by x.closed_at desc), '[]'::jsonb) into items
  from (
    select c.closed_at, jsonb_build_object(
      'project_id', c.project_id,
      'code', c.project_code,
      'name', c.project_name,
      'project_type', c.project_type,
      'client_name', cl.name,
      'closed_at', c.closed_at,
      'data_origin', c.data_origin,
      'sales_price', c.sales_price,
      'budget_total', c.budget_total,
      'final_cost', c.final_cost,
      'expected_margin', c.expected_margin,
      'final_margin', c.final_margin,
      'margin_delta_points', c.margin_delta_points,
      'planned_days', c.planned_days,
      'actual_days', c.actual_days,
      'budget_by_category', c.budget_by_category,
      'actual_by_category', c.actual_by_category,
      'main_deviation_category', c.main_deviation_category,
      'main_deviation_amount', c.main_deviation_amount,
      'summary_text', c.summary_text
    ) as j
    from public.project_closures c
    left join public.closure_reviews r on r.organization_id = c.organization_id and r.project_id = c.project_id
    left join public.clients cl on cl.organization_id = c.organization_id and cl.id = c.client_id
    where c.organization_id = org and not coalesce(r.excluded, false)
      and (p_include_demo or c.data_origin <> 'demo')
      and (p_project_type is null or c.project_type = p_project_type)
    order by c.closed_at desc
    limit lim
  ) x;

  return jsonb_build_object(
    'project_type', p_project_type,
    'includes_demo', p_include_demo,
    'sample_size', n,
    'returned', jsonb_array_length(items),
    'items', items
  );
end;
$$;
revoke all on function public.admin_similar_closures(text, integer, boolean) from public, anon;
grant execute on function public.admin_similar_closures(text, integer, boolean) to authenticated;

COMMIT;
