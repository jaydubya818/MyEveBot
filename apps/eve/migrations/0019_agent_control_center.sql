ALTER TABLE task_runs
  DROP CONSTRAINT IF EXISTS task_runs_status_check;

-- statement-breakpoint
ALTER TABLE task_runs
  ADD CONSTRAINT task_runs_status_check CHECK (status IN (
    'queued', 'running', 'awaiting_approval', 'paused',
    'completed', 'failed', 'cancelled'
  ));

