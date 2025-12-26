-- Add fte_subtraction column to schedule_pca_allocations
-- This stores the FTE subtraction from leave (excluding special program subtraction)
-- Used to calculate base_FTE_remaining = 1.0 - fte_subtraction for display

ALTER TABLE schedule_pca_allocations 
ADD COLUMN IF NOT EXISTS fte_subtraction DECIMAL;

-- Rename fte_assigned to slot_assigned to better reflect its purpose
-- slot_assigned tracks which slots are assigned (0.25 per slot), not FTE
ALTER TABLE schedule_pca_allocations 
RENAME COLUMN fte_assigned TO slot_assigned;

