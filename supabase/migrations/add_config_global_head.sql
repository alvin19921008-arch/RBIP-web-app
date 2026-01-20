-- Global configuration head (versions/timestamps) + drift threshold
-- This supports the Dashboard “Sync / Publish” feature and Schedule drift notifications.

CREATE TABLE IF NOT EXISTS public.config_global_head (
  -- Single-row table. Using a boolean PK is a simple Supabase-friendly pattern.
  id boolean PRIMARY KEY DEFAULT true,

  global_version integer NOT NULL DEFAULT 1,
  global_updated_at timestamptz NOT NULL DEFAULT now(),

  -- Per-category simple version counters (user-friendly “Config ID” per category)
  category_versions jsonb NOT NULL DEFAULT jsonb_build_object(
    'staffProfile', 1,
    'teamConfig', 1,
    'wardConfig', 1,
    'specialPrograms', 1,
    'sptAllocations', 1,
    'pcaPreferences', 1
  ),
  category_updated_at jsonb NOT NULL DEFAULT jsonb_build_object(
    'staffProfile', to_jsonb(now()::text),
    'teamConfig', to_jsonb(now()::text),
    'wardConfig', to_jsonb(now()::text),
    'specialPrograms', to_jsonb(now()::text),
    'sptAllocations', to_jsonb(now()::text),
    'pcaPreferences', to_jsonb(now()::text)
  ),

  -- Drift notification threshold setting (admin/developer can adjust from Dashboard).
  -- Stored as JSON so UI can show “days/weeks/months” without exposing date math details.
  drift_notification_threshold jsonb NOT NULL DEFAULT jsonb_build_object('value', 30, 'unit', 'days'),
  drift_notification_threshold_updated_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure the single row exists
INSERT INTO public.config_global_head (id)
VALUES (true)
ON CONFLICT (id) DO NOTHING;

-- RLS: anyone logged in can read; only admin/developer can modify.
ALTER TABLE public.config_global_head ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read global head" ON public.config_global_head;
CREATE POLICY "Read global head" ON public.config_global_head
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admin full access" ON public.config_global_head;
CREATE POLICY "Admin full access" ON public.config_global_head FOR ALL
  USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('admin', 'developer')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('admin', 'developer')));

-- Helper to bump version counters once per statement.
CREATE OR REPLACE FUNCTION public.bump_config_global_head(p_categories text[])
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  cats text[] := COALESCE(p_categories, ARRAY[]::text[]);
BEGIN
  -- Update the single-row head. Use jsonb_object_keys so we only touch known keys.
  UPDATE public.config_global_head h
  SET
    global_version = h.global_version + 1,
    global_updated_at = now(),
    category_versions = (
      SELECT jsonb_object_agg(k.key, to_jsonb(
        CASE
          WHEN k.key = ANY(cats) THEN COALESCE((h.category_versions ->> k.key)::int, 0) + 1
          ELSE COALESCE((h.category_versions ->> k.key)::int, 0)
        END
      ))
      FROM jsonb_object_keys(h.category_versions) AS k(key)
    ),
    category_updated_at = (
      SELECT jsonb_object_agg(k.key,
        CASE
          WHEN k.key = ANY(cats) THEN to_jsonb(now()::text)
          ELSE h.category_updated_at -> k.key
        END
      )
      FROM jsonb_object_keys(h.category_updated_at) AS k(key)
    )
  WHERE h.id = true;
END;
$$;

-- ============================================================================
-- Triggers (statement-level) to bump the head on global config writes
-- ============================================================================

-- Staff profile category: staff changes EXCEPT team assignment changes
CREATE OR REPLACE FUNCTION public.trg_bump_staff_profile()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.bump_config_global_head(ARRAY['staffProfile']);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS bump_staff_profile_on_staff_insert ON public.staff;
CREATE TRIGGER bump_staff_profile_on_staff_insert
AFTER INSERT ON public.staff
FOR EACH STATEMENT
EXECUTE FUNCTION public.trg_bump_staff_profile();

DROP TRIGGER IF EXISTS bump_staff_profile_on_staff_delete ON public.staff;
CREATE TRIGGER bump_staff_profile_on_staff_delete
AFTER DELETE ON public.staff
FOR EACH STATEMENT
EXECUTE FUNCTION public.trg_bump_staff_profile();

DROP TRIGGER IF EXISTS bump_staff_profile_on_staff_update ON public.staff;
CREATE TRIGGER bump_staff_profile_on_staff_update
AFTER UPDATE OF name, rank, floating, status, buffer_fte, floor_pca, special_program ON public.staff
FOR EACH STATEMENT
EXECUTE FUNCTION public.trg_bump_staff_profile();

