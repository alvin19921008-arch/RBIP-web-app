-- Add pca_preference_order column to special_programs table
ALTER TABLE special_programs 
ADD COLUMN IF NOT EXISTS pca_preference_order UUID[] DEFAULT '{}';

