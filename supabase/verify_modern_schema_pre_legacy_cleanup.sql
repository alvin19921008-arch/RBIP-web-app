-- Read-only preflight audit for removing legacy schema fallbacks.
-- Run in Supabase SQL Editor.
--
-- Output columns:
-- - severity: BLOCKER | IMPORTANT | INFO
-- - category: table | column | function | policy | type | index | data | legacy
-- - item: object being checked
-- - status: PASS | FAIL | WARN
-- - details: why it matters for legacy fallback removal
--
-- Notes:
-- - This script does NOT mutate data or schema.
-- - "BLOCKER + FAIL" items should be fixed before deleting legacy fallbacks.

WITH checks AS (
  -- Core schema columns used by schedule page/controller without old-schema fallback.
  SELECT
    'BLOCKER'::text AS severity,
    'column'::text AS category,
    'staff.status'::text AS item,
    EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'staff' AND column_name = 'status'
    ) AS ok,
    'Required by modern staff loading and staff status logic (inactive/buffer).'::text AS details
  UNION ALL
  SELECT
    'BLOCKER', 'column', 'staff.buffer_fte',
    EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'staff' AND column_name = 'buffer_fte'
    ),
    'Required by buffer staff flow and snapshot/global sync logic.'
  UNION ALL
  SELECT
    'BLOCKER', 'column', 'wards.team_assignment_portions',
    EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'wards' AND column_name = 'team_assignment_portions'
    ),
    'Required by modern ward/team configuration reads (old fallback currently handles missing column).'
  UNION ALL
  SELECT
    'BLOCKER', 'column', 'spt_allocations.config_by_weekday',
    EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'spt_allocations' AND column_name = 'config_by_weekday'
    ),
    'Required by modern SPT config model and select fields.'
  UNION ALL
  SELECT
    'BLOCKER', 'column', 'daily_schedules.baseline_snapshot',
    EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'daily_schedules' AND column_name = 'baseline_snapshot'
    ),
    'Required by per-date snapshot hydration (legacy no-baseline fallback currently exists).'
  UNION ALL
  SELECT
    'BLOCKER', 'column', 'daily_schedules.workflow_state',
    EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'daily_schedules' AND column_name = 'workflow_state'
    ),
    'Required by step state persistence.'
  UNION ALL
  SELECT
    'BLOCKER', 'column', 'daily_schedules.tie_break_decisions',
    EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'daily_schedules' AND column_name = 'tie_break_decisions'
    ),
    'Required by floating PCA tie-break persistence.'

  -- Extra calculation columns currently selected in controller read path.
  UNION ALL
  SELECT
    'BLOCKER', 'column', 'schedule_calculations.base_average_pca_per_team',
    EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'schedule_calculations' AND column_name = 'base_average_pca_per_team'
    ),
    'Controller select includes this column; missing column triggers fallback path.'
  UNION ALL
  SELECT
    'BLOCKER', 'column', 'schedule_calculations.expected_beds_per_team',
    EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'schedule_calculations' AND column_name = 'expected_beds_per_team'
    ),
    'Controller/UI use this field; missing column currently depends on fallback.'
  UNION ALL
  SELECT
    'BLOCKER', 'column', 'schedule_calculations.required_pca_per_team',
    EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'schedule_calculations' AND column_name = 'required_pca_per_team'
    ),
    'Controller/UI use this field; missing column currently depends on fallback.'

  -- Core RPC functions used by app/controller.
  UNION ALL
  SELECT
    'BLOCKER', 'function', 'public.load_schedule_v1(date)',
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'load_schedule_v1'
    ),
    'Primary schedule load RPC.'
  UNION ALL
  SELECT
    'BLOCKER', 'function', 'public.save_schedule_v1(...)',
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'save_schedule_v1'
    ),
    'Primary schedule save RPC.'
  UNION ALL
  SELECT
    'BLOCKER', 'function', 'public.copy_schedule_v1(...)',
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'copy_schedule_v1'
    ),
    'Schedule copy API RPC.'
  UNION ALL
  SELECT
    'IMPORTANT', 'function', 'public.update_schedule_allocation_notes_v1(...)',
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'update_schedule_allocation_notes_v1'
    ),
    'Schedule allocation notes save path.'
  UNION ALL
  SELECT
    'IMPORTANT', 'function', 'public.pull_global_to_snapshot_v1(...)',
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'pull_global_to_snapshot_v1'
    ),
    'Config sync used by copy/rebase and dashboard.'
  UNION ALL
  SELECT
    'IMPORTANT', 'function', 'public.publish_snapshot_to_global_v1(...)',
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'publish_snapshot_to_global_v1'
    ),
    'Config publish flow (dashboard).'
  UNION ALL
  SELECT
    'IMPORTANT', 'function', 'public.create_config_global_backup_v1(...)',
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'create_config_global_backup_v1'
    ),
    'Config backup flow (dashboard).'
  UNION ALL
  SELECT
    'IMPORTANT', 'function', 'public.restore_config_global_backup_v1(...)',
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'restore_config_global_backup_v1'
    ),
    'Config restore flow (dashboard).'
  UNION ALL
  SELECT
    'IMPORTANT', 'function', 'public.set_drift_notification_threshold_v1(...)',
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'set_drift_notification_threshold_v1'
    ),
    'Config drift threshold update flow.'

  -- Tables introduced by migrations and used by current features.
  UNION ALL
  SELECT
    'IMPORTANT', 'table', 'public.team_settings',
    to_regclass('public.team_settings') IS NOT NULL,
    'Used by dashboard team config and snapshot diff.'
  UNION ALL
  SELECT
    'IMPORTANT', 'table', 'public.config_global_head',
    to_regclass('public.config_global_head') IS NOT NULL,
    'Used by global head/sync flow.'
  UNION ALL
  SELECT
    'IMPORTANT', 'table', 'public.config_global_backups',
    to_regclass('public.config_global_backups') IS NOT NULL,
    'Used by config backup/restore flow.'

  -- Data presence / constraints that reduce runtime surprises.
  UNION ALL
  SELECT
    'IMPORTANT', 'data', 'config_global_head seeded row (id=true)',
    EXISTS (SELECT 1 FROM public.config_global_head WHERE id = true),
    'Expected singleton row for global head reads.'
  UNION ALL
  SELECT
    'IMPORTANT', 'index', 'spt_allocations unique staff_id',
    EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'spt_allocations'
        AND indexdef ILIKE '%UNIQUE%'
        AND indexdef ILIKE '%(staff_id)%'
    ),
    'Migration expects one canonical SPT row per staff.'
  UNION ALL
  SELECT
    'IMPORTANT', 'index', 'user_profiles username unique index',
    EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'user_profiles'
        AND indexname = 'user_profiles_username_unique_idx'
    ),
    'Account-management migration expects unique usernames.'

  -- Auth/role model checks.
  UNION ALL
  SELECT
    'IMPORTANT', 'column', 'user_profiles.username',
    EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'user_profiles' AND column_name = 'username'
    ),
    'Required by username login/account management.'
  UNION ALL
  SELECT
    'IMPORTANT', 'column', 'user_profiles.email',
    EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'user_profiles' AND column_name = 'email'
    ),
    'Used by account-management metadata.'
  UNION ALL
  SELECT
    'IMPORTANT', 'policy', 'daily_schedules "Admin full access" includes developer',
    EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'daily_schedules'
        AND policyname = 'Admin full access'
        AND (
          COALESCE(qual, '') ILIKE '%developer%'
          OR COALESCE(with_check, '') ILIKE '%developer%'
        )
    ),
    'Required for developer-level schedule admin paths.'
  UNION ALL
  SELECT
    'IMPORTANT', 'policy', 'staff "Admin full access" includes developer',
    EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'staff'
        AND policyname = 'Admin full access'
        AND (
          COALESCE(qual, '') ILIKE '%developer%'
          OR COALESCE(with_check, '') ILIKE '%developer%'
        )
    ),
    'Required for developer-level staff management paths.'
  UNION ALL
  SELECT
    'IMPORTANT', 'constraint', 'user_profiles_role_check includes user/admin/developer',
    EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
        AND t.relname = 'user_profiles'
        AND c.conname = 'user_profiles_role_check'
        AND pg_get_constraintdef(c.oid) ILIKE '%user%'
        AND pg_get_constraintdef(c.oid) ILIKE '%admin%'
        AND pg_get_constraintdef(c.oid) ILIKE '%developer%'
    ),
    'App role model expects user/admin/developer.'

  -- Legacy markers (warn-only): still present old columns/types can indicate partial migration history.
  UNION ALL
  SELECT
    'INFO', 'legacy', 'staff.active legacy column still present',
    NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'staff' AND column_name = 'active'
    ),
    'If present, actions may still silently succeed via old fallback branch.'
  UNION ALL
  SELECT
    'INFO', 'type', 'staff_status enum exists',
    EXISTS (
      SELECT 1
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typname = 'staff_status'
    ),
    'Expected after buffer-staff migration.'
  UNION ALL
  SELECT
    'INFO', 'policy', 'team_settings RLS enabled',
    EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'team_settings'
        AND c.relrowsecurity = true
    ),
    'Security migration enables RLS on team_settings.'
),
results AS (
  SELECT
    severity,
    category,
    item,
    CASE
      WHEN ok THEN 'PASS'
      WHEN severity = 'INFO' THEN 'WARN'
      ELSE 'FAIL'
    END AS status,
    details
  FROM checks
)
SELECT
  severity,
  category,
  item,
  status,
  details
