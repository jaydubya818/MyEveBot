CREATE TABLE IF NOT EXISTS skill_assignments (
  owner_id text NOT NULL,
  agent_id text NOT NULL
    CHECK (agent_id IN ('functional-state', 'ux-accessibility', 'trust-resilience')),
  skill_name text NOT NULL,
  enabled boolean NOT NULL,
  assigned_by text NOT NULL DEFAULT 'owner'
    CHECK (assigned_by IN ('owner', 'agent', 'system')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, agent_id, skill_name)
);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS skill_assignments_by_owner_agent
  ON skill_assignments (owner_id, agent_id, enabled, skill_name);

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS skill_usage_events (
  id bigserial PRIMARY KEY,
  owner_id text NOT NULL,
  skill_name text NOT NULL,
  agent_id text NOT NULL,
  session_id text NOT NULL,
  turn_id text NOT NULL,
  task_run_id text REFERENCES task_runs(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, turn_id, skill_name)
);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS skill_usage_by_owner_skill
  ON skill_usage_events (owner_id, skill_name, occurred_at DESC);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS skill_usage_by_task
  ON skill_usage_events (task_run_id, occurred_at DESC)
  WHERE task_run_id IS NOT NULL;

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS skill_eval_runs (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  target text NOT NULL,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed')),
  passed integer NOT NULL DEFAULT 0 CHECK (passed >= 0),
  failed integer NOT NULL DEFAULT 0 CHECK (failed >= 0),
  scored integer NOT NULL DEFAULT 0 CHECK (scored >= 0),
  skipped integer NOT NULL DEFAULT 0 CHECK (skipped >= 0),
  errored integer NOT NULL DEFAULT 0 CHECK (errored >= 0),
  started_at timestamptz NOT NULL,
  completed_at timestamptz
);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS skill_eval_runs_by_owner
  ON skill_eval_runs (owner_id, started_at DESC);

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS skill_eval_results (
  run_id text NOT NULL REFERENCES skill_eval_runs(id) ON DELETE CASCADE,
  skill_name text NOT NULL,
  eval_id text NOT NULL,
  verdict text NOT NULL CHECK (verdict IN ('passed', 'failed', 'scored', 'skipped')),
  assertions jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text,
  started_at timestamptz NOT NULL,
  completed_at timestamptz NOT NULL,
  PRIMARY KEY (run_id, skill_name)
);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS skill_eval_results_by_skill
  ON skill_eval_results (skill_name, completed_at DESC, run_id DESC);
