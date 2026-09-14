ALTER TABLE task_runs DROP CONSTRAINT IF EXISTS task_runs_kind_check;

-- statement-breakpoint
ALTER TABLE task_runs ADD CONSTRAINT task_runs_kind_check
  CHECK (kind IN ('product_qa', 'delegated_work'));

-- statement-breakpoint
ALTER TABLE task_runs DROP CONSTRAINT IF EXISTS task_runs_max_specialists_check;

-- statement-breakpoint
ALTER TABLE task_runs ADD CONSTRAINT task_runs_max_specialists_check
  CHECK (max_specialists >= 0);

-- statement-breakpoint
ALTER TABLE task_runs ADD COLUMN IF NOT EXISTS objective text;

-- statement-breakpoint
ALTER TABLE task_runs ADD COLUMN IF NOT EXISTS expected_output text;

-- statement-breakpoint
ALTER TABLE task_runs ADD COLUMN IF NOT EXISTS parent_task_id text REFERENCES task_runs(id) ON DELETE SET NULL;

-- statement-breakpoint
ALTER TABLE task_runs ADD COLUMN IF NOT EXISTS source_task_id text REFERENCES task_runs(id) ON DELETE SET NULL;

-- statement-breakpoint
ALTER TABLE task_runs ADD COLUMN IF NOT EXISTS role_id text;

-- statement-breakpoint
ALTER TABLE task_runs ADD COLUMN IF NOT EXISTS result_summary text;

-- statement-breakpoint
ALTER TABLE task_runs ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'draft'
  CHECK (review_status IN ('draft', 'ready_for_review', 'accepted', 'revision_requested', 'superseded'));

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS task_runs_parent
  ON task_runs (owner_id, parent_task_id, created_at ASC)
  WHERE parent_task_id IS NOT NULL;

-- statement-breakpoint
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS routine_name text;

-- statement-breakpoint
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS approval_boundary text;

-- statement-breakpoint
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS source_outcome_id text REFERENCES outcomes(id) ON DELETE SET NULL;
