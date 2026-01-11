-- update_schedule_allocation_notes_v1: patch schedule-level rich-text notes.
--
-- This function:
-- - Updates only daily_schedules.staff_overrides.__allocationNotes
-- - Leaves other staff_overrides keys untouched (prevents accidentally persisting unsaved edits)
-- - Ensures is_tentative = true (RLS may depend on tentative schedules)
--
CREATE OR REPLACE FUNCTION public.update_schedule_allocation_notes_v1(
  p_schedule_id uuid,
  p_doc jsonb,
  p_updated_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE daily_schedules
  SET
    is_tentative = true,
    staff_overrides = jsonb_set(
      COALESCE(daily_schedules.staff_overrides, '{}'::jsonb),
      '{__allocationNotes}',
      jsonb_build_object(
        'doc', COALESCE(p_doc, '{}'::jsonb),
        'updatedAt', COALESCE(p_updated_at, now())
      ),
      true
    )
  WHERE daily_schedules.id = p_schedule_id;
END;
$$;

