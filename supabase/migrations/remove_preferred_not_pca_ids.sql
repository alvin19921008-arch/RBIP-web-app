-- Remove preferred_not_pca_ids column from pca_preferences table
-- This feature is no longer used in the revised floating PCA allocation algorithm

ALTER TABLE pca_preferences 
DROP COLUMN IF EXISTS preferred_not_pca_ids;
