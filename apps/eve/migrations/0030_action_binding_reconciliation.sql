-- Main's committed 0026 remains immutable. Carry forward the additional
-- qualified recovery binding semantics from the Routine/Federation branch.
ALTER TABLE action_requests ADD COLUMN approval_generation integer NOT NULL DEFAULT 0;
-- statement-breakpoint
-- Competing live bindings require explicit reconciliation; never discard a
-- potentially transmitted action or backfill execution authority.
CREATE UNIQUE INDEX action_requests_live_binding ON action_requests(owner_id,run_id,parameter_hash)
WHERE status IN ('planned','awaiting_approval','authorized','executing','verifying','result_unknown','recovering','needs_you','retryable');
