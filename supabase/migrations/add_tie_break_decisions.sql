-- Add tie_break_decisions field to daily_schedules table
-- This stores tie-breaker decisions as JSONB: { "team1,team2:pendingFTE": "selectedTeam", ... }

ALTER TABLE daily_schedules
  ADD COLUMN IF NOT EXISTS tie_break_decisions JSONB DEFAULT '{}';

COMMENT ON COLUMN daily_schedules.tie_break_decisions IS 'Stores tie-breaker decisions: key format is "team1,team2:pendingFTE", value is the selected team';

