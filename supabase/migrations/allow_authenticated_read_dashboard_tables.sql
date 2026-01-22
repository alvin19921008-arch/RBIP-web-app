-- Allow authenticated users to READ dashboard tables.
-- Writes remain controlled by existing admin/developer policies.

-- staff
drop policy if exists "Authenticated read staff" on public.staff;
create policy "Authenticated read staff"
on public.staff
for select
to authenticated
using (true);

-- wards
drop policy if exists "Authenticated read wards" on public.wards;
create policy "Authenticated read wards"
on public.wards
for select
to authenticated
using (true);

-- team_settings
drop policy if exists "Authenticated read team_settings" on public.team_settings;
create policy "Authenticated read team_settings"
on public.team_settings
for select
to authenticated
using (true);

-- pca_preferences
drop policy if exists "Authenticated read pca_preferences" on public.pca_preferences;
create policy "Authenticated read pca_preferences"
on public.pca_preferences
for select
to authenticated
using (true);

-- special_programs
drop policy if exists "Authenticated read special_programs" on public.special_programs;
create policy "Authenticated read special_programs"
on public.special_programs
for select
to authenticated
using (true);

-- spt_allocations
drop policy if exists "Authenticated read spt_allocations" on public.spt_allocations;
create policy "Authenticated read spt_allocations"
on public.spt_allocations
for select
to authenticated
using (true);

-- config_global_head
drop policy if exists "Authenticated read config_global_head" on public.config_global_head;
create policy "Authenticated read config_global_head"
on public.config_global_head
for select
to authenticated
using (true);

-- config_global_backups
drop policy if exists "Authenticated read config_global_backups" on public.config_global_backups;
create policy "Authenticated read config_global_backups"
on public.config_global_backups
for select
to authenticated
using (true);

-- daily_schedules (needed for dashboard sync panel date list)
drop policy if exists "Authenticated read daily_schedules" on public.daily_schedules;
create policy "Authenticated read daily_schedules"
on public.daily_schedules
for select
to authenticated
using (true);

