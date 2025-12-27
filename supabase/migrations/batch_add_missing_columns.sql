-- Batch migration to add/rename all missing columns for schedule_pca_allocations
-- This migration ensures the database schema matches what the save function expects
-- Run this in Supabase SQL Editor to bring your database up to date

-- ============================================================================
-- schedule_pca_allocations table updates
-- ============================================================================

-- 1. Rename fte_assigned to slot_assigned (if fte_assigned exists and slot_assigned doesn't)
DO $$ 
BEGIN
  -- Check if fte_assigned exists and slot_assigned doesn't
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'schedule_pca_allocations' 
    AND column_name = 'fte_assigned'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'schedule_pca_allocations' 
    AND column_name = 'slot_assigned'
  ) THEN
    ALTER TABLE schedule_pca_allocations 
    RENAME COLUMN fte_assigned TO slot_assigned;
    RAISE NOTICE 'Renamed fte_assigned to slot_assigned';
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'schedule_pca_allocations' 
    AND column_name = 'slot_assigned'
  ) THEN
    -- If neither exists, add slot_assigned
    ALTER TABLE schedule_pca_allocations 
    ADD COLUMN slot_assigned DECIMAL NOT NULL DEFAULT 0;
    RAISE NOTICE 'Added slot_assigned column';
  END IF;
END $$;

-- 2. Add invalid_slot if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'schedule_pca_allocations' 
    AND column_name = 'invalid_slot'
  ) THEN
    ALTER TABLE schedule_pca_allocations 
    ADD COLUMN invalid_slot INTEGER;
    RAISE NOTICE 'Added invalid_slot column';
  END IF;
END $$;

-- 3. Add leave_comeback_time if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'schedule_pca_allocations' 
    AND column_name = 'leave_comeback_time'
  ) THEN
    ALTER TABLE schedule_pca_allocations 
    ADD COLUMN leave_comeback_time TEXT;
    RAISE NOTICE 'Added leave_comeback_time column';
  END IF;
END $$;

-- 4. Add leave_mode if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'schedule_pca_allocations' 
    AND column_name = 'leave_mode'
  ) THEN
    ALTER TABLE schedule_pca_allocations 
    ADD COLUMN leave_mode TEXT;
    RAISE NOTICE 'Added leave_mode column';
  END IF;
END $$;

-- 5. Note: fte_subtraction is NOT added - it's calculated from staffOverrides, not stored in DB

-- ============================================================================
-- Verify all columns exist
-- ============================================================================
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'schedule_pca_allocations'
  AND column_name IN (
    'slot_assigned',
    'invalid_slot', 
    'leave_comeback_time', 
    'leave_mode'
  )
ORDER BY column_name;

-- ============================================================================
-- Summary
-- ============================================================================
-- Expected columns in schedule_pca_allocations (for save function):
-- ✓ id, schedule_id, staff_id, team
-- ✓ fte_pca, fte_remaining, slot_assigned (renamed from fte_assigned)
-- ✓ slot1, slot2, slot3, slot4, slot_whole
-- ✓ leave_type, special_program_ids
-- ✓ invalid_slot, leave_comeback_time, leave_mode
-- ✗ fte_subtraction (NOT stored - calculated from staffOverrides)
