-- Published-main 0039/0040 remain immutable execution facts. The runner verifies
-- exact source checksums and table structure, then records semantic equivalents
-- separately while atomically applying the missing canonical forward chain.
CREATE TABLE sofie_published_main_bridge (
  id text PRIMARY KEY CHECK (id = '0068'),
  source_commit text NOT NULL,
  source_ledger jsonb NOT NULL CHECK (jsonb_typeof(source_ledger) = 'array'),
  canonical_manifest jsonb NOT NULL CHECK (jsonb_typeof(canonical_manifest) = 'object'),
  satisfied_migrations jsonb NOT NULL CHECK (jsonb_typeof(satisfied_migrations) = 'object'),
  reconciled_at timestamptz NOT NULL DEFAULT now()
);
