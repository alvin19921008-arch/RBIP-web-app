ALTER TABLE public.staff
ADD COLUMN IF NOT EXISTS shared_therapist_mode text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'staff_shared_therapist_mode_check'
  ) THEN
    ALTER TABLE public.staff
    ADD CONSTRAINT staff_shared_therapist_mode_check
    CHECK (
      shared_therapist_mode IS NULL
      OR shared_therapist_mode IN ('slot-based', 'single-team')
    );
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.save_staff_edit_dialog_v2(
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_staff jsonb := COALESCE(p_payload -> 'staff', '{}'::jsonb);
  v_configs jsonb := COALESCE(p_payload -> 'specialProgramConfigs', '{}'::jsonb);
  v_staff_id uuid := NULL;
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
  v_program_row public.special_programs%ROWTYPE;
  v_day text;
  v_day_cfg jsonb;
  v_config_by_weekday jsonb;
  v_entry jsonb;
  v_slots jsonb;
  v_enabled boolean;
  v_fte numeric;
  v_shared_mode text := CASE
    WHEN v_staff ? 'shared_therapist_mode' THEN NULLIF(v_staff ->> 'shared_therapist_mode', '')
    ELSE NULL
  END;
BEGIN
  v_result := public.save_staff_edit_dialog_v1(p_payload);
  v_staff_id := NULLIF(COALESCE(p_payload ->> 'staffId', v_result ->> 'id'), '')::uuid;

  IF v_staff_id IS NULL THEN
    RETURN v_result;
  END IF;

  IF v_staff ? 'shared_therapist_mode' THEN
    UPDATE public.staff
    SET shared_therapist_mode = CASE
      WHEN v_shared_mode IN ('slot-based', 'single-team') THEN v_shared_mode
      ELSE NULL
    END
    WHERE id = v_staff_id;
  END IF;

  DELETE FROM public.special_program_staff_configs spc
  WHERE spc.staff_id = v_staff_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.special_programs sp
      WHERE sp.id = spc.program_id
        AND sp.name = ANY(v_requested_programs)
    );

  FOR v_program_row IN
    SELECT *
    FROM public.special_programs
    WHERE name = ANY(v_requested_programs)
    FOR UPDATE
  LOOP
    v_config_by_weekday := '{}'::jsonb;

    FOREACH v_day IN ARRAY ARRAY['mon', 'tue', 'wed', 'thu', 'fri'] LOOP
      v_day_cfg := COALESCE(v_configs -> v_program_row.name -> v_day, '{}'::jsonb);
      v_enabled := COALESCE((v_day_cfg ->> 'enabled')::boolean, false);

      SELECT COALESCE(jsonb_agg(slot_value ORDER BY slot_value), '[]'::jsonb)
      INTO v_slots
      FROM (
        SELECT DISTINCT value::int AS slot_value
        FROM jsonb_array_elements_text(
          CASE
            WHEN jsonb_typeof(v_day_cfg -> 'slots') = 'array' THEN v_day_cfg -> 'slots'
            ELSE '[]'::jsonb
          END
        ) AS raw(value)
        WHERE value IN ('1', '2', '3', '4')
      ) normalized_slots;

      v_fte := CASE
        WHEN jsonb_typeof(v_day_cfg -> 'fteSubtraction') = 'number'
          THEN (v_day_cfg ->> 'fteSubtraction')::numeric
        ELSE NULL
      END;

      IF
        v_enabled
        OR jsonb_array_length(v_slots) > 0
        OR (v_program_row.name = 'CRP' AND v_fte IS NOT NULL)
        OR (v_program_row.name <> 'CRP' AND COALESCE(v_fte, 0) > 0)
      THEN
        v_entry := jsonb_strip_nulls(
          jsonb_build_object(
            'enabled', CASE WHEN v_enabled THEN true ELSE NULL END,
            'slots', CASE WHEN jsonb_array_length(v_slots) > 0 THEN v_slots ELSE NULL END,
            'fte_subtraction', CASE WHEN v_fte IS NOT NULL THEN to_jsonb(v_fte) ELSE NULL END
          )
        );
        v_config_by_weekday := jsonb_set(v_config_by_weekday, ARRAY[v_day], v_entry, true);
      END IF;
    END LOOP;

    IF v_config_by_weekday = '{}'::jsonb THEN
      DELETE FROM public.special_program_staff_configs
      WHERE program_id = v_program_row.id
        AND staff_id = v_staff_id;
    ELSE
      INSERT INTO public.special_program_staff_configs (
        program_id,
        staff_id,
        config_by_weekday
      )
      VALUES (
        v_program_row.id,
        v_staff_id,
        v_config_by_weekday
      )
      ON CONFLICT (program_id, staff_id) DO UPDATE
      SET
        config_by_weekday = EXCLUDED.config_by_weekday,
        updated_at = now();
    END IF;
  END LOOP;

  RETURN v_result;
END;
$$;
