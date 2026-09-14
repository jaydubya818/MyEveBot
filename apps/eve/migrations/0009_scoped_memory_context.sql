CREATE TABLE IF NOT EXISTS memory_records (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  scope_type text NOT NULL CHECK (scope_type IN ('owner', 'agent', 'goal', 'project', 'task')),
  scope_id text NOT NULL,
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 4000),
  provider text NOT NULL DEFAULT 'supermemory',
  provider_id text,
  source_type text NOT NULL DEFAULT 'explicit',
  source_id text,
  confidence numeric(4,3) NOT NULL DEFAULT 1 CHECK (confidence BETWEEN 0 AND 1),
  permanent boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_confirmed_at timestamptz,
  UNIQUE (owner_id, id)
);

-- statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS memory_records_owner_provider_id
  ON memory_records (owner_id, provider, provider_id)
  WHERE provider_id IS NOT NULL;

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS memory_records_scope_active
  ON memory_records (owner_id, scope_type, scope_id, updated_at DESC)
  WHERE status = 'active';

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS memory_scope_migrations (
  owner_id text PRIMARY KEY,
  completed_at timestamptz NOT NULL DEFAULT now()
);

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS thread_summaries (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  thread_id text NOT NULL,
  goal_id text REFERENCES goals(id) ON DELETE SET NULL,
  purpose text NOT NULL DEFAULT '',
  important_facts jsonb NOT NULL DEFAULT '[]'::jsonb,
  decisions jsonb NOT NULL DEFAULT '[]'::jsonb,
  open_questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  commitments jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_message_count integer NOT NULL DEFAULT 0 CHECK (source_message_count >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, id)
);

-- statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS thread_summaries_one_active
  ON thread_summaries (owner_id, thread_id)
  WHERE status = 'active';

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS run_context_entries (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  agent_id text NOT NULL,
  task_run_id text,
  goal_id text,
  goal_task_id text,
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 12000),
  source_type text NOT NULL DEFAULT 'checkpoint',
  source_id text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'promoted')),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (owner_id, agent_id) REFERENCES agents(owner_id, id) ON DELETE CASCADE,
  FOREIGN KEY (owner_id, task_run_id) REFERENCES task_runs(owner_id, id) ON DELETE CASCADE,
  FOREIGN KEY (owner_id, goal_id) REFERENCES goals(owner_id, id) ON DELETE CASCADE
);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS run_context_entries_execution
  ON run_context_entries (owner_id, agent_id, task_run_id, updated_at DESC)
  WHERE status = 'active';

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS context_assemblies (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  agent_id text NOT NULL,
  session_id text NOT NULL,
  agent_run_id text,
  thread_id text,
  goal_id text,
  goal_task_id text,
  task_run_id text,
  memory_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  thread_summary_id text,
  source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  estimated_tokens integer NOT NULL CHECK (estimated_tokens >= 0),
  budget jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (owner_id, agent_id) REFERENCES agents(owner_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (thread_summary_id) REFERENCES thread_summaries(id) ON DELETE SET NULL
);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS context_assemblies_run_recent
  ON context_assemblies (owner_id, agent_id, session_id, created_at DESC);

-- Existing Supermemory entries are intentionally not deleted. The application
-- imports entries without canonical metadata into owner scope exactly once per
-- owner, using provider_id for idempotency and memory_scope_migrations as the
-- durable completion marker.
