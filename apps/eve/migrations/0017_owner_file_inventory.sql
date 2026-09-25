-- Make owner-uploaded chat files part of the durable schema so backups can
-- inventory them without depending on the chat upload path running first.
CREATE TABLE IF NOT EXISTS chat_files (
  id text PRIMARY KEY,
  thread_id text NOT NULL,
  filename text NOT NULL,
  media_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  blob_url text NOT NULL,
  blob_path text NOT NULL,
  owner_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- statement-breakpoint
ALTER TABLE chat_files ADD COLUMN IF NOT EXISTS owner_id text;

-- statement-breakpoint
ALTER TABLE chat_files ALTER COLUMN owner_id DROP DEFAULT;

-- statement-breakpoint
ALTER TABLE chat_files ALTER COLUMN owner_id DROP NOT NULL;

-- statement-breakpoint
UPDATE chat_files SET owner_id = NULL WHERE owner_id = 'web:owner';

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS chat_files_owner_created_idx
  ON chat_files (owner_id, created_at DESC);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS chat_files_owner_thread_idx
  ON chat_files (owner_id, thread_id, created_at DESC);
