-- Global config backups + Sync/Publish RPCs (admin/developer only)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- Backups table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.config_global_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL,
  note text NULL,
  head jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.config_global_backups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access" ON public.config_global_backups;
CREATE POLICY "Admin full access" ON public.config_global_backups FOR ALL
  USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('admin', 'developer')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('admin', 'developer')));

-- ============================================================================
-- Helpers
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_admin_or_developer()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid() AND role IN ('admin', 'developer')
  );
$$;

CREATE OR REPLACE FUNCTION public.get_config_global_head_v1()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT to_jsonb(h)
  FROM public.config_global_head h
  WHERE h.id = true
  LIMIT 1;
$$;

-- Update drift threshold (days/weeks/months) - admin/developer only
CREATE OR REPLACE FUNCTION public.set_drift_notification_threshold_v1(
  p_value integer,
  p_unit text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  unit_norm text;
BEGIN
  IF NOT public.is_admin_or_developer() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  unit_norm := lower(coalesce(p_unit, 'days'));
  IF unit_norm NOT IN ('days', 'weeks', 'months') THEN
    RAISE EXCEPTION 'invalid_unit';
  END IF;

  IF p_value IS NULL OR p_value < 0 OR p_value > 3650 THEN
    RAISE EXCEPTION 'invalid_value';
  END IF;

  UPDATE public.config_global_head
  SET
    drift_notification_threshold = jsonb_build_object('value', p_value, 'unit', unit_norm),
    drift_notification_threshold_updated_at = now()
  WHERE id = true;

  RETURN public.get_config_global_head_v1();
END;
$$;

-- Create a global backup (admin/developer only)
CREATE OR REPLACE FUNCTION public.create_config_global_backup_v1(
  p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  backup_id uuid;
  head_row jsonb;
  payload jsonb;
BEGIN
  IF NOT public.is_admin_or_developer() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  head_row := public.get_config_global_head_v1();

  payload := jsonb_build_object(
    'staff',
      COALESCE(
        (SELECT jsonb_agg(to_jsonb(s)) FROM public.staff s),
        '[]'::jsonb
      ),
    'wards',
      COALESCE(
        (SELECT jsonb_agg(to_jsonb(w)) FROM public.wards w),
        '[]'::jsonb
      ),
    'team_settings',
      COALESCE(
        (SELECT jsonb_agg(to_jsonb(t)) FROM public.team_settings t),
        '[]'::jsonb
      ),
    'special_programs',
      COALESCE(
        (SELECT jsonb_agg(to_jsonb(p)) FROM public.special_programs p),
        '[]'::jsonb
      ),
    'spt_allocations',
      COALESCE(
        (SELECT jsonb_agg(to_jsonb(a)) FROM public.spt_allocations a),
        '[]'::jsonb
      ),
    'pca_preferences',
      COALESCE(
        (SELECT jsonb_agg(to_jsonb(pp)) FROM public.pca_preferences pp),
        '[]'::jsonb
      )
  );

  INSERT INTO public.config_global_backups (created_by, note, head, payload)
  VALUES (auth.uid(), p_note, COALESCE(head_row, '{}'::jsonb), payload)
  RETURNING id INTO backup_id;

  RETURN backup_id;
END;
$$;

-- Restore global config from a backup (admin/developer only)
-- Notes:
-- - Uses upserts where possible.
-- - Does NOT delete “extra” rows not present in the backup (safer).
CREATE OR REPLACE FUNCTION public.restore_config_global_backup_v1(
  p_backup_id uuid,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b record;
  staff_rows jsonb;
  ward_rows jsonb;
  team_settings_rows jsonb;
  sp_rows jsonb;
  spt_rows jsonb;
  pref_rows jsonb;
BEGIN
  IF NOT public.is_admin_or_developer() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO b
  FROM public.config_global_backups
  WHERE id = p_backup_id
  LIMIT 1;

  IF b.id IS NULL THEN
    RAISE EXCEPTION 'backup_not_found';
  END IF;

  -- Always create a new backup before restore (safety)
  PERFORM public.create_config_global_backup_v1(COALESCE(p_note, 'Auto-backup before restore'));

  staff_rows := COALESCE(b.payload -> 'staff', '[]'::jsonb);
  ward_rows := COALESCE(b.payload -> 'wards', '[]'::jsonb);
  team_settings_rows := COALESCE(b.payload -> 'team_settings', '[]'::jsonb);
  sp_rows := COALESCE(b.payload -> 'special_programs', '[]'::jsonb);
  spt_rows := COALESCE(b.payload -> 'spt_allocations', '[]'::jsonb);
  pref_rows := COALESCE(b.payload -> 'pca_preferences', '[]'::jsonb);

  -- Staff (best-effort upsert: only columns that exist in all environments)
  INSERT INTO public.staff (id, name, rank, team, floating, status, buffer_fte, floor_pca, special_program)
  SELECT
    x.id,
    x.name,
    x.rank,
    x.team,
    COALESCE(x.floating, false),
    COALESCE(x.status, 'active'),
    x.buffer_fte,
    x.floor_pca,
    x.special_program
  FROM jsonb_to_recordset(staff_rows) AS x(
    id uuid,
    name text,
    rank staff_rank,
    team team,
    floating boolean,
    status staff_status,
    buffer_fte numeric,
    floor_pca text[],
    special_program text[]
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    rank = EXCLUDED.rank,
    team = EXCLUDED.team,
    floating = EXCLUDED.floating,
    status = EXCLUDED.status,
    buffer_fte = EXCLUDED.buffer_fte,
    floor_pca = EXCLUDED.floor_pca,
    special_program = EXCLUDED.special_program;

  -- Wards
  INSERT INTO public.wards (id, name, total_beds, team_assignments, team_assignment_portions)
  SELECT
    x.id,
    x.name,
    x.total_beds,
    COALESCE(x.team_assignments, '{}'::jsonb),
    COALESCE(x.team_assignment_portions, '{}'::jsonb)
  FROM jsonb_to_recordset(ward_rows) AS x(
    id uuid,
    name text,
    total_beds integer,
    team_assignments jsonb,
    team_assignment_portions jsonb
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    total_beds = EXCLUDED.total_beds,
    team_assignments = EXCLUDED.team_assignments,
    team_assignment_portions = EXCLUDED.team_assignment_portions;

  -- Team settings
  INSERT INTO public.team_settings (
    team,
    display_name,
    merged_into,
    merge_label_override,
    merged_pca_preferences_override,
    updated_at
  )
  SELECT
    x.team,
    x.display_name,
    x.merged_into,
    x.merge_label_override,
    x.merged_pca_preferences_override,
    now()
  FROM jsonb_to_recordset(team_settings_rows) AS x(
    team team,
    display_name text,
    merged_into team,
    merge_label_override text,
    merged_pca_preferences_override jsonb
  )
  ON CONFLICT (team) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    merged_into = EXCLUDED.merged_into,
    merge_label_override = EXCLUDED.merge_label_override,
    merged_pca_preferences_override = EXCLUDED.merged_pca_preferences_override,
    updated_at = EXCLUDED.updated_at;

  -- Special programs
  INSERT INTO public.special_programs (
    id, name, staff_ids, weekdays, slots, fte_subtraction, pca_required, therapist_preference_order, pca_preference_order
  )
  SELECT
    x.id,
    x.name,
    COALESCE(x.staff_ids, '{}'::uuid[]),
    COALESCE(x.weekdays, '{}'::text[]),
    COALESCE(x.slots, '{}'::jsonb),
    COALESCE(x.fte_subtraction, '{}'::jsonb),
    x.pca_required,
    COALESCE(x.therapist_preference_order, '{}'::jsonb),
    COALESCE(x.pca_preference_order, '{}'::uuid[])
  FROM jsonb_to_recordset(sp_rows) AS x(
    id uuid,
    name text,
    staff_ids uuid[],
    weekdays text[],
    slots jsonb,
    fte_subtraction jsonb,
    pca_required integer,
    therapist_preference_order jsonb,
    pca_preference_order uuid[]
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    staff_ids = EXCLUDED.staff_ids,
    weekdays = EXCLUDED.weekdays,
    slots = EXCLUDED.slots,
    fte_subtraction = EXCLUDED.fte_subtraction,
    pca_required = EXCLUDED.pca_required,
    therapist_preference_order = EXCLUDED.therapist_preference_order,
    pca_preference_order = EXCLUDED.pca_preference_order;

  -- SPT allocations
  INSERT INTO public.spt_allocations (
    id, staff_id, specialty, teams, weekdays, slots, slot_modes, fte_addon,
    substitute_team_head, is_rbip_supervisor, active
  )
  SELECT
    x.id,
    x.staff_id,
    x.specialty,
    COALESCE(x.teams, '{}'::team[]),
    COALESCE(x.weekdays, '{}'::text[]),
    COALESCE(x.slots, '{}'::jsonb),
    COALESCE(x.slot_modes, '{}'::jsonb),
    COALESCE(x.fte_addon, 0),
    COALESCE(x.substitute_team_head, false),
    COALESCE(x.is_rbip_supervisor, false),
    COALESCE(x.active, true)
  FROM jsonb_to_recordset(spt_rows) AS x(
    id uuid,
    staff_id uuid,
    specialty text,
    teams team[],
    weekdays text[],
    slots jsonb,
    slot_modes jsonb,
    fte_addon numeric,
    substitute_team_head boolean,
    is_rbip_supervisor boolean,
    active boolean
  )
  ON CONFLICT (id) DO UPDATE SET
    staff_id = EXCLUDED.staff_id,
    specialty = EXCLUDED.specialty,
    teams = EXCLUDED.teams,
    weekdays = EXCLUDED.weekdays,
    slots = EXCLUDED.slots,
    slot_modes = EXCLUDED.slot_modes,
    fte_addon = EXCLUDED.fte_addon,
    substitute_team_head = EXCLUDED.substitute_team_head,
    is_rbip_supervisor = EXCLUDED.is_rbip_supervisor,
    active = EXCLUDED.active;

  -- PCA preferences
  INSERT INTO public.pca_preferences (
    id, team, preferred_pca_ids, preferred_slots, avoid_gym_schedule, gym_schedule, floor_pca_selection
  )
  SELECT
    x.id,
    x.team,
    COALESCE(x.preferred_pca_ids, '{}'::uuid[]),
    COALESCE(x.preferred_slots, '{}'::int[]),
    x.avoid_gym_schedule,
    x.gym_schedule,
    x.floor_pca_selection
  FROM jsonb_to_recordset(pref_rows) AS x(
    id uuid,
    team team,
    preferred_pca_ids uuid[],
    preferred_slots integer[],
    avoid_gym_schedule boolean,
    gym_schedule integer,
    floor_pca_selection text
  )
  ON CONFLICT (id) DO UPDATE SET
    team = EXCLUDED.team,
    preferred_pca_ids = EXCLUDED.preferred_pca_ids,
    preferred_slots = EXCLUDED.preferred_slots,
    avoid_gym_schedule = EXCLUDED.avoid_gym_schedule,
    gym_schedule = EXCLUDED.gym_schedule,
    floor_pca_selection = EXCLUDED.floor_pca_selection;
END;
$$;

-- ============================================================================
-- Publish snapshot -> global (selected categories), with optimistic concurrency
-- ============================================================================

CREATE OR REPLACE FUNCTION public.publish_snapshot_to_global_v1(
  p_date date,
  p_categories text[],
  p_expected_global_version integer DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cats text[] := COALESCE(p_categories, ARRAY[]::text[]);
  current_version integer;
  s record;
  stored jsonb;
  data jsonb;
  staff_rows jsonb;
  sp_rows jsonb;
  spt_rows jsonb;
  ward_rows jsonb;
  pref_rows jsonb;
  team_display_names jsonb;
  team_merge jsonb;
BEGIN
  IF NOT public.is_admin_or_developer() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT global_version INTO current_version
  FROM public.config_global_head
  WHERE id = true;

  IF p_expected_global_version IS NOT NULL AND current_version IS DISTINCT FROM p_expected_global_version THEN
    RAISE EXCEPTION 'global_head_changed';
  END IF;

  SELECT id, baseline_snapshot INTO s
  FROM public.daily_schedules
  WHERE date = p_date
  LIMIT 1;

  IF s.id IS NULL THEN
    RAISE EXCEPTION 'schedule_not_found';
  END IF;

  stored := COALESCE(s.baseline_snapshot, '{}'::jsonb);
  -- Envelope (v1/v2) stores data under 'data'
  IF (stored ? 'data') THEN
    data := COALESCE(stored -> 'data', '{}'::jsonb);
  ELSE
    data := stored;
  END IF;

  -- Always create a backup before publishing
  PERFORM public.create_config_global_backup_v1(COALESCE(p_note, 'Auto-backup before publish'));

  staff_rows := COALESCE(data -> 'staff', '[]'::jsonb);
  sp_rows := COALESCE(data -> 'specialPrograms', '[]'::jsonb);
  spt_rows := COALESCE(data -> 'sptAllocations', '[]'::jsonb);
  ward_rows := COALESCE(data -> 'wards', '[]'::jsonb);
  pref_rows := COALESCE(data -> 'pcaPreferences', '[]'::jsonb);
  team_display_names := COALESCE(data -> 'teamDisplayNames', '{}'::jsonb);
  team_merge := COALESCE(
    data -> 'teamMerge',
    '{"mergedInto":{},"mergeLabelOverrideByTeam":{},"mergedPcaPreferencesOverrideByTeam":{}}'::jsonb
  );

  -- staffProfile: staff fields excluding team assignment
  IF 'staffProfile' = ANY(cats) THEN
    UPDATE public.staff st
    SET
      name = src.name,
      rank = src.rank,
      floating = COALESCE(src.floating, false),
      status = COALESCE(src.status, 'active'),
      buffer_fte = src.buffer_fte,
      floor_pca = src.floor_pca,
      special_program = src.special_program
    FROM (
      SELECT *
      FROM jsonb_to_recordset(staff_rows) AS x(
        id uuid,
        name text,
        rank staff_rank,
        team team,
        floating boolean,
        status staff_status,
        buffer_fte numeric,
        floor_pca text[],
        special_program text[]
      )
    ) src
    WHERE st.id = src.id;
  END IF;

  -- teamConfig: staff.team + wards team assignments/portions + team_settings display names
  IF 'teamConfig' = ANY(cats) THEN
    UPDATE public.staff st
    SET team = src.team
    FROM (
      SELECT *
      FROM jsonb_to_recordset(staff_rows) AS x(
        id uuid,
        name text,
        rank staff_rank,
        team team,
        floating boolean,
        status staff_status,
        buffer_fte numeric,
        floor_pca text[],
        special_program text[]
      )
    ) src
    WHERE st.id = src.id;

    -- Wards team assignment maps (best-effort; keep name/total_beds unchanged here)
    UPDATE public.wards w
    SET
      team_assignments = COALESCE(src.team_assignments, w.team_assignments),
      team_assignment_portions = COALESCE(src.team_assignment_portions, w.team_assignment_portions)
    FROM (
      SELECT *
      FROM jsonb_to_recordset(ward_rows) AS x(
        id uuid,
        name text,
        total_beds integer,
        team_assignments jsonb,
        team_assignment_portions jsonb
      )
    ) src
    WHERE w.id = src.id;

    -- Team settings (display names + merge config).
    INSERT INTO public.team_settings (
      team,
      display_name,
      merged_into,
      merge_label_override,
      merged_pca_preferences_override,
      updated_at
    )
    SELECT
      t.team,
      COALESCE(team_display_names ->> (t.team)::text, (t.team)::text) AS display_name,
      CASE
        WHEN NULLIF(COALESCE(team_merge -> 'mergedInto' ->> (t.team)::text, ''), '') IS NULL THEN NULL
        ELSE (team_merge -> 'mergedInto' ->> (t.team)::text)::team
      END AS merged_into,
      NULLIF(btrim(COALESCE(team_merge -> 'mergeLabelOverrideByTeam' ->> (t.team)::text, '')), '')
        AS merge_label_override,
      (team_merge -> 'mergedPcaPreferencesOverrideByTeam' -> (t.team)::text) AS merged_pca_preferences_override,
      now()
    FROM (
      SELECT unnest(enum_range(NULL::team)) AS team
    ) t
    ON CONFLICT (team) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      merged_into = EXCLUDED.merged_into,
      merge_label_override = EXCLUDED.merge_label_override,
      merged_pca_preferences_override = EXCLUDED.merged_pca_preferences_override,
      updated_at = EXCLUDED.updated_at;
  END IF;

  -- wardConfig: wards name/total_beds
  IF 'wardConfig' = ANY(cats) THEN
    UPDATE public.wards w
    SET
      name = src.name,
      total_beds = src.total_beds
    FROM (
      SELECT *
      FROM jsonb_to_recordset(ward_rows) AS x(
        id uuid,
        name text,
        total_beds integer,
        team_assignments jsonb,
        team_assignment_portions jsonb
      )
    ) src
    WHERE w.id = src.id;
  END IF;

  -- specialPrograms
  IF 'specialPrograms' = ANY(cats) THEN
    INSERT INTO public.special_programs (
      id, name, staff_ids, weekdays, slots, fte_subtraction, pca_required, therapist_preference_order, pca_preference_order
    )
    SELECT
      x.id,
      x.name,
      COALESCE(x.staff_ids, '{}'::uuid[]),
      COALESCE(x.weekdays, '{}'::text[]),
      COALESCE(x.slots, '{}'::jsonb),
      COALESCE(x.fte_subtraction, '{}'::jsonb),
      x.pca_required,
      COALESCE(x.therapist_preference_order, '{}'::jsonb),
      COALESCE(x.pca_preference_order, '{}'::uuid[])
    FROM jsonb_to_recordset(sp_rows) AS x(
      id uuid,
      name text,
      staff_ids uuid[],
      weekdays text[],
      slots jsonb,
      fte_subtraction jsonb,
      pca_required integer,
      therapist_preference_order jsonb,
      pca_preference_order uuid[]
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      staff_ids = EXCLUDED.staff_ids,
      weekdays = EXCLUDED.weekdays,
      slots = EXCLUDED.slots,
      fte_subtraction = EXCLUDED.fte_subtraction,
      pca_required = EXCLUDED.pca_required,
      therapist_preference_order = EXCLUDED.therapist_preference_order,
      pca_preference_order = EXCLUDED.pca_preference_order;
  END IF;

  -- sptAllocations
  IF 'sptAllocations' = ANY(cats) THEN
    INSERT INTO public.spt_allocations (
      id, staff_id, specialty, teams, weekdays, slots, slot_modes, fte_addon,
      substitute_team_head, is_rbip_supervisor, active
    )
    SELECT
      x.id,
      x.staff_id,
      x.specialty,
      COALESCE(x.teams, '{}'::team[]),
      COALESCE(x.weekdays, '{}'::text[]),
      COALESCE(x.slots, '{}'::jsonb),
      COALESCE(x.slot_modes, '{}'::jsonb),
      COALESCE(x.fte_addon, 0),
      COALESCE(x.substitute_team_head, false),
      COALESCE(x.is_rbip_supervisor, false),
      COALESCE(x.active, true)
    FROM jsonb_to_recordset(spt_rows) AS x(
      id uuid,
      staff_id uuid,
      specialty text,
      teams team[],
      weekdays text[],
      slots jsonb,
      slot_modes jsonb,
      fte_addon numeric,
      substitute_team_head boolean,
      is_rbip_supervisor boolean,
      active boolean
    )
    ON CONFLICT (id) DO UPDATE SET
      staff_id = EXCLUDED.staff_id,
      specialty = EXCLUDED.specialty,
      teams = EXCLUDED.teams,
      weekdays = EXCLUDED.weekdays,
      slots = EXCLUDED.slots,
      slot_modes = EXCLUDED.slot_modes,
      fte_addon = EXCLUDED.fte_addon,
      substitute_team_head = EXCLUDED.substitute_team_head,
      is_rbip_supervisor = EXCLUDED.is_rbip_supervisor,
      active = EXCLUDED.active;
  END IF;

  -- pcaPreferences
  IF 'pcaPreferences' = ANY(cats) THEN
    INSERT INTO public.pca_preferences (
      id, team, preferred_pca_ids, preferred_slots, avoid_gym_schedule, gym_schedule, floor_pca_selection
    )
    SELECT
      x.id,
      x.team,
      COALESCE(x.preferred_pca_ids, '{}'::uuid[]),
      COALESCE(x.preferred_slots, '{}'::int[]),
      x.avoid_gym_schedule,
      x.gym_schedule,
      x.floor_pca_selection
    FROM jsonb_to_recordset(pref_rows) AS x(
      id uuid,
      team team,
      preferred_pca_ids uuid[],
      preferred_slots integer[],
      avoid_gym_schedule boolean,
      gym_schedule integer,
      floor_pca_selection text
    )
    ON CONFLICT (id) DO UPDATE SET
      team = EXCLUDED.team,
      preferred_pca_ids = EXCLUDED.preferred_pca_ids,
      preferred_slots = EXCLUDED.preferred_slots,
      avoid_gym_schedule = EXCLUDED.avoid_gym_schedule,
      gym_schedule = EXCLUDED.gym_schedule,
      floor_pca_selection = EXCLUDED.floor_pca_selection;
  END IF;
END;
$$;

