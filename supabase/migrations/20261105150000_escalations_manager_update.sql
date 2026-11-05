-- Managers hold "Investigate & resolve escalations" by default (and are alerted about delivery
-- discrepancies), but the update policy only admitted owners and team leaders, so their Resolve /
-- Investigate clicks were silently filtered out by RLS. Admit managers too.
drop policy if exists esc_update on public.escalations;
create policy esc_update on public.escalations
  for update
  using (
    org_id = app.uid_org()
    and app.uid_role() = any (array['owner', 'manager', 'team_leader']::app_role[])
  )
  with check (
    org_id = app.uid_org()
    and app.uid_role() = any (array['owner', 'manager', 'team_leader']::app_role[])
  );
