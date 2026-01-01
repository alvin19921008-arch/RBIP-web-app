-- Add buffer staff system: status enum and buffer_fte column

-- Create staff_status enum type
CREATE TYPE staff_status AS ENUM ('active', 'inactive', 'buffer');

-- Add status column to staff table (default 'active')
ALTER TABLE staff ADD COLUMN IF NOT EXISTS status staff_status DEFAULT 'active';

-- Migrate existing active boolean to status enum
UPDATE staff SET status = CASE 
  WHEN active = true THEN 'active'::staff_status
  WHEN active = false THEN 'inactive'::staff_status
  ELSE 'active'::staff_status
END
WHERE status IS NULL;

-- Set all existing staff to active if status is still null (safety check)
UPDATE staff SET status = 'active'::staff_status WHERE status IS NULL;

-- Add buffer_fte column (nullable, for buffer staff only)
ALTER TABLE staff ADD COLUMN IF NOT EXISTS buffer_fte DECIMAL(3,2);

-- Drop old active column (after migration is complete)
ALTER TABLE staff DROP COLUMN IF EXISTS active;
