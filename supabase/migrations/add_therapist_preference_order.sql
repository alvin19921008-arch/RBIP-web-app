-- Add therapist_preference_order column to special_programs table
-- This column stores an object mapping teams to ordered arrays of staff IDs
-- Format: {"DRO": ["uuid1", "uuid2"], "FO": ["uuid3", "uuid4"]}
ALTER TABLE special_programs 
ADD COLUMN IF NOT EXISTS therapist_preference_order JSONB DEFAULT '{}';


