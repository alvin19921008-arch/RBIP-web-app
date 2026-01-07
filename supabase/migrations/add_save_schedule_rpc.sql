-- save_schedule_v1: server-side transactional save for schedules.
--
-- This function:
-- - Upserts therapist allocations (ON CONFLICT schedule_id, staff_id)
-- - Upserts PCA allocations (ON CONFLICT schedule_id, staff_id)
-- - Replaces bed allocations (delete + insert)
-- - Upserts schedule calculations (ON CONFLICT schedule_id, team)
-- - Updates schedule metadata (tie_break_decisions, staff_overrides, workflow_state)
--
-- Notes:
-- - Relies on unique constraints from add_allocation_upsert_constraints.sql
-- - Runs with SECURITY INVOKER (default) so RLS policies still apply

CREATE OR REPLACE FUNCTION public.save_schedule_v1(
  schedule_id uuid,
  therapist_allocations jsonb,
  pca_allocations jsonb,
  bed_allocations jsonb,
  calculations jsonb,
  tie_break_decisions jsonb,
  staff_overrides jsonb,
  workflow_state jsonb
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Therapist allocations
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
    x.schedule_id,
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
    schedule_id uuid,
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
  )
  ON CONFLICT (schedule_id, staff_id)
  DO UPDATE SET
    team = EXCLUDED.team,
    fte_therapist = EXCLUDED.fte_therapist,
    fte_remaining = EXCLUDED.fte_remaining,
    slot_whole = EXCLUDED.slot_whole,
    slot1 = EXCLUDED.slot1,
    slot2 = EXCLUDED.slot2,
    slot3 = EXCLUDED.slot3,
    slot4 = EXCLUDED.slot4,
    leave_type = EXCLUDED.leave_type,
    special_program_ids = EXCLUDED.special_program_ids,
    is_substitute_team_head = EXCLUDED.is_substitute_team_head,
    spt_slot_display = EXCLUDED.spt_slot_display,
    is_manual_override = EXCLUDED.is_manual_override,
    manual_override_note = EXCLUDED.manual_override_note;

  -- PCA allocations
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
    invalid_slot,
    leave_comeback_time,
    leave_mode
  )
  SELECT
    x.schedule_id,
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
    x.invalid_slot,
    x.leave_comeback_time,
    x.leave_mode
  FROM jsonb_to_recordset(COALESCE(pca_allocations, '[]'::jsonb)) AS x(
    schedule_id uuid,
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
    invalid_slot integer,
    leave_comeback_time text,
    leave_mode text
  )
  ON CONFLICT (schedule_id, staff_id)
  DO UPDATE SET
    team = EXCLUDED.team,
    fte_pca = EXCLUDED.fte_pca,
    fte_remaining = EXCLUDED.fte_remaining,
    slot_assigned = EXCLUDED.slot_assigned,
    slot_whole = EXCLUDED.slot_whole,
    slot1 = EXCLUDED.slot1,
    slot2 = EXCLUDED.slot2,
    slot3 = EXCLUDED.slot3,
    slot4 = EXCLUDED.slot4,
    leave_type = EXCLUDED.leave_type,
    special_program_ids = EXCLUDED.special_program_ids,
    invalid_slot = EXCLUDED.invalid_slot,
    leave_comeback_time = EXCLUDED.leave_comeback_time,
    leave_mode = EXCLUDED.leave_mode;

  -- Bed allocations (replace)
  DELETE FROM schedule_bed_allocations
  WHERE schedule_bed_allocations.schedule_id = save_schedule_v1.schedule_id;

  INSERT INTO schedule_bed_allocations (
    schedule_id,
    from_team,
    to_team,
    ward,
    num_beds,
    slot
  )
  SELECT
    save_schedule_v1.schedule_id,
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

  -- Schedule calculations
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
    x.schedule_id,
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
    schedule_id uuid,
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

  -- Schedule metadata
  UPDATE daily_schedules
  SET
    is_tentative = true,
    tie_break_decisions = COALESCE(save_schedule_v1.tie_break_decisions, '{}'::jsonb),
    staff_overrides = COALESCE(save_schedule_v1.staff_overrides, '{}'::jsonb),
    workflow_state = COALESCE(save_schedule_v1.workflow_state, '{}'::jsonb)
  WHERE daily_schedules.id = save_schedule_v1.schedule_id;
END;
$$;

