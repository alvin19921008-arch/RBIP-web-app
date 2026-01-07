-- Add admin DELETE policy for daily_schedules
-- This allows admins to delete schedules from the history page
CREATE POLICY "Admin full access" ON daily_schedules FOR ALL USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
);
