-- Templates can now target any subset of stores. NULL / empty store_ids = chain-wide.
-- Applied to project ttgubeyxuwkwaovugkxz via the Supabase dashboard / MCP.

alter table public.task_templates add column if not exists store_ids uuid[];

update public.task_templates
   set store_ids = array[store_id]
 where store_id is not null and store_ids is null;

-- keep the legacy single store_id in step with store_ids (single store -> that id, else null)
create or replace function app.sync_template_store_id()
returns trigger language plpgsql as $$
begin
  if new.store_ids is not null and cardinality(new.store_ids) = 0 then
    new.store_ids := null;
  end if;
  new.store_id := case when new.store_ids is not null and cardinality(new.store_ids) = 1
                       then new.store_ids[1] else null end;
  return new;
end $$;

drop trigger if exists sync_template_store_id on public.task_templates;
create trigger sync_template_store_id
  before insert or update of store_ids on public.task_templates
  for each row execute function app.sync_template_store_id();

-- scheduler: materialise per store in store_ids (or every store when chain-wide).
-- Only the store loop's WHERE clause changed from the previous version.
CREATE OR REPLACE FUNCTION app.scheduler_tick()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  tpl record;
  st record;
  r record;
  inst record;
  t text;
  tz text;
  today date;
  local_now timestamp;
  trigger_at timestamptz;
  due_ts timestamptz;
  cutoff_ts timestamptz;
  k text;
  owners uuid[];
  leaders uuid[];
  recips uuid[];
