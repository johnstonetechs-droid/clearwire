-- ClearWire Field Reporter — reporters can edit their own submissions
--
-- Until a pro acknowledges, the reporter should be able to fix typos,
-- add more photos, correct the damage_type. Once the pro has moved
-- status past 'reported', we lock it — crews may already be relying
-- on the data.

drop policy if exists "reports_update_own" on public.reports;
create policy "reports_update_own" on public.reports for update
  using (reporter_id = auth.uid() and status = 'reported');

drop policy if exists "outage_update_own" on public.outage_reports;
create policy "outage_update_own" on public.outage_reports for update
  using (reporter_id = auth.uid() and status = 'reported');
