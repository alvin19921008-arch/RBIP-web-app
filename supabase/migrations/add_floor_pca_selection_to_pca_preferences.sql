-- Add floor_pca_selection column to pca_preferences table
-- This stores the team's floor preference: 'upper', 'lower', or NULL
ALTER TABLE pca_preferences
ADD COLUMN IF NOT EXISTS floor_pca_selection TEXT;

-- Set default values based on team mapping:
-- Upper teams: FO, SMM, SFM, DRO
-- Lower teams: CPPC, MC, GMC, NSM
UPDATE pca_preferences
SET floor_pca_selection = 'upper'
WHERE team IN ('FO', 'SMM', 'SFM', 'DRO');

UPDATE pca_preferences
SET floor_pca_selection = 'lower'
WHERE team IN ('CPPC', 'MC', 'GMC', 'NSM');

