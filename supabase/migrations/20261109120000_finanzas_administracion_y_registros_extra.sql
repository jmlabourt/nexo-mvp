-- Administración registra facturas, cobros y pagos a proveedores · y los registros que la app tenía solo en el navegador.
--
-- 1. Facturas, cobros y pagos efectivos a proveedores: los registra Administración (rol `comercial`) o un Administrativo.
--    Antes solo los veía y registraba el Administrativo. Gerencia sigue viéndolos. Compras y Planta, no.
--    Además guarda lo que la app ya mandaba y la base descartaba: vencimiento, condición e hito de la factura, y la
--    solicitud de pago a la que corresponde cada pago. Un pago puede hacerse sobre una orden enviada (no solo facturada).
--    Se vuelven a definir ledger_workspace, ledger_commit y ledger_reset.
-- 2. Tabla ledger_extras (pedidos de pago, correcciones financieras, trabajo externo, capacidad de planta,
--    rentabilidad objetivo, catálogo de materiales) con sus funciones de lectura, escritura y carga masiva.
--
-- Las reglas de saldos y numeración siguen en los disparadores de la migración 20261028120000.


-- ── 0. Columnas que la app ya mandaba y la base descartaba ─────────────────────────────────────────────────────
-- Factura: vencimiento, condición de pago e hito del cronograma (alimentan cobros vencidos y el calendario de cobros).
alter table public.sales_invoices add column if not exists due_date date;
alter table public.sales_invoices add column if not exists condition text;
alter table public.sales_invoices add column if not exists milestone_id text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'sales_invoices_due_after_issue') then
    alter table public.sales_invoices add constraint sales_invoices_due_after_issue check (due_date is null or due_date >= date);
  end if;
end $$;
-- Pago a proveedor: la solicitud de pago que cancela (Compras pide, Administración paga).
alter table public.supplier_payments add column if not exists payment_request_id text;

-- Un pago se registra sobre una orden enviada o facturada (el pedido de pago puede ser anterior a la factura del proveedor).
create or replace function private.tg_supplier_payment() returns trigger language plpgsql set search_path = '' as $$
declare o public.purchase_orders;
begin
  if private.rules_off(new.organization_id) then return new; end if;
  select * into o from public.purchase_orders x where x.organization_id = new.organization_id and x.id = new.order_id;
  if not found or o.status not in ('sent', 'invoiced') then
    raise exception 'Primero enviá la orden de compra al proveedor.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- ── 1. Lectura, escritura y carga masiva (con los permisos de Administración) ───────────────────────────────────
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
    'salesInvoices', case when mgr or quote then (
      select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', i.id, 'projectId', i.project_id, 'number', i.number, 'date', i.date,
        'amount', i.amount, 'notes', i.notes, 'dueDate', i.due_date, 'condition', i.condition, 'milestoneId', i.milestone_id, 'createdBy', i.created_by, 'createdAt', i.created_at)) order by i.date, i.created_at, i.id), empty)
      from public.sales_invoices i where i.organization_id = org) else empty end,
    'collections', case when mgr or quote then (
      select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', c.id, 'projectId', c.project_id, 'invoiceId', c.invoice_id, 'date', c.date,
        'amount', c.amount, 'notes', c.notes, 'createdBy', c.created_by, 'createdAt', c.created_at)) order by c.date, c.created_at, c.id), empty)
      from public.collections c where c.organization_id = org) else empty end,
    'supplierPayments', case when buy or quote then (
      select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', s.id, 'orderId', s.order_id, 'date', s.date, 'amount', s.amount,
        'reference', s.reference, 'paymentRequestId', s.payment_request_id, 'by', s.paid_by, 'at', s.paid_at)) order by s.date, s.paid_at, s.id), empty)
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
  ) || public.ledger_extras_workspace();
