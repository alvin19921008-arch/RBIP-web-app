-- Optimize save_schedule_v1:
-- 1) Replace PCA rows inside RPC (no client-side stale reconciliation queries)
-- 2) Return daily_schedules.updated_at so client can skip extra metadata fetch

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
RETURNS timestamptz
LANGUAGE plpgsql
AS $$
DECLARE
  v_updated_at timestamptz;
BEGIN
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

  -- Schedule metadata + updated_at in one roundtrip
  UPDATE daily_schedules
  SET
    is_tentative = true,
    tie_break_decisions = COALESCE(save_schedule_v1.tie_break_decisions, '{}'::jsonb),
    staff_overrides = COALESCE(save_schedule_v1.staff_overrides, '{}'::jsonb),
    workflow_state = COALESCE(save_schedule_v1.workflow_state, '{}'::jsonb)
  WHERE daily_schedules.id = p_schedule_id
  RETURNING daily_schedules.updated_at INTO v_updated_at;

  RETURN v_updated_at;
END;
$$;

