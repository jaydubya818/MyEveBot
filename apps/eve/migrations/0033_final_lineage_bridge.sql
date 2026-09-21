-- The runner atomically verifies the exact prior lineage and, where missing,
-- applies the immutable historical reconciliation statements as bridge work.
-- Historical execution and semantic satisfaction remain separate audit facts.
CREATE TABLE sofie_migration_bridge_receipts (
  id text PRIMARY KEY CHECK (id='0033'),
  source_ledger jsonb NOT NULL CHECK (jsonb_typeof(source_ledger)='array'),
  canonical_manifest jsonb NOT NULL CHECK (jsonb_typeof(canonical_manifest)='object'),
  satisfied_migrations jsonb NOT NULL CHECK (jsonb_typeof(satisfied_migrations)='object'),
  reconciled_at timestamptz NOT NULL DEFAULT now()
);
