-- Suppliers the owner manages (Admin → Suppliers) instead of a list hard-coded in the staff app.
--
-- The Delivery Received and Invoice Upload pickers read the active (non-archived) suppliers.
-- deliveries.supplier / invoices.supplier stay plain text: they record the name as it was when
-- logged, so renaming, archiving or deleting a supplier never rewrites history (and the invoice
-- PDFs already filed under store / supplier / month keep their paths).

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  constraint suppliers_name_len check (char_length(btrim(name)) between 1 and 60)
);
-- names are unique per organisation ignoring case and surrounding spaces
create unique index if not exists suppliers_org_name_key on public.suppliers (org_id, lower(btrim(name)));

alter table public.suppliers enable row level security;
create policy suppliers_select on public.suppliers
  for select using (org_id = app.uid_org());
create policy suppliers_write on public.suppliers
  for all using (org_id = app.uid_org() and app.uid_role() = 'owner'::app_role)
  with check (org_id = app.uid_org() and app.uid_role() = 'owner'::app_role);

-- seed every organisation with the suppliers the app used to hard-code
insert into public.suppliers (org_id, name)
select o.id, s.name
from public.organizations o
cross join (values ('Booker'), ('Coca-Cola Enterprises'), ('Nisa'), ('Bestway')) as s(name)
on conflict do nothing;

-- live updates for the staff pickers and the admin list
alter publication supabase_realtime add table public.suppliers;
