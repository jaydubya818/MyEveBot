-- Dependencies: 0001_runtime_core.sql provides web_chat_threads; 0008_persistent_agents.sql
-- provides agents, agent_runs, and owner/agent attribution on web_chat_threads.
-- This migration is intentionally independent of 0009 scoped memory, 0010 Agent Computer,
-- and 0011 Knowledge Core. Its reserved 0012 version may follow gaps on phase-local branches.

ALTER TABLE web_chat_threads
  ADD COLUMN IF NOT EXISTS role_id text;

-- statement-breakpoint
DO $$ BEGIN
  ALTER TABLE web_chat_threads ADD CONSTRAINT web_chat_threads_one_executor
    CHECK (agent_id IS NULL OR role_id IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS web_chat_threads_owner_role
  ON web_chat_threads (owner_id, role_id, updated_at DESC) WHERE role_id IS NOT NULL;

-- statement-breakpoint
ALTER TABLE agent_runs
  ADD COLUMN IF NOT EXISTS executor_kind text,
  ADD COLUMN IF NOT EXISTS role_id text;

-- statement-breakpoint
UPDATE agent_runs AS run
SET executor_kind = CASE WHEN agent.is_primary THEN 'primary-agent' ELSE 'persistent-agent' END
FROM agents AS agent
WHERE run.owner_id = agent.owner_id
  AND run.agent_id = agent.id
  AND run.executor_kind IS NULL;

-- statement-breakpoint
ALTER TABLE agent_runs
  ALTER COLUMN executor_kind SET DEFAULT 'persistent-agent',
  ALTER COLUMN executor_kind SET NOT NULL;

-- statement-breakpoint
DO $$ BEGIN
  ALTER TABLE agent_runs ADD CONSTRAINT agent_runs_executor_kind_valid
    CHECK (executor_kind IN ('primary-agent', 'persistent-agent', 'on-demand-role'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- statement-breakpoint
DO $$ BEGIN
  ALTER TABLE agent_runs ADD CONSTRAINT agent_runs_role_attribution_valid
    CHECK ((executor_kind = 'on-demand-role') = (role_id IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS agent_runs_owner_role
  ON agent_runs (owner_id, role_id, updated_at DESC) WHERE role_id IS NOT NULL;
