-- Schema Verification Queries
-- Run these in Supabase SQL Editor to verify schema integrity

-- 1. Check if all required tables exist
SELECT 
  table_name,
  CASE 
    WHEN table_name IN (
      'staff', 'staff_preferences', 'special_programs', 'spt_allocations',
      'team_head_substitutions', 'pca_preferences', 'wards', 'daily_schedules',
      'schedule_therapist_allocations', 'schedule_pca_allocations',
      'schedule_bed_allocations', 'schedule_calculations', 'user_profiles'
    ) THEN '✅ Required'
    ELSE '⚠️ Optional'
  END as status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'staff', 'staff_preferences', 'special_programs', 'spt_allocations',
    'team_head_substitutions', 'pca_preferences', 'wards', 'daily_schedules',
    'schedule_therapist_allocations', 'schedule_pca_allocations',
    'schedule_bed_allocations', 'schedule_calculations', 'user_profiles'
  )
ORDER BY table_name;

-- 2. Check enum types
SELECT 
  t.typname as enum_name,
  array_agg(e.enumlabel ORDER BY e.enumsortorder) as enum_values
FROM pg_type t 
JOIN pg_enum e ON t.oid = e.enumtypid  
WHERE t.typname IN ('staff_rank', 'team', 'weekday', 'leave_type')
GROUP BY t.typname
ORDER BY t.typname;

-- 3. Check user_profiles and admin users
SELECT 
  id,
  role,
  created_at
FROM user_profiles
ORDER BY created_at;

-- 4. Check RLS policies
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'staff', 'staff_preferences', 'special_programs', 'spt_allocations',
    'team_head_substitutions', 'pca_preferences', 'wards', 'daily_schedules',
    'schedule_therapist_allocations', 'schedule_pca_allocations',
    'schedule_bed_allocations', 'schedule_calculations', 'user_profiles'
  )
ORDER BY tablename, policyname;

-- 5. Check indexes
SELECT 
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'staff', 'staff_preferences', 'special_programs', 'spt_allocations',
    'team_head_substitutions', 'pca_preferences', 'wards', 'daily_schedules',
    'schedule_therapist_allocations', 'schedule_pca_allocations',
    'schedule_bed_allocations', 'schedule_calculations', 'user_profiles'
  )
ORDER BY tablename, indexname;

-- 6. Check foreign key constraints
SELECT
  tc.table_name, 
  kcu.column_name, 
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name 
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND tc.table_name IN (
    'staff_preferences', 'special_programs', 'spt_allocations',
    'team_head_substitutions', 'pca_preferences', 'daily_schedules',
    'schedule_therapist_allocations', 'schedule_pca_allocations',
    'schedule_bed_allocations', 'schedule_calculations', 'user_profiles'
  )
ORDER BY tc.table_name, kcu.column_name;

