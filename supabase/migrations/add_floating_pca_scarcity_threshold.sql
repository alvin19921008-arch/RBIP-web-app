-- Add Floating PCA scarcity trigger threshold (Balanced mode recommendation)
--
-- This setting is used by Step 3.1 UI to auto-select / recommend Balanced allocation
-- when the shortage is severe.
--
-- Definition (current):
-- - shortage_fte = (totalPendingFTE - floatingPoolRemainingFTE)
-- - trigger when shortage_fte >= threshold.shortage_fte
--
-- Notes:
-- - Anyone authenticated can READ config_global_head (existing RLS).
-- - Only admin/developer can WRITE (existing RLS + RPC guard below).

ALTER TABLE public.config_global_head
ADD COLUMN IF NOT EXISTS floating_pca_scarcity_threshold jsonb NOT NULL
  DEFAULT jsonb_build_object('shortage_fte', 0.5),
ADD COLUMN IF NOT EXISTS floating_pca_scarcity_threshold_updated_at timestamptz NOT NULL
  DEFAULT now();

-- Update floating PCA scarcity threshold (admin/developer only)
CREATE OR REPLACE FUNCTION public.set_floating_pca_scarcity_threshold_v1(
  p_shortage_fte numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v numeric;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid() AND role IN ('admin', 'developer')
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF p_shortage_fte IS NULL THEN
    RAISE EXCEPTION 'invalid_value';
  END IF;

  -- Clamp and round to nearest quarter-FTE.
  v := round(p_shortage_fte * 4) / 4.0;
  IF v < 0 OR v > 10 THEN
    RAISE EXCEPTION 'invalid_value';
  END IF;

  UPDATE public.config_global_head
  SET
    floating_pca_scarcity_threshold = jsonb_build_object('shortage_fte', v),
    floating_pca_scarcity_threshold_updated_at = now()
  WHERE id = true;

  RETURN public.get_config_global_head_v1();
END;
$$;

