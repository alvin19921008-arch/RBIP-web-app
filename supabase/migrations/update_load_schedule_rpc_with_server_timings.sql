-- Add server-side timing breakdown to load_schedule_v1 payload.
-- This helps diagnose DB-side slowness (cold cache, RLS overhead, JSON aggregation) without guessing.

CREATE OR REPLACE FUNCTION public.load_schedule_v1(
  p_date date
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  s daily_schedules%ROWTYPE;

  t0 timestamptz := clock_timestamp();
  t_after_schedule timestamptz;
  t_after_tentative timestamptz;
  t_after_th timestamptz;
  t_after_pca timestamptz;
  t_after_bed timestamptz;
  t_after_calcs timestamptz;

  th jsonb;
  pca jsonb;
  bed jsonb;
  calcs jsonb;

  ms_schedule numeric := 0;
  ms_tentative numeric := 0;
  ms_th numeric := 0;
  ms_pca numeric := 0;
  ms_bed numeric := 0;
  ms_calcs numeric := 0;
  ms_total numeric := 0;
BEGIN
  SELECT *
  INTO s
  FROM daily_schedules
  WHERE date = p_date
  LIMIT 1;

  t_after_schedule := clock_timestamp();
  ms_schedule := EXTRACT(EPOCH FROM (t_after_schedule - t0)) * 1000;

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

  t_after_tentative := clock_timestamp();
  ms_tentative := EXTRACT(EPOCH FROM (t_after_tentative - t_after_schedule)) * 1000;

  th := COALESCE(
    (
      SELECT jsonb_agg(to_jsonb(a))
      FROM schedule_therapist_allocations a
      WHERE a.schedule_id = s.id
    ),
    '[]'::jsonb
  );
  t_after_th := clock_timestamp();
  ms_th := EXTRACT(EPOCH FROM (t_after_th - t_after_tentative)) * 1000;

  pca := COALESCE(
    (
      SELECT jsonb_agg(to_jsonb(a))
      FROM schedule_pca_allocations a
      WHERE a.schedule_id = s.id
    ),
    '[]'::jsonb
  );
  t_after_pca := clock_timestamp();
  ms_pca := EXTRACT(EPOCH FROM (t_after_pca - t_after_th)) * 1000;

  bed := COALESCE(
    (
      SELECT jsonb_agg(to_jsonb(a))
      FROM schedule_bed_allocations a
      WHERE a.schedule_id = s.id
    ),
    '[]'::jsonb
  );
  t_after_bed := clock_timestamp();
  ms_bed := EXTRACT(EPOCH FROM (t_after_bed - t_after_pca)) * 1000;

  calcs := COALESCE(
    (
      SELECT jsonb_agg(to_jsonb(c))
      FROM schedule_calculations c
      WHERE c.schedule_id = s.id
    ),
    '[]'::jsonb
  );
  t_after_calcs := clock_timestamp();
  ms_calcs := EXTRACT(EPOCH FROM (t_after_calcs - t_after_bed)) * 1000;

  ms_total := EXTRACT(EPOCH FROM (t_after_calcs - t0)) * 1000;

  RETURN jsonb_build_object(
    'meta',
    jsonb_build_object(
      'server_ms',
      jsonb_build_object(
        'total', ms_total,
        'schedule', ms_schedule,
        'ensure_tentative', ms_tentative,
        'therapist_allocations', ms_th,
        'pca_allocations', ms_pca,
        'bed_allocations', ms_bed,
        'calculations', ms_calcs
      )
    ),
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
    'therapist_allocations', th,
    'pca_allocations', pca,
    'bed_allocations', bed,
    'calculations', calcs
  );
END;
$$;

