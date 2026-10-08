-- ─────────────────────────────────────────────────────────────
-- Lote 3 · Cotizador con operarios y horas extra.
--
-- 1. Cada línea de Mano de obra guarda el operario asignado, el rol y si son
--    horas normales o extra (con el multiplicador usado). budget_lines ya es
--    solo de Gestión (Lote 2): Taller no la lee ni la recibe en taller_workspace().
-- 2. El multiplicador de horas extra vive en una tabla aparte, cost_settings,
--    que solo lee y escribe Gestión. NO va en organizations.alert_settings
--    porque la empresa la leen también los operarios activos.
--
-- Sin DROP: solo ADD COLUMN / CREATE ... IF NOT EXISTS y políticas creadas una vez.
-- ─────────────────────────────────────────────────────────────

alter table public.budget_lines
  add column if not exists operator_id text,
  add column if not exists labor_role text,
  add column if not exists hour_type text,
  add column if not exists overtime_multiplier numeric;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'budget_lines_hour_type_check') then
    alter table public.budget_lines
      add constraint budget_lines_hour_type_check check (hour_type is null or hour_type in ('normal', 'overtime'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'budget_lines_overtime_multiplier_check') then
    alter table public.budget_lines
      add constraint budget_lines_overtime_multiplier_check check (overtime_multiplier is null or overtime_multiplier >= 1);
  end if;
end $$;

create index if not exists budget_lines_operator_idx
  on public.budget_lines (organization_id, operator_id) where operator_id is not null;

-- ── Multiplicador de horas extra (solo Gestión) ──────────────

create table if not exists public.cost_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  overtime_multiplier numeric not null default 2
    check (overtime_multiplier >= 1 and overtime_multiplier <= 5),
  updated_at timestamptz not null default now()
);

alter table public.cost_settings enable row level security;
revoke all on public.cost_settings from anon;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cost_settings' and policyname = 'managers read cost settings') then
    create policy "managers read cost settings" on public.cost_settings for select to authenticated
      using ((select private.is_org_manager(organization_id)));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cost_settings' and policyname = 'managers insert cost settings') then
    create policy "managers insert cost settings" on public.cost_settings for insert to authenticated
      with check ((select private.is_org_manager(organization_id)));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cost_settings' and policyname = 'managers update cost settings') then
    create policy "managers update cost settings" on public.cost_settings for update to authenticated
      using ((select private.is_org_manager(organization_id)))
      with check ((select private.is_org_manager(organization_id)));
  end if;
end $$;
