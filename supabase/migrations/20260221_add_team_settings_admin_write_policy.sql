-- Ensure admin/developer can write team_settings (needed for Team Merge UI).

ALTER TABLE public.team_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access" ON public.team_settings;
CREATE POLICY "Admin full access" ON public.team_settings
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.user_profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'developer')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.user_profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'developer')
  )
);
