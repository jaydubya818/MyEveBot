CREATE TABLE IF NOT EXISTS knowledge_sources (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('chat', 'email', 'slack', 'telegram', 'calendar', 'file', 'web', 'run', 'manual')),
  provider text,
  external_id text,
  reference_uri text,
  author text,
  captured_at timestamptz NOT NULL DEFAULT now(),
  content_hash text,
  snapshot_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, id),
  CHECK (reference_uri IS NOT NULL OR external_id IS NOT NULL OR snapshot_ref IS NOT NULL OR source_type = 'manual')
);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS knowledge_sources_owner_recent
  ON knowledge_sources (owner_id, captured_at DESC, id DESC);

-- statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS knowledge_sources_owner_external
  ON knowledge_sources (owner_id, provider, external_id)
  WHERE provider IS NOT NULL AND external_id IS NOT NULL;

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS knowledge_records (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('fact', 'observation', 'hypothesis', 'decision', 'commitment', 'preference', 'insight')),
  title text,
  statement text NOT NULL CHECK (char_length(statement) BETWEEN 1 AND 20000),
  confidence numeric(4,3) NOT NULL DEFAULT 1 CHECK (confidence BETWEEN 0 AND 1),
  status text NOT NULL,
  occurrence_count integer CHECK (occurrence_count IS NULL OR occurrence_count > 0),
  first_seen_at timestamptz,
  last_confirmed_at timestamptz,
  first_observed_at timestamptz,
  last_observed_at timestamptz,
  test_description text,
  decision_trigger text,
  rationale text,
  alternatives jsonb NOT NULL DEFAULT '[]'::jsonb,
  decided_at timestamptz,
  reopen_condition text,
  subject text,
  due_at timestamptz,
  fulfilled_at timestamptz,
  preference_key text,
  preference_value jsonb,
  preference_scope text,
  preference_source_type text CHECK (preference_source_type IS NULL OR preference_source_type IN ('explicit_user', 'approved_observation', 'system_default')),
  preference_source_id text,
  active boolean,
  review_at timestamptz,
  expires_at timestamptz,
  generated_at timestamptz,
  created_by_type text NOT NULL CHECK (created_by_type IN ('owner', 'agent', 'system', 'import')),
  created_by_id text,
  goal_id text,
  project_ref text,
  supersedes_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, id),
  FOREIGN KEY (owner_id, goal_id) REFERENCES goals(owner_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (owner_id, created_by_id) REFERENCES agents(owner_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (owner_id, supersedes_id) REFERENCES knowledge_records(owner_id, id) ON DELETE RESTRICT,
  CHECK (supersedes_id IS NULL OR supersedes_id <> id),
  CHECK (
    (kind = 'fact' AND status IN ('active', 'stale', 'superseded', 'contradicted')) OR
    (kind = 'observation' AND status IN ('active', 'dismissed', 'promoted', 'stale', 'contradicted')) OR
    (kind = 'hypothesis' AND status IN ('open', 'supported', 'rejected', 'inconclusive', 'promoted')) OR
    (kind = 'decision' AND status IN ('active', 'superseded', 'reopened', 'reversed')) OR
    (kind = 'commitment' AND status IN ('open', 'fulfilled', 'missed', 'cancelled', 'superseded')) OR
    (kind = 'preference' AND status IN ('active', 'inactive', 'superseded', 'expired')) OR
    (kind = 'insight' AND status IN ('active', 'stale', 'superseded', 'contradicted'))
  ),
  CHECK (kind <> 'observation' OR occurrence_count IS NOT NULL),
  CHECK (kind <> 'decision' OR (title IS NOT NULL AND decided_at IS NOT NULL)),
  CHECK (kind <> 'commitment' OR subject IS NOT NULL),
  CHECK (kind <> 'preference' OR (preference_key IS NOT NULL AND preference_value IS NOT NULL AND preference_scope IS NOT NULL AND preference_source_type IS NOT NULL AND active IS NOT NULL)),
  CHECK (kind <> 'insight' OR generated_at IS NOT NULL),
  CHECK ((created_by_type = 'agent') = (created_by_id IS NOT NULL))
);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS knowledge_records_owner_kind_status
  ON knowledge_records (owner_id, kind, status, updated_at DESC, id DESC);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS knowledge_records_owner_goal
  ON knowledge_records (owner_id, goal_id, updated_at DESC)
  WHERE goal_id IS NOT NULL;

-- statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS knowledge_records_one_successor
  ON knowledge_records (owner_id, supersedes_id)
  WHERE supersedes_id IS NOT NULL;

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS knowledge_records_owner_search
  ON knowledge_records USING gin (to_tsvector('english', coalesce(title, '') || ' ' || statement));

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS knowledge_provenance_links (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  knowledge_id text NOT NULL,
  source_id text NOT NULL,
  relation text NOT NULL CHECK (relation IN ('supports', 'contradicts', 'derived_from', 'mentioned_in', 'confirmed_by')),
  confidence numeric(4,3) NOT NULL DEFAULT 1 CHECK (confidence BETWEEN 0 AND 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, knowledge_id, source_id, relation),
  FOREIGN KEY (owner_id, knowledge_id) REFERENCES knowledge_records(owner_id, id) ON DELETE CASCADE,
  FOREIGN KEY (owner_id, source_id) REFERENCES knowledge_sources(owner_id, id) ON DELETE RESTRICT
);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS knowledge_provenance_owner_claim
  ON knowledge_provenance_links (owner_id, knowledge_id, created_at DESC);

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS knowledge_relationships (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  subject_type text NOT NULL CHECK (subject_type IN ('source', 'fact', 'observation', 'hypothesis', 'decision', 'commitment', 'preference', 'insight', 'goal', 'agent', 'project', 'person', 'organization')),
  subject_id text NOT NULL,
  predicate text NOT NULL CHECK (predicate ~ '^[a-z][a-z0-9_]{0,63}$'),
  object_type text NOT NULL CHECK (object_type IN ('source', 'fact', 'observation', 'hypothesis', 'decision', 'commitment', 'preference', 'insight', 'goal', 'agent', 'project', 'person', 'organization')),
  object_id text NOT NULL,
  confidence numeric(4,3) NOT NULL DEFAULT 1 CHECK (confidence BETWEEN 0 AND 1),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'stale', 'superseded', 'contradicted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, subject_type, subject_id, predicate, object_type, object_id),
  CHECK (subject_type <> object_type OR subject_id <> object_id)
);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS knowledge_relationships_owner_subject
  ON knowledge_relationships (owner_id, subject_type, subject_id, status, updated_at DESC);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS knowledge_relationships_owner_object
  ON knowledge_relationships (owner_id, object_type, object_id, status, updated_at DESC);
