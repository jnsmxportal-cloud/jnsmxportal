-- Task categories become data. public.categories holds one row per category per
-- organisation; the six former enum values are seeded as built-in ("system") rows.
-- task_templates.category and task_instances.category change from the task_category
-- enum to text slugs that reference categories(org_id, slug), so a category can be
-- renamed, recoloured, archived (hidden from pickers) or deleted (work reassigned).

create table if not exists public.categories (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  slug          text not null,
  name          text not null,
  color         text not null default '#16B364',
  icon          text not null default 'list-checks',
  is_system     boolean not null default false,
  display_order int  not null default 100,
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  constraint categories_org_slug_key unique (org_id, slug),
  constraint categories_slug_format check (slug ~ '^[a-z0-9_]{1,40}$'),
  constraint categories_name_nonempty check (length(trim(name)) between 1 and 60),
  constraint categories_color_format check (color ~ '^#[0-9A-Fa-f]{6}$')
);

-- ---- seed the built-ins for every org (and for any org created later) ----
create or replace function app.seed_system_categories(p_org uuid)
returns void language sql security definer set search_path = public as $$
  insert into categories (org_id, slug, name, color, icon, is_system, display_order) values
    (p_org, 'daily',       'Daily',       '#16B364', 'list-checks', true, 10),
    (p_org, 'weekly',      'Weekly',      '#0891B2', 'broom',       true, 20),
    (p_org, 'ad_hoc',      'Ad-hoc',      '#5B6478', 'note-pencil', true, 30),
    (p_org, 'incident',    'Incident',    '#E5484D', 'warning',     true, 40),
    (p_org, 'delivery',    'Delivery',    '#3B82F6', 'truck',       true, 50),
    (p_org, 'maintenance', 'Maintenance', '#B45309', 'wrench',      true, 60)
  on conflict (org_id, slug) do nothing;
$$;

select app.seed_system_categories(id) from public.organizations;

create or replace function app.seed_org_categories()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform app.seed_system_categories(new.id);
  return new;
end $$;

drop trigger if exists trg_seed_categories on public.organizations;
create trigger trg_seed_categories after insert on public.organizations
  for each row execute function app.seed_org_categories();

-- ---- enum -> text slug + FK ----
alter table public.task_templates alter column category drop default;
alter table public.task_templates alter column category type text using category::text;
alter table public.task_templates alter column category set default 'daily';

alter table public.task_instances alter column category drop default;
alter table public.task_instances alter column category type text using category::text;
alter table public.task_instances alter column category set default 'daily';

alter table public.task_templates
  add constraint task_templates_category_fkey
  foreign key (org_id, category) references public.categories(org_id, slug)
  on update cascade on delete restrict;

alter table public.task_instances
  add constraint task_instances_category_fkey
  foreign key (org_id, category) references public.categories(org_id, slug)
  on update cascade on delete restrict;

create index if not exists task_templates_category_idx on public.task_templates (org_id, category);
create index if not exists task_instances_category_idx on public.task_instances (org_id, category);

drop type if exists public.task_category;

-- ---- guard rails: built-ins cannot be deleted, slugs are fixed, Daily is the fallback ----
create or replace function app.guard_categories()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.is_system then
      raise exception 'Built-in categories cannot be deleted. Archive it instead.';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' then
    if new.slug <> old.slug then
      raise exception 'A category slug cannot be changed once created.';
    end if;
    if new.is_system <> old.is_system then
      raise exception 'is_system cannot be changed.';
    end if;
    if old.is_system and old.slug = 'daily' and new.archived_at is not null then
      raise exception 'Daily is the default category and cannot be archived.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_categories on public.categories;
create trigger trg_guard_categories before update or delete on public.categories
  for each row execute function app.guard_categories();

-- ---- RLS: every org member reads, only the owner writes ----
alter table public.categories enable row level security;

drop policy if exists categories_select on public.categories;
create policy categories_select on public.categories for select
  using (org_id = app.uid_org());

drop policy if exists categories_write on public.categories;
create policy categories_write on public.categories for all
  using (org_id = app.uid_org() and app.uid_role() = 'owner')
  with check (org_id = app.uid_org() and app.uid_role() = 'owner');

-- ---- usage counts for the Admin tab (runs as the caller, RLS applies) ----
create or replace function public.category_usage()
returns table (category text, templates bigint, instances bigint, open_instances bigint)
language sql stable set search_path = public as $$
  select c.slug,
         (select count(*) from task_templates t where t.org_id = c.org_id and t.category = c.slug),
         (select count(*) from task_instances i where i.org_id = c.org_id and i.category = c.slug),
         (select count(*) from task_instances i where i.org_id = c.org_id and i.category = c.slug
             and i.status in ('scheduled','assigned','in_progress','submitted','rejected'))
    from categories c
   where c.org_id = app.uid_org();
$$;

-- ---- atomic delete: move templates + task history to a replacement, then delete ----
-- Owner only. A category that is still referenced needs a replacement; the move and the
-- delete happen in one transaction so no template or task is ever left pointing nowhere.
create or replace function public.delete_category(p_id uuid, p_replacement uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cat       categories%rowtype;
  v_rep       categories%rowtype;
  v_templates bigint := 0;
  v_instances bigint := 0;
begin
  select * into v_cat from categories where id = p_id;
  if not found then
    raise exception 'Category not found';
  end if;
  if v_cat.org_id <> app.uid_org() or app.uid_role() <> 'owner' then
    raise exception 'Only the owner can delete categories';
  end if;
  if v_cat.is_system then
    raise exception 'Built-in categories cannot be deleted. Archive it instead.';
  end if;

  select count(*) into v_templates from task_templates where org_id = v_cat.org_id and category = v_cat.slug;
  select count(*) into v_instances from task_instances where org_id = v_cat.org_id and category = v_cat.slug;

  if v_templates + v_instances > 0 then
    if p_replacement is null then
      raise exception 'This category is still used by % template(s) and % task(s). Choose a replacement.',
        v_templates, v_instances;
    end if;
    select * into v_rep from categories where id = p_replacement and org_id = v_cat.org_id;
    if not found or v_rep.id = v_cat.id then
      raise exception 'Invalid replacement category';
    end if;
    if v_rep.archived_at is not null then
      raise exception 'The replacement category is archived';
    end if;
    update task_templates set category = v_rep.slug where org_id = v_cat.org_id and category = v_cat.slug;
    update task_instances set category = v_rep.slug where org_id = v_cat.org_id and category = v_cat.slug;
  end if;

  delete from categories where id = p_id;

  insert into audit_log (org_id, actor, action, entity, entity_id, detail)
  values (v_cat.org_id, auth.uid(), 'category.deleted', 'category', p_id,
          jsonb_build_object('slug', v_cat.slug, 'name', v_cat.name,
                             'templates_moved', v_templates, 'instances_moved', v_instances,
                             'replacement', v_rep.slug));

  return jsonb_build_object('templates_moved', v_templates, 'instances_moved', v_instances,
                            'replacement', v_rep.slug);
end $$;

revoke all on function public.delete_category(uuid, uuid) from public;
grant execute on function public.delete_category(uuid, uuid) to authenticated;
grant execute on function public.category_usage() to authenticated;
