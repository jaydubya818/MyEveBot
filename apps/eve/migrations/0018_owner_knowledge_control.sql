ALTER TABLE owner_data_operations
  DROP CONSTRAINT IF EXISTS owner_data_operations_operation_type_check;

-- statement-breakpoint
ALTER TABLE owner_data_operations
  ADD CONSTRAINT owner_data_operations_operation_type_check CHECK (operation_type IN (
    'export_started', 'export_completed', 'export_failed', 'backup_verified',
    'restore_planned', 'restore_started', 'restore_completed', 'restore_failed', 'restore_verified',
    'memory_corrected', 'memory_deleted', 'memory_forgotten',
    'knowledge_corrected', 'knowledge_deleted', 'preference_corrected', 'contradiction_resolved',
    'connector_disconnected', 'connector_revoked',
    'deletion_started', 'deletion_completed', 'deletion_failed'
  ));

-- statement-breakpoint
ALTER TABLE owner_data_operations
  DROP CONSTRAINT IF EXISTS owner_data_operations_status_check;

-- statement-breakpoint
ALTER TABLE owner_data_operations
  ADD CONSTRAINT owner_data_operations_status_check CHECK (
    status IN ('running', 'completed', 'partially_completed', 'failed')
  );
