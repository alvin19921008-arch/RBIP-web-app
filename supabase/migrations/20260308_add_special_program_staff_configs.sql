CREATE TABLE IF NOT EXISTS public.special_program_staff_configs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  program_id uuid NOT NULL REFERENCES public.special_programs(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  config_by_weekday jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(program_id, staff_id)
);

DROP TRIGGER IF EXISTS update_special_program_staff_configs_updated_at ON public.special_program_staff_configs;
CREATE TRIGGER update_special_program_staff_configs_updated_at
BEFORE UPDATE ON public.special_program_staff_configs
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

INSERT INTO public.special_program_staff_configs (program_id, staff_id, config_by_weekday)
SELECT
  sp.id,
  staff_id,
  COALESCE(
    (
      SELECT jsonb_object_agg(day, day_config)
      FROM (
        SELECT
          day,
          jsonb_strip_nulls(
            jsonb_build_object(
              'enabled', true,
              'slots',
                CASE
                  WHEN jsonb_typeof(cfg.slot_days -> day) = 'array'
                  THEN cfg.slot_days -> day
                  ELSE NULL
                END,
              'fte_subtraction',
                CASE
                  WHEN cfg.fte_days ? day THEN cfg.fte_days -> day
                  ELSE NULL
                END
            )
          ) AS day_config
        FROM unnest(ARRAY['mon', 'tue', 'wed', 'thu', 'fri']) AS day
        WHERE
          (
            jsonb_typeof(cfg.slot_days -> day) = 'array'
            AND jsonb_array_length(cfg.slot_days -> day) > 0
          )
          OR cfg.fte_days ? day
      ) day_rows
    ),
    '{}'::jsonb
  ) AS config_by_weekday
FROM public.special_programs sp
CROSS JOIN LATERAL unnest(COALESCE(sp.staff_ids, '{}'::uuid[])) AS staff_id
CROSS JOIN LATERAL (
  SELECT
    CASE
      WHEN jsonb_typeof(sp.slots) = 'object' THEN COALESCE(sp.slots -> staff_id::text, '{}'::jsonb)
      ELSE '{}'::jsonb
    END AS slot_days,
    CASE
      WHEN jsonb_typeof(sp.fte_subtraction) = 'object' THEN COALESCE(sp.fte_subtraction -> staff_id::text, '{}'::jsonb)
      ELSE '{}'::jsonb
    END AS fte_days
) cfg
ON CONFLICT (program_id, staff_id) DO UPDATE
SET config_by_weekday = EXCLUDED.config_by_weekday;

ALTER TABLE public.special_program_staff_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access" ON public.special_program_staff_configs;
CREATE POLICY "Admin full access" ON public.special_program_staff_configs
FOR ALL
USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('admin', 'developer')))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('admin', 'developer')));

DROP POLICY IF EXISTS "Authenticated read special_program_staff_configs" ON public.special_program_staff_configs;
CREATE POLICY "Authenticated read special_program_staff_configs"
ON public.special_program_staff_configs
FOR SELECT
TO authenticated
USING (true);
