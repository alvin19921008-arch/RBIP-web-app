-- Update Floating PCA scarcity trigger threshold (v2)
--
-- New definition (v2):
-- - Count how many teams have pendingFTE >= pending_fte
-- - Trigger when count >= min_teams
--
-- Stored in config_global_head.floating_pca_scarcity_threshold as:
--   { pending_fte: 0.75, min_teams: 3 }
--
-- Backward compatibility:
-- - Older installs may have { shortage_fte: ... } from v1.
-- - The app will treat missing pending_fte/min_teams as defaults.

-- Update default JSON shape
ALTER TABLE public.config_global_head
ALTER COLUMN floating_pca_scarcity_threshold
SET DEFAULT jsonb_build_object('pending_fte', 0.75, 'min_teams', 3);

-- Normalize existing row to v2 shape if it is still in v1 shape.
UPDATE public.config_global_head
SET floating_pca_scarcity_threshold = jsonb_build_object(
  'pending_fte',
  0.75,
  'min_teams',
  3
)
WHERE id = true
  AND (floating_pca_scarcity_threshold ? 'pending_fte') IS NOT TRUE;

-- Update floating PCA scarcity threshold (admin/developer only)
CREATE OR REPLACE FUNCTION public.set_floating_pca_scarcity_threshold_v2(
  p_pending_fte numeric,
  p_min_teams integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pending_v numeric;
  min_v integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid() AND role IN ('admin', 'developer')
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF p_pending_fte IS NULL OR p_min_teams IS NULL THEN
    RAISE EXCEPTION 'invalid_value';
  END IF;

  -- Round pending threshold to nearest quarter-FTE and clamp.
  pending_v := round(p_pending_fte * 4) / 4.0;
  IF pending_v < 0 OR pending_v > 4 THEN
    RAISE EXCEPTION 'invalid_value';
  END IF;

  -- Clamp min teams to [1..8]
  min_v := p_min_teams;
  IF min_v < 1 OR min_v > 8 THEN
    RAISE EXCEPTION 'invalid_value';
  END IF;

  UPDATE public.config_global_head
  SET
    floating_pca_scarcity_threshold = jsonb_build_object('pending_fte', pending_v, 'min_teams', min_v),
    floating_pca_scarcity_threshold_updated_at = now()
  WHERE id = true;

  RETURN public.get_config_global_head_v1();
END;
$$;

