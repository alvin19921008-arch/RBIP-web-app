-- load_schedule_v1: server-side schedule load bundle for cold-start performance.
--
-- This function:
-- - Loads a schedule row by date
-- - Ensures is_tentative = true (some RLS policies depend on tentative schedules)
-- - Returns allocations + calculations in one JSON payload to reduce round trips
--
-- Notes:
-- - Runs with SECURITY INVOKER (default) so RLS policies still apply
-- - Returns NULL if schedule row does not exist for the given date
--
-- Return shape:
-- {
--   schedule: { id, date, is_tentative, tie_break_decisions, baseline_snapshot, staff_overrides, workflow_state },
--   therapist_allocations: [...],
--   pca_allocations: [...],
--   bed_allocations: [...],
--   calculations: [...]
-- }
CREATE OR REPLACE FUNCTION public.load_schedule_v1(
  p_date date
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  s daily_schedules%ROWTYPE;
BEGIN
  SELECT *
  INTO s
  FROM daily_schedules
  WHERE date = p_date
  LIMIT 1;

  IF s.id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Ensure schedule is tentative (RLS may depend on this)
  IF COALESCE(s.is_tentative, false) = false THEN
    UPDATE daily_schedules
    SET is_tentative = true
    WHERE id = s.id;
    s.is_tentative := true;
  END IF;

  RETURN jsonb_build_object(
    'schedule',
    jsonb_build_object(
      'id', s.id,
      'date', s.date,
      'is_tentative', COALESCE(s.is_tentative, true),
      'tie_break_decisions', COALESCE(s.tie_break_decisions, '{}'::jsonb),
      'baseline_snapshot', COALESCE(s.baseline_snapshot, '{}'::jsonb),
      'staff_overrides', COALESCE(s.staff_overrides, '{}'::jsonb),
      'workflow_state', COALESCE(s.workflow_state, '{}'::jsonb)
    ),
    'therapist_allocations',
    COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(a))
        FROM schedule_therapist_allocations a
        WHERE a.schedule_id = s.id
      ),
      '[]'::jsonb
    ),
    'pca_allocations',
    COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(a))
        FROM schedule_pca_allocations a
        WHERE a.schedule_id = s.id
      ),
      '[]'::jsonb
    ),
    'bed_allocations',
    COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(a))
        FROM schedule_bed_allocations a
        WHERE a.schedule_id = s.id
      ),
      '[]'::jsonb
    ),
    'calculations',
    COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(c))
        FROM schedule_calculations c
        WHERE c.schedule_id = s.id
      ),
      '[]'::jsonb
    )
  );
END;
$$;

