CREATE TABLE IF NOT EXISTS agents (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  label text,
  role text NOT NULL CHECK (char_length(role) BETWEEN 1 AND 120),
  description text NOT NULL DEFAULT '',
  instructions text NOT NULL CHECK (char_length(instructions) BETWEEN 1 AND 20000),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'disabled', 'archived')),
  is_primary boolean NOT NULL DEFAULT false,
  preferred_model text,
  reasoning_preference text NOT NULL DEFAULT 'default'
    CHECK (reasoning_preference IN ('default', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh')),
  avatar_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  risk_ceiling text NOT NULL DEFAULT 'low'
    CHECK (risk_ceiling IN ('low', 'medium', 'high')),
  notification_policy text NOT NULL DEFAULT 'activity'
    CHECK (notification_policy IN ('silent', 'activity', 'digest', 'push_on_block')),
  max_steps integer NOT NULL DEFAULT 20 CHECK (max_steps BETWEEN 1 AND 200),
  max_runtime_seconds integer NOT NULL DEFAULT 900 CHECK (max_runtime_seconds BETWEEN 10 AND 86400),
  max_estimated_cost_usd numeric(10,4) NOT NULL DEFAULT 2 CHECK (max_estimated_cost_usd > 0),
  max_retries integer NOT NULL DEFAULT 1 CHECK (max_retries BETWEEN 0 AND 10),
  created_by_type text NOT NULL DEFAULT 'owner'
    CHECK (created_by_type IN ('owner', 'agent', 'system')),
  created_by_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  UNIQUE (owner_id, id),
  UNIQUE (owner_id, slug),
  CHECK (NOT is_primary OR status = 'active'),
  CHECK ((status = 'archived') = (archived_at IS NOT NULL))
);

-- statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS agents_one_primary_per_owner
  ON agents (owner_id) WHERE is_primary;

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS agents_owner_status
  ON agents (owner_id, status, updated_at DESC);

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS agent_capabilities (
  owner_id text NOT NULL,
  agent_id text NOT NULL,
  capability_id text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  assigned_by_type text NOT NULL DEFAULT 'owner'
    CHECK (assigned_by_type IN ('owner', 'agent', 'system')),
  assigned_by_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (agent_id, capability_id),
  FOREIGN KEY (owner_id, agent_id) REFERENCES agents(owner_id, id) ON DELETE CASCADE
);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS agent_capabilities_owner_agent
  ON agent_capabilities (owner_id, agent_id, capability_id);

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS agent_audit_events (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  agent_id text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'created', 'updated', 'capabilities_changed', 'paused', 'resumed', 'disabled', 'archived', 'duplicated'
  )),
  actor_type text NOT NULL CHECK (actor_type IN ('owner', 'agent', 'system')),
  actor_id text,
  summary text NOT NULL,
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (owner_id, agent_id) REFERENCES agents(owner_id, id) ON DELETE RESTRICT
);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS agent_audit_owner_recent
  ON agent_audit_events (owner_id, created_at DESC, id DESC);

-- statement-breakpoint
ALTER TABLE web_chat_threads
  ADD COLUMN IF NOT EXISTS owner_id text,
  ADD COLUMN IF NOT EXISTS agent_id text;

-- statement-breakpoint
UPDATE web_chat_threads SET owner_id = 'owner' WHERE owner_id IS NULL;

-- statement-breakpoint
ALTER TABLE web_chat_threads ALTER COLUMN owner_id SET NOT NULL;

-- statement-breakpoint
DO $$ BEGIN
  ALTER TABLE web_chat_threads ADD CONSTRAINT web_chat_threads_owner_agent_fk
    FOREIGN KEY (owner_id, agent_id) REFERENCES agents(owner_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS web_chat_threads_owner_agent
  ON web_chat_threads (owner_id, agent_id, updated_at DESC);

-- statement-breakpoint
ALTER TABLE task_runs ADD COLUMN IF NOT EXISTS agent_id text;

-- statement-breakpoint
DO $$ BEGIN
  ALTER TABLE task_runs ADD CONSTRAINT task_runs_owner_agent_fk
    FOREIGN KEY (owner_id, agent_id) REFERENCES agents(owner_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS task_runs_owner_agent
  ON task_runs (owner_id, agent_id, updated_at DESC) WHERE agent_id IS NOT NULL;

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS agent_runs (
  id text PRIMARY KEY,
  session_id text NOT NULL,
  owner_id text NOT NULL,
  agent_id text NOT NULL,
  thread_id text,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  model_steps integer NOT NULL DEFAULT 0 CHECK (model_steps >= 0),
  estimated_cost_usd numeric(10,4) NOT NULL DEFAULT 0 CHECK (estimated_cost_usd >= 0),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (owner_id, agent_id) REFERENCES agents(owner_id, id) ON DELETE RESTRICT
);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS agent_runs_owner_agent
  ON agent_runs (owner_id, agent_id, updated_at DESC);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS agent_runs_session
  ON agent_runs (session_id, updated_at DESC);
