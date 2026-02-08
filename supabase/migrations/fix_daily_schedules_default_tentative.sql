-- Ensure new schedules are editable under RLS.
-- RLS policies for schedule_*_allocations require daily_schedules.is_tentative = true.
--
-- Historically, daily_schedules.is_tentative defaulted to false, which can create rows that
-- immediately block saving allocations (RLS “new row violates row-level security policy”).

ALTER TABLE public.daily_schedules
  ALTER COLUMN is_tentative SET DEFAULT true;

UPDATE public.daily_schedules
SET is_tentative = true
WHERE COALESCE(is_tentative, false) = false;

