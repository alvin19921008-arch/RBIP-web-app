-- copy_schedule_with_rebase_v1:
-- Atomic long-term path for copy + target baseline rebase to current Global config.
--
-- This wraps:
-- 1) copy_schedule_v1
-- 2) pull_global_to_snapshot_v1
--
-- If rebase fails, the whole transaction rolls back.

CREATE OR REPLACE FUNCTION public.copy_schedule_with_rebase_v1(
  p_from_schedule_id uuid,
  p_to_schedule_id uuid,
  p_to_date date,
  p_mode text,
  p_include_buffer_staff boolean,
  p_baseline_snapshot jsonb,
  p_staff_overrides jsonb,
  p_workflow_state jsonb,
  p_tie_break_decisions jsonb,
  p_buffer_staff_ids uuid[] DEFAULT NULL,
  p_rebase_categories text[] DEFAULT NULL,
  p_rebase_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  cats text[] := COALESCE(
    p_rebase_categories,
    ARRAY[
      'staffProfile',
      'teamConfig',
      'wardConfig',
      'specialPrograms',
      'sptAllocations',
      'pcaPreferences'
    ]::text[]
  );
BEGIN
  PERFORM public.copy_schedule_v1(
    p_from_schedule_id,
    p_to_schedule_id,
    p_mode,
    p_include_buffer_staff,
    p_baseline_snapshot,
    p_staff_overrides,
    p_workflow_state,
    p_tie_break_decisions,
    p_buffer_staff_ids
  );

  PERFORM public.pull_global_to_snapshot_v1(
    p_date := p_to_date,
    p_categories := cats,
    p_note := COALESCE(p_rebase_note, 'Auto-rebase baseline after copy'),
    p_include_buffer_staff := p_include_buffer_staff
  );
END;
$$;

