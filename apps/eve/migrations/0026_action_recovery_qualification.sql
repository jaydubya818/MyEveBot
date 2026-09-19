ALTER TABLE action_requests DROP CONSTRAINT action_requests_status_check;
-- statement-breakpoint
ALTER TABLE action_requests ADD CONSTRAINT action_requests_status_check CHECK (status IN (
  'planned','awaiting_approval','authorized','executing','verifying','completed','failed','result_unknown','cancelled','denied',
  'recovering','needs_you','retryable'
));
-- statement-breakpoint
ALTER TABLE action_requests
  ADD COLUMN recovery_token text,
  ADD COLUMN recovery_expires_at timestamptz,
  ADD COLUMN recovery_result jsonb,
  ADD COLUMN approval_generation integer NOT NULL DEFAULT 0;
-- statement-breakpoint
-- Fail migration if older data contains competing live bindings: reconcile them
-- explicitly rather than silently discarding a potentially transmitted action.
CREATE UNIQUE INDEX action_requests_live_binding ON action_requests(owner_id,run_id,parameter_hash)
WHERE status IN ('planned','awaiting_approval','authorized','executing','verifying','result_unknown','recovering','needs_you','retryable');
