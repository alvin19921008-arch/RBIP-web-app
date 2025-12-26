-- Add avoid_gym_schedule column to pca_preferences table
ALTER TABLE pca_preferences 
ADD COLUMN IF NOT EXISTS avoid_gym_schedule BOOLEAN DEFAULT false;

