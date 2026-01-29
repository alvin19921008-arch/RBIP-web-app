-- SPT allocations: move weekday config into JSONB + enforce one row per staff_id.
-- Also updates snapshot/global sync RPCs to include the new column and upsert by staff_id.

-- ============================================================================
-- 1) Schema: add config_by_weekday + unique staff_id
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'spt_allocations'
      AND column_name = 'config_by_weekday'
  ) THEN
    ALTER TABLE public.spt_allocations
      ADD COLUMN config_by_weekday jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- ============================================================================
-- 2) Data migration: synthesize config_by_weekday from legacy columns, and
--    consolidate multiple rows per staff_id into a single canonical row.
--    Rules:
--    - Only active rows are considered when picking canonical row (if any active exists)
--    - For weekday collisions, later updated_at wins
--    - contributes_fte is derived from legacy fte_addon > 0 (display_text defaults to null)
-- ============================================================================

DO $$
DECLARE
  sid uuid;
  canonical_id uuid;
  r record;
  day_text text;
  cfg jsonb;
  day_cfg jsonb;
  slots_day jsonb;
  modes_day jsonb;
  teams_acc team[];
  weekdays_arr weekday[];
BEGIN
  -- Ensure every row has config_by_weekday populated from its own legacy fields (best-effort).
  FOR r IN
    SELECT *
    FROM public.spt_allocations
    ORDER BY updated_at NULLS LAST, created_at NULLS LAST, id
  LOOP
    IF r.config_by_weekday IS NULL OR r.config_by_weekday = '{}'::jsonb THEN
      cfg := '{}'::jsonb;
      weekdays_arr := COALESCE(r.weekdays, '{}'::weekday[]);
      FOREACH day_text IN ARRAY (weekdays_arr::text[]) LOOP
        slots_day := COALESCE(r.slots -> day_text, '[]'::jsonb);
        modes_day := COALESCE(r.slot_modes -> day_text, NULL);
        day_cfg := jsonb_build_object(
          'enabled', true,
          'contributes_fte', COALESCE(r.fte_addon, 0) > 0,
          'slots', slots_day,
          'slot_modes', COALESCE(modes_day, jsonb_build_object('am', 'AND', 'pm', 'AND')),
          'display_text', NULL
        );
        cfg := cfg || jsonb_build_object(day_text, day_cfg);
      END LOOP;

      UPDATE public.spt_allocations
      SET config_by_weekday = cfg
      WHERE id = r.id;
    END IF;
  END LOOP;

  -- Consolidate duplicates per staff_id.
  FOR sid IN
    SELECT staff_id
    FROM public.spt_allocations
    GROUP BY staff_id
    HAVING COUNT(*) > 1
  LOOP
    -- Pick canonical row: prefer active, then most recently updated.
    SELECT id INTO canonical_id
    FROM public.spt_allocations
    WHERE staff_id = sid
    ORDER BY COALESCE(active, true) DESC, updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id ASC
    LIMIT 1;

    cfg := '{}'::jsonb;
    teams_acc := '{}'::team[];

    -- Merge rows: later rows overwrite per-day config (row loop is ascending, overwrite later).
    FOR r IN
      SELECT *
      FROM public.spt_allocations
      WHERE staff_id = sid
      ORDER BY updated_at ASC NULLS LAST, created_at ASC NULLS LAST, id ASC
    LOOP
      -- Merge teams (union distinct)
      teams_acc := (
        SELECT COALESCE(array_agg(DISTINCT t), '{}'::team[])
        FROM unnest(COALESCE(teams_acc, '{}'::team[]) || COALESCE(r.teams, '{}'::team[])) AS t
      );

      -- Merge config_by_weekday (later overwrites)
      cfg := cfg || COALESCE(r.config_by_weekday, '{}'::jsonb);
    END LOOP;

    UPDATE public.spt_allocations
    SET
      teams = teams_acc,
      config_by_weekday = cfg
    WHERE id = canonical_id;

    DELETE FROM public.spt_allocations
    WHERE staff_id = sid AND id <> canonical_id;
  END LOOP;
