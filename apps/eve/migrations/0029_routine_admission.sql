-- Admission history stays on canonical occurrences. No provider credentials or readiness cache.
ALTER TABLE execution_occurrences ALTER COLUMN run_id DROP NOT NULL;
-- statement-breakpoint
ALTER TABLE execution_occurrences DROP CONSTRAINT execution_occurrences_status_check;
-- statement-breakpoint
ALTER TABLE execution_occurrences ADD CONSTRAINT execution_occurrences_status_check
  CHECK (status IN ('pending','running','waiting','retrying','completed','failed','cancelled','recovery_required','blocked_precheck'));
-- statement-breakpoint
ALTER TABLE execution_occurrences ADD COLUMN admission jsonb, ADD COLUMN preflight jsonb;
-- statement-breakpoint
ALTER TABLE execution_occurrences ADD CONSTRAINT execution_occurrences_run_required
  CHECK (run_id IS NOT NULL OR status='blocked_precheck');

-- statement-breakpoint
-- Winner inserts the occurrence first, then its Run in the same statement.
-- Deferral prevents an orphan Run when READY and blocked scheduler ticks race.
ALTER TABLE execution_occurrences ALTER CONSTRAINT execution_occurrences_owner_id_run_id_fkey DEFERRABLE INITIALLY DEFERRED;
