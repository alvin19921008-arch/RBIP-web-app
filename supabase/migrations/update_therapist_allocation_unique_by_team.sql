-- Allow multiple therapist allocation rows for the same staff in the same schedule,
-- as long as they are in different teams.
--
-- Previously we enforced UNIQUE(schedule_id, staff_id), which prevented therapist split/merge overrides.
-- We now enforce UNIQUE(schedule_id, staff_id, team) instead.

DO $$
BEGIN
  -- Drop the old constraint if present
  ALTER TABLE schedule_therapist_allocations
    DROP CONSTRAINT IF EXISTS schedule_therapist_allocations_schedule_staff_unique;
EXCEPTION
  WHEN undefined_table THEN
    -- Table may not exist in older schemas
    NULL;
END $$;

DO $$
BEGIN
  -- Add new uniqueness per team
  ALTER TABLE schedule_therapist_allocations
    ADD CONSTRAINT schedule_therapist_allocations_schedule_staff_team_unique
    UNIQUE (schedule_id, staff_id, team);
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;

-- Helpful indexes for common access patterns
CREATE INDEX IF NOT EXISTS idx_schedule_therapist_allocations_schedule_staff_team
  ON schedule_therapist_allocations (schedule_id, staff_id, team);

CREATE INDEX IF NOT EXISTS idx_schedule_therapist_allocations_schedule_staff
  ON schedule_therapist_allocations (schedule_id, staff_id);

