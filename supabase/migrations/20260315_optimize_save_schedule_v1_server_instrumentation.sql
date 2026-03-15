-- Further optimize + instrument save_schedule_v1:
-- - Return structured diagnostics (timings/rows/metadata updates)
-- - Skip metadata UPDATE when values are unchanged
-- - Keep PCA replace semantics to avoid client-side stale-row reconciliation

DROP FUNCTION IF EXISTS public.save_schedule_v1(
  uuid,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb
);

CREATE OR REPLACE FUNCTION public.save_schedule_v1(
  p_schedule_id uuid,
  therapist_allocations jsonb,
  pca_allocations jsonb,
  bed_allocations jsonb,
  calculations jsonb,
  tie_break_decisions jsonb,
  staff_overrides jsonb,
  workflow_state jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_started_at timestamptz := clock_timestamp();
  v_checkpoint timestamptz := v_started_at;

  v_therapist_ms numeric := 0;
  v_pca_ms numeric := 0;
  v_bed_ms numeric := 0;
  v_calc_ms numeric := 0;
  v_meta_ms numeric := 0;

  v_therapist_inserted integer := 0;
  v_pca_inserted integer := 0;
  v_bed_inserted integer := 0;
  v_calc_upserted integer := 0;

  v_input_therapist integer := 0;
  v_input_pca integer := 0;
  v_input_bed integer := 0;
  v_input_calc integer := 0;

  v_updated_at timestamptz;
  v_metadata_changed boolean := false;

  v_tie_break_decisions jsonb := COALESCE(tie_break_decisions, '{}'::jsonb);
  v_staff_overrides jsonb := COALESCE(staff_overrides, '{}'::jsonb);
  v_workflow_state jsonb := COALESCE(workflow_state, '{}'::jsonb);
BEGIN
  v_input_therapist := CASE WHEN jsonb_typeof(COALESCE(therapist_allocations, '[]'::jsonb)) = 'array'
    THEN jsonb_array_length(COALESCE(therapist_allocations, '[]'::jsonb)) ELSE 0 END;
  v_input_pca := CASE WHEN jsonb_typeof(COALESCE(pca_allocations, '[]'::jsonb)) = 'array'
    THEN jsonb_array_length(COALESCE(pca_allocations, '[]'::jsonb)) ELSE 0 END;
  v_input_bed := CASE WHEN jsonb_typeof(COALESCE(bed_allocations, '[]'::jsonb)) = 'array'
    THEN jsonb_array_length(COALESCE(bed_allocations, '[]'::jsonb)) ELSE 0 END;
  v_input_calc := CASE WHEN jsonb_typeof(COALESCE(calculations, '[]'::jsonb)) = 'array'
    THEN jsonb_array_length(COALESCE(calculations, '[]'::jsonb)) ELSE 0 END;

  -- Therapist allocations (replace)
  DELETE FROM schedule_therapist_allocations
  WHERE schedule_therapist_allocations.schedule_id = p_schedule_id;

  INSERT INTO schedule_therapist_allocations (
    schedule_id,
    staff_id,
    team,
    fte_therapist,
    fte_remaining,
    slot_whole,
    slot1,
    slot2,
    slot3,
    slot4,
    leave_type,
    special_program_ids,
    is_substitute_team_head,
    spt_slot_display,
    is_manual_override,
    manual_override_note
  )
  SELECT
    p_schedule_id,
    x.staff_id,
    x.team,
    x.fte_therapist,
    x.fte_remaining,
    x.slot_whole,
    x.slot1,
    x.slot2,
    x.slot3,
    x.slot4,
    x.leave_type,
    x.special_program_ids,
    COALESCE(x.is_substitute_team_head, false),
    x.spt_slot_display,
    COALESCE(x.is_manual_override, false),
    x.manual_override_note
  FROM jsonb_to_recordset(COALESCE(therapist_allocations, '[]'::jsonb)) AS x(
    staff_id uuid,
    team team,
    fte_therapist numeric,
    fte_remaining numeric,
    slot_whole integer,
    slot1 team,
    slot2 team,
    slot3 team,
    slot4 team,
    leave_type leave_type,
    special_program_ids uuid[],
    is_substitute_team_head boolean,
    spt_slot_display text,
    is_manual_override boolean,
    manual_override_note text
  );
  GET DIAGNOSTICS v_therapist_inserted = ROW_COUNT;
  v_therapist_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_checkpoint)) * 1000;
  v_checkpoint := clock_timestamp();

  -- PCA allocations (replace wholesale)
  DELETE FROM schedule_pca_allocations
  WHERE schedule_pca_allocations.schedule_id = p_schedule_id;

  INSERT INTO schedule_pca_allocations (
    schedule_id,
    staff_id,
    team,
    fte_pca,
    fte_remaining,
    slot_assigned,
    slot_whole,
    slot1,
    slot2,
    slot3,
    slot4,
    leave_type,
    special_program_ids,
    invalid_slot
  )
  SELECT
    p_schedule_id,
    x.staff_id,
    x.team,
    x.fte_pca,
    x.fte_remaining,
    x.slot_assigned,
    x.slot_whole,
    x.slot1,
    x.slot2,
    x.slot3,
    x.slot4,
    x.leave_type,
    x.special_program_ids,
    x.invalid_slot
  FROM jsonb_to_recordset(COALESCE(pca_allocations, '[]'::jsonb)) AS x(
    staff_id uuid,
    team team,
    fte_pca numeric,
    fte_remaining numeric,
    slot_assigned numeric,
    slot_whole integer,
    slot1 team,
    slot2 team,
    slot3 team,
    slot4 team,
    leave_type leave_type,
    special_program_ids uuid[],
    invalid_slot integer
  );
  GET DIAGNOSTICS v_pca_inserted = ROW_COUNT;
  v_pca_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_checkpoint)) * 1000;
  v_checkpoint := clock_timestamp();

  -- Bed allocations (replace)
  DELETE FROM schedule_bed_allocations
  WHERE schedule_bed_allocations.schedule_id = p_schedule_id;

  INSERT INTO schedule_bed_allocations (
    schedule_id,
    from_team,
    to_team,
    ward,
    num_beds,
    slot
  )
  SELECT
    p_schedule_id,
    x.from_team,
    x.to_team,
    x.ward,
    x.num_beds,
    x.slot
  FROM jsonb_to_recordset(COALESCE(bed_allocations, '[]'::jsonb)) AS x(
    from_team team,
    to_team team,
    ward text,
    num_beds integer,
    slot integer
  );
  GET DIAGNOSTICS v_bed_inserted = ROW_COUNT;
  v_bed_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_checkpoint)) * 1000;
  v_checkpoint := clock_timestamp();

  -- Schedule calculations (upsert)
  INSERT INTO schedule_calculations (
    schedule_id,
    team,
    designated_wards,
    total_beds_designated,
    total_beds,
    total_pt_on_duty,
    beds_per_pt,
    pt_per_team,
    beds_for_relieving,
    pca_on_duty,
    total_pt_per_pca,
    total_pt_per_team,
    average_pca_per_team
  )
  SELECT
    p_schedule_id,
    x.team,
    COALESCE(x.designated_wards, '{}'::text[]),
    x.total_beds_designated,
    x.total_beds,
    x.total_pt_on_duty,
    x.beds_per_pt,
    x.pt_per_team,
    x.beds_for_relieving,
    x.pca_on_duty,
    x.total_pt_per_pca,
    x.total_pt_per_team,
    x.average_pca_per_team
  FROM jsonb_to_recordset(COALESCE(calculations, '[]'::jsonb)) AS x(
    team team,
    designated_wards text[],
    total_beds_designated integer,
    total_beds integer,
    total_pt_on_duty numeric,
    beds_per_pt numeric,
    pt_per_team numeric,
    beds_for_relieving numeric,
    pca_on_duty numeric,
    total_pt_per_pca numeric,
    total_pt_per_team numeric,
    average_pca_per_team numeric
  )
  ON CONFLICT (schedule_id, team)
  DO UPDATE SET
    designated_wards = EXCLUDED.designated_wards,
    total_beds_designated = EXCLUDED.total_beds_designated,
    total_beds = EXCLUDED.total_beds,
    total_pt_on_duty = EXCLUDED.total_pt_on_duty,
    beds_per_pt = EXCLUDED.beds_per_pt,
    pt_per_team = EXCLUDED.pt_per_team,
    beds_for_relieving = EXCLUDED.beds_for_relieving,
    pca_on_duty = EXCLUDED.pca_on_duty,
    total_pt_per_pca = EXCLUDED.total_pt_per_pca,
    total_pt_per_team = EXCLUDED.total_pt_per_team,
    average_pca_per_team = EXCLUDED.average_pca_per_team;
  GET DIAGNOSTICS v_calc_upserted = ROW_COUNT;
  v_calc_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_checkpoint)) * 1000;
  v_checkpoint := clock_timestamp();

  -- Schedule metadata: only write when anything changed
  UPDATE daily_schedules
  SET
    is_tentative = true,
    tie_break_decisions = v_tie_break_decisions,
    staff_overrides = v_staff_overrides,
    workflow_state = v_workflow_state
  WHERE daily_schedules.id = p_schedule_id
    AND (
      daily_schedules.is_tentative IS DISTINCT FROM true
      OR daily_schedules.tie_break_decisions IS DISTINCT FROM v_tie_break_decisions
      OR daily_schedules.staff_overrides IS DISTINCT FROM v_staff_overrides
      OR daily_schedules.workflow_state IS DISTINCT FROM v_workflow_state
    )
  RETURNING daily_schedules.updated_at INTO v_updated_at;

  IF FOUND THEN
    v_metadata_changed := true;
  ELSE
    SELECT updated_at INTO v_updated_at
    FROM daily_schedules
    WHERE id = p_schedule_id;
    v_metadata_changed := false;
  END IF;

  v_meta_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_checkpoint)) * 1000;

  RETURN jsonb_build_object(
    'updated_at', v_updated_at,
    'timings', jsonb_build_object(
      'total_ms', EXTRACT(EPOCH FROM (clock_timestamp() - v_started_at)) * 1000,
      'therapist_ms', v_therapist_ms,
      'pca_ms', v_pca_ms,
      'bed_ms', v_bed_ms,
      'calc_ms', v_calc_ms,
      'metadata_ms', v_meta_ms
    ),
    'rows', jsonb_build_object(
      'therapist_input', v_input_therapist,
      'pca_input', v_input_pca,
      'bed_input', v_input_bed,
      'calc_input', v_input_calc,
      'therapist_inserted', v_therapist_inserted,
      'pca_inserted', v_pca_inserted,
      'bed_inserted', v_bed_inserted,
      'calc_upserted', v_calc_upserted
    ),
    'metadata', jsonb_build_object(
      'changed', v_metadata_changed
    )
  );
END;
$$;

