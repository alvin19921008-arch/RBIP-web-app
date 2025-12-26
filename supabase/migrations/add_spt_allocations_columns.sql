-- Migration: Add missing columns to spt_allocations table
-- Run this in Supabase SQL Editor if the columns don't exist

-- Add 'active' column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'spt_allocations' AND column_name = 'active') THEN
        ALTER TABLE spt_allocations ADD COLUMN active BOOLEAN DEFAULT true;
    END IF;
END $$;

-- Add 'is_rbip_supervisor' column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'spt_allocations' AND column_name = 'is_rbip_supervisor') THEN
        ALTER TABLE spt_allocations ADD COLUMN is_rbip_supervisor BOOLEAN DEFAULT false;
    END IF;
END $$;

-- Add 'slot_modes' column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'spt_allocations' AND column_name = 'slot_modes') THEN
        ALTER TABLE spt_allocations ADD COLUMN slot_modes JSONB DEFAULT '{}';
    END IF;
END $$;

-- Verify columns were added
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'spt_allocations' 
ORDER BY ordinal_position;

