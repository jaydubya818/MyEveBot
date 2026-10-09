CREATE TABLE IF NOT EXISTS goals (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description text NOT NULL DEFAULT '',
  motivation text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused', 'blocked', 'waiting', 'completed', 'abandoned', 'archived')),
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  planning_mode text NOT NULL DEFAULT 'simple'
    CHECK (planning_mode IN ('instant', 'simple', 'structured', 'complex')),
  success_criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
  target_date date,
  source text NOT NULL DEFAULT 'chat',
  source_reference text,
  workspace_id text,
  idempotency_key text,
  started_at timestamptz,
  completed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, id)
);

-- statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS goals_owner_idempotency
  ON goals (owner_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS goals_owner_status_updated
  ON goals (owner_id, status, updated_at DESC, id DESC);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS goals_owner_focus
  ON goals (owner_id, priority, target_date, updated_at DESC)
  WHERE status IN ('active', 'blocked', 'waiting');

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS goal_plans (
  id text PRIMARY KEY,
  goal_id text NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded')),
  summary text NOT NULL,
  strategy text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  superseded_at timestamptz,
  UNIQUE (goal_id, version)
);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS goal_plans_active
  ON goal_plans (goal_id, version DESC)
  WHERE status = 'active';

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS goal_milestones (
  id text PRIMARY KEY,
  goal_id text NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped')),
  target_date date,
  completed_at timestamptz,
  position integer NOT NULL DEFAULT 0,
  success_criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (goal_id, id)
);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS goal_milestones_order
  ON goal_milestones (goal_id, position, created_at, id);

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS goal_tasks (
  id text PRIMARY KEY,
  goal_id text NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  milestone_id text REFERENCES goal_milestones(id) ON DELETE SET NULL,
  parent_task_id text REFERENCES goal_tasks(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 240),
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'todo'
    CHECK (status IN ('todo', 'ready', 'in_progress', 'waiting', 'blocked', 'verification', 'completed', 'cancelled', 'failed')),
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  due_at timestamptz,
  assigned_to text,
  required_capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  success_criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
  estimated_effort_minutes integer CHECK (estimated_effort_minutes IS NULL OR estimated_effort_minutes > 0),
  estimated_cost_usd numeric(10, 4) CHECK (estimated_cost_usd IS NULL OR estimated_cost_usd >= 0),
  position integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (goal_id, id)
);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS goal_tasks_by_goal
  ON goal_tasks (goal_id, position, created_at, id);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS goal_tasks_due
  ON goal_tasks (goal_id, status, due_at)
  WHERE status NOT IN ('completed', 'cancelled');

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS goal_task_dependencies (
  task_id text NOT NULL REFERENCES goal_tasks(id) ON DELETE CASCADE,
  depends_on_task_id text NOT NULL REFERENCES goal_tasks(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, depends_on_task_id),
  CHECK (task_id <> depends_on_task_id)
);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS goal_task_dependencies_reverse
  ON goal_task_dependencies (depends_on_task_id, task_id);

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS goal_thread_links (
  goal_id text NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  owner_id text NOT NULL,
  thread_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (goal_id, thread_id)
);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS goal_threads_by_owner_thread
  ON goal_thread_links (owner_id, thread_id, created_at DESC);

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS eve_events (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  type text NOT NULL,
  source_type text NOT NULL,
  source_id text,
  goal_id text REFERENCES goals(id) ON DELETE CASCADE,
  goal_task_id text REFERENCES goal_tasks(id) ON DELETE SET NULL,
  run_id text,
  severity text NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info', 'attention', 'warning', 'critical')),
  summary text NOT NULL,
  rationale jsonb NOT NULL DEFAULT '[]'::jsonb,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

-- statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS eve_events_owner_idempotency
  ON eve_events (owner_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS eve_events_owner_timeline
  ON eve_events (owner_id, occurred_at DESC, id DESC);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS eve_events_goal_timeline
  ON eve_events (goal_id, occurred_at DESC, id DESC)
  WHERE goal_id IS NOT NULL;

-- statement-breakpoint
ALTER TABLE task_runs
  ADD COLUMN IF NOT EXISTS goal_id text REFERENCES goals(id) ON DELETE SET NULL;

-- statement-breakpoint
ALTER TABLE task_runs
  ADD COLUMN IF NOT EXISTS goal_task_id text REFERENCES goal_tasks(id) ON DELETE SET NULL;

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS task_runs_by_goal
  ON task_runs (owner_id, goal_id, updated_at DESC)
  WHERE goal_id IS NOT NULL;
