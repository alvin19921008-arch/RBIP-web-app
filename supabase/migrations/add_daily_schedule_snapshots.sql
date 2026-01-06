-- Add per-schedule snapshot and workflow state columns to daily_schedules
ALTER TABLE public.daily_schedules
  ADD COLUMN IF NOT EXISTS baseline_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.daily_schedules
  ADD COLUMN IF NOT EXISTS staff_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.daily_schedules
  ADD COLUMN IF NOT EXISTS workflow_state JSONB NOT NULL DEFAULT '{}'::jsonb;

