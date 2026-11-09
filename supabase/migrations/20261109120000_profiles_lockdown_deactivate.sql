-- 1) Security: `profiles_update_self` let any signed-in user UPDATE every column of their own
--    row through the REST API — including role / role_id / org_id, i.e. a staff member could
--    make themselves Owner. The app only ever writes is_online / last_seen_at from the client;
--    role, name and store changes go through the service-role `admin-users` edge function, and
--    app.propagate_role_base() is SECURITY DEFINER. So: column-level UPDATE for presence only.
revoke update on public.profiles from anon, authenticated;
revoke update (id, org_id, full_name, role, role_id, avatar_color, is_online, last_seen_at, created_at)
  on public.profiles from anon, authenticated;
grant update (is_online, last_seen_at) on public.profiles to authenticated;

-- 2) Removing a team member. Members referenced by history (tasks, deliveries, evidence,
--    approvals, audit log …) cannot be hard-deleted without losing who-did-what, so they are
--    deactivated instead: sign-in banned, PIN + store access removed, hidden from lists and
--    pickers, name kept on past records. Members with no history are deleted outright.
alter table public.profiles add column if not exists deactivated_at timestamptz;
