-- Blerp — Roles válidos de organization_members: Administrativo (owner/member), Compras, Jefe de planta y Operario.
-- La parte manual de Lote 5A (supabase/manual/20261016120100_lote5a_manual.sql) nunca se había corrido en la base en vivo:
-- sin esto, un usuario invitado como Compras o Jefe de planta no podía entrar (violaba el check de rol).
-- Solo cambia la regla que valida la columna; no toca filas ni reset_workspace.
BEGIN;
alter table public.organization_members drop constraint if exists organization_members_role_check;
alter table public.organization_members
  add constraint organization_members_role_check check (role in ('owner', 'member', 'compras', 'jefe_planta', 'operator'));
COMMIT;
