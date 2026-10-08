-- ─────────────────────────────────────────────────────────────
-- Blerp — baja lógica de operarios.
-- Dar de baja = active = false + deactivated_at. El historial de horas no se toca.
-- Columna nueva y opcional: las versiones anteriores de la app la ignoran.
-- ─────────────────────────────────────────────────────────────
alter table public.operators add column if not exists deactivated_at timestamptz;