end;
$$;

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
                        'internalHours','generalCosts','rubroCatalog','rates','clients','suppliers','financialMonthlyRatePct',
                        'paymentRequests','financialCorrections','externalWork','externalRates','capacityBase','capacityAdjustments','capacityPlans','quoteDefaults','materialCatalog'];
  extras text[] := array['paymentRequests','financialCorrections','externalWork','externalRates','capacityBase','capacityAdjustments','capacityPlans','quoteDefaults','materialCatalog'];
  k text;
begin
  select m.org, m.actor into org, actor from private.ledger_member() m;
  for k in select jsonb_object_keys(p) loop
    if not k = any(known) then raise exception 'Colección no permitida: %.', k using errcode = 'check_violation'; end if;
  end loop;

  -- Permiso por colección.
  if (p ? 'rubroCatalog' or p ? 'rates' or p ? 'generalCosts' or p ? 'financialMonthlyRatePct') and not private.can_manage(org) then
    raise exception 'Esto lo registra Gerencia.' using errcode = 'insufficient_privilege';
  end if;
  -- Facturas, cobros y pagos efectivos a proveedores: los registra Administración (un Administrativo también; el resto no).
  if (p ? 'salesInvoices' or p ? 'collections' or p ? 'supplierPayments') and not private.can_quote(org) then
    raise exception 'Facturas, cobros y pagos los registra Administración.' using errcode = 'insufficient_privilege';
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
    insert into public.sales_invoices (organization_id, id, project_id, number, date, amount, notes, created_by, due_date, condition, milestone_id)
    select org, x.id, x."projectId", x.number, x.date, round(x.amount, 2), nullif(btrim(x.notes), ''), actor,
           x."dueDate", nullif(btrim(x.condition), ''), nullif(btrim(x."milestoneId"), '')
    from jsonb_to_recordset(coalesce(p -> 'salesInvoices' -> 'upsert', '[]'))
      as x(id text, "projectId" text, number text, date date, amount numeric, notes text, "dueDate" date, condition text, "milestoneId" text)
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
    insert into public.supplier_payments (organization_id, id, order_id, date, amount, reference, paid_by, payment_request_id)
    select org, x.id, x."orderId", x.date, round(x.amount, 2), btrim(x.reference), actor, nullif(btrim(x."paymentRequestId"), '')
    from jsonb_to_recordset(coalesce(p -> 'supplierPayments' -> 'upsert', '[]'))
      as x(id text, "orderId" text, date date, amount numeric, reference text, "paymentRequestId" text)
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

  -- Registros extra (pedidos de pago, trabajo externo, capacidad…): en la misma transacción, con sus permisos y reglas.
  if exists (select 1 from jsonb_object_keys(p) as pk(name) where pk.name = any(extras)) then
    perform public.ledger_extras_commit((select jsonb_object_agg(e.key, e.value) from jsonb_each(p) e where e.key = any(extras)));
  end if;
end;
$$;

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

    insert into public.sales_invoices (organization_id, id, project_id, number, date, amount, notes, created_by, created_at, due_date, condition, milestone_id)
    select org, x.id, x."projectId", x.number, x.date, x.amount, nullif(x.notes, ''), coalesce(x."createdBy", ''), coalesce(x."createdAt", now()),
           x."dueDate", nullif(x.condition, ''), nullif(x."milestoneId", '')
    from jsonb_to_recordset(coalesce(p -> 'salesInvoices', '[]'))
      as x(id text, "projectId" text, number text, date date, amount numeric, notes text, "createdBy" text, "createdAt" timestamptz,
           "dueDate" date, condition text, "milestoneId" text);

    insert into public.collections (organization_id, id, project_id, invoice_id, date, amount, notes, created_by, created_at)
    select org, x.id, x."projectId", nullif(x."invoiceId", ''), x.date, x.amount, nullif(x.notes, ''), coalesce(x."createdBy", ''), coalesce(x."createdAt", now())
    from jsonb_to_recordset(coalesce(p -> 'collections', '[]'))
      as x(id text, "projectId" text, "invoiceId" text, date date, amount numeric, notes text, "createdBy" text, "createdAt" timestamptz);

    insert into public.supplier_payments (organization_id, id, order_id, date, amount, reference, paid_by, paid_at, payment_request_id)
    select org, x.id, x."orderId", x.date, x.amount, x.reference, coalesce(x.by, ''), coalesce(x.at, now()), nullif(x."paymentRequestId", '')
    from jsonb_to_recordset(coalesce(p -> 'supplierPayments', '[]'))
      as x(id text, "orderId" text, date date, amount numeric, reference text, by text, at timestamptz, "paymentRequestId" text);

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

  -- Registros extra: se vacían siempre y, si viene un escenario, se cargan los que trae.
  perform public.ledger_extras_reset(case when p is not null and jsonb_typeof(p) = 'object'
    then (select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) from jsonb_each(p) e where e.key = any(array['paymentRequests','financialCorrections','externalWork','externalRates','capacityBase','capacityAdjustments','capacityPlans','quoteDefaults','materialCatalog'])) end);
