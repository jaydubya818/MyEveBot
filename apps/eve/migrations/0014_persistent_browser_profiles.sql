CREATE TABLE IF NOT EXISTS persistent_browser_profiles (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  agent_id text NOT NULL,
  provider text NOT NULL DEFAULT 'orgo' CHECK (provider IN ('orgo')),
  status text NOT NULL DEFAULT 'ready'
    CHECK (status IN ('ready', 'takeover_required', 'reconnect_required', 'revoked')),
  generation integer NOT NULL DEFAULT 1 CHECK (generation > 0),
  last_used_at timestamptz,
  last_owner_takeover_at timestamptz,
  last_authenticated_at timestamptz,
  failure_summary text,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (owner_id, agent_id) REFERENCES agents(owner_id, id) ON DELETE RESTRICT,
  UNIQUE (owner_id, agent_id),
  CHECK ((status = 'revoked') = (revoked_at IS NOT NULL))
);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS persistent_browser_profiles_owner
  ON persistent_browser_profiles (owner_id, updated_at DESC);

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS persistent_browser_profile_grants (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  profile_id text NOT NULL REFERENCES persistent_browser_profiles(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  FOREIGN KEY (owner_id, agent_id) REFERENCES agents(owner_id, id) ON DELETE RESTRICT
);

-- statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS persistent_browser_profile_grants_active
  ON persistent_browser_profile_grants (profile_id, agent_id)
  WHERE revoked_at IS NULL;

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS persistent_browser_profile_grants_agent
  ON persistent_browser_profile_grants (owner_id, agent_id)
  WHERE revoked_at IS NULL;
