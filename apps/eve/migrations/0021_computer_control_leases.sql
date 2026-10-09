CREATE TABLE IF NOT EXISTS computer_control_leases (
  computer_session_id text PRIMARY KEY REFERENCES computer_sessions(id) ON DELETE CASCADE,
  owner_id text NOT NULL,
  agent_id text NOT NULL,
  run_id text REFERENCES task_runs(id) ON DELETE SET NULL,
  controller text NOT NULL CHECK (controller IN ('AGENT','OWNER','PAUSED','NONE')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  claimed_by text,
  claimed_at timestamptz,
  heartbeat_at timestamptz,
  expires_at timestamptz,
  transition_reason text,
  state_fingerprint text,
  checkpoint jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (owner_id,agent_id) REFERENCES agents(owner_id,id) ON DELETE RESTRICT,
  CHECK ((controller='OWNER') = (claimed_by IS NOT NULL)),
  CHECK ((controller='OWNER') = (expires_at IS NOT NULL))
);

-- statement-breakpoint
INSERT INTO computer_control_leases (computer_session_id,owner_id,agent_id,run_id,controller,transition_reason)
SELECT id,owner_id,agent_id,run_id,
  CASE WHEN status IN ('completed','failed','expired','stopped') THEN 'NONE'
       WHEN status='paused' THEN 'PAUSED' ELSE 'AGENT' END,
  'Initial control state derived from canonical Computer session'
FROM computer_sessions ON CONFLICT (computer_session_id) DO NOTHING;

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS computer_control_receipts (
  id text PRIMARY KEY,
  computer_session_id text NOT NULL REFERENCES computer_sessions(id) ON DELETE CASCADE,
  owner_id text NOT NULL,
  agent_id text NOT NULL,
  run_id text REFERENCES task_runs(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  previous_controller text CHECK (previous_controller IS NULL OR previous_controller IN ('AGENT','OWNER','PAUSED','NONE')),
  new_controller text NOT NULL CHECK (new_controller IN ('AGENT','OWNER','PAUSED','NONE')),
  control_version bigint NOT NULL CHECK (control_version > 0),
  requested_by text NOT NULL,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS computer_control_receipts_timeline
  ON computer_control_receipts (owner_id,computer_session_id,created_at DESC,id DESC);

-- statement-breakpoint
ALTER TABLE computer_actions
  ADD COLUMN IF NOT EXISTS control_version bigint;

-- statement-breakpoint
UPDATE computer_actions a SET control_version=l.version
FROM computer_control_leases l
WHERE l.computer_session_id=a.computer_session_id AND a.control_version IS NULL;

-- statement-breakpoint
ALTER TABLE computer_actions ALTER COLUMN control_version SET NOT NULL;

-- statement-breakpoint
ALTER TABLE task_runs DROP CONSTRAINT IF EXISTS task_runs_status_check;

-- statement-breakpoint
ALTER TABLE task_runs ADD CONSTRAINT task_runs_status_check CHECK (status IN (
  'queued','running','awaiting_approval','waiting_for_owner','paused','completed','failed','cancelled'
));
