-- Blerp — Invitaciones por WhatsApp (celular) además de mail.
-- · member_invitations admite mail, celular o ambos (al menos uno).
-- · El celular se guarda solo con dígitos y código de país (ej. 5491155551234), igual que auth.users.phone.
-- · handle_new_user: una cuenta que entra solo con celular tiene que tener una invitación pendiente;
--   si no, se rechaza (no se crea una empresa nueva a nombre de un número desconocido).
BEGIN;

create or replace function private.norm_phone(p text)
returns text
language sql
immutable
set search_path = ''
as $$ select nullif(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '') $$;

alter table public.member_invitations add column if not exists phone text;
alter table public.member_invitations alter column email drop not null;
alter table public.member_invitations drop constraint if exists member_invitations_contact_check;
alter table public.member_invitations add constraint member_invitations_contact_check
  check (email is not null or phone is not null);
alter table public.member_invitations drop constraint if exists member_invitations_phone_check;
alter table public.member_invitations add constraint member_invitations_phone_check
  check (phone is null or phone ~ '^[0-9]{8,15}$');
create unique index if not exists member_invitations_pending_phone_idx
  on public.member_invitations (phone) where phone is not null and accepted_at is null and revoked_at is null;

alter table public.operators add column if not exists phone text;

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
  if v_role is null or v_role not in ('member', 'compras', 'jefe_planta', 'operator') then
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

  -- Una sola invitación pendiente por contacto: la nueva reemplaza a la anterior de esta empresa.
  update public.member_invitations set revoked_at = now()
  where organization_id = org and accepted_at is null and revoked_at is null
    and ((v_email is not null and lower(email) = v_email) or (v_phone is not null and phone = v_phone));
  insert into public.member_invitations (organization_id, email, phone, display_name, role, operator_id, invited_by)
  values (org, v_email, v_phone, v_name, v_role, v_operator, (select auth.uid()))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.admin_members()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  org uuid := private.my_admin_org();
begin
  return jsonb_build_object(
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', m.user_id,
        'display_name', m.display_name,
        'email', u.email,
        'phone', private.norm_phone(u.phone),
        'role', m.role, 'can_view_commercial', (m.role='owner' or m.can_view_commercial),
        'deactivated_at', m.deactivated_at,
        'created_at', m.created_at,
        'operator_id', o.id,
        'is_self', m.user_id = (select auth.uid())
      ) order by m.created_at)
      from public.organization_members m
      left join auth.users u on u.id = m.user_id
      left join public.operators o on o.organization_id = m.organization_id and o.user_id = m.user_id
      where m.organization_id = org), '[]'::jsonb),
    'invitations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'email', i.email, 'phone', i.phone, 'display_name', i.display_name, 'role', i.role,
        'operator_id', i.operator_id, 'created_at', i.created_at
      ) order by i.created_at)
      from public.member_invitations i
      where i.organization_id = org and i.accepted_at is null and i.revoked_at is null), '[]'::jsonb)
  );
end;
$$;

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

  -- 4) Mail sin invitación (Google o mail): empresa nueva como Administrativo.
  insert into public.organizations (name) values ('Empresa de ' || display) returning id into new_org;
  insert into public.organization_members (organization_id, user_id, role, display_name)
  values (new_org, new.id, 'owner', display);
  return new;
end;
$$;

COMMIT;
