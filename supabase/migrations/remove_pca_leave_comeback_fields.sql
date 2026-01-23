-- Remove legacy PCA leave comeback fields.
--
-- This migration:
-- 1) Updates RPCs that referenced leave_comeback_time / leave_mode
-- 2) Drops the columns from schedule_pca_allocations
--
-- Rationale: the app no longer uses the leave/come-back time feature, and historical schedules are test-only.

-- ============================================================================
-- save_schedule_v1: remove leave_comeback_time / leave_mode from PCA payload
-- ============================================================================
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
RETURNS void
LANGUAGE plpgsql
AS $$
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

  -- PCA allocations (upsert by schedule_id, staff_id)
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
    invalid_slot = EXCLUDED.invalid_slot;

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

  -- Schedule metadata
  UPDATE daily_schedules
  SET
    is_tentative = true,
    tie_break_decisions = COALESCE(save_schedule_v1.tie_break_decisions, '{}'::jsonb),
    staff_overrides = COALESCE(save_schedule_v1.staff_overrides, '{}'::jsonb),
    workflow_state = COALESCE(save_schedule_v1.workflow_state, '{}'::jsonb)
  WHERE daily_schedules.id = p_schedule_id;
END;
$$;

-- ============================================================================
-- copy_schedule_v1: remove leave_comeback_time / leave_mode from PCA copy
-- ============================================================================
CREATE OR REPLACE FUNCTION public.copy_schedule_v1(
  from_schedule_id uuid,
  to_schedule_id uuid,
  mode text,
  include_buffer_staff boolean,
  baseline_snapshot jsonb,
  staff_overrides jsonb,
  workflow_state jsonb,
  tie_break_decisions jsonb,
  buffer_staff_ids uuid[] DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  is_full boolean;
BEGIN
  is_full := (mode = 'full');

  -- Clear target tables
  DELETE FROM schedule_therapist_allocations WHERE schedule_id = to_schedule_id;
  DELETE FROM schedule_pca_allocations WHERE schedule_id = to_schedule_id;
  DELETE FROM schedule_bed_allocations WHERE schedule_id = to_schedule_id;
  DELETE FROM schedule_calculations WHERE schedule_id = to_schedule_id;
  -- Legacy-safe: unmet-needs tracking table may not exist in some deployments.
  IF to_regclass('public.pca_unmet_needs_tracking') IS NOT NULL THEN
    DELETE FROM pca_unmet_needs_tracking WHERE schedule_id = to_schedule_id;
  END IF;

  -- Therapist allocations (always copied)
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
    to_schedule_id,
    a.staff_id,
    a.team,
    a.fte_therapist,
    a.fte_remaining,
    a.slot_whole,
    a.slot1,
    a.slot2,
    a.slot3,
    a.slot4,
    a.leave_type,
    a.special_program_ids,
    a.is_substitute_team_head,
    a.spt_slot_display,
    a.is_manual_override,
    a.manual_override_note
  FROM schedule_therapist_allocations a
  WHERE a.schedule_id = from_schedule_id
    AND (
      include_buffer_staff
      OR buffer_staff_ids IS NULL
      OR NOT (a.staff_id = ANY(buffer_staff_ids))
    );

  -- PCA allocations
  IF is_full THEN
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
      to_schedule_id,
      a.staff_id,
      a.team,
      a.fte_pca,
      a.fte_remaining,
      a.slot_assigned,
      a.slot_whole,
      a.slot1,
      a.slot2,
      a.slot3,
      a.slot4,
      a.leave_type,
      a.special_program_ids,
      a.invalid_slot
    FROM schedule_pca_allocations a
    WHERE a.schedule_id = from_schedule_id
      AND (
        include_buffer_staff
        OR buffer_staff_ids IS NULL
        OR NOT (a.staff_id = ANY(buffer_staff_ids))
      );
  ELSE
    -- Hybrid: non-floating + special-program + substitution PCAs
    WITH substitution_ids AS (
      SELECT (e.key)::uuid AS staff_id
      FROM jsonb_each(COALESCE(staff_overrides, '{}'::jsonb)) AS e(key, value)
      WHERE (e.value ? 'substitutionFor')
    )
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
      to_schedule_id,
      a.staff_id,
      a.team,
      a.fte_pca,
      a.fte_remaining,
      a.slot_assigned,
      a.slot_whole,
      a.slot1,
      a.slot2,
      a.slot3,
      a.slot4,
      a.leave_type,
      a.special_program_ids,
      a.invalid_slot
    FROM schedule_pca_allocations a
    LEFT JOIN staff s ON s.id = a.staff_id
    WHERE a.schedule_id = from_schedule_id
      AND (
        include_buffer_staff
        OR buffer_staff_ids IS NULL
        OR NOT (a.staff_id = ANY(buffer_staff_ids))
      )
      AND (
        COALESCE(s.floating, false) = false
        OR (a.special_program_ids IS NOT NULL AND array_length(a.special_program_ids, 1) > 0)
        OR a.staff_id IN (SELECT staff_id FROM substitution_ids)
      );
  END IF;

  -- Bed allocations + calculations only for full copy
  IF is_full THEN
    INSERT INTO schedule_bed_allocations (schedule_id, from_team, to_team, ward, num_beds, slot)
    SELECT to_schedule_id, a.from_team, a.to_team, a.ward, a.num_beds, a.slot
    FROM schedule_bed_allocations a
    WHERE a.schedule_id = from_schedule_id;

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
      to_schedule_id,
      c.team,
      c.designated_wards,
      c.total_beds_designated,
      c.total_beds,
      c.total_pt_on_duty,
      c.beds_per_pt,
      c.pt_per_team,
      c.beds_for_relieving,
      c.pca_on_duty,
      c.total_pt_per_pca,
      c.total_pt_per_team,
      c.average_pca_per_team
    FROM schedule_calculations c
    WHERE c.schedule_id = from_schedule_id;
  END IF;

  -- Update target schedule metadata
  UPDATE daily_schedules
  SET
    is_tentative = true,
    baseline_snapshot = COALESCE(copy_schedule_v1.baseline_snapshot, '{}'::jsonb),
    staff_overrides = COALESCE(copy_schedule_v1.staff_overrides, '{}'::jsonb),
    workflow_state = COALESCE(copy_schedule_v1.workflow_state, '{}'::jsonb),
    tie_break_decisions = COALESCE(copy_schedule_v1.tie_break_decisions, '{}'::jsonb)
  WHERE daily_schedules.id = to_schedule_id;
END;
$$;

-- ============================================================================
-- Drop columns
-- ============================================================================
ALTER TABLE public.schedule_pca_allocations
  DROP COLUMN IF EXISTS leave_comeback_time;

ALTER TABLE public.schedule_pca_allocations
  DROP COLUMN IF EXISTS leave_mode;

