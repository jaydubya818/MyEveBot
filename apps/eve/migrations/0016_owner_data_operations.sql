CREATE TABLE IF NOT EXISTS owner_data_operations (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  operation_type text NOT NULL CHECK (operation_type IN (
    'export_started', 'export_completed', 'export_failed', 'backup_verified',
    'restore_planned', 'restore_started', 'restore_completed', 'restore_failed', 'restore_verified',
    'memory_corrected', 'memory_deleted', 'connector_disconnected', 'connector_revoked',
    'deletion_started', 'deletion_completed', 'deletion_failed'
  )),
  status text NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  archive_version integer,
  record_count integer CHECK (record_count IS NULL OR record_count >= 0),
  domain_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  checksum text,
  error_summary text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS owner_data_operations_owner_history
  ON owner_data_operations (owner_id, created_at DESC, id DESC);
