-- One terminal email action per initial follow-up Routine. Payload is private
-- owner data, like its saved conversation; never exposed by the Actions API.
CREATE TABLE routine_pending_sends (
  owner_id text NOT NULL,
  run_id text NOT NULL REFERENCES task_runs(id) ON DELETE CASCADE,
  action_id text NOT NULL REFERENCES action_requests(id) ON DELETE CASCADE,
  request jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_id,run_id),
  UNIQUE(action_id)
);
