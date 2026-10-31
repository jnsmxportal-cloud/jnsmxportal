-- task_instances.checklist: an optional per-task checklist definition (same shape as
-- task_templates.checklist). When the dashboard creates a task from a template, the owner can
-- edit the items for that task only; the edited list is stored here and expanded into
-- checklist_items instead of the template's list. Custom one-off tasks can now carry items too.
-- NULL keeps today's behaviour: expand the template's checklist (scheduler, "Run now", staff).

alter table public.task_instances add column if not exists checklist jsonb;

create or replace function app.expand_template_checklist()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  src jsonb;
  item jsonb;
  pos int := 0;
begin
  if new.checklist is not null then
    src := new.checklist;
  elsif new.template_id is not null then
    select coalesce(t.checklist, '[]'::jsonb) into src from task_templates t where t.id = new.template_id;
  else
    return new;
  end if;

  for item in select jsonb_array_elements(coalesce(src, '[]'::jsonb)) loop
    insert into checklist_items (instance_id, label, position, requires_photo, requires_temp,
      temp_limit, temp_is_max, requires_qr, requires_signature)
    values (new.id, item->>'label', pos,
      coalesce((item->>'photo')::boolean, false),
      coalesce((item->>'temp')::boolean, false),
      (item->>'limit')::numeric,
      true,
      coalesce((item->>'qr')::boolean, false),
      coalesce((item->>'signature')::boolean, false));
    pos := pos + 1;
  end loop;
  return new;
end $function$;