end;
$$;

-- ── 2. Registros que la app tenía solo en el navegador de la demo ──────────────────────────────────────────────
-- Una sola tabla, una fila por registro (colección + id), con la forma exacta del contrato de la app (types/index.ts).
-- Nunca se lee ni escribe directo: solo con ledger_extras_workspace / ledger_extras_commit, que aplican el permiso
-- por colección y las reglas de historial (los registros no se borran; lo ya registrado no se reescribe).
--   paymentRequests       Compras pide el pago · Administración registra la gestión bancaria o lo cancela
--   financialCorrections  correcciones y anulaciones financieras con antes/después, motivo y autor (Administración)
--   externalWork          trabajo externo: Planta lo registra · Gerencia confirma el costo
--   externalRates         tarifa por rubro del trabajo externo (Gerencia)
--   capacityBase / capacityAdjustments / capacityPlans   capacidad de planta (Jefe de planta)
--   quoteDefaults         rentabilidad objetivo por defecto de las cotizaciones (Gerencia)
--   materialCatalog       materiales y precios de referencia (Administración)
create table if not exists public.ledger_extras (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  collection text not null check (collection in ('paymentRequests', 'financialCorrections', 'externalWork', 'externalRates',
    'capacityBase', 'capacityAdjustments', 'capacityPlans', 'quoteDefaults', 'materialCatalog')),
  id text not null check (length(id) between 1 and 120),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (organization_id, collection, id)
);
alter table public.ledger_extras enable row level security;
drop policy if exists "manager reads" on public.ledger_extras;
create policy "manager reads" on public.ledger_extras for select to authenticated using ((select private.is_org_manager(organization_id)));
revoke all on public.ledger_extras from anon;

-- Las colecciones de un solo registro (id fijo).
create or replace function private.extras_singleton(c text) returns boolean
language sql immutable set search_path = '' as $$ select c in ('capacityBase', 'quoteDefaults') $$;

/** Campos de costo que confirma Gerencia en el trabajo externo (Planta no los ve ni los cambia). */
create or replace function private.external_cost_keys() returns text[]
language sql immutable set search_path = '' as $$ select array['confirmedCost', 'confirmedBy', 'confirmedAt', 'costHistory'] $$;

-- ── Lectura: ledger_extras_workspace() ─────────────────────────────────────────────────────────────────────────
-- Cada rol recibe solo lo suyo. Planta no recibe costos confirmados ni precios de materiales.
create or replace function public.ledger_extras_workspace()
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
  res jsonb := '{}'::jsonb;
  c text; allowed boolean; v jsonb;
