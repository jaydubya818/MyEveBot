CREATE TABLE local_computer_devices (
  owner_id text NOT NULL,
  device_id text NOT NULL,
  pairing_hash text NOT NULL,
  roots jsonb NOT NULL DEFAULT '[]',
  permissions jsonb NOT NULL DEFAULT '{}',
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_id, device_id)
);

CREATE TABLE local_computer_jobs (
  id uuid PRIMARY KEY,
  owner_id text NOT NULL,
  device_id text NOT NULL,
  pairing_hash text NOT NULL,
  agent_id text NOT NULL,
  agent_revision timestamptz NOT NULL,
  session_id text NOT NULL,
  action_id text NOT NULL REFERENCES action_requests(id),
  parameters jsonb NOT NULL,
  needs_approval boolean NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed','expired','unknown')),
  claim_id uuid,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '60 seconds',
  finished_at timestamptz,
  UNIQUE(owner_id, action_id)
);
CREATE INDEX local_computer_jobs_poll ON local_computer_jobs(owner_id, device_id, status, created_at);
