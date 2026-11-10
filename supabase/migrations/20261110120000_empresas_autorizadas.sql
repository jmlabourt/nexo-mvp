-- Empresas autorizadas: nadie crea una empresa en Blerp por su cuenta.
--  · El equipo de Blerp (platform_admins) autoriza a una empresa cargando el mail de su Gerencia/Administrativo y el nombre.
--  · Cuando esa persona entra por primera vez (Google o código por mail), se crea la empresa con ese nombre y queda como Administrativo.
--  · Después ese Administrativo invita a su gente desde Configuración → Usuarios (admin_invite_member), cada uno con su rol:
--    al entrar, cada persona cae en la pantalla de su rol. Eso no cambia.
--  · Un mail sin autorización ni invitación ni operario cargado se rechaza con un mensaje claro.
--  · Las empresas y usuarios que ya existen no se tocan (el alta solo corre la primera vez que alguien entra).
BEGIN;

create table if not exists public.platform_admins (
  email text primary key check (email = lower(email))
);
comment on table public.platform_admins is 'Equipo de Blerp: puede autorizar empresas. Se carga a mano (SQL).';

create table if not exists public.company_authorizations (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(email)),
  company_name text not null check (length(trim(company_name)) >= 2),
  authorized_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  used_user_id uuid references auth.users (id) on delete set null,
  organization_id uuid references public.organizations (id) on delete set null,
  revoked_at timestamptz
);
create unique index if not exists company_authorizations_pending_email_idx
  on public.company_authorizations (email) where used_at is null and revoked_at is null;

-- Sin políticas: nadie las lee ni escribe directo; solo las funciones platform_* (SECURITY DEFINER).
alter table public.platform_admins enable row level security;
alter table public.company_authorizations enable row level security;
revoke all on public.platform_admins from anon, authenticated;
revoke all on public.company_authorizations from anon, authenticated;

insert into public.platform_admins (email) values ('jmlabourt@gmail.com') on conflict do nothing;

create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_admins pa
    join auth.users u on lower(u.email) = pa.email
    where u.id = auth.uid()
  )
$$;

create or replace function public.platform_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select private.is_platform_admin() $$;

create or replace function public.platform_authorizations()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'Solo el equipo de Blerp puede ver las autorizaciones.' using errcode = 'insufficient_privilege';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id,
      'email', a.email,
      'company_name', a.company_name,
      'created_at', a.created_at,
      'used_at', a.used_at,
      'revoked_at', a.revoked_at,
      'status', case when a.revoked_at is not null then 'revoked' when a.used_at is not null then 'used' else 'pending' end,
      'members', case when a.organization_id is null then null
                      else (select count(*) from public.organization_members m where m.organization_id = a.organization_id) end
    ) order by a.created_at desc)
    from public.company_authorizations a
  ), '[]'::jsonb);
end;
$$;

create or replace function public.platform_authorize_company(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(coalesce(p ->> 'email', '')));
  v_name text := trim(coalesce(p ->> 'company_name', ''));
  v_id uuid;
