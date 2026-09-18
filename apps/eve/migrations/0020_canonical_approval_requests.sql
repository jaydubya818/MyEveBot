ALTER TABLE task_approval_decisions
  ADD COLUMN IF NOT EXISTS owner_id text,
  ADD COLUMN IF NOT EXISTS goal_id text REFERENCES goals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS goal_task_id text REFERENCES goal_tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS agent_id text,
  ADD COLUMN IF NOT EXISTS role_id text,
  ADD COLUMN IF NOT EXISTS capability_id text,
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS resource text,
  ADD COLUMN IF NOT EXISTS action text,
  ADD COLUMN IF NOT EXISTS action_class text,
  ADD COLUMN IF NOT EXISTS action_parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS binding_hash text,
  ADD COLUMN IF NOT EXISTS risk text,
  ADD COLUMN IF NOT EXISTS effects jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS estimated_cost_usd numeric(10,4),
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS decision_reason text;

-- statement-breakpoint
UPDATE task_approval_decisions a
SET owner_id=r.owner_id, goal_id=r.goal_id, goal_task_id=r.goal_task_id,
    agent_id=r.agent_id, role_id=r.role_id, action=coalesce(a.action,'legacy_task_approval'),
    action_class=coalesce(a.action_class,'execute'), binding_hash=coalesce(a.binding_hash,'legacy:' || a.id),
    risk=coalesce(a.risk,'high'), expires_at=coalesce(a.expires_at,a.requested_at + interval '24 hours'),
    status=coalesce(a.status,CASE WHEN a.decision='approved' THEN 'approved' WHEN a.decision='denied' THEN 'denied' ELSE 'pending' END)
FROM task_runs r WHERE r.id=a.task_id;

-- statement-breakpoint
ALTER TABLE task_approval_decisions
  ALTER COLUMN owner_id SET NOT NULL,
  ALTER COLUMN action SET NOT NULL,
  ALTER COLUMN action_class SET NOT NULL,
  ALTER COLUMN binding_hash SET NOT NULL,
  ALTER COLUMN risk SET NOT NULL,
  ALTER COLUMN expires_at SET NOT NULL,
  ALTER COLUMN status SET NOT NULL;

-- statement-breakpoint
ALTER TABLE task_approval_decisions
  ADD CONSTRAINT task_approval_action_class_check CHECK (action_class IN ('read','write','create','update','delete','send','publish','spend','deploy','execute','transfer')),
  ADD CONSTRAINT task_approval_risk_check CHECK (risk IN ('low','medium','high','critical')),
  ADD CONSTRAINT task_approval_status_check CHECK (status IN ('pending','approved','denied','expired','invalidated'));

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS task_approval_owner_status
  ON task_approval_decisions (owner_id,status,requested_at DESC,id DESC);

