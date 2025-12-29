-- Create team_settings table
CREATE TABLE IF NOT EXISTS team_settings (
  team team PRIMARY KEY,
  display_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed initial team settings with default display names
INSERT INTO team_settings (team, display_name)
VALUES 
  ('FO', 'FO'),
  ('SMM', 'SMM'),
  ('SFM', 'SFM'),
  ('CPPC', 'CPPC'),
  ('MC', 'MC'),
  ('GMC', 'GMC'),
  ('NSM', 'NSM'),
  ('DRO', 'DRO')
ON CONFLICT (team) DO NOTHING;

-- Add team_assignment_portions column to wards table
ALTER TABLE wards ADD COLUMN IF NOT EXISTS team_assignment_portions JSONB DEFAULT '{}';

-- Function to compute fraction from numeric bed counts
-- This will be used to populate portions for existing data
CREATE OR REPLACE FUNCTION compute_fraction_from_beds(team_beds INTEGER, total_beds INTEGER)
RETURNS TEXT AS $$
DECLARE
  fraction NUMERIC;
  known_fractions RECORD;
BEGIN
  IF team_beds = total_beds OR team_beds = 0 THEN
    RETURN NULL;
  END IF;
  
  fraction := team_beds::NUMERIC / total_beds::NUMERIC;
  
  -- Check against known fraction patterns
  FOR known_fractions IN 
    SELECT 1 as num, 2 as den, 0.5 as value UNION ALL
    SELECT 1, 3, 1.0/3 UNION ALL
    SELECT 2, 3, 2.0/3 UNION ALL
    SELECT 3, 4, 0.75
  LOOP
    IF ABS(fraction - known_fractions.value) < 0.01 THEN
      RETURN known_fractions.num || '/' || known_fractions.den;
    END IF;
  END LOOP;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Populate team_assignment_portions for existing ward data
-- This extracts portions from existing numeric bed assignments
DO $$
DECLARE
  ward_record RECORD;
  team_key TEXT;
  team_beds INTEGER;
  computed_fraction TEXT;
  current_portions JSONB;
BEGIN
  FOR ward_record IN SELECT * FROM wards LOOP
    current_portions := COALESCE(ward_record.team_assignment_portions, '{}'::JSONB);
    
    -- Check each team's bed assignment
    FOR team_key, team_beds IN SELECT * FROM jsonb_each_text(ward_record.team_assignments) LOOP
      -- Only compute if portion doesn't already exist
      IF NOT (current_portions ? team_key) THEN
        computed_fraction := compute_fraction_from_beds(
          (team_beds::INTEGER),
          ward_record.total_beds
        );
        
        IF computed_fraction IS NOT NULL THEN
          current_portions := current_portions || jsonb_build_object(team_key, computed_fraction);
        END IF;
      END IF;
    END LOOP;
    
    -- Update ward with computed portions
    IF current_portions != COALESCE(ward_record.team_assignment_portions, '{}'::JSONB) THEN
      UPDATE wards 
      SET team_assignment_portions = current_portions
      WHERE id = ward_record.id;
    END IF;
  END LOOP;
END $$;

-- Drop the helper function after use (optional, can keep for future use)
-- DROP FUNCTION IF EXISTS compute_fraction_from_beds(INTEGER, INTEGER);
