CREATE TABLE IF NOT EXISTS task_runs (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('product_qa')),
  title text NOT NULL,
  thread_id text,
  status text NOT NULL CHECK (status IN ('queued', 'running', 'awaiting_approval', 'completed', 'failed', 'cancelled')),
  status_reason text,
  target jsonb NOT NULL DEFAULT '{}'::jsonb,
  max_duration_seconds integer NOT NULL CHECK (max_duration_seconds > 0),
  max_specialists integer NOT NULL CHECK (max_specialists > 0),
  max_model_steps integer NOT NULL CHECK (max_model_steps > 0),
  max_retries_per_specialist integer NOT NULL CHECK (max_retries_per_specialist >= 0),
  max_estimated_cost_usd numeric(10, 4) NOT NULL CHECK (max_estimated_cost_usd > 0),
  model_steps integer NOT NULL DEFAULT 0 CHECK (model_steps >= 0),
  estimated_cost_usd numeric(10, 4) NOT NULL DEFAULT 0 CHECK (estimated_cost_usd >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  deadline_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, id)
);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS task_runs_by_owner
  ON task_runs (owner_id, updated_at DESC, id DESC);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS task_runs_by_thread
  ON task_runs (owner_id, thread_id, updated_at DESC)
  WHERE thread_id IS NOT NULL;

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS task_run_sessions (
  task_id text NOT NULL REFERENCES task_runs(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  role text NOT NULL,
  call_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, session_id),
  UNIQUE (session_id)
);

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS task_specialists (
  task_id text NOT NULL REFERENCES task_runs(id) ON DELETE CASCADE,
  role text NOT NULL,
  label text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  active_session_id text,
  summary text,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, role)
);

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS task_acceptance_checks (
  id text PRIMARY KEY,
  task_id text NOT NULL REFERENCES task_runs(id) ON DELETE CASCADE,
  slug text NOT NULL,
  label text NOT NULL,
  specialist_role text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('local', 'preview', 'both')),
  required boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'passed', 'failed', 'blocked')),
  result_summary text,
  checked_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, slug),
  FOREIGN KEY (task_id, specialist_role) REFERENCES task_specialists(task_id, role)
);

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS task_artifacts (
  id text PRIMARY KEY,
  task_id text NOT NULL REFERENCES task_runs(id) ON DELETE CASCADE,
  check_id text REFERENCES task_acceptance_checks(id) ON DELETE SET NULL,
  specialist_role text,
  kind text NOT NULL CHECK (kind IN ('screenshot', 'report', 'log', 'json')),
  filename text NOT NULL,
  content_type text NOT NULL,
  storage_key text NOT NULL UNIQUE,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  sha256 text NOT NULL,
  redacted boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (task_id, specialist_role) REFERENCES task_specialists(task_id, role)
);

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS task_milestones (
  id bigserial PRIMARY KEY,
  task_id text NOT NULL REFERENCES task_runs(id) ON DELETE CASCADE,
  kind text NOT NULL,
  summary text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS task_milestones_by_task
  ON task_milestones (task_id, created_at ASC, id ASC);

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS task_approval_decisions (
  id text PRIMARY KEY,
  task_id text NOT NULL REFERENCES task_runs(id) ON DELETE CASCADE,
  requested_by text NOT NULL,
  prompt text NOT NULL,
  decision text CHECK (decision IN ('approved', 'denied')),
  decided_by text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS task_transitions (
  id bigserial PRIMARY KEY,
  task_id text NOT NULL REFERENCES task_runs(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  actor text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS task_transitions_by_task
  ON task_transitions (task_id, created_at ASC, id ASC);
