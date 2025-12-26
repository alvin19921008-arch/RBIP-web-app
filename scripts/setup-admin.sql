-- Setup Admin User Script
-- Run this in Supabase SQL Editor after creating a user in Authentication

-- Step 1: Find your user ID from auth.users
-- Replace 'your-email@example.com' with your actual email
SELECT id, email, created_at 
FROM auth.users 
WHERE email = 'your-email@example.com';

-- Step 2: After you have the user ID, run this to create/update the admin profile
-- Replace 'YOUR-USER-ID-HERE' with the actual UUID from Step 1
INSERT INTO user_profiles (id, role)
VALUES ('YOUR-USER-ID-HERE', 'admin')
ON CONFLICT (id) DO UPDATE SET role = 'admin';

-- Step 3: Verify the admin user was created
SELECT 
  up.id,
  au.email,
  up.role,
  up.created_at
FROM user_profiles up
JOIN auth.users au ON up.id = au.id
WHERE up.role = 'admin';

-- Alternative: If you know the user ID directly, you can skip Step 1 and just run:
-- INSERT INTO user_profiles (id, role)
-- VALUES ('<paste-user-id-here>', 'admin')
-- ON CONFLICT (id) DO UPDATE SET role = 'admin';