begin
  select m.organization_id into org from public.organization_members m
  where m.user_id = uid and m.deactivated_at is null and m.role <> 'operator' order by m.created_at limit 1;
  if org is null then return '{}'::jsonb; end if; -- el Operario no tiene registros extra
  mgr := private.can_manage(org); quote := private.can_quote(org); buy := private.can_buy(org); plant := private.can_plant(org);

  foreach c in array array['paymentRequests', 'financialCorrections', 'externalWork', 'externalRates', 'capacityBase', 'capacityAdjustments',
                           'capacityPlans', 'quoteDefaults', 'materialCatalog'] loop
    allowed := case c
      when 'paymentRequests' then buy or quote
      when 'financialCorrections' then quote
      when 'externalWork' then plant
      when 'externalRates' then mgr
      when 'capacityBase' then plant
      when 'capacityAdjustments' then plant
      when 'capacityPlans' then plant
      when 'quoteDefaults' then quote
      when 'materialCatalog' then quote or buy or plant
    end;
    continue when not allowed;
    if private.extras_singleton(c) then
      select e.data into v from public.ledger_extras e where e.organization_id = org and e.collection = c and e.id = 'singleton';
      if v is not null then res := res || jsonb_build_object(c, v); end if;
    else
      select coalesce(jsonb_agg(
        case
          when c = 'externalWork' and not mgr then e.data - private.external_cost_keys()
          when c = 'materialCatalog' and not (quote or buy) then e.data - 'referenceCost'
          else e.data
        end order by e.created_at, e.id), '[]'::jsonb)
      into v from public.ledger_extras e where e.organization_id = org and e.collection = c;
      res := res || jsonb_build_object(c, v);
    end if;
  end loop;
  return res;
end;
$$;

