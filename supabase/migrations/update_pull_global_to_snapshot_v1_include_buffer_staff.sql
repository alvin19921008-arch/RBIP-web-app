-- Extend pull_global_to_snapshot_v1 to optionally exclude buffer staff from snapshot baseline.
-- Also allow service_role to run admin-only sync helpers from server routes.

-- 1) Allow service_role to pass admin checks (server-side automation).
CREATE OR REPLACE FUNCTION public.is_admin_or_developer()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    COALESCE(auth.role(), '') = 'service_role'
    OR EXISTS (
      SELECT 1
      FROM public.user_profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'developer')
    );
$$;

-- 2) Replace pull_global_to_snapshot_v1 with an include-buffer flag.
DROP FUNCTION IF EXISTS public.pull_global_to_snapshot_v1(date, text[], text);

CREATE OR REPLACE FUNCTION public.pull_global_to_snapshot_v1(
  p_date date,
  p_categories text[],
  p_note text DEFAULT NULL,
  p_include_buffer_staff boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cats text[] := COALESCE(p_categories, ARRAY[]::text[]);
  sched record;
  stored jsonb;
  data jsonb;
  head jsonb;
  staff_rows jsonb;
  wards_rows jsonb;
  team_display_names jsonb;
  programs_rows jsonb;
  spt_rows jsonb;
  prefs_rows jsonb;
BEGIN
  IF NOT public.is_admin_or_developer() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT id, baseline_snapshot INTO sched
  FROM public.daily_schedules
  WHERE date = p_date
  LIMIT 1;

  IF sched.id IS NULL THEN
    RAISE EXCEPTION 'schedule_not_found';
  END IF;

  stored := COALESCE(sched.baseline_snapshot, '{}'::jsonb);
  IF (stored ? 'data') THEN
    data := COALESCE(stored -> 'data', '{}'::jsonb);
  ELSE
    data := stored;
  END IF;

  -- Load current global tables (same fields as snapshot baseline builder).
  -- Buffer handling:
  -- - When p_include_buffer_staff=false, downgrade status='buffer' to 'inactive' in the snapshot roster.
  -- - This keeps global roster intact while respecting copy semantics.
  staff_rows := COALESCE(
    (
      SELECT jsonb_agg(to_jsonb(s))
      FROM (
        SELECT
          id,
          name,
          rank,
          team,
          floating,
          CASE
            WHEN NOT COALESCE(p_include_buffer_staff, true) AND COALESCE(status, 'active') = 'buffer'
              THEN 'inactive'::staff_status
            ELSE COALESCE(status, 'active')
          END AS status,
          CASE
            WHEN NOT COALESCE(p_include_buffer_staff, true) AND COALESCE(status, 'active') = 'buffer'
              THEN NULL
            ELSE buffer_fte
          END AS buffer_fte,
          floor_pca,
          special_program
        FROM public.staff
        ORDER BY name
      ) s
    ),
    '[]'::jsonb
  );

  wards_rows := COALESCE(
    (
      SELECT jsonb_agg(to_jsonb(w))
      FROM (
        SELECT id, name, total_beds, team_assignments, team_assignment_portions
        FROM public.wards
        ORDER BY name
      ) w
    ),
    '[]'::jsonb
  );

  team_display_names := COALESCE(
    (
      SELECT jsonb_object_agg(team::text, display_name)
      FROM public.team_settings
    ),
    '{}'::jsonb
  );

  programs_rows := COALESCE(
    (
      SELECT jsonb_agg(to_jsonb(p))
      FROM (
        SELECT id, name, staff_ids, weekdays, slots, fte_subtraction, pca_required, therapist_preference_order, pca_preference_order
        FROM public.special_programs
        ORDER BY name
      ) p
    ),
    '[]'::jsonb
  );

  spt_rows := COALESCE(
    (
      SELECT jsonb_agg(to_jsonb(a))
      FROM (
        SELECT id, staff_id, specialty, teams, weekdays, slots, slot_modes, fte_addon, substitute_team_head, is_rbip_supervisor, active
        FROM public.spt_allocations
        ORDER BY created_at
      ) a
    ),
    '[]'::jsonb
  );

  prefs_rows := COALESCE(
    (
      SELECT jsonb_agg(to_jsonb(pp))
      FROM (
        SELECT id, team, preferred_pca_ids, preferred_slots, avoid_gym_schedule, gym_schedule, floor_pca_selection
        FROM public.pca_preferences
        ORDER BY team
      ) pp
    ),
    '[]'::jsonb
  );

  -- Apply selected categories. (For simplicity, refreshes the entire relevant slice.)
  IF ('staffProfile' = ANY(cats)) OR ('teamConfig' = ANY(cats)) THEN
    data := jsonb_set(data, '{staff}', staff_rows, true);
  END IF;

  IF 'teamConfig' = ANY(cats) THEN
    data := jsonb_set(data, '{teamDisplayNames}', team_display_names, true);
  END IF;

  IF ('wardConfig' = ANY(cats)) OR ('teamConfig' = ANY(cats)) THEN
    data := jsonb_set(data, '{wards}', wards_rows, true);
  END IF;

  IF 'specialPrograms' = ANY(cats) THEN
    data := jsonb_set(data, '{specialPrograms}', programs_rows, true);
  END IF;

  IF 'sptAllocations' = ANY(cats) THEN
    data := jsonb_set(data, '{sptAllocations}', spt_rows, true);
  END IF;

  IF 'pcaPreferences' = ANY(cats) THEN
    data := jsonb_set(data, '{pcaPreferences}', prefs_rows, true);
  END IF;

  SELECT jsonb_build_object(
    'global_version', h.global_version,
    'global_updated_at', h.global_updated_at::text,
    'category_versions', h.category_versions,
    'category_updated_at', h.category_updated_at,
    'drift_notification_threshold', h.drift_notification_threshold
  )
  INTO head
  FROM public.config_global_head h
  WHERE h.id = true
  LIMIT 1;

  UPDATE public.daily_schedules
  SET baseline_snapshot = jsonb_build_object(
    'schemaVersion', 2,
    'createdAt', now()::text,
    'source', 'save',
    'globalHeadAtCreation', COALESCE(head, '{}'::jsonb),
    'data', data
  )
  WHERE id = sched.id;
END;
$$;

