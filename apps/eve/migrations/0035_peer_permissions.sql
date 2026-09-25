CREATE TABLE myeve_peer_permissions (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  local_agent_id text NOT NULL REFERENCES agents(id),
  relay_origin text NOT NULL,
  local_relay_account_id text NOT NULL,
  local_relay_agent_id text NOT NULL,
  peer_account_id text NOT NULL,
  peer_agent_id text NOT NULL,
  display_name text NOT NULL,
  policies jsonb NOT NULL CHECK (jsonb_typeof(policies)='array'),
  expires_at timestamptz,
  revoked_at timestamptz,
  revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
  mutation_id text NOT NULL,
  mutation_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id,local_agent_id,relay_origin,local_relay_account_id,local_relay_agent_id,peer_account_id,peer_agent_id)
);
-- statement-breakpoint
CREATE INDEX myeve_peer_permissions_owner_agent ON myeve_peer_permissions(owner_id,local_agent_id);
-- statement-breakpoint
CREATE TABLE myeve_peer_action_bindings (
  owner_id text NOT NULL,
  run_id text NOT NULL REFERENCES task_runs(id),
  action_key text NOT NULL,
  permission_id text NOT NULL REFERENCES myeve_peer_permissions(id),
  permission_revision integer NOT NULL,
  request_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_id,run_id,action_key)
);