-- ── Escritura: ledger_extras_commit(p) ─────────────────────────────────────────────────────────────────────────
-- p = { "<colección>": { "upsert": [filas] }, ... } · las colecciones de un solo registro van como { "<colección>": { ... } }.
-- Nada se borra. Cada colección define quién escribe y qué puede cambiar después de creada.
create or replace function public.ledger_extras_commit(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  org uuid; actor text;
  mgr boolean; quote boolean; buy boolean; plant boolean;
  known text[] := array['paymentRequests', 'financialCorrections', 'externalWork', 'externalRates', 'capacityBase', 'capacityAdjustments',
                        'capacityPlans', 'quoteDefaults', 'materialCatalog'];
  k text; r jsonb; rid text; old jsonb; merged jsonb; k2 text; pct numeric;
begin
  select m.org, m.actor into org, actor from private.ledger_member() m;
  mgr := private.can_manage(org); quote := private.can_quote(org); buy := private.can_buy(org); plant := private.can_plant(org);

  for k in select jsonb_object_keys(p) loop
    if not k = any(known) then raise exception 'Colección no permitida: %.', k using errcode = 'check_violation'; end if;
    if not private.extras_singleton(k) and jsonb_array_length(coalesce(p -> k -> 'remove', '[]'::jsonb)) > 0 then
      raise exception 'Este registro no se elimina: queda en el historial.' using errcode = 'check_violation';
    end if;
  end loop;

  -- Permiso por colección. paymentRequests se decide por fila (Compras crea; Administración gestiona).
  if (p ? 'financialCorrections' or p ? 'materialCatalog') and not quote then
    raise exception 'Esto lo registra Administración.' using errcode = 'insufficient_privilege';
  end if;
  if (p ? 'externalRates' or p ? 'quoteDefaults') and not mgr then
    raise exception 'Esto lo configura Gerencia.' using errcode = 'insufficient_privilege';
  end if;
  if (p ? 'capacityBase' or p ? 'capacityAdjustments' or p ? 'capacityPlans') and not plant then
    raise exception 'La capacidad la administra el Jefe de planta.' using errcode = 'insufficient_privilege';
  end if;
  if p ? 'externalWork' and not plant then
    raise exception 'El trabajo externo lo registra el Jefe de planta.' using errcode = 'insufficient_privilege';
  end if;
  if p ? 'paymentRequests' and not (buy or quote) then
    raise exception 'Los pedidos de pago los hace Compras y los gestiona Administración.' using errcode = 'insufficient_privilege';
  end if;

  -- Serializa las escrituras de la empresa.
  perform 1 from public.organizations o where o.id = org for update;

  -- Colecciones de un solo registro.
  for k in select x from unnest(array['capacityBase', 'quoteDefaults']) x loop
    continue when not p ? k;
    r := p -> k;
    if jsonb_typeof(r) <> 'object' then raise exception 'Dato inválido.' using errcode = 'check_violation'; end if;
    if k = 'quoteDefaults' then
      foreach k2 in array array['materialsTargetPct', 'laborTargetPct'] loop
        if jsonb_typeof(r -> k2) <> 'number' then raise exception 'Los objetivos de rentabilidad deben ser números.' using errcode = 'check_violation'; end if;
        pct := (r ->> k2)::numeric;
        if pct < 0 or pct >= 100 then raise exception 'Los objetivos de rentabilidad deben estar entre 0 y menos de 100 %%.' using errcode = 'check_violation'; end if;
      end loop;
    else
      for k2 in select jsonb_object_keys(r) loop
        if jsonb_typeof(r -> k2) <> 'number' or (r ->> k2)::numeric < 0 then
          raise exception 'Capacidad base inválida: horas semanales no negativas.' using errcode = 'check_violation';
        end if;
      end loop;
    end if;
    insert into public.ledger_extras (organization_id, collection, id, data, created_by, updated_by)
    values (org, k, 'singleton', r, actor, actor)
    on conflict (organization_id, collection, id) do update set data = excluded.data, updated_by = actor, updated_at = now();
  end loop;

  -- Listas.
  for k in select x from unnest(known) x loop
    continue when private.extras_singleton(k) or not p ? k;
    for r in select * from jsonb_array_elements(coalesce(p -> k -> 'upsert', '[]'::jsonb)) loop
      if jsonb_typeof(r) <> 'object' then raise exception 'Dato inválido.' using errcode = 'check_violation'; end if;
      rid := case k when 'externalRates' then (r ->> 'rubro') || '|' || (r ->> 'validFrom') else r ->> 'id' end;
      if rid is null or btrim(rid) = '' then raise exception 'Falta el identificador del registro.' using errcode = 'check_violation'; end if;
      select e.data into old from public.ledger_extras e where e.organization_id = org and e.collection = k and e.id = rid for update;

      if old is null then
        -- Alta. Compras no crea una solicitud ya gestionada, y Planta no confirma costos.
        if k = 'paymentRequests' then
          if not buy then raise exception 'Los pedidos de pago los hace Compras.' using errcode = 'insufficient_privilege'; end if;
          if (r ? 'banking') or (r ? 'cancelled') then raise exception 'Compras solicita pagos; la gestión bancaria corresponde a Administración.' using errcode = 'insufficient_privilege'; end if;
          if jsonb_typeof(r -> 'amount') <> 'number' or (r ->> 'amount')::numeric <= 0 then raise exception 'El importe del pedido debe ser mayor a 0.' using errcode = 'check_violation'; end if;
        elsif k = 'externalWork' and not mgr and r ?| private.external_cost_keys() then
          raise exception 'Solo Gerencia confirma el costo del trabajo externo.' using errcode = 'insufficient_privilege';
        elsif k = 'externalRates' and (jsonb_typeof(r -> 'hourlyCost') <> 'number' or (r ->> 'hourlyCost')::numeric < 0) then
          raise exception 'La tarifa del trabajo externo debe ser un número no negativo.' using errcode = 'check_violation';
        elsif k = 'materialCatalog' and (btrim(coalesce(r ->> 'name', '')) = '' or jsonb_typeof(r -> 'referenceCost') <> 'number' or (r ->> 'referenceCost')::numeric < 0) then
          raise exception 'Completá nombre y costo de referencia del material.' using errcode = 'check_violation';
        end if;
        insert into public.ledger_extras (organization_id, collection, id, data, created_by, updated_by) values (org, k, rid, r, actor, actor);
      else
        if old = r then continue; end if;
        -- Modificación de un registro existente.
        if k in ('financialCorrections', 'externalRates', 'capacityAdjustments') then
          raise exception 'Este registro no se modifica: queda en el historial.' using errcode = 'check_violation';
        elsif k = 'paymentRequests' then
          if not quote then raise exception 'Compras no altera solicitudes previas ni su gestión bancaria.' using errcode = 'insufficient_privilege'; end if;
          if (old - 'banking' - 'cancelled') is distinct from (r - 'banking' - 'cancelled') then
            raise exception 'Administración gestiona la solicitud existente; no modifica su obligación.' using errcode = 'check_violation';
          end if;
          if (old ? 'banking') and (old -> 'banking') is distinct from (r -> 'banking') then
            raise exception 'La gestión bancaria registrada no se modifica: queda en el historial.' using errcode = 'check_violation';
          end if;
          if (old ? 'cancelled') and (old -> 'cancelled') is distinct from (r -> 'cancelled') then
            raise exception 'Una solicitud cancelada no se modifica.' using errcode = 'check_violation';
          end if;
        elsif k = 'externalWork' then
          if mgr then
            merged := r;
          else
            -- Planta cambia lo suyo; el costo confirmado queda como estaba.
            merged := (r - private.external_cost_keys()) || coalesce((select jsonb_object_agg(x.key, x.value) from jsonb_each(old) x where x.key = any(private.external_cost_keys())), '{}'::jsonb);
          end if;
          r := merged;
        elsif k = 'materialCatalog' then
          if (old ->> 'id') is distinct from (r ->> 'id') then raise exception 'El material conserva su identificador.' using errcode = 'check_violation'; end if;
        end if;
        update public.ledger_extras e set data = r, updated_by = actor, updated_at = now()
        where e.organization_id = org and e.collection = k and e.id = rid;
      end if;
    end loop;
  end loop;
end;
$$;

-- ── Carga masiva (demo de la empresa / empezar de cero): solo Administrativo ───────────────────────────────────
create or replace function public.ledger_extras_reset(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  org uuid; actor text; k text; r jsonb;
begin
  select m.org, m.actor into org, actor from private.ledger_member() m;
  if not private.can_manage(org) then raise exception 'Esto lo hace un usuario Administrativo.' using errcode = 'insufficient_privilege'; end if;
  perform 1 from public.organizations o where o.id = org for update;
  delete from public.ledger_extras where organization_id = org;
  if p is null or jsonb_typeof(p) <> 'object' then return; end if;
  for k in select jsonb_object_keys(p) loop
    if private.extras_singleton(k) then
      insert into public.ledger_extras (organization_id, collection, id, data, created_by) values (org, k, 'singleton', p -> k, actor);
    else
      for r in select * from jsonb_array_elements(p -> k) loop
        insert into public.ledger_extras (organization_id, collection, id, data, created_by)
        values (org, k, case k when 'externalRates' then (r ->> 'rubro') || '|' || (r ->> 'validFrom') else r ->> 'id' end, r, actor);
      end loop;
    end if;
  end loop;
end;
$$;

revoke all on function public.ledger_workspace() from public, anon;
revoke all on function public.ledger_commit(jsonb) from public, anon;
revoke all on function public.ledger_reset(jsonb) from public, anon;
revoke all on function public.ledger_extras_workspace() from public, anon;
revoke all on function public.ledger_extras_commit(jsonb) from public, anon;
revoke all on function public.ledger_extras_reset(jsonb) from public, anon;
grant execute on function public.ledger_workspace() to authenticated;
grant execute on function public.ledger_commit(jsonb) to authenticated;
grant execute on function public.ledger_reset(jsonb) to authenticated;
grant execute on function public.ledger_extras_workspace() to authenticated;
grant execute on function public.ledger_extras_commit(jsonb) to authenticated;
grant execute on function public.ledger_extras_reset(jsonb) to authenticated;
