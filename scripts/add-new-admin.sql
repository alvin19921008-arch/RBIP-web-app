-- Add New Admin User Profile
-- Run this in Supabase SQL Editor

-- New user details:
-- ID: 950b43f4-c3e9-43bf-8211-4406da640bdb

INSERT INTO user_profiles (id, role)
VALUES ('950b43f4-c3e9-43bf-8211-4406da640bdb', 'admin')
ON CONFLICT (id) DO UPDATE SET role = 'admin';

-- Verify it was created
SELECT 
  up.id,
  au.email,
  up.role,
  up.created_at
FROM user_profiles up
JOIN auth.users au ON up.id = au.id
WHERE up.id = '950b43f4-c3e9-43bf-8211-4406da640bdb';

