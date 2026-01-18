-- Performance indexes for load_schedule_v1 RPC
-- These indexes make the RPC scale as history grows by ensuring schedule_id/date filters
-- do not degrade into sequential scans.

-- daily_schedules.date is UNIQUE in schema, but ensure an explicit index exists (safe no-op if already present)
CREATE INDEX IF NOT EXISTS idx_daily_schedules_date ON public.daily_schedules(date);

-- load_schedule_v1 filters these tables by schedule_id
CREATE INDEX IF NOT EXISTS idx_schedule_bed_allocations_schedule_id
  ON public.schedule_bed_allocations(schedule_id);

CREATE INDEX IF NOT EXISTS idx_schedule_calculations_schedule_id
  ON public.schedule_calculations(schedule_id);

