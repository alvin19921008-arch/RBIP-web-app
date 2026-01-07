-- Enable bulk upserts for allocations by adding unique constraints.
-- This migration also deduplicates any existing duplicate rows.

-- Therapist allocations: ensure unique per (schedule_id, staff_id)
DO $$
BEGIN
  -- Remove duplicates (keep the newest physical row by ctid)
  DELETE FROM schedule_therapist_allocations a
  USING schedule_therapist_allocations b
  WHERE a.schedule_id = b.schedule_id
    AND a.staff_id = b.staff_id
    AND a.ctid < b.ctid;
EXCEPTION
  WHEN undefined_table THEN
    -- Table may not exist in older schemas
    NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE schedule_therapist_allocations
    ADD CONSTRAINT schedule_therapist_allocations_schedule_staff_unique
    UNIQUE (schedule_id, staff_id);
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_schedule_therapist_allocations_schedule_staff
  ON schedule_therapist_allocations (schedule_id, staff_id);

-- PCA allocations: ensure unique per (schedule_id, staff_id)
DO $$
BEGIN
  -- Remove duplicates (keep the newest physical row by ctid)
  DELETE FROM schedule_pca_allocations a
  USING schedule_pca_allocations b
  WHERE a.schedule_id = b.schedule_id
    AND a.staff_id = b.staff_id
    AND a.ctid < b.ctid;
EXCEPTION
  WHEN undefined_table THEN
    NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE schedule_pca_allocations
    ADD CONSTRAINT schedule_pca_allocations_schedule_staff_unique
    UNIQUE (schedule_id, staff_id);
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_schedule_pca_allocations_schedule_staff
  ON schedule_pca_allocations (schedule_id, staff_id);

