-- Forward reconciliation evidence only. Historical ledger rows are never renamed or rewritten.
CREATE TABLE IF NOT EXISTS sofie_published_main_bridge (
  id text PRIMARY KEY CHECK (id = '0068'),
  origin text NOT NULL,
  source_ledger jsonb NOT NULL CHECK (jsonb_typeof(source_ledger) = 'array'),
  satisfied_migrations jsonb NOT NULL CHECK (jsonb_typeof(satisfied_migrations) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);