-- Team configuration category: staff team assignment changes + team_settings + ward team assignments/portions
CREATE OR REPLACE FUNCTION public.trg_bump_team_config()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.bump_config_global_head(ARRAY['teamConfig']);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS bump_team_config_on_staff_team_update ON public.staff;
CREATE TRIGGER bump_team_config_on_staff_team_update
AFTER UPDATE OF team ON public.staff
FOR EACH STATEMENT
EXECUTE FUNCTION public.trg_bump_team_config();

-- team_settings may not exist on older DBs; create trigger only when available.
DO $$
BEGIN
  IF to_regclass('public.team_settings') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS bump_team_config_on_team_settings_write ON public.team_settings;';
    EXECUTE 'CREATE TRIGGER bump_team_config_on_team_settings_write
      AFTER INSERT OR UPDATE OR DELETE ON public.team_settings
      FOR EACH STATEMENT
      EXECUTE FUNCTION public.trg_bump_team_config();';
  END IF;
END $$;

DROP TRIGGER IF EXISTS bump_team_config_on_wards_team_assignments_update ON public.wards;
-- wards.team_assignment_portions may not exist on older DBs; fall back to team_assignments-only trigger.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'wards'
      AND column_name = 'team_assignment_portions'
  ) THEN
    EXECUTE 'CREATE TRIGGER bump_team_config_on_wards_team_assignments_update
      AFTER UPDATE OF team_assignments, team_assignment_portions ON public.wards
      FOR EACH STATEMENT
      EXECUTE FUNCTION public.trg_bump_team_config();';
  ELSE
    EXECUTE 'CREATE TRIGGER bump_team_config_on_wards_team_assignments_update
      AFTER UPDATE OF team_assignments ON public.wards
      FOR EACH STATEMENT
      EXECUTE FUNCTION public.trg_bump_team_config();';
  END IF;
END $$;

-- Ward config category: ward name/bed stat changes
CREATE OR REPLACE FUNCTION public.trg_bump_ward_config()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.bump_config_global_head(ARRAY['wardConfig']);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS bump_ward_config_on_wards_insert ON public.wards;
CREATE TRIGGER bump_ward_config_on_wards_insert
AFTER INSERT ON public.wards
FOR EACH STATEMENT
EXECUTE FUNCTION public.trg_bump_ward_config();

DROP TRIGGER IF EXISTS bump_ward_config_on_wards_delete ON public.wards;
CREATE TRIGGER bump_ward_config_on_wards_delete
AFTER DELETE ON public.wards
FOR EACH STATEMENT
EXECUTE FUNCTION public.trg_bump_ward_config();

DROP TRIGGER IF EXISTS bump_ward_config_on_wards_update ON public.wards;
CREATE TRIGGER bump_ward_config_on_wards_update
AFTER UPDATE OF name, total_beds ON public.wards
FOR EACH STATEMENT
EXECUTE FUNCTION public.trg_bump_ward_config();

-- Special programs
CREATE OR REPLACE FUNCTION public.trg_bump_special_programs()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.bump_config_global_head(ARRAY['specialPrograms']);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS bump_special_programs_on_write ON public.special_programs;
CREATE TRIGGER bump_special_programs_on_write
AFTER INSERT OR UPDATE OR DELETE ON public.special_programs
FOR EACH STATEMENT
EXECUTE FUNCTION public.trg_bump_special_programs();

-- SPT allocations
CREATE OR REPLACE FUNCTION public.trg_bump_spt_allocations()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.bump_config_global_head(ARRAY['sptAllocations']);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS bump_spt_allocations_on_write ON public.spt_allocations;
CREATE TRIGGER bump_spt_allocations_on_write
AFTER INSERT OR UPDATE OR DELETE ON public.spt_allocations
FOR EACH STATEMENT
EXECUTE FUNCTION public.trg_bump_spt_allocations();

-- PCA preferences
CREATE OR REPLACE FUNCTION public.trg_bump_pca_preferences()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.bump_config_global_head(ARRAY['pcaPreferences']);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS bump_pca_preferences_on_write ON public.pca_preferences;
CREATE TRIGGER bump_pca_preferences_on_write
AFTER INSERT OR UPDATE OR DELETE ON public.pca_preferences
FOR EACH STATEMENT
EXECUTE FUNCTION public.trg_bump_pca_preferences();

