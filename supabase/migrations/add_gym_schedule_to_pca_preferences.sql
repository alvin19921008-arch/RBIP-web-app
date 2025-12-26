-- Add gym_schedule column to pca_preferences table
ALTER TABLE pca_preferences
ADD COLUMN IF NOT EXISTS gym_schedule INTEGER;

-- Add UNIQUE constraint on team if it doesn't exist (required for ON CONFLICT)
-- This ensures each team has only one preference record
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'pca_preferences_team_key' 
    AND conrelid = 'pca_preferences'::regclass
  ) THEN
    ALTER TABLE pca_preferences
    ADD CONSTRAINT pca_preferences_team_key UNIQUE (team);
  END IF;
END $$;

-- STEP 1: Clean up existing data that violates new constraints
-- Nullify preferred_slots if more than 1 slot selected (user will re-enter)
UPDATE pca_preferences
SET preferred_slots = '{}'::INTEGER[]
WHERE array_length(preferred_slots, 1) > 1;

-- Trim preferred_pca_ids to max 2 (keep first 2)
UPDATE pca_preferences
SET preferred_pca_ids = preferred_pca_ids[1:2]
WHERE array_length(preferred_pca_ids, 1) > 2;

-- STEP 2: Migrate gym schedules from staff_preferences to pca_preferences
-- For each team, find team head (APPT) and copy gym_schedule
-- Create pca_preferences records if they don't exist

DO $$
DECLARE
  team_val team;
  team_head_id UUID;
  gym_slot_val INTEGER;
  gym_schedule_json JSONB;
BEGIN
  -- Loop through all teams
  FOR team_val IN SELECT unnest(ARRAY['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO']::team[]) LOOP
    -- Find team head (APPT rank) for this team
    SELECT id INTO team_head_id
    FROM staff
    WHERE team = team_val AND rank = 'APPT'
    LIMIT 1;
    
    -- If team head exists, get gym schedule from staff_preferences
    IF team_head_id IS NOT NULL THEN
      SELECT gym_schedule INTO gym_schedule_json
      FROM staff_preferences
      WHERE staff_id = team_head_id;
      
      -- Extract slot from gym_schedule JSONB
      -- Format can be: number (legacy) or {team, slot} (new format)
      IF gym_schedule_json IS NOT NULL THEN
        IF jsonb_typeof(gym_schedule_json) = 'number' THEN
          -- Legacy format: just a number
          gym_slot_val := (gym_schedule_json::text)::INTEGER;
        ELSIF gym_schedule_json->>'slot' IS NOT NULL THEN
          -- New format: {team, slot}
          gym_slot_val := (gym_schedule_json->>'slot')::INTEGER;
        ELSE
          gym_slot_val := NULL;
        END IF;
      ELSE
        gym_slot_val := NULL;
      END IF;
      
      -- Insert or update pca_preferences with gym_schedule
      INSERT INTO pca_preferences (team, gym_schedule)
      VALUES (team_val, gym_slot_val)
      ON CONFLICT (team) DO UPDATE
      SET gym_schedule = EXCLUDED.gym_schedule;
    ELSE
      -- No team head found, create pca_preferences record with NULL gym_schedule
      INSERT INTO pca_preferences (team, gym_schedule)
      VALUES (team_val, NULL)
      ON CONFLICT (team) DO UPDATE
      SET gym_schedule = NULL;
    END IF;
  END LOOP;
END $$;

