-- Roles & rights (SCRUM-9): admin-defined roles with feature permissions.
--
-- A role has a NAME the admin chooses ("Cashier", "Back Office Staff"), a BASE ROLE (one of the
-- five app_role values) that decides data access — every RLS policy keeps checking profiles.role,
-- which a trigger derives from the chosen role's base — and a PERMISSIONS map of feature switches
-- the app reads to show or hide what the user can do ("tasks.create", "tasks.review", ...).
-- The five built-ins are seeded per organisation so every existing user keeps exactly the rights
-- they have today; they can be re-configured but not renamed, re-based or deleted.
--
-- Order matters: the built-ins are seeded BEFORE the guard trigger exists, because the guard
-- forces is_system = false on every insert that comes later (owners cannot mint built-ins).

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  base_role app_role not null,
  permissions jsonb not null default '{}'::jsonb,
  is_system boolean not null default false,
  display_order int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint roles_name_len check (char_length(btrim(name)) between 1 and 40)
);
-- names are unique per organisation ignoring case and surrounding spaces
create unique index if not exists roles_org_name_key on public.roles (org_id, lower(btrim(name)));

alter table public.roles enable row level security;
create policy roles_select on public.roles
  for select using (org_id = app.uid_org());
create policy roles_write on public.roles
  for all using (org_id = app.uid_org() and app.uid_role() = 'owner'::app_role)
  with check (org_id = app.uid_org() and app.uid_role() = 'owner'::app_role);

alter table public.profiles add column if not exists role_id uuid references public.roles(id) on delete set null;
create index if not exists profiles_role_id_idx on public.profiles(role_id);

-- ---- profiles.role (what every RLS policy checks) always follows the chosen role's base -------

create or replace function app.sync_profile_role()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.role_id is not null then
    select base_role into new.role from roles where id = new.role_id;
  end if;
  return new;
end $function$;

drop trigger if exists trg_sync_profile_role on public.profiles;
create trigger trg_sync_profile_role
  before insert or update of role_id on public.profiles
  for each row execute function app.sync_profile_role();

-- re-basing a custom role moves its members' data access with it
create or replace function app.propagate_role_base()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.base_role <> old.base_role then
    update profiles set role = new.base_role where role_id = new.id;
    update user_store_roles usr set role = new.base_role
      from profiles p where p.id = usr.user_id and p.role_id = new.id;
  end if;
  return null;
end $function$;

drop trigger if exists trg_propagate_role_base on public.roles;
create trigger trg_propagate_role_base
  after update of base_role on public.roles
  for each row execute function app.propagate_role_base();

-- ---- built-in roles: what each base role can do today ---------------------------------------

insert into public.roles (org_id, name, description, base_role, permissions, is_system, display_order)
select o.id, r.name, r.description, r.base::app_role, r.perms::jsonb, true, r.ord
from public.organizations o
cross join (values
  ('Owner', 'Runs the chain: every store, every setting, final approvals', 'owner',
   '{"tasks.create":true,"tasks.review":true,"escalations.resolve":true,"deliveries.log":true,"temp.log":true,"incidents.report":true,"invoices.upload":true,"deliveries.verify":true,"deliveries.approve":true,"rota.manage":true,"reports.view":true,"inbox.use":true}', 1),
  ('Manager', 'Monitors the stores, keeps the rota and reports', 'manager',
   '{"escalations.resolve":true,"rota.manage":true,"reports.view":true,"inbox.use":true}', 2),
  ('Team Leader', 'Runs a store floor: raises and reviews tasks, handles escalations', 'team_leader',
   '{"tasks.create":true,"tasks.review":true,"escalations.resolve":true,"deliveries.log":true,"temp.log":true,"incidents.report":true,"invoices.upload":true,"inbox.use":true}', 3),
  ('Remote Office', 'Back office: verifies deliveries and reviews submissions', 'remote_office',
   '{"tasks.create":true,"tasks.review":true,"deliveries.verify":true,"reports.view":true,"inbox.use":true}', 4),
  ('Staff', 'Completes the day-to-day checklists and logs', 'staff',
   '{"deliveries.log":true,"temp.log":true,"incidents.report":true,"invoices.upload":true,"inbox.use":true}', 5)
) as r(name, description, base, perms, ord)
on conflict (org_id, lower(btrim(name))) do nothing;

-- every existing member keeps today's rights via the matching built-in
update public.profiles p
   set role_id = r.id
  from public.roles r
 where r.org_id = p.org_id and r.is_system and r.base_role = p.role and p.role_id is null;

-- ---- guards (after the seed: inserts from here on are always custom roles) -------------------

create or replace function app.guard_roles()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  members int;
begin
  if tg_op = 'DELETE' then
    if old.is_system then
      raise exception 'Built-in roles cannot be deleted';
    end if;
    select count(*) into members from profiles where role_id = old.id;
    if members > 0 then
      raise exception 'This role is still assigned to % team member(s) — move them to another role first', members;
    end if;
    return old;
  end if;
  new.name := btrim(new.name);
  if tg_op = 'INSERT' then
    new.is_system := false;
    return new;
  end if;
  -- UPDATE
  if old.is_system then
    if new.name <> old.name or new.base_role <> old.base_role or not new.is_system then
      raise exception 'Built-in roles keep their name and base role; only their permissions can change';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $function$;

drop trigger if exists trg_guard_roles on public.roles;
create trigger trg_guard_roles
  before insert or update or delete on public.roles
  for each row execute function app.guard_roles();
