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
  ADD COLUMN recovery_result jsonb;
