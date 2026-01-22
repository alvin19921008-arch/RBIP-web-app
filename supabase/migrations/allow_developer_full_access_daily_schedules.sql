-- Allow admin + developer full access to daily_schedules (including delete from History page).
-- Developers are intended to have all admin privileges.

DROP POLICY IF EXISTS "Admin full access" ON daily_schedules;

CREATE POLICY "Admin full access" ON daily_schedules
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM user_profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'developer')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM user_profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'developer')
  )
);

