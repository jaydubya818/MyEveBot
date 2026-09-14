ALTER TABLE skill_usage_events
  ADD COLUMN IF NOT EXISTS loaded_step_index integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_accounted_step integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS outcome text NOT NULL DEFAULT 'loaded'
    CHECK (outcome IN ('loaded', 'succeeded', 'failed', 'cancelled')),
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS duration_ms integer CHECK (duration_ms IS NULL OR duration_ms >= 0),
  ADD COLUMN IF NOT EXISTS input_tokens bigint NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  ADD COLUMN IF NOT EXISTS output_tokens bigint NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  ADD COLUMN IF NOT EXISTS cache_read_tokens bigint NOT NULL DEFAULT 0 CHECK (cache_read_tokens >= 0),
  ADD COLUMN IF NOT EXISTS cache_write_tokens bigint NOT NULL DEFAULT 0 CHECK (cache_write_tokens >= 0),
  ADD COLUMN IF NOT EXISTS cost_usd numeric(14, 8) NOT NULL DEFAULT 0 CHECK (cost_usd >= 0);

-- statement-breakpoint
DROP INDEX IF EXISTS skill_usage_by_task;

-- statement-breakpoint
CREATE INDEX skill_usage_by_task
  ON skill_usage_events (owner_id, task_run_id, occurred_at DESC)
  WHERE task_run_id IS NOT NULL;

-- statement-breakpoint
ALTER TABLE skill_eval_runs
  DROP CONSTRAINT IF EXISTS skill_eval_runs_status_check;

-- statement-breakpoint
ALTER TABLE skill_eval_runs
  ADD CONSTRAINT skill_eval_runs_status_check
  CHECK (status IN ('queued', 'running', 'completed', 'failed'));

-- statement-breakpoint
ALTER TABLE skill_eval_runs
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'manual'
    CHECK (mode IN ('manual', 'changed', 'ci')),
  ADD COLUMN IF NOT EXISTS requested_count integer NOT NULL DEFAULT 0 CHECK (requested_count >= 0),
  ADD COLUMN IF NOT EXISTS completed_count integer NOT NULL DEFAULT 0 CHECK (completed_count >= 0),
  ADD COLUMN IF NOT EXISTS requested_skills jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cost_usd numeric(14, 8) NOT NULL DEFAULT 0 CHECK (cost_usd >= 0),
  ADD COLUMN IF NOT EXISTS error text;

-- statement-breakpoint
ALTER TABLE skill_eval_results
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS duration_ms integer CHECK (duration_ms IS NULL OR duration_ms >= 0),
  ADD COLUMN IF NOT EXISTS input_tokens bigint NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  ADD COLUMN IF NOT EXISTS output_tokens bigint NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  ADD COLUMN IF NOT EXISTS cost_usd numeric(14, 8) NOT NULL DEFAULT 0 CHECK (cost_usd >= 0);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS skill_eval_results_by_skill_hash
  ON skill_eval_results (skill_name, content_hash, completed_at DESC);
