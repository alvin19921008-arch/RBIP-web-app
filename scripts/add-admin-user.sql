-- Add Admin User Profile
-- Run this in Supabase SQL Editor

-- Your user details:
-- ID: 36cf36fd-3793-4118-8ec9-8b9d8b9c1996
-- Email: alvin19921008@gmail.com

INSERT INTO user_profiles (id, role)
VALUES ('36cf36fd-3793-4118-8ec9-8b9d8b9c1996', 'admin')
ON CONFLICT (id) DO UPDATE SET role = 'admin';

-- Verify it was created
SELECT 
  up.id,
  au.email,
  up.role,
  up.created_at
FROM user_profiles up
JOIN auth.users au ON up.id = au.id
WHERE up.id = '36cf36fd-3793-4118-8ec9-8b9d8b9c1996';