begin
  if not private.is_platform_admin() then
    raise exception 'Solo el equipo de Blerp puede autorizar empresas.' using errcode = 'insufficient_privilege';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Ingresá un mail válido.' using errcode = 'check_violation';
  end if;
  if length(v_name) < 2 then
    raise exception 'Ingresá el nombre de la empresa.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from auth.users u where lower(u.email) = v_email) then
    raise exception 'Ese mail ya tiene una cuenta en Blerp: la autorización solo sirve para quien entra por primera vez.' using errcode = 'unique_violation';
  end if;
  if exists (select 1 from public.member_invitations i where lower(i.email) = v_email and i.accepted_at is null and i.revoked_at is null) then
    raise exception 'Ese mail tiene una invitación pendiente de otra empresa: al entrar se uniría a esa empresa.' using errcode = 'unique_violation';
  end if;
  if exists (select 1 from public.company_authorizations a where a.email = v_email and a.used_at is null and a.revoked_at is null) then
    raise exception 'Ese mail ya está autorizado y todavía no entró.' using errcode = 'unique_violation';
  end if;
  insert into public.company_authorizations (email, company_name, authorized_by)
  values (v_email, v_name, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.platform_revoke_authorization(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'Solo el equipo de Blerp puede revocar autorizaciones.' using errcode = 'insufficient_privilege';
  end if;
  update public.company_authorizations set revoked_at = now()
  where id = p_id and used_at is null and revoked_at is null;
  if not found then
    raise exception 'La autorización no existe, ya se usó o ya estaba revocada.' using errcode = 'no_data_found';
  end if;
end;
$$;

revoke execute on function public.platform_is_admin() from public, anon;
revoke execute on function public.platform_authorizations() from public, anon;
revoke execute on function public.platform_authorize_company(jsonb) from public, anon;
revoke execute on function public.platform_revoke_authorization(uuid) from public, anon;
grant execute on function public.platform_is_admin() to authenticated;
grant execute on function public.platform_authorizations() to authenticated;
grant execute on function public.platform_authorize_company(jsonb) to authenticated;
grant execute on function public.platform_revoke_authorization(uuid) to authenticated;

-- Alta de usuarios: igual que antes (invitación → operario cargado), pero el paso 4 ya no crea empresas a cualquiera.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_org uuid;
  inv public.member_invitations%rowtype;
  invited public.operators%rowtype;
  auth_row public.company_authorizations%rowtype;
  v_phone text := private.norm_phone(new.phone);
  display text := coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Usuario'
  );
begin
  -- 1) Invitación pendiente por mail o por celular → entra a esa empresa con ese rol.
  if new.email is not null or v_phone is not null then
    select * into inv
    from public.member_invitations i
    where i.accepted_at is null and i.revoked_at is null
      and ((new.email is not null and lower(i.email) = lower(new.email)) or (v_phone is not null and i.phone = v_phone))
    order by i.created_at desc
    limit 1;
    if found then
      insert into public.organization_members (organization_id, user_id, role, display_name)
      values (inv.organization_id, new.id, inv.role, inv.display_name);
      if inv.role = 'operator' and inv.operator_id is not null then
        update public.operators set user_id = new.id
        where organization_id = inv.organization_id and id = inv.operator_id and user_id is null;
      end if;
      update public.member_invitations set accepted_at = now(), accepted_user_id = new.id
      where organization_id = inv.organization_id and id = inv.id;
      return new;
    end if;
  end if;

  -- 2) Operario cargado con ese mail o celular.
  select * into invited
  from public.operators o
  where o.user_id is null and o.active and o.deactivated_at is null
    and ((new.email is not null and lower(o.email) = lower(new.email)) or (v_phone is not null and private.norm_phone(o.phone) = v_phone))
  order by o.created_at
  limit 1;
  if found then
    insert into public.organization_members (organization_id, user_id, role, display_name)
    values (invited.organization_id, new.id, 'operator', invited.name);
    update public.operators set user_id = new.id
    where organization_id = invited.organization_id and id = invited.id;
    return new;
  end if;

  -- 3) Solo celular y sin invitación: no se crea una empresa nueva.
  if new.email is null then
    raise exception 'Ese celular no tiene una invitación. Pedile al Administrativo de tu empresa que te invite.' using errcode = 'check_violation';
  end if;

  -- 4) Mail autorizado por el equipo de Blerp: se crea la empresa con el nombre autorizado y esta persona queda como Administrativo.
  select * into auth_row
  from public.company_authorizations a
  where a.email = lower(new.email) and a.used_at is null and a.revoked_at is null
  order by a.created_at desc
  limit 1
  for update;
  if found then
    insert into public.organizations (name) values (auth_row.company_name) returning id into new_org;
    insert into public.organization_members (organization_id, user_id, role, display_name)
    values (new_org, new.id, 'owner', display);
    update public.company_authorizations
    set used_at = now(), used_user_id = new.id, organization_id = new_org
    where id = auth_row.id;
    return new;
  end if;

  -- 5) El equipo de Blerp puede abrir su propia empresa (pruebas y demos).
  if exists (select 1 from public.platform_admins pa where pa.email = lower(new.email)) then
    insert into public.organizations (name) values ('Empresa de ' || display) returning id into new_org;
    insert into public.organization_members (organization_id, user_id, role, display_name)
    values (new_org, new.id, 'owner', display);
    return new;
  end if;

  -- 6) Cualquier otro mail: sin autorización no hay empresa.
  raise exception 'Tu empresa todavía no está autorizada en Blerp. Pedile al equipo de Blerp que la autorice, o al Administrativo de tu empresa que te invite.' using errcode = 'check_violation';
end;
$$;

COMMIT;
