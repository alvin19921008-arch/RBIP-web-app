-- One-time helper: backfill missing baseline_snapshot.teamMerge on historical schedules.
-- Safety goals:
-- - only touch rows where teamMerge is missing
-- - support dry-run preview
-- - support date range scoping
-- - preserve existing snapshot payload shape (envelope v2/v1 vs legacy raw)

CREATE OR REPLACE FUNCTION public.backfill_missing_snapshot_team_merge_v1(
  p_from_date date DEFAULT NULL,
  p_to_date date DEFAULT NULL,
  p_dry_run boolean DEFAULT true,
  p_team_merge jsonb DEFAULT
    '{"mergedInto":{},"mergeLabelOverrideByTeam":{},"mergedPcaPreferencesOverrideByTeam":{}}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_candidates integer := 0;
  v_updated integer := 0;
  v_sample_dates text[];
BEGIN
  IF NOT public.is_admin_or_developer() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF p_from_date IS NOT NULL AND p_to_date IS NOT NULL AND p_from_date > p_to_date THEN
    RAISE EXCEPTION 'invalid_date_range';
  END IF;

  WITH candidates AS (
    SELECT
      d.id,
      d.date,
      d.baseline_snapshot,
      (d.baseline_snapshot ? 'data') AS is_envelope,
      CASE
        WHEN d.baseline_snapshot ? 'data' THEN COALESCE(d.baseline_snapshot -> 'data', '{}'::jsonb)
        ELSE COALESCE(d.baseline_snapshot, '{}'::jsonb)
      END AS data_blob
    FROM public.daily_schedules d
    WHERE (p_from_date IS NULL OR d.date >= p_from_date)
      AND (p_to_date IS NULL OR d.date <= p_to_date)
  )
  SELECT
    COUNT(*)::integer,
    ARRAY(
      SELECT c.date::text
      FROM candidates c
      WHERE COALESCE((c.data_blob ? 'teamMerge'), false) = false
      ORDER BY c.date DESC
      LIMIT 20
    )
  INTO v_candidates, v_sample_dates
  FROM candidates
  WHERE COALESCE((candidates.data_blob ? 'teamMerge'), false) = false;

  IF COALESCE(p_dry_run, true) THEN
    RETURN jsonb_build_object(
      'dryRun', true,
      'fromDate', p_from_date,
      'toDate', p_to_date,
      'candidates', v_candidates,
      'sampleDates', COALESCE(to_jsonb(v_sample_dates), '[]'::jsonb),
      'teamMergeToWrite', p_team_merge
    );
  END IF;

  WITH targets AS (
    SELECT
      d.id,
      (d.baseline_snapshot ? 'data') AS is_envelope,
      CASE
        WHEN d.baseline_snapshot ? 'data' THEN COALESCE(d.baseline_snapshot -> 'data', '{}'::jsonb)
        ELSE COALESCE(d.baseline_snapshot, '{}'::jsonb)
      END AS data_blob
    FROM public.daily_schedules d
    WHERE (p_from_date IS NULL OR d.date >= p_from_date)
      AND (p_to_date IS NULL OR d.date <= p_to_date)
      AND COALESCE(
        (
          CASE
            WHEN d.baseline_snapshot ? 'data' THEN COALESCE(d.baseline_snapshot -> 'data', '{}'::jsonb)
            ELSE COALESCE(d.baseline_snapshot, '{}'::jsonb)
          END
        ) ? 'teamMerge',
        false
      ) = false
  ),
  updates AS (
    UPDATE public.daily_schedules d
    SET baseline_snapshot = CASE
      WHEN t.is_envelope THEN jsonb_set(d.baseline_snapshot, '{data,teamMerge}', p_team_merge, true)
      ELSE jsonb_set(d.baseline_snapshot, '{teamMerge}', p_team_merge, true)
    END
    FROM targets t
    WHERE d.id = t.id
    RETURNING d.id
  )
  SELECT COUNT(*)::integer INTO v_updated FROM updates;

  RETURN jsonb_build_object(
    'dryRun', false,
    'fromDate', p_from_date,
    'toDate', p_to_date,
    'candidates', v_candidates,
    'updated', v_updated,
    'sampleDates', COALESCE(to_jsonb(v_sample_dates), '[]'::jsonb),
    'teamMergeWritten', p_team_merge
  );
END;
$$;

