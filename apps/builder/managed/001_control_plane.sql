CREATE TABLE IF NOT EXISTS managed_beta_invites (
  id text PRIMARY KEY,
  email text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  relay_invite_ciphertext text,
  monthly_model_budget_usd numeric(10,2) NOT NULL CHECK (monthly_model_budget_usd >= 1),
  expires_at timestamptz NOT NULL,
  claimed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS managed_beta_invites_active_email_idx
  ON managed_beta_invites (lower(email)) WHERE claimed_at IS NULL AND revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS managed_eve_environments (
  id text PRIMARY KEY,
  invite_id text NOT NULL UNIQUE REFERENCES managed_beta_invites(id),
  email text NOT NULL UNIQUE,
  owner_name text NOT NULL,
  agent_name text NOT NULL,
  project_name text NOT NULL UNIQUE,
  project_id text UNIQUE,
  database_store_id text UNIQUE,
  blob_store_id text UNIQUE,
  deployment_id text,
  public_url text,
  template_release integer,
  state text NOT NULL CHECK (state IN ('requested','approved','provisioning','deploying','verifying','ready','paused','failed','retiring','retired')),
  monthly_model_budget_usd numeric(10,2) NOT NULL CHECK (monthly_model_budget_usd >= 1),
  last_health_at timestamptz,
  last_health_status text,
  last_error_stage text,
  last_error_summary text,
  last_export_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz
);

CREATE INDEX IF NOT EXISTS managed_eve_environments_state_idx ON managed_eve_environments (state);

CREATE TABLE IF NOT EXISTS managed_eve_events (
  id text PRIMARY KEY,
  environment_id text NOT NULL REFERENCES managed_eve_environments(id),
  kind text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS managed_eve_events_environment_idx
  ON managed_eve_events (environment_id, created_at);
