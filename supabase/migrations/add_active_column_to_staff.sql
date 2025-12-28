-- Add 'active' column to staff table
ALTER TABLE staff ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;

-- Set all existing staff to active by default
UPDATE staff SET active = true WHERE active IS NULL;
