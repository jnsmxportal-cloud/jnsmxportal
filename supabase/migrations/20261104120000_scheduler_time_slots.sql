-- Per-run-time deadlines, slot labels and rota assignment for daily / weekly / biweekly templates
-- (SCRUM-11: a chiller temperature log taken twice a day needs a morning deadline for the morning
-- reading and an evening deadline for the evening reading, each handled by the staff on shift).
--
-- recurrence additions (all optional, keyed by the HH:MM entries of `times`):
--   deadlines       {"07:00":"09:00","19:00":"21:00"}  deadline per run time; when the key is present
--                   a time without an entry is due at its trigger time. Without the key the legacy
--                   template-wide `deadline` still applies to every time.
--   labels          {"07:00":"Morning","19:00":"Evening"}  appended to the task title ("… · Morning")
--   assign_on_shift true  → the task is assigned to whoever the rota (shifts) has on shift at that
--                   store at the trigger time (latest-starting shift wins); the assignee is notified.
--                   Nobody on shift → unassigned, i.e. open to anyone at the store, as before.

create or replace function app.scheduler_tick()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  anchor_monday date;
  k text;
  owners uuid[];
  leaders uuid[];
  recips uuid[];
  slot_deadline text;
  slot_title text;
  assignee uuid;
  new_id uuid;
