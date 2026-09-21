-- Historical ledger rows are never rewritten. The runner records verified
-- equivalence of feature-lineage 0026 to canonical 0030 in a separate receipt.
CREATE TABLE sofie_migration_reconciliations (
  id text PRIMARY KEY,
  origin text NOT NULL CHECK (origin IN ('canonical','396631afa4739e5ca8ac0c5c81781f82f3160403')),
  source_ledger jsonb NOT NULL CHECK (jsonb_typeof(source_ledger)='array'),
  satisfied_migrations jsonb NOT NULL CHECK (jsonb_typeof(satisfied_migrations)='object'),
  reconciled_at timestamptz NOT NULL DEFAULT now()
);

-- Lock both sides of the ownership proof until the audit and change commit.
LOCK TABLE chat_files, web_chat_threads IN SHARE ROW EXCLUSIVE MODE;

-- A file's durable thread relation, not the deploying process's owner, is the
-- evidence. Orphans/placeholder owners must be investigated before retrying.
DO $ownership$
BEGIN
  IF EXISTS (
    SELECT 1 FROM chat_files f LEFT JOIN web_chat_threads t ON t.id=f.thread_id
    WHERE (f.owner_id IS NULL OR f.owner_id='web:owner')
      AND (t.id IS NULL OR t.owner_id IS NULL OR btrim(t.owner_id)='' OR t.owner_id='web:owner')
  ) THEN
    RAISE EXCEPTION 'Ambiguous file ownership; reconcile evidence before retrying 0031';
  END IF;
  IF EXISTS (
    SELECT 1 FROM chat_files f JOIN web_chat_threads t ON t.id=f.thread_id
    WHERE f.owner_id IS NOT NULL AND f.owner_id<>'web:owner'
      AND f.owner_id IS DISTINCT FROM t.owner_id
  ) THEN
    RAISE EXCEPTION 'Conflicting explicit file/thread owners; reconcile evidence before retrying 0031';
  END IF;
END $ownership$;

CREATE TABLE sofie_file_owner_reconciliations (
  file_id text PRIMARY KEY,
  thread_id text NOT NULL,
  previous_owner_id text,
  resolved_owner_id text NOT NULL,
  proof text NOT NULL CHECK (proof='web_chat_threads.owner_id'),
  reconciled_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO sofie_file_owner_reconciliations(file_id,thread_id,previous_owner_id,resolved_owner_id,proof)
SELECT f.id,f.thread_id,f.owner_id,t.owner_id,'web_chat_threads.owner_id'
FROM chat_files f JOIN web_chat_threads t ON t.id=f.thread_id
WHERE f.owner_id IS NULL OR f.owner_id='web:owner';

UPDATE chat_files f SET owner_id=a.resolved_owner_id
FROM sofie_file_owner_reconciliations a WHERE a.file_id=f.id;

ALTER TABLE chat_files ALTER COLUMN owner_id DROP DEFAULT;
ALTER TABLE chat_files ALTER COLUMN owner_id DROP NOT NULL;

-- No approval, Action, recovery, Computer, Routine or Federation authority is
-- inserted, approved, renewed, re-owned, reset or activated by this migration.
