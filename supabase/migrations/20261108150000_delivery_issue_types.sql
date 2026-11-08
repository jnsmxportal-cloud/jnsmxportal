-- Delivery Received asks "Any issues or discrepancies with this delivery?" instead of only a
-- quantity question: staff pick one or more issue types, and discrepancy_units becomes the
-- (optional) number of units affected. Values the app writes:
--   short · damaged · wrong_item · expired · over · other
alter table public.deliveries
  add column if not exists issue_types text[] not null default '{}';

-- deliveries logged before this recorded only "units short"
update public.deliveries
set issue_types = array['short']
where discrepancy_units > 0 and issue_types = '{}';