END $$;

-- Unique staff_id constraint (after consolidation)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'spt_allocations'
      AND indexname = 'spt_allocations_staff_id_unique'
  ) THEN
    CREATE UNIQUE INDEX spt_allocations_staff_id_unique ON public.spt_allocations (staff_id);
  END IF;
END $$;

-- ============================================================================
-- 3) Update pull_global_to_snapshot_v1 to include config_by_weekday
-- ============================================================================

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
        SELECT
          id,
          staff_id,
          specialty,
          teams,
          weekdays,
          slots,
          slot_modes,
          fte_addon,
          substitute_team_head,
          is_rbip_supervisor,
          active,
          config_by_weekday
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

-- ============================================================================
-- 5) Update publish_snapshot_to_global_v1 to upsert spt_allocations by staff_id
--    and include config_by_weekday.
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

    -- Team settings display names (teamDisplayNames is a JSON object: { TEAM: displayName })
    INSERT INTO public.team_settings (team, display_name, updated_at)
    SELECT
      (kv.key)::team,
      (kv.value)::text,
      now()
    FROM jsonb_each_text(team_display_names) kv
    ON CONFLICT (team) DO UPDATE SET
      display_name = EXCLUDED.display_name,
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

  -- sptAllocations (upsert by staff_id; include config_by_weekday)
  IF 'sptAllocations' = ANY(cats) THEN
    INSERT INTO public.spt_allocations (
      id, staff_id, specialty, teams, weekdays, slots, slot_modes, fte_addon,
      substitute_team_head, is_rbip_supervisor, active, config_by_weekday
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
      COALESCE(x.active, true),
      COALESCE(x.config_by_weekday, '{}'::jsonb)
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
      active boolean,
      config_by_weekday jsonb
    )
    ON CONFLICT (staff_id) DO UPDATE SET
      specialty = EXCLUDED.specialty,
      teams = EXCLUDED.teams,
      weekdays = EXCLUDED.weekdays,
      slots = EXCLUDED.slots,
      slot_modes = EXCLUDED.slot_modes,
      fte_addon = EXCLUDED.fte_addon,
      substitute_team_head = EXCLUDED.substitute_team_head,
      is_rbip_supervisor = EXCLUDED.is_rbip_supervisor,
      active = EXCLUDED.active,
      config_by_weekday = EXCLUDED.config_by_weekday;
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

-- ============================================================================
-- 4) Update global backup restore + publish RPCs to upsert spt_allocations by staff_id
--    and include config_by_weekday.
-- ============================================================================

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
  INSERT INTO public.team_settings (team, display_name, updated_at)
  SELECT
    x.team,
    x.display_name,
    now()
  FROM jsonb_to_recordset(team_settings_rows) AS x(
    team team,
    display_name text
  )
  ON CONFLICT (team) DO UPDATE SET
    display_name = EXCLUDED.display_name,
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

  -- SPT allocations (upsert by staff_id; include config_by_weekday)
  INSERT INTO public.spt_allocations (
    id, staff_id, specialty, teams, weekdays, slots, slot_modes, fte_addon,
    substitute_team_head, is_rbip_supervisor, active, config_by_weekday
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
    COALESCE(x.active, true),
    COALESCE(x.config_by_weekday, '{}'::jsonb)
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
    active boolean,
    config_by_weekday jsonb
  )
  ON CONFLICT (staff_id) DO UPDATE SET
    specialty = EXCLUDED.specialty,
    teams = EXCLUDED.teams,
    weekdays = EXCLUDED.weekdays,
    slots = EXCLUDED.slots,
    slot_modes = EXCLUDED.slot_modes,
    fte_addon = EXCLUDED.fte_addon,
    substitute_team_head = EXCLUDED.substitute_team_head,
    is_rbip_supervisor = EXCLUDED.is_rbip_supervisor,
    active = EXCLUDED.active,
    config_by_weekday = EXCLUDED.config_by_weekday;

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

