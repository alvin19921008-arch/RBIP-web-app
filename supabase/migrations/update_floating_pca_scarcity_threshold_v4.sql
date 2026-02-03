-- Update Floating PCA scarcity trigger threshold (v4: slack-slots based)
--
-- New rule inputs for Step 3.1 scarcity detection:
-- - slack_slots (integer): trigger when (availableSlots - neededSlots) <= slack_slots
-- - min_teams (integer): sanity guard; only evaluate when >= N teams have pending > 0
-- - behavior = 'auto_select' | 'remind_only' | 'off'
--
-- Stored in config_global_head.floating_pca_scarcity_threshold as:
--   { slack_slots: 2, min_teams: 3, behavior: 'auto_select' }
--
-- Backward compatibility:
-- - v1 shape: { shortage_fte: ... }
-- - v2 shape: { pending_fte: ..., min_teams: ... }
-- - v3 adds behavior
-- - v4 adds slack_slots; UI/Step 3.1 will prefer slack_slots when present.

ALTER TABLE public.config_global_head
ALTER COLUMN floating_pca_scarcity_threshold
SET DEFAULT jsonb_build_object('slack_slots', 2, 'min_teams', 3, 'behavior', 'auto_select');

-- Add slack_slots if missing (default 2).
UPDATE public.config_global_head
SET floating_pca_scarcity_threshold =
  COALESCE(floating_pca_scarcity_threshold, '{}'::jsonb) ||
  jsonb_build_object('slack_slots', 2)
WHERE id = true
  AND (COALESCE(floating_pca_scarcity_threshold, '{}'::jsonb) ? 'slack_slots') IS NOT TRUE;

CREATE OR REPLACE FUNCTION public.set_floating_pca_scarcity_threshold_v4(
  p_slack_slots integer,
  p_min_teams integer,
  p_behavior text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  slack_v integer;
  min_v integer;
  behavior_norm text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid() AND role IN ('admin', 'developer')
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF p_slack_slots IS NULL OR p_min_teams IS NULL THEN
    RAISE EXCEPTION 'invalid_value';
  END IF;

  behavior_norm := lower(coalesce(p_behavior, 'auto_select'));
  IF behavior_norm NOT IN ('auto_select', 'remind_only', 'off') THEN
    RAISE EXCEPTION 'invalid_value';
  END IF;

  slack_v := p_slack_slots;
  -- Practical bounds: allow 0..32 slots as a safe upper bound.
  IF slack_v < 0 OR slack_v > 32 THEN
    RAISE EXCEPTION 'invalid_value';
  END IF;

  min_v := p_min_teams;
  IF min_v < 1 OR min_v > 8 THEN
    RAISE EXCEPTION 'invalid_value';
  END IF;

  UPDATE public.config_global_head
  SET
    floating_pca_scarcity_threshold = jsonb_build_object(
      'slack_slots', slack_v,
      'min_teams', min_v,
      'behavior', behavior_norm
    ),
    floating_pca_scarcity_threshold_updated_at = now()
  WHERE id = true;

  RETURN public.get_config_global_head_v1();
END;
$$;

