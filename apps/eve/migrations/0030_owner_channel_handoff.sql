-- Owner-channel projections reference canonical task_runs and Action Gateway.
-- No new Run, Approval, Action or Result authority model.
CREATE TABLE owner_channel_requests (
  relay_account_id text NOT NULL,
  request_id text NOT NULL,
  owner_id text NOT NULL,
  agent_id text NOT NULL,
  source_identity text NOT NULL,
  relay_thread_id text NOT NULL,
  work_hash text NOT NULL,
  run_id text NOT NULL,
  request jsonb NOT NULL,
  admitted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  dispatch_id uuid,
  dispatched_at timestamptz,
  last_observed_at timestamptz,
  cancel_acknowledged_at timestamptz,
  session_id text UNIQUE,
  turn_id text,
  tokens_used integer NOT NULL DEFAULT 0 CHECK(tokens_used>=0),
  usage_unknown boolean NOT NULL DEFAULT false,
  actions_started integer NOT NULL DEFAULT 0 CHECK(actions_started BETWEEN 0 AND 12),
  PRIMARY KEY(relay_account_id,request_id),
  UNIQUE(owner_id,run_id),
  FOREIGN KEY(owner_id,run_id) REFERENCES task_runs(owner_id,id),
  FOREIGN KEY(owner_id,agent_id) REFERENCES agents(owner_id,id)
);
-- statement-breakpoint
CREATE TABLE owner_channel_nonces (
  nonce text PRIMARY KEY,
  relay_account_id text NOT NULL,
  owner_id text NOT NULL,
  environment text NOT NULL,
  expires_at timestamptz NOT NULL
);
-- statement-breakpoint
CREATE TABLE owner_channel_commands (
  command_id text PRIMARY KEY,
  relay_account_id text NOT NULL,
  request_id text NOT NULL,
  owner_id text NOT NULL,
  payload_hash text NOT NULL,
  operation text NOT NULL CHECK(operation IN ('start','status','approval','recovery','cancel')),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(relay_account_id,request_id) REFERENCES owner_channel_requests(relay_account_id,request_id)
);