begin
  select coalesce(array_agg(id), '{}') into owners from profiles where role = 'owner';

  for tpl in
    select * from task_templates where recurrence is not null
      and (recurrence->>'freq') in ('daily','weekly','month_end','on_clock_in')
  loop
    for st in
      select * from stores where org_id = tpl.org_id
        and (coalesce(cardinality(tpl.store_ids), 0) = 0 or id = any(tpl.store_ids))
    loop
      tz := coalesce(st.timezone, 'Europe/London');
      local_now := now() at time zone tz;
      today := local_now::date;

      if (tpl.recurrence->>'freq') = 'on_clock_in' then
        for r in
          select * from shift_roster
          where store_id = st.id and clock_in_at is not null
            and (shift_start at time zone tz)::date = today
        loop
          k := tpl.id || ':' || st.id || ':' || r.user_id || ':' || today;
          if (tpl.recurrence->>'deadline_rel') = 'shift_end-2h' then
            due_ts := r.shift_end - interval '2 hours';
          else
            due_ts := r.shift_end;
          end if;
          insert into task_instances (org_id, template_id, store_id, title, description, category,
            priority, status, evidence, geofence_policy, is_temperature_log, due_at, cutoff_at,
            assigned_to, generated_key)
          values (tpl.org_id, tpl.id, st.id, tpl.title, tpl.description, tpl.category, tpl.priority,
            'assigned', tpl.evidence, tpl.geofence_policy, tpl.is_temperature_log,
            due_ts, r.shift_end, r.user_id, k)
          on conflict (generated_key) do nothing;
        end loop;
        continue;
      end if;

      if (tpl.recurrence->>'freq') = 'month_end' then
        if today <> (date_trunc('month', today) + interval '1 month - 1 day')::date then
          continue;
        end if;
        k := tpl.id || ':' || st.id || ':' || today;
        cutoff_ts := ((date_trunc('month', today) + interval '1 month + 4 days')::timestamp) at time zone tz;
        insert into task_instances (org_id, template_id, store_id, title, description, category,
          priority, status, evidence, geofence_policy, due_at, cutoff_at, generated_key)
        values (tpl.org_id, tpl.id, st.id, tpl.title, tpl.description, tpl.category, tpl.priority,
          'assigned', tpl.evidence, tpl.geofence_policy, null, cutoff_ts, k)
        on conflict (generated_key) do nothing;
        continue;
      end if;

      if (tpl.recurrence->>'freq') = 'daily'
         and tpl.recurrence ? 'except_days'
         and (select bool_or((v)::int = extract(isodow from local_now)::int)
              from jsonb_array_elements_text(tpl.recurrence->'except_days') v) then
        continue;
      end if;
      if (tpl.recurrence->>'freq') = 'weekly'
         and not coalesce((select bool_or((v)::int = extract(isodow from local_now)::int)
              from jsonb_array_elements_text(tpl.recurrence->'byweekday') v), false) then
        continue;
      end if;

      for t in select jsonb_array_elements_text(coalesce(tpl.recurrence->'times', '[]'::jsonb)) loop
        trigger_at := (today::timestamp + t::time) at time zone tz;
        if now() < trigger_at then continue; end if;
        k := tpl.id || ':' || st.id || ':' || today || ':' || t;
        if tpl.recurrence ? 'deadline' then
          due_ts := (today::timestamp + (tpl.recurrence->>'deadline')::time) at time zone tz;
        else
          due_ts := trigger_at;
        end if;
        if tpl.recurrence ? 'escalate_at' then
          cutoff_ts := (today::timestamp + (tpl.recurrence->>'escalate_at')::time) at time zone tz;
        else
          cutoff_ts := null;
        end if;
        insert into task_instances (org_id, template_id, store_id, title, description, category,
          priority, status, evidence, geofence_policy, is_temperature_log, due_at, cutoff_at, generated_key)
        values (tpl.org_id, tpl.id, st.id, tpl.title, tpl.description, tpl.category, tpl.priority,
          'assigned', tpl.evidence, tpl.geofence_policy, tpl.is_temperature_log, due_ts, cutoff_ts, k)
        on conflict (generated_key) do nothing;
      end loop;
    end loop;
  end loop;

  for inst in
    select * from task_instances
    where status in ('scheduled','assigned','in_progress','rejected')
      and due_at is not null and reminder_sent_at is null
      and now() >= due_at - interval '30 minutes' and now() < due_at
  loop
    recips := case when inst.assigned_to is not null then array[inst.assigned_to]
      else coalesce((select array_agg(usr.user_id) from user_store_roles usr
                     where usr.store_id = inst.store_id and usr.role = 'staff'), '{}') end;
    insert into notifications (org_id, user_id, type, title, body, deep_link, icon)
    select inst.org_id, u, 'reminder', 'Due soon: ' || inst.title,
      'Due at ' || to_char(inst.due_at at time zone 'Europe/London', 'HH24:MI'), '/staff/tasks', 'clock-countdown'
    from unnest(recips) u;
    update task_instances set reminder_sent_at = now() where id = inst.id;
  end loop;

  for inst in
    select * from task_instances
    where status in ('scheduled','assigned','in_progress','rejected')
      and due_at is not null and overdue_notified_at is null and now() > due_at
  loop
    select coalesce(array_agg(usr.user_id), '{}') into leaders from user_store_roles usr
      where usr.store_id = inst.store_id and usr.role = 'team_leader';
    recips := leaders;
    if inst.assigned_to is not null then recips := recips || inst.assigned_to; end if;
    insert into notifications (org_id, user_id, type, title, body, deep_link, icon)
    select inst.org_id, u, 'overdue', 'Overdue: ' || inst.title,
      'Was due ' || to_char(inst.due_at at time zone 'Europe/London', 'HH24:MI'), '/staff/tasks', 'clock-countdown'
    from unnest(recips) u;
    update task_instances set overdue_notified_at = now() where id = inst.id;
  end loop;

  for inst in
    select i.*, coalesce(t.recurrence->>'pending_until_complete','false') as puc
    from task_instances i left join task_templates t on t.id = i.template_id
    where i.status in ('scheduled','assigned','in_progress','rejected')
      and i.cutoff_at is not null and i.escalation_created_at is null and now() > i.cutoff_at
  loop
    if inst.puc <> 'true' then
      update task_instances set status = 'missed' where id = inst.id;
    end if;
    insert into escalations (org_id, store_id, source, title, detail, level, stage, status, instance_id, action_due_at)
    values (inst.org_id, inst.store_id, 'missed_deadline',
      case when inst.puc = 'true' then 'Still pending: ' || inst.title else 'Missed: ' || inst.title end,
      'Not completed by the ' || to_char(inst.cutoff_at at time zone 'Europe/London', 'DD Mon HH24:MI') || ' cutoff. Escalated automatically.',
      (case when inst.priority in ('high','critical') then 'critical' else 'high' end)::escalation_level,
      'owner'::escalation_stage, 'open'::escalation_status, inst.id, now() + interval '24 hours');
    recips := owners;
    if inst.assigned_to is not null then recips := recips || inst.assigned_to; end if;
    insert into notifications (org_id, user_id, type, title, body, deep_link, icon)
    select inst.org_id, u, 'escalation',
      case when inst.puc = 'true' then 'Escalation: ' || inst.title || ' still pending'
           else 'Missed checklist: ' || inst.title end,
      'Escalated to the Owner automatically', '/owner/escalations', 'warning-octagon'
    from unnest(recips) u;
    update task_instances set escalation_created_at = now() where id = inst.id;
  end loop;
end $function$;
