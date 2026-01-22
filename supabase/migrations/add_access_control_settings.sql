-- Access control settings (UI visibility feature flags)
-- Stored as a single "global" row, updated via server API using service role.

create table if not exists public.access_control_settings (
  key text primary key,
  settings jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id)
);

alter table public.access_control_settings enable row level security;

-- Any authenticated user can read settings (UI-only visibility control).
drop policy if exists "Authenticated can read access settings" on public.access_control_settings;
create policy "Authenticated can read access settings"
on public.access_control_settings
for select
to authenticated
using (true);

-- No insert/update/delete policies on purpose (writes are done via service role API).

