-- Adapter state is separate from canonical Knowledge, Memory, and local Runs.
-- statement-breakpoint
CREATE TABLE myeve_relay_connections (
  owner_id text PRIMARY KEY,
  local_agent_id text NOT NULL REFERENCES agents(id),
  relay_owner_id text NOT NULL,
  relay_agent_id text NOT NULL,
  address text NOT NULL UNIQUE,
  issuer text NOT NULL,
  signing_key_id text NOT NULL,
  signing_public_key text NOT NULL,
  agent_credential_encrypted text NOT NULL,
  owner_session_encrypted text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','revoked')),
  local_work_policy jsonb NOT NULL DEFAULT '{"research":"approval","analysis":"approval","summarization":"approval","artifact_generation":"approval"}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- statement-breakpoint
CREATE TABLE myeve_relay_publications (
  id text PRIMARY KEY,
  owner_id text NOT NULL REFERENCES myeve_relay_connections(owner_id),
  relay_view_id text,
  version integer NOT NULL DEFAULT 0,
  name text NOT NULL,
  visibility text NOT NULL DEFAULT 'PRIVATE' CHECK (visibility IN ('PRIVATE','SHARED','UNLISTED','PUBLIC')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','revoked','sync_required')),
  audience jsonb NOT NULL DEFAULT '[]',
  preview_hash text NOT NULL,
  preview_expires_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  document jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id,relay_view_id)
);
-- statement-breakpoint
CREATE TABLE myeve_relay_projection (
  owner_id text NOT NULL,
  publication_id text NOT NULL REFERENCES myeve_relay_publications(id),
  reference text NOT NULL,
  revision text NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(publication_id,reference)
);
-- statement-breakpoint
CREATE TABLE myeve_relay_requests (
  owner_id text NOT NULL REFERENCES myeve_relay_connections(owner_id),
  request_id text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('incoming','outgoing')),
  capability text NOT NULL,
  conversation_id text,
  sender_owner_id text NOT NULL,
  sender_agent_id text NOT NULL,
  envelope_hash text NOT NULL,
  envelope_encrypted text,
  result_encrypted text,
  state text NOT NULL DEFAULT 'incoming' CHECK (state IN ('incoming','processing','needs_approval','accepted','completed','denied','expired','recovery_required')),
  local_run_id text REFERENCES task_runs(id),
  local_decision text,
  relay_acknowledged boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_id,request_id)
);
-- statement-breakpoint
CREATE TABLE myeve_relay_activity (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  request_id text,
  kind text NOT NULL,
  metadata jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- statement-breakpoint
CREATE TABLE myeve_relay_receipts (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  relay_account_id text NOT NULL,
  sequence bigint NOT NULL,
  record jsonb NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(relay_account_id,sequence)
);
-- statement-breakpoint
CREATE TABLE myeve_relay_grants (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  document jsonb NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  created_at timestamptz NOT NULL DEFAULT now()
);
-- statement-breakpoint
CREATE TABLE myeve_relay_external_context (
  owner_id text NOT NULL,
  request_id text NOT NULL,
  source_owner_id text NOT NULL,
  source_agent_id text NOT NULL,
  publication_id text,
  publication_version integer,
  context_encrypted text NOT NULL,
  retrieved_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY(owner_id,request_id)
);
-- statement-breakpoint
CREATE TABLE myeve_relay_artifacts (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  request_id text,
  content_encrypted text NOT NULL,
  metadata jsonb NOT NULL,
  audience text NOT NULL,
  audience_public_key text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- statement-breakpoint
CREATE INDEX myeve_relay_inbox ON myeve_relay_requests(owner_id,state,created_at);
-- statement-breakpoint
CREATE INDEX myeve_relay_activity_owner ON myeve_relay_activity(owner_id,created_at);
-- statement-breakpoint
CREATE TABLE myeve_relay_peers (
  owner_id text NOT NULL,
  address text NOT NULL,
  artifact_origin text NOT NULL,
  artifact_public_key text NOT NULL,
  PRIMARY KEY(owner_id,address)
);
