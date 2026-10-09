-- Additive execution metadata. task_runs remains the canonical logical Run.
CREATE TABLE execution_routines (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  source_kind text NOT NULL CHECK (source_kind IN ('reminder','review','webhook','manual')),
  source_id text NOT NULL,
  name text NOT NULL,
  agent_id text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','auto_paused','disabled','archived')),
  configuration jsonb NOT NULL,
  consecutive_failures integer NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  failure_threshold integer NOT NULL DEFAULT 3 CHECK (failure_threshold BETWEEN 1 AND 10),
  last_failure text,
  last_success_at timestamptz,
  paused_at timestamptz,
  pause_sequence integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id,id),
  UNIQUE (owner_id,source_kind,source_id),
  FOREIGN KEY (owner_id,agent_id) REFERENCES agents(owner_id,id)
);

-- statement-breakpoint
CREATE TABLE execution_routine_versions (
  owner_id text NOT NULL,
  routine_id text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  configuration jsonb NOT NULL,
  changed_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id,routine_id,version),
  FOREIGN KEY (owner_id,routine_id) REFERENCES execution_routines(owner_id,id)
);

-- statement-breakpoint
CREATE TABLE execution_occurrences (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  routine_id text NOT NULL,
  routine_version integer NOT NULL,
  occurrence_key text NOT NULL,
  scheduled_for timestamptz NOT NULL,
  run_id text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','waiting','retrying','completed','failed','cancelled','recovery_required')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  claim_version bigint NOT NULL DEFAULT 0,
  claimed_by text,
  claimed_at timestamptz,
  heartbeat_at timestamptz,
  lease_expires_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  failure_category text,
  completed_at timestamptz,
  cost_status text NOT NULL DEFAULT 'unknown' CHECK (cost_status IN ('known','estimated','unknown')),
  cost_usd numeric(12,6) CHECK (cost_usd >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id,id),
  UNIQUE (owner_id,routine_id,occurrence_key),
  FOREIGN KEY (owner_id,routine_id,routine_version) REFERENCES execution_routine_versions(owner_id,routine_id,version),
  FOREIGN KEY (owner_id,run_id) REFERENCES task_runs(owner_id,id),
  CHECK ((status='running') = (claimed_by IS NOT NULL)),
  CHECK ((status='running') = (lease_expires_at IS NOT NULL)),
  CHECK ((cost_status='unknown') = (cost_usd IS NULL))
);

-- statement-breakpoint
CREATE INDEX execution_occurrences_due ON execution_occurrences(next_attempt_at,scheduled_for) WHERE status IN ('pending','retrying');

-- statement-breakpoint
CREATE TABLE execution_attempts (
  owner_id text NOT NULL,
  occurrence_id text NOT NULL,
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  claim_version bigint NOT NULL,
  worker_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('running','completed','failed','interrupted','waiting','cancelled')),
  failure_category text,
  retry_decision text CHECK (retry_decision IN ('retry','stop','recovery_required','wait')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  cost_status text NOT NULL DEFAULT 'unknown' CHECK (cost_status IN ('known','estimated','unknown')),
  cost_usd numeric(12,6) CHECK (cost_usd >= 0),
  PRIMARY KEY (owner_id,occurrence_id,attempt_number),
  FOREIGN KEY (owner_id,occurrence_id) REFERENCES execution_occurrences(owner_id,id),
  CHECK ((cost_status='unknown') = (cost_usd IS NULL))
);

-- statement-breakpoint
CREATE TABLE action_requests (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  run_id text NOT NULL,
  occurrence_id text,
  action_key text NOT NULL,
  executor jsonb NOT NULL,
  trigger jsonb NOT NULL,
  capability_id text NOT NULL,
  action_class text NOT NULL,
  target jsonb NOT NULL,
  parameter_hash text NOT NULL,
  safe_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  decision text NOT NULL CHECK (decision IN ('ALLOW','REQUIRE_APPROVAL','DENY')),
  authority_source text NOT NULL,
  approval_id text REFERENCES task_approval_decisions(id),
  status text NOT NULL CHECK (status IN ('planned','awaiting_approval','authorized','executing','verifying','completed','failed','result_unknown','cancelled','denied')),
  attempt_count integer NOT NULL DEFAULT 0,
  computer_session_id text REFERENCES computer_sessions(id),
  control_version bigint,
  provider_receipt jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id,id),
  UNIQUE (owner_id,run_id,action_key),
  FOREIGN KEY (owner_id,run_id) REFERENCES task_runs(owner_id,id),
  FOREIGN KEY (owner_id,occurrence_id) REFERENCES execution_occurrences(owner_id,id)
);

-- statement-breakpoint
CREATE TABLE action_receipts (
  id bigserial PRIMARY KEY,
  owner_id text NOT NULL,
  action_id text NOT NULL,
  attempt_number integer NOT NULL,
  event text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (owner_id,action_id) REFERENCES action_requests(owner_id,id)
);

-- statement-breakpoint
CREATE INDEX action_requests_run ON action_requests(owner_id,run_id,created_at);

-- statement-breakpoint
-- Extend the existing control lease; do not introduce another controller.
ALTER TABLE computer_control_leases ADD COLUMN gateway_actions_in_flight integer NOT NULL DEFAULT 0 CHECK (gateway_actions_in_flight>=0);

-- statement-breakpoint
-- Generalize the Phase 3 delivery ledger instead of adding a second outbox.
ALTER TABLE review_deliveries
  ALTER COLUMN review_kind DROP NOT NULL,
  ADD COLUMN occurrence_id text,
  ADD COLUMN run_id text,
  ADD COLUMN result_reference text,
  ADD COLUMN claim_version bigint NOT NULL DEFAULT 0,
  ADD COLUMN result_unknown boolean NOT NULL DEFAULT false,
  ADD FOREIGN KEY (owner_id,occurrence_id) REFERENCES execution_occurrences(owner_id,id),
  ADD FOREIGN KEY (owner_id,run_id) REFERENCES task_runs(owner_id,id);

-- statement-breakpoint
CREATE UNIQUE INDEX delivery_occurrence_channel ON review_deliveries(owner_id,occurrence_id,requested_channel) WHERE occurrence_id IS NOT NULL;
