-- Update Floating PCA scarcity trigger threshold (v3: add behavior toggle)
--
-- Adds an admin/developer configurable behavior for Step 3.1:
-- - behavior = 'auto_select' | 'remind_only' | 'off'
--
-- Stored in config_global_head.floating_pca_scarcity_threshold as:
--   { pending_fte: 0.75, min_teams: 3, behavior: 'auto_select' }
--
-- Backward compatibility:
-- - v1 shape: { shortage_fte: ... }
-- - v2 shape: { pending_fte: ..., min_teams: ... }
-- - v3 adds behavior; when missing, we default to 'auto_select' to preserve prior UX.

ALTER TABLE public.config_global_head
ALTER COLUMN floating_pca_scarcity_threshold
SET DEFAULT jsonb_build_object('pending_fte', 0.75, 'min_teams', 3, 'behavior', 'auto_select');

-- Add behavior if missing (preserve prior behavior = auto-select).
UPDATE public.config_global_head
SET floating_pca_scarcity_threshold =
  COALESCE(floating_pca_scarcity_threshold, '{}'::jsonb) ||
  jsonb_build_object('behavior', 'auto_select')
WHERE id = true
  AND (COALESCE(floating_pca_scarcity_threshold, '{}'::jsonb) ? 'behavior') IS NOT TRUE;

CREATE OR REPLACE FUNCTION public.set_floating_pca_scarcity_threshold_v3(
  p_pending_fte numeric,
  p_min_teams integer,
  p_behavior text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pending_v numeric;
  min_v integer;
  behavior_norm text;
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

  behavior_norm := lower(coalesce(p_behavior, 'auto_select'));
  IF behavior_norm NOT IN ('auto_select', 'remind_only', 'off') THEN
    RAISE EXCEPTION 'invalid_value';
  END IF;

  pending_v := round(p_pending_fte * 4) / 4.0;
  IF pending_v < 0 OR pending_v > 4 THEN
    RAISE EXCEPTION 'invalid_value';
  END IF;

  min_v := p_min_teams;
  IF min_v < 1 OR min_v > 8 THEN
    RAISE EXCEPTION 'invalid_value';
  END IF;

  UPDATE public.config_global_head
  SET
    floating_pca_scarcity_threshold = jsonb_build_object(
      'pending_fte', pending_v,
      'min_teams', min_v,
      'behavior', behavior_norm
    ),
    floating_pca_scarcity_threshold_updated_at = now()
  WHERE id = true;

  RETURN public.get_config_global_head_v1();
END;
$$;

