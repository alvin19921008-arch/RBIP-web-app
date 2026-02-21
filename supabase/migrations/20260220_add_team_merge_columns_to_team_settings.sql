-- Team merge support (global Team Configuration).
-- Adds merge mapping + optional merged-label/pca-preference overrides.

ALTER TABLE public.team_settings
  ADD COLUMN IF NOT EXISTS merged_into team NULL,
  ADD COLUMN IF NOT EXISTS merge_label_override text NULL,
  ADD COLUMN IF NOT EXISTS merged_pca_preferences_override jsonb NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'team_settings_no_self_merge'
  ) THEN
    ALTER TABLE public.team_settings
      ADD CONSTRAINT team_settings_no_self_merge
      CHECK (merged_into IS NULL OR merged_into <> team);
  END IF;
END $$;

