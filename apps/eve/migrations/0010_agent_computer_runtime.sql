CREATE TABLE IF NOT EXISTS computer_sessions (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  agent_id text NOT NULL,
  goal_id text REFERENCES goals(id) ON DELETE SET NULL,
  goal_task_id text REFERENCES goal_tasks(id) ON DELETE SET NULL,
  run_id text REFERENCES task_runs(id) ON DELETE SET NULL,
  runtime_session_id text NOT NULL,
  sandbox_id text,
  status text NOT NULL DEFAULT 'provisioning'
    CHECK (status IN ('provisioning', 'ready', 'running', 'paused', 'completed', 'failed', 'expired', 'stopped')),
  environment_type text NOT NULL DEFAULT 'eve-sandbox'
    CHECK (environment_type IN ('eve-sandbox', 'vercel-sandbox')),
  started_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  expires_at timestamptz NOT NULL,
  resource_limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  network_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  failure_code text,
  failure_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (owner_id, agent_id) REFERENCES agents(owner_id, id) ON DELETE RESTRICT,
  CHECK ((status IN ('completed', 'failed', 'expired', 'stopped')) = (completed_at IS NOT NULL)),
  CHECK ((status = 'failed') = (failure_code IS NOT NULL))
);

-- statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS computer_sessions_one_active_runtime
  ON computer_sessions (runtime_session_id)
  WHERE status IN ('provisioning', 'ready', 'running', 'paused');

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS computer_sessions_owner_recent
  ON computer_sessions (owner_id, last_activity_at DESC, id DESC);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS computer_sessions_agent_recent
  ON computer_sessions (owner_id, agent_id, last_activity_at DESC, id DESC);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS computer_sessions_expiry
  ON computer_sessions (expires_at)
  WHERE status IN ('provisioning', 'ready', 'running', 'paused');

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS browser_sessions (
  id text PRIMARY KEY,
  computer_session_id text NOT NULL UNIQUE REFERENCES computer_sessions(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'ready'
    CHECK (status IN ('ready', 'running', 'paused', 'completed', 'failed', 'expired', 'stopped')),
  current_url text,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS computer_actions (
  id text PRIMARY KEY,
  computer_session_id text NOT NULL REFERENCES computer_sessions(id) ON DELETE CASCADE,
  run_id text REFERENCES task_runs(id) ON DELETE SET NULL,
  agent_id text NOT NULL,
  call_id text NOT NULL,
  type text NOT NULL CHECK (type IN (
    'browser.navigate', 'browser.click', 'browser.type', 'browser.read',
    'file.read', 'file.write', 'file.download', 'file.upload', 'terminal.command'
  )),
  target text,
  input_summary text NOT NULL DEFAULT '',
  output_summary text,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed', 'denied', 'timed_out')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  failure_code text,
  failure_summary text,
  UNIQUE (computer_session_id, call_id)
);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS computer_actions_session_timeline
  ON computer_actions (computer_session_id, started_at ASC, id ASC);

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS computer_artifacts (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  computer_session_id text NOT NULL REFERENCES computer_sessions(id) ON DELETE CASCADE,
  action_id text REFERENCES computer_actions(id) ON DELETE SET NULL,
  run_id text REFERENCES task_runs(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('screenshot', 'download', 'report', 'file', 'log', 'json')),
  filename text NOT NULL,
  content_type text NOT NULL,
  storage_key text NOT NULL UNIQUE,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  sha256 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS computer_artifacts_session
  ON computer_artifacts (computer_session_id, created_at ASC, id ASC);
