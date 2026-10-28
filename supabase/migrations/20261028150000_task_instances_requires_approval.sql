-- task_instances.requires_approval: whether a submitted instance waits in the review queue
-- (status 'submitted') or completes immediately (status 'completed').
-- Inherited from the template on insert when not given explicitly; true otherwise.

alter table public.task_instances add column if not exists requires_approval boolean;

-- backfill: instances from a template follow it, everything else keeps today's behaviour (review)
update public.task_instances i
   set requires_approval = coalesce(t.requires_approval, true)
  from public.task_templates t
 where i.template_id = t.id and i.requires_approval is null;
update public.task_instances set requires_approval = true where requires_approval is null;

-- BEFORE INSERT: fill a missing requires_approval from the template (or true).
-- Runs before the NOT NULL check, so the scheduler and existing inserts need no change.
create or replace function app.inherit_template_defaults()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.requires_approval is null then
    if new.template_id is not null then
      select coalesce(t.requires_approval, true) into new.requires_approval
        from task_templates t where t.id = new.template_id;
    end if;
    new.requires_approval := coalesce(new.requires_approval, true);
  end if;
  return new;
end $$;

drop trigger if exists trg_inherit_template_defaults on public.task_instances;
create trigger trg_inherit_template_defaults
  before insert on public.task_instances
  for each row execute function app.inherit_template_defaults();

-- no column default on purpose: a default would be applied before the trigger and hide the template value
alter table public.task_instances alter column requires_approval set not null;