begin
  select coalesce(array_agg(id), '{}') into owners from profiles where role = 'owner';

  for tpl in
    select * from task_templates where recurrence is not null
      and (recurrence->>'freq') in ('once','daily','weekly','biweekly','month_end','on_clock_in')
  loop
    for st in
      select * from stores where org_id = tpl.org_id
        and (coalesce(cardinality(tpl.store_ids), 0) = 0 or id = any(tpl.store_ids))
    loop
      tz := coalesce(st.timezone, 'Europe/London');
      local_now := now() at time zone tz;
      today := local_now::date;

      if (tpl.recurrence->>'freq') = 'once' then
        -- one-off: a single task per store in scope, created as soon as the template is saved and
        -- due at the owner's chosen local date-time. Editing the template's due date re-times the
        -- task while it is still open; once it is completed the template does not fire again.
        if not ((tpl.recurrence->>'due_at') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}') then
          continue;
        end if;
        due_ts := (left(tpl.recurrence->>'due_at', 16))::timestamp at time zone tz;
        if (tpl.recurrence->>'escalate_after_hours') ~ '^\d+(\.\d+)?$' then
          cutoff_ts := due_ts + ((tpl.recurrence->>'escalate_after_hours')::numeric * interval '1 hour');
        else
          cutoff_ts := null;
        end if;
        k := tpl.id || ':' || st.id || ':once';
        if exists (select 1 from scheduler_tombstones where generated_key = k) then continue; end if;
        insert into task_instances (org_id, template_id, store_id, title, description, category,
          priority, status, evidence, geofence_policy, is_temperature_log, due_at, cutoff_at, generated_key)
        values (tpl.org_id, tpl.id, st.id, tpl.title, tpl.description, tpl.category, tpl.priority,
          'assigned', tpl.evidence, tpl.geofence_policy, tpl.is_temperature_log, due_ts, cutoff_ts, k)
        on conflict (generated_key) do nothing;
        update task_instances
           set due_at = due_ts, cutoff_at = cutoff_ts,
               reminder_sent_at = case when due_ts > now() then null else reminder_sent_at end,
               overdue_notified_at = case when due_ts > now() then null else overdue_notified_at end
         where generated_key = k
           and status in ('scheduled','assigned','in_progress','rejected')
           and (due_at is distinct from due_ts or cutoff_at is distinct from cutoff_ts);
        continue;
      end if;

      if (tpl.recurrence->>'freq') = 'on_clock_in' then
        for r in
          select * from shift_roster
          where store_id = st.id and clock_in_at is not null
            and (shift_start at time zone tz)::date = today
        loop
          k := tpl.id || ':' || st.id || ':' || r.user_id || ':' || today;
          if exists (select 1 from scheduler_tombstones where generated_key = k) then continue; end if;
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
        if exists (select 1 from scheduler_tombstones where generated_key = k) then continue; end if;
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
      if (tpl.recurrence->>'freq') in ('weekly','biweekly')
         and not coalesce((select bool_or((v)::int = extract(isodow from local_now)::int)
              from jsonb_array_elements_text(tpl.recurrence->'byweekday') v), false) then
        continue;
      end if;
      if (tpl.recurrence->>'freq') = 'biweekly' then
        -- the anchor's week (Mon-Sun) is week 0; only even weeks since then are "on"
        anchor_monday := case
          when (tpl.recurrence->>'anchor') ~ '^\d{4}-\d{2}-\d{2}$' then (tpl.recurrence->>'anchor')::date
          else date '2026-01-05'
        end;
        anchor_monday := anchor_monday - (extract(isodow from anchor_monday)::int - 1);
        if today < anchor_monday or (((today - anchor_monday) / 7) % 2) <> 0 then
          continue;
        end if;
      end if;

      for t in select jsonb_array_elements_text(coalesce(tpl.recurrence->'times', '[]'::jsonb)) loop
        trigger_at := (today::timestamp + t::time) at time zone tz;
        if now() < trigger_at then continue; end if;
        k := tpl.id || ':' || st.id || ':' || today || ':' || t;
        if exists (select 1 from scheduler_tombstones where generated_key = k) then continue; end if;

        -- deadline for this run time: its own entry when the template has per-time deadlines,
        -- otherwise the legacy template-wide deadline; neither = due at the trigger time
        slot_deadline := case
          when tpl.recurrence ? 'deadlines' then tpl.recurrence->'deadlines'->>t
          else tpl.recurrence->>'deadline'
        end;
        if slot_deadline ~ '^\d{2}:\d{2}' then
          due_ts := (today::timestamp + slot_deadline::time) at time zone tz;
          -- a deadline earlier than the trigger time means the next day
          if due_ts < trigger_at then due_ts := due_ts + interval '1 day'; end if;
        else
          due_ts := trigger_at;
        end if;
        if (tpl.recurrence->>'escalate_after_hours') ~ '^\d+(\.\d+)?$' then
          -- relative: N hours after the deadline (0 = at the deadline)
          cutoff_ts := due_ts + ((tpl.recurrence->>'escalate_after_hours')::numeric * interval '1 hour');
        elsif tpl.recurrence ? 'escalate_at' then
          -- legacy absolute clock time; roll to the next day if it would precede the deadline
          cutoff_ts := (today::timestamp + (tpl.recurrence->>'escalate_at')::time) at time zone tz;
          if cutoff_ts < due_ts then cutoff_ts := cutoff_ts + interval '1 day'; end if;
        else
          cutoff_ts := null;
        end if;

        slot_title := tpl.title
          || coalesce(' · ' || nullif(btrim(tpl.recurrence->'labels'->>t), ''), '');

        assignee := null;
        if (tpl.recurrence->>'assign_on_shift') = 'true' then
          select s.user_id into assignee from shifts s
           where s.store_id = st.id and s.starts_at <= trigger_at and s.ends_at > trigger_at
           order by s.starts_at desc, s.created_at desc
           limit 1;
        end if;

        new_id := null;
        insert into task_instances (org_id, template_id, store_id, title, description, category,
          priority, status, evidence, geofence_policy, is_temperature_log, due_at, cutoff_at,
          assigned_to, generated_key)
        values (tpl.org_id, tpl.id, st.id, slot_title, tpl.description, tpl.category, tpl.priority,
          'assigned', tpl.evidence, tpl.geofence_policy, tpl.is_temperature_log, due_ts, cutoff_ts,
          assignee, k)
        on conflict (generated_key) do nothing
        returning id into new_id;

        if new_id is not null and assignee is not null then
          insert into notifications (org_id, user_id, type, title, body, deep_link, icon)
          values (tpl.org_id, assignee, 'assigned', 'Assigned to you: ' || slot_title,
            'Due ' || to_char(due_ts at time zone tz, 'HH24:MI')
              || case when (due_ts at time zone tz)::date > today then ' tomorrow' else ' today' end,
            '/staff/tasks', 'clipboard-text');
        end if;
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
