-- Fix security alerts: enable RLS on public.team_settings.
-- Policy "Authenticated read team_settings" already exists from allow_authenticated_read_dashboard_tables.sql;
-- it has no effect until RLS is enabled on the table.

ALTER TABLE public.team_settings ENABLE ROW LEVEL SECURITY;
