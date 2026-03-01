-- Feedback / Bug Report System
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.feedback_reports (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number      SERIAL,
  submitter_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  submitter_name     text,
  type               text NOT NULL CHECK (type IN ('bug','wrong_calc','ui_issue','feature_request','question')),
  severity           text CHECK (severity IN ('critical','high','medium','low')),
  category           text NOT NULL,
  sub_category       text,
  title              text NOT NULL,
  description        text NOT NULL,
  steps_to_reproduce text,
  screenshot_url     text,
  auto_context       jsonb DEFAULT '{}'::jsonb,
  upvote_count       integer NOT NULL DEFAULT 0,
  status             text NOT NULL DEFAULT 'new'
                       CHECK (status IN ('new','in_review','in_progress','fixed','wont_fix','duplicate')),
  is_priority        boolean NOT NULL DEFAULT false,
  dev_notes          text,
  dev_reply          text,
  reply_read         boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.feedback_upvotes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id   uuid NOT NULL REFERENCES public.feedback_reports(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_id, user_id)
);

-- ── Indexes ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS feedback_reports_submitter_idx ON public.feedback_reports(submitter_id);
CREATE INDEX IF NOT EXISTS feedback_reports_status_idx ON public.feedback_reports(status);
CREATE INDEX IF NOT EXISTS feedback_reports_created_idx ON public.feedback_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_upvotes_report_idx ON public.feedback_upvotes(report_id);

-- ── RLS ──────────────────────────────────────────────────────────
ALTER TABLE public.feedback_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_upvotes ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all reports (needed for "similar issues" panel)
CREATE POLICY "Authenticated can read reports"
  ON public.feedback_reports FOR SELECT
  TO authenticated
  USING (true);

-- Authenticated users can read upvotes
CREATE POLICY "Authenticated can read upvotes"
  ON public.feedback_upvotes FOR SELECT
  TO authenticated
  USING (true);

-- Note: INSERT/UPDATE/DELETE are handled server-side via service-role (admin) client
-- so no DML policies are needed for authenticated role.

-- ── Auto-update updated_at ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS feedback_reports_updated_at ON public.feedback_reports;
CREATE TRIGGER feedback_reports_updated_at
  BEFORE UPDATE ON public.feedback_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Denormalize upvote_count via trigger ─────────────────────────
CREATE OR REPLACE FUNCTION public.sync_feedback_upvote_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.feedback_reports
    SET upvote_count = upvote_count + 1
    WHERE id = NEW.report_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.feedback_reports
    SET upvote_count = GREATEST(upvote_count - 1, 0)
    WHERE id = OLD.report_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS feedback_upvotes_count_sync ON public.feedback_upvotes;
CREATE TRIGGER feedback_upvotes_count_sync
  AFTER INSERT OR DELETE ON public.feedback_upvotes
  FOR EACH ROW EXECUTE FUNCTION public.sync_feedback_upvote_count();
