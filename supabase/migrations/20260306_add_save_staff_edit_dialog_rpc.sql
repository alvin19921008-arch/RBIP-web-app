-- Atomic save boundary for Staff Edit Dialog draft payloads.

CREATE OR REPLACE FUNCTION public.save_staff_edit_dialog_v1(
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff jsonb := COALESCE(p_payload -> 'staff', '{}'::jsonb);
  v_spt jsonb := COALESCE(p_payload -> 'sptAllocation', 'null'::jsonb);
  v_configs jsonb := COALESCE(p_payload -> 'specialProgramConfigs', '{}'::jsonb);
  v_staff_id uuid := NULLIF(p_payload ->> 'staffId', '')::uuid;
  v_requested_programs text[] := COALESCE(
    (
      SELECT array_agg(value)
      FROM jsonb_array_elements_text(
        CASE
          WHEN jsonb_typeof(v_staff -> 'special_program') = 'array' THEN v_staff -> 'special_program'
          ELSE '[]'::jsonb
        END
      ) AS t(value)
    ),
    '{}'::text[]
  );
  v_floor_pca text[] := COALESCE(
    (
      SELECT array_agg(value)
      FROM jsonb_array_elements_text(
        CASE
          WHEN jsonb_typeof(v_staff -> 'floor_pca') = 'array' THEN v_staff -> 'floor_pca'
          ELSE '[]'::jsonb
        END
      ) AS t(value)
    ),
    '{}'::text[]
  );
  v_existing_staff public.staff%ROWTYPE;
  v_saved_staff public.staff%ROWTYPE;
  v_previous_programs text[] := '{}'::text[];
  v_next_rank staff_rank;
  v_has_spt_data boolean := false;
  v_program_name text;
  v_program_row public.special_programs%ROWTYPE;
  v_current_slots jsonb;
  v_current_fte jsonb;
  v_current_staff_ids uuid[];
  v_program_weekdays weekday[];
  v_draft_config jsonb;
  v_entry_slots jsonb;
  v_entry_fte jsonb;
  v_day text;
  v_day_cfg jsonb;
BEGIN
  IF NOT public.is_admin_or_developer() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF COALESCE(v_staff ->> 'status', '') IN ('inactive', 'buffer') THEN
    v_staff := jsonb_set(v_staff, '{team}', 'null'::jsonb, true);
  END IF;

  IF v_staff_id IS NOT NULL THEN
    SELECT *
    INTO v_existing_staff
    FROM public.staff
    WHERE id = v_staff_id
    FOR UPDATE;

    IF v_existing_staff.id IS NULL THEN
      RAISE EXCEPTION 'staff_not_found';
    END IF;

    v_previous_programs := COALESCE(v_existing_staff.special_program, '{}'::text[]);

    UPDATE public.staff
    SET
      name = COALESCE(NULLIF(v_staff ->> 'name', ''), v_existing_staff.name),
      rank = CASE
        WHEN v_staff ? 'rank' THEN NULLIF(v_staff ->> 'rank', '')::staff_rank
        ELSE v_existing_staff.rank
      END,
      team = CASE
        WHEN v_staff ? 'team' THEN
          CASE
            WHEN jsonb_typeof(v_staff -> 'team') = 'null' THEN NULL
            ELSE NULLIF(v_staff ->> 'team', '')::team
          END
        ELSE v_existing_staff.team
      END,
      special_program = CASE
        WHEN v_staff ? 'special_program' THEN v_requested_programs
        ELSE v_existing_staff.special_program
      END,
      floating = CASE
        WHEN v_staff ? 'floating' THEN COALESCE((v_staff ->> 'floating')::boolean, false)
        ELSE v_existing_staff.floating
      END,
      floor_pca = CASE
        WHEN v_staff ? 'floor_pca' THEN v_floor_pca
        ELSE v_existing_staff.floor_pca
      END,
      status = CASE
        WHEN v_staff ? 'status' THEN COALESCE(NULLIF(v_staff ->> 'status', '')::staff_status, v_existing_staff.status)
        ELSE v_existing_staff.status
      END
    WHERE id = v_staff_id
    RETURNING * INTO v_saved_staff;
  ELSE
    INSERT INTO public.staff (
      name,
      rank,
      team,
      special_program,
      floating,
      floor_pca,
      status
    )
    VALUES (
      NULLIF(v_staff ->> 'name', ''),
      NULLIF(v_staff ->> 'rank', '')::staff_rank,
      CASE
        WHEN v_staff ? 'team' AND jsonb_typeof(v_staff -> 'team') <> 'null'
          THEN NULLIF(v_staff ->> 'team', '')::team
        ELSE NULL
      END,
      v_requested_programs,
      COALESCE((v_staff ->> 'floating')::boolean, false),
      v_floor_pca,
      COALESCE(NULLIF(v_staff ->> 'status', '')::staff_status, 'active'::staff_status)
    )
    RETURNING * INTO v_saved_staff;

    v_staff_id := v_saved_staff.id;
  END IF;

  v_next_rank := v_saved_staff.rank;
  v_has_spt_data :=
    v_spt IS NOT NULL
    AND v_spt <> 'null'::jsonb
    AND (
      COALESCE(v_spt ->> 'specialty', '') <> ''
      OR COALESCE((v_spt ->> 'is_rbip_supervisor')::boolean, false)
      OR jsonb_array_length(COALESCE(v_spt -> 'teams', '[]'::jsonb)) > 0
      OR jsonb_array_length(COALESCE(v_spt -> 'weekdays', '[]'::jsonb)) > 0
      OR EXISTS (
        SELECT 1
        FROM jsonb_object_keys(COALESCE(v_spt -> 'config_by_weekday', '{}'::jsonb))
      )
    );

  IF v_next_rank = 'SPT'::staff_rank AND v_has_spt_data THEN
    INSERT INTO public.spt_allocations (
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
    )
    VALUES (
      v_staff_id,
      NULLIF(v_spt ->> 'specialty', ''),
      COALESCE(
        (
          SELECT array_agg(value::team)
          FROM jsonb_array_elements_text(COALESCE(v_spt -> 'teams', '[]'::jsonb)) AS t(value)
        ),
        '{}'::team[]
      ),
      COALESCE(
        (
          SELECT array_agg(value::weekday)
          FROM jsonb_array_elements_text(COALESCE(v_spt -> 'weekdays', '[]'::jsonb)) AS t(value)
        ),
        '{}'::weekday[]
      ),
      COALESCE(v_spt -> 'slots', '{}'::jsonb),
      COALESCE(v_spt -> 'slot_modes', '{}'::jsonb),
      COALESCE((v_spt ->> 'fte_addon')::numeric, 0),
      COALESCE((v_spt ->> 'substitute_team_head')::boolean, false),
      COALESCE((v_spt ->> 'is_rbip_supervisor')::boolean, false),
      COALESCE((v_spt ->> 'active')::boolean, true),
      COALESCE(v_spt -> 'config_by_weekday', '{}'::jsonb)
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
  ELSIF v_next_rank <> 'SPT'::staff_rank THEN
    DELETE FROM public.spt_allocations
    WHERE staff_id = v_staff_id;
  END IF;

  FOR v_program_name IN
    SELECT DISTINCT value
    FROM unnest(COALESCE(v_previous_programs, '{}'::text[]) || COALESCE(v_requested_programs, '{}'::text[])) AS t(value)
  LOOP
    SELECT *
    INTO v_program_row
    FROM public.special_programs
    WHERE name = v_program_name
    LIMIT 1
    FOR UPDATE;

    v_current_slots := COALESCE(v_program_row.slots, '{}'::jsonb);
    v_current_fte := COALESCE(v_program_row.fte_subtraction, '{}'::jsonb);
    v_current_staff_ids := COALESCE(v_program_row.staff_ids, '{}'::uuid[]);

    IF v_program_name = ANY(v_requested_programs) THEN
      v_draft_config := COALESCE(v_configs -> v_program_name, '{}'::jsonb);
      v_entry_slots := '{}'::jsonb;
      v_entry_fte := '{}'::jsonb;

      FOREACH v_day IN ARRAY ARRAY['mon', 'tue', 'wed', 'thu', 'fri'] LOOP
        v_day_cfg := COALESCE(v_draft_config -> v_day, '{}'::jsonb);

        IF COALESCE((v_day_cfg ->> 'enabled')::boolean, false) THEN
          IF jsonb_array_length(COALESCE(v_day_cfg -> 'slots', '[]'::jsonb)) > 0 THEN
            v_entry_slots := jsonb_set(v_entry_slots, ARRAY[v_day], COALESCE(v_day_cfg -> 'slots', '[]'::jsonb), true);
          END IF;

          IF v_program_name = 'CRP' THEN
            v_entry_fte := jsonb_set(
              v_entry_fte,
              ARRAY[v_day],
              to_jsonb(COALESCE((v_day_cfg ->> 'fteSubtraction')::numeric, 0)),
              true
            );
          ELSIF COALESCE((v_day_cfg ->> 'fteSubtraction')::numeric, 0) > 0 THEN
            v_entry_fte := jsonb_set(
              v_entry_fte,
              ARRAY[v_day],
              to_jsonb((v_day_cfg ->> 'fteSubtraction')::numeric),
              true
            );
          END IF;
        END IF;
      END LOOP;

      IF v_entry_slots <> '{}'::jsonb THEN
        v_current_slots := jsonb_set(v_current_slots, ARRAY[v_staff_id::text], v_entry_slots, true);
      ELSE
        v_current_slots := v_current_slots - v_staff_id::text;
      END IF;

      IF v_entry_fte <> '{}'::jsonb THEN
        v_current_fte := jsonb_set(v_current_fte, ARRAY[v_staff_id::text], v_entry_fte, true);
      ELSE
        v_current_fte := v_current_fte - v_staff_id::text;
      END IF;

      SELECT COALESCE(array_agg(DISTINCT value), '{}'::uuid[])
      INTO v_current_staff_ids
      FROM unnest(v_current_staff_ids || ARRAY[v_staff_id]) AS t(value);
    ELSIF v_program_row.id IS NOT NULL THEN
      v_current_slots := v_current_slots - v_staff_id::text;
      v_current_fte := v_current_fte - v_staff_id::text;

      SELECT COALESCE(array_agg(value), '{}'::uuid[])
      INTO v_current_staff_ids
      FROM unnest(v_current_staff_ids) AS t(value)
      WHERE value <> v_staff_id;
    END IF;

    SELECT COALESCE(array_agg(day::weekday ORDER BY sort_order), '{}'::weekday[])
    INTO v_program_weekdays
    FROM (
      SELECT DISTINCT day,
        CASE day
          WHEN 'mon' THEN 1
          WHEN 'tue' THEN 2
          WHEN 'wed' THEN 3
          WHEN 'thu' THEN 4
          WHEN 'fri' THEN 5
          ELSE 99
        END AS sort_order
      FROM (
        SELECT day_key AS day
        FROM jsonb_each(COALESCE(v_current_slots, '{}'::jsonb)) AS s(staff_key, staff_value),
             jsonb_object_keys(COALESCE(staff_value, '{}'::jsonb)) AS day_key
        UNION
        SELECT day_key AS day
        FROM jsonb_each(COALESCE(v_current_fte, '{}'::jsonb)) AS f(staff_key, staff_value),
             jsonb_object_keys(COALESCE(staff_value, '{}'::jsonb)) AS day_key
      ) days
      WHERE day IN ('mon', 'tue', 'wed', 'thu', 'fri')
    ) ordered_days;

    IF v_program_name = ANY(v_requested_programs) THEN
      IF v_program_row.id IS NOT NULL THEN
        UPDATE public.special_programs
        SET
          staff_ids = v_current_staff_ids,
          weekdays = v_program_weekdays,
          slots = v_current_slots,
          fte_subtraction = v_current_fte
        WHERE id = v_program_row.id;
      ELSE
        INSERT INTO public.special_programs (
          name,
          staff_ids,
          weekdays,
          slots,
          fte_subtraction,
          pca_required,
          therapist_preference_order,
          pca_preference_order
        )
        VALUES (
          v_program_name,
          v_current_staff_ids,
          v_program_weekdays,
          v_current_slots,
          v_current_fte,
          NULL,
          '{}'::jsonb,
          '{}'::uuid[]
        );
      END IF;
    ELSIF v_program_row.id IS NOT NULL THEN
      UPDATE public.special_programs
      SET
        staff_ids = v_current_staff_ids,
        weekdays = v_program_weekdays,
        slots = v_current_slots,
        fte_subtraction = v_current_fte
      WHERE id = v_program_row.id;
    END IF;
  END LOOP;

  RETURN to_jsonb(v_saved_staff);
END;
$$;
