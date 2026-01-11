-- Account management: usernames + expanded roles (user/admin/developer)
-- Also updates admin RLS policies to treat 'developer' as admin-equivalent.

-- 1) Extend user_profiles schema
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT;

-- Expand role check constraint from ('admin','regular') to ('user','admin','developer')
ALTER TABLE user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_role_check;

ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_role_check CHECK (role IN ('user', 'admin', 'developer'));

-- Migrate legacy role values
UPDATE user_profiles
SET role = 'user'
WHERE role = 'regular';

-- Backfill username from auth.users email local-part (best-effort).
-- If email is missing, generate a stable fallback.
UPDATE user_profiles up
SET username = COALESCE(
  NULLIF(
    lower(
      regexp_replace(
        split_part(au.email, '@', 1),
        '[^a-zA-Z0-9_]+',
        '',
        'g'
      )
    ),
    ''
  ),
  'user_' || substring(up.id::text, 1, 8)
)
FROM auth.users au
WHERE au.id = up.id
  AND (up.username IS NULL OR btrim(up.username) = '');

-- Ensure any remaining null usernames have a fallback.
UPDATE user_profiles
SET username = 'user_' || substring(id::text, 1, 8)
WHERE username IS NULL OR btrim(username) = '';

-- De-dup usernames if needed by appending a short suffix for 2nd+ occurrences.
WITH ranked AS (
  SELECT id, username, row_number() OVER (PARTITION BY username ORDER BY id) AS rn
  FROM user_profiles
)
UPDATE user_profiles up
SET username = up.username || '_' || substring(up.id::text, 1, 4)
FROM ranked r
WHERE up.id = r.id
  AND r.rn > 1;

-- Enforce NOT NULL + uniqueness
ALTER TABLE user_profiles
  ALTER COLUMN username SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_username_unique_idx ON user_profiles (username);

-- 2) Promote the existing admin account email to Developer access (as requested)
UPDATE user_profiles up
SET role = 'developer'
FROM auth.users au
WHERE au.id = up.id
  AND au.email = 'alvin19921008@gmail.com';

-- 3) Update "Admin full access" policies to include developer
DROP POLICY IF EXISTS "Admin full access" ON staff;
CREATE POLICY "Admin full access" ON staff FOR ALL
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'developer')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'developer')));

DROP POLICY IF EXISTS "Admin full access" ON staff_preferences;
CREATE POLICY "Admin full access" ON staff_preferences FOR ALL
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'developer')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'developer')));

DROP POLICY IF EXISTS "Admin full access" ON special_programs;
CREATE POLICY "Admin full access" ON special_programs FOR ALL
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'developer')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'developer')));

DROP POLICY IF EXISTS "Admin full access" ON spt_allocations;
CREATE POLICY "Admin full access" ON spt_allocations FOR ALL
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'developer')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'developer')));

DROP POLICY IF EXISTS "Admin full access" ON team_head_substitutions;
CREATE POLICY "Admin full access" ON team_head_substitutions FOR ALL
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'developer')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'developer')));

DROP POLICY IF EXISTS "Admin full access" ON pca_preferences;
CREATE POLICY "Admin full access" ON pca_preferences FOR ALL
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'developer')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'developer')));

DROP POLICY IF EXISTS "Admin full access" ON wards;
CREATE POLICY "Admin full access" ON wards FOR ALL
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'developer')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'developer')));