FROM results
ORDER BY
  CASE severity WHEN 'BLOCKER' THEN 1 WHEN 'IMPORTANT' THEN 2 ELSE 3 END,
  CASE status WHEN 'FAIL' THEN 1 WHEN 'WARN' THEN 2 ELSE 3 END,
  category,
  item;

-- Optional quick summary:
WITH checks AS (
  SELECT
    CASE
      WHEN ok THEN 'PASS'
      WHEN severity = 'INFO' THEN 'WARN'
      ELSE 'FAIL'
    END AS status,
    severity
  FROM (
    SELECT
      'BLOCKER'::text AS severity,
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'staff' AND column_name = 'status'
      ) AS ok
    UNION ALL
    SELECT
      'BLOCKER',
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'staff' AND column_name = 'buffer_fte'
      )
    UNION ALL
    SELECT
      'BLOCKER',
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'wards' AND column_name = 'team_assignment_portions'
      )
    UNION ALL
    SELECT
      'BLOCKER',
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'spt_allocations' AND column_name = 'config_by_weekday'
      )
    UNION ALL
    SELECT
      'BLOCKER',
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'schedule_calculations' AND column_name = 'base_average_pca_per_team'
      )
    UNION ALL
    SELECT
      'BLOCKER',
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'schedule_calculations' AND column_name = 'expected_beds_per_team'
      )
    UNION ALL
    SELECT
      'BLOCKER',
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'schedule_calculations' AND column_name = 'required_pca_per_team'
      )
  ) t
)
SELECT
  severity,
  status,
  COUNT(*) AS count
FROM checks
GROUP BY severity, status
ORDER BY severity, status;
