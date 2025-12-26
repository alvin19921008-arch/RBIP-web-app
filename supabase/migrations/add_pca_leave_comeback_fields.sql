-- Add fields for PCA leave/come back time tracking
-- These fields are used when FTE remaining is not a multiple of 0.25

ALTER TABLE schedule_pca_allocations
  ADD COLUMN IF NOT EXISTS invalid_slot INTEGER,
  ADD COLUMN IF NOT EXISTS leave_comeback_time TEXT,
  ADD COLUMN IF NOT EXISTS leave_mode TEXT;

-- Add comments for documentation
COMMENT ON COLUMN schedule_pca_allocations.invalid_slot IS 'Slot number (1-4) that is leave/come back, assigned but not counted in FTE';
COMMENT ON COLUMN schedule_pca_allocations.leave_comeback_time IS 'Time in HH:MM format when PCA leaves or comes back';
COMMENT ON COLUMN schedule_pca_allocations.leave_mode IS 'Either "leave" or "come_back" to indicate if PCA is leaving or coming back at the specified time';

