-- Migration to add missing columns to schedule_pca_allocations and daily_schedules
-- Run this in your Supabase SQL Editor

-- Add fte_assigned column to schedule_pca_allocations (if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'schedule_pca_allocations' 
                 AND column_name = 'fte_assigned') THEN
    ALTER TABLE schedule_pca_allocations ADD COLUMN fte_assigned DECIMAL NOT NULL DEFAULT 0;
  END IF;
END $$;

-- Add invalid_slot column to schedule_pca_allocations (if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'schedule_pca_allocations' 
                 AND column_name = 'invalid_slot') THEN
    ALTER TABLE schedule_pca_allocations ADD COLUMN invalid_slot INTEGER;
  END IF;
END $$;

-- Add leave_comeback_time column to schedule_pca_allocations (if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'schedule_pca_allocations' 
                 AND column_name = 'leave_comeback_time') THEN
    ALTER TABLE schedule_pca_allocations ADD COLUMN leave_comeback_time TEXT;
  END IF;
END $$;

-- Add leave_mode column to schedule_pca_allocations (if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'schedule_pca_allocations' 
                 AND column_name = 'leave_mode') THEN
    ALTER TABLE schedule_pca_allocations ADD COLUMN leave_mode TEXT;
  END IF;
END $$;

-- Add tie_break_decisions column to daily_schedules (if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'daily_schedules' 
                 AND column_name = 'tie_break_decisions') THEN
    ALTER TABLE daily_schedules ADD COLUMN tie_break_decisions JSONB DEFAULT '{}';
  END IF;
END $$;

-- Verify columns were added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name IN ('schedule_pca_allocations', 'daily_schedules')
  AND column_name IN ('fte_assigned', 'invalid_slot', 'leave_comeback_time', 'leave_mode', 'tie_break_decisions')
ORDER BY table_name, column_name;

